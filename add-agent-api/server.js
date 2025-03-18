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

// Create the wallet service
const walletService = {
  generateWallet() {
    const newWallet = ethers.Wallet.createRandom();
    return {
      address: newWallet.address,
      privateKey: newWallet.privateKey
    };
  }
};

// Initialize Express
const app = express();
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Contract configuration
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS || '0xDe438021611C7878ECeb271FCEF15Fc12890019f';
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const PRIVATE_KEY = process.env.PRIVATE_KEY;

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
    const agentWallet = walletService.generateWallet();
    
    console.log(`Registering agent: ${name}`);
    console.log(`Generated wallet address: ${agentWallet.address}`);
    
    // Submit transaction
    const tx = await contract.addAgent(
      name,
      agentWallet.address,  // Use wallet address for wallet_address field
      socialLink || '',
      profileUrl || '',
      description || name,
      agentWallet.address   // Also use wallet address as admin_address
    );
    
    console.log(`Transaction submitted: ${tx.hash}`);
    
    // Wait for confirmation
    const receipt = await tx.wait();
    
    // Find the AgentAdded event to get the agent ID
    const addedEvent = receipt.events.find(e => e.event === 'AgentAdded');
    const agentId = addedEvent.args.id.toString();
    
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
        blockNumber: receipt.blockNumber
      }
    });
    
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({
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