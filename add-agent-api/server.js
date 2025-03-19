// server.js
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

// Initialize Express
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Contract configuration
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0xDe438021611C7878ECeb271FCEF15Fc12890019f';
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// Load wallet service
const walletGenerator = require('./services/walletService');

// Load ABI
let CONTRACT_ABI;
try {
  const abiPath = path.join(__dirname, 'abi', 'AIAgentIndex.json');
  CONTRACT_ABI = JSON.parse(fs.readFileSync(abiPath, 'utf8'));
  console.log('ABI loaded successfully');
} catch (error) {
  console.error('Error loading ABI:', error.message);
  console.error('Make sure you have created the abi directory and AIAgentIndex.json file');
  process.exit(1);
}

// Provider setup
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
const contract = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, wallet);

// Get minimum viable gas price
async function getMinimumViableGasPrice() {
  try {
    // Get current fee data
    const feeData = await provider.getFeeData();
    const baseGasPrice = feeData.maxFeePerGas || feeData.gasPrice;
    
    // Calculate a small buffer over the base price (just 5% more than minimum)
    const viableGasPrice = baseGasPrice.mul(105).div(100);
    
    console.log(`Network base gas price: ${ethers.utils.formatUnits(baseGasPrice, "gwei")} Gwei`);
    console.log(`Using gas price: ${ethers.utils.formatUnits(viableGasPrice, "gwei")} Gwei`);
    
    return {
      maxFeePerGas: viableGasPrice,
      maxPriorityFeePerGas: ethers.utils.parseUnits("0.0001", "gwei") // Minimal priority fee
    };
  } catch (error) {
    console.error('Error getting gas price:', error);
    // Fallback to safe values
    return {
      maxFeePerGas: ethers.utils.parseUnits("0.001", "gwei"),
      maxPriorityFeePerGas: ethers.utils.parseUnits("0.0001", "gwei")
    };
  }
}

// Register agent with GET endpoint for curl-friendly usage
app.get('/register-agent', async (req, res) => {
  try {
    // Extract parameters from query string
    const { name, socialLink, profileUrl, description } = req.query;
    
    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Agent name is required'
      });
    }
    
    // Generate wallet for messaging
    const agentWallet = walletGenerator.generateWallet();
    
    console.log(`Registering agent: ${name}`);
    console.log(`Generated wallet address: ${agentWallet.address}`);
    
    // Get optimal gas settings
    const gasSettings = await getMinimumViableGasPrice();
    
    // Submit transaction
    const tx = await contract.addAgent(
      name,
      agentWallet.address,
      socialLink || '',
      profileUrl || '',
      description || name,
      agentWallet.address,
      gasSettings
    );
    
    console.log(`Transaction submitted: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    // Find the AgentAdded event to get the agent ID
    const addedEvent = receipt.events.find(e => e.event === 'AgentAdded');
    const agentId = addedEvent.args.id.toString();
    
    // Log gas usage details
    const effectiveGasPrice = receipt.effectiveGasPrice;
    const gasUsed = receipt.gasUsed;
    console.log(`Gas used: ${gasUsed.toString()}`);
    console.log(`Effective gas price: ${ethers.utils.formatUnits(effectiveGasPrice, "gwei")} Gwei`);
    
    // Return response with agent details
    res.json({
      success: true,
      message: 'Agent successfully registered',
      agent: {
        id: agentId,
        name,
        wallet_address: agentWallet.address,
        socialLink: socialLink || '',
        profileUrl: profileUrl || '',
        description: description || name,
        wallet: {
          address: agentWallet.address,
          privateKey: agentWallet.privateKey
        }
      },
      transaction: {
        hash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: gasUsed.toString(),
        effectiveGasPrice: ethers.utils.formatUnits(effectiveGasPrice, "gwei") + " Gwei"
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    
    // If we get a gas-related error, retry once with higher gas
    if (error.code === 'UNPREDICTABLE_GAS_LIMIT' || 
        error.message.includes('max fee per gas less than block base fee')) {
      
      try {
        console.log('Retrying with higher gas price...');
        
        // Generate a new wallet (since the previous attempt might have partial state)
        const agentWallet = walletGenerator.generateWallet();
        
        // Use a higher gas price for the retry
        const tx = await contract.addAgent(
          req.query.name,
          agentWallet.address,
          req.query.socialLink || '',
          req.query.profileUrl || '',
          req.query.description || req.query.name,
          agentWallet.address,
          {
            maxFeePerGas: ethers.utils.parseUnits("0.002", "gwei"),      // Higher backup gas price
            maxPriorityFeePerGas: ethers.utils.parseUnits("0.0002", "gwei")
          }
        );
        
        console.log(`Retry transaction submitted: ${tx.hash}`);
        const receipt = await tx.wait();
        
        // Find the AgentAdded event
        const addedEvent = receipt.events.find(e => e.event === 'AgentAdded');
        const agentId = addedEvent.args.id.toString();
        
        // Log retry gas usage
        const effectiveGasPrice = receipt.effectiveGasPrice;
        const gasUsed = receipt.gasUsed;
        console.log(`Retry gas used: ${gasUsed.toString()}`);
        console.log(`Retry effective gas price: ${ethers.utils.formatUnits(effectiveGasPrice, "gwei")} Gwei`);
        
        // Return success response
        return res.json({
          success: true,
          message: 'Agent successfully registered (retry)',
          agent: {
            id: agentId,
            name: req.query.name,
            wallet_address: agentWallet.address,
            socialLink: req.query.socialLink || '',
            profileUrl: req.query.profileUrl || '',
            description: req.query.description || req.query.name,
            wallet: {
              address: agentWallet.address,
              privateKey: agentWallet.privateKey
            }
          },
          transaction: {
            hash: receipt.transactionHash,
            blockNumber: receipt.blockNumber,
            gasUsed: gasUsed.toString(),
            effectiveGasPrice: ethers.utils.formatUnits(effectiveGasPrice, "gwei") + " Gwei"
          }
        });
        
      } catch (retryError) {
        console.error('Retry also failed:', retryError);
        return res.status(500).json({
          success: false,
          error: `Initial attempt: ${error.message}, Retry: ${retryError.message}`
        });
      }
    }
    
    // For non-gas errors, just return the error
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Add a status endpoint for health checks
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    contractAddress: CONTRACT_ADDRESS,
    rpcUrl: RPC_URL
  });
});

// Start the server
const PORT = process.env.PORT || 5002;
app.listen(PORT, () => {
  console.log(`Agent registration API running on port ${PORT}`);
  console.log(`Contract address: ${CONTRACT_ADDRESS}`);
  console.log(`RPC URL: ${RPC_URL}`);
});