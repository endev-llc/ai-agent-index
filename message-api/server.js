// server.js
const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// Load environment variables
dotenv.config();

// Import services
const authService = require('./services/authService');
const MessageService = require('./services/messageService');
const responseFormatter = require('./utils/responseFormatter');
// Import the wallet generator
const walletGenerator = require('./services/walletService');

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
const messageService = new MessageService(contract, provider);

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

// Universal message endpoint
app.get('/message', async (req, res) => {
  try {
    const { to, text, auth } = req.query;
    
    // Validate basic parameters
    if (!to) {
      return res.status(400).json(responseFormatter.error('Recipient address is required'));
    }
    
    if (!text) {
      return res.status(400).json(responseFormatter.error('Message text is required'));
    }
    
    // If auth is missing or empty, prompt for registration with wallet generation
    if (!auth || auth.trim() === '') {
      console.log('Empty auth value, prompting for registration with wallet generation');
      return res.status(400).json(responseFormatter.newRegistrationPrompt(to, text));
    }
    
    // Check if auth is a valid private key
    if (!authService.isValidPrivateKey(auth)) {
      // If not a valid private key, prompt for registration with wallet generation
      console.log('Invalid private key format, prompting for registration with wallet generation');
      return res.status(400).json(responseFormatter.newRegistrationPrompt(to, text));
    }
    
    // Get sender's wallet from auth
    try {
      const senderWallet = authService.getWalletFromAuth(auth, provider);
      const senderAddress = senderWallet.address;
      
      // Check if agent exists in registry
      const agentExists = await messageService.checkAgentExists(senderAddress);
      
      if (!agentExists) {
        // Agent needs to register first (but they already have a private key)
        return res.status(400).json(
          responseFormatter.registrationRequired(to, text, auth)
        );
      }
      
      // Send the message
      const txResult = await messageService.sendMessage(senderWallet, to, text);
      
      // Generate command to save auth locally
      const saveCommand = authService.generateSaveCommand(auth);
      
      // Format the response
      const response = messageService.formatMessageResponse(
        txResult, 
        senderAddress, 
        to, 
        text
      );
      
      // Add save command if needed
      response.saveSecretCommand = saveCommand;
      
      return res.json(response);
      
    } catch (error) {
      // If there's an authentication error, prompt for registration with wallet generation
      console.log('Authentication error:', error.message);
      return res.status(400).json(responseFormatter.newRegistrationPrompt(to, text));
    }
  } catch (error) {
    console.error('Error processing message:', error);
    return res.status(500).json(responseFormatter.error(
      `Server error: ${error.message}`, 500
    ));
  }
});

// Register agent with GET endpoint for curl-friendly usage (similar to add-agent-api)
app.get('/register-agent', async (req, res) => {
  try {
    // Extract parameters from query string
    const { name, socialLink, profileUrl, description } = req.query;
    
    if (!name) {
      return res.status(400).json(responseFormatter.error('Agent name is required'));
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
      },
      messageExample: `curl -G 'http://localhost:5003/message' \\
  --data-urlencode 'to=RECIPIENT_ADDRESS' \\
  --data-urlencode 'text=YOUR_MESSAGE' \\
  --data-urlencode 'auth=${agentWallet.privateKey}'`
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
          },
          messageExample: `curl -G 'http://localhost:5003/message' \\
  --data-urlencode 'to=RECIPIENT_ADDRESS' \\
  --data-urlencode 'text=YOUR_MESSAGE' \\
  --data-urlencode 'auth=${agentWallet.privateKey}'`
        });
        
      } catch (retryError) {
        console.error('Retry also failed:', retryError);
        return res.status(500).json(responseFormatter.error(
          `Initial attempt: ${error.message}, Retry: ${retryError.message}`, 500
        ));
      }
    }
    
    // For non-gas errors, just return the error
    return res.status(500).json(responseFormatter.error(
      `Registration error: ${error.message}`, 500
    ));
  }
});

// Registration endpoint (for existing private key)
app.get('/register', async (req, res) => {
  try {
    const { 
      name, 
      description, 
      socialLink, 
      profileUrl, 
      auth,
      pendingMessageTo,
      pendingMessageText
    } = req.query;
    
    // Validate required fields
    if (!name) {
      return res.status(400).json(responseFormatter.error('Agent name is required'));
    }
    
    if (!auth) {
      return res.status(400).json(responseFormatter.error('Authentication is required'));
    }
    
    // Get the wallet address from auth
    try {
      const address = authService.getAddressFromAuth(auth);
      
      // Get optimal gas settings
      const gasSettings = await getMinimumViableGasPrice();
      
      // Register the agent in the contract
      const tx = await contract.addAgent(
        name,
        address,
        socialLink || '',
        profileUrl || '',
        description || name,
        address,
        gasSettings
      );
      
      console.log(`Registration transaction submitted: ${tx.hash}`);
      const receipt = await tx.wait();
      
      // Find the AgentAdded event to get the agent ID
      const addedEvent = receipt.events.find(e => e.event === 'AgentAdded');
      const agentId = addedEvent.args.id.toString();
      
      // Generate command to save auth locally
      const saveCommand = authService.generateSaveCommand(auth);
      
      // Prepare response
      const response = {
        success: true,
        message: 'Agent successfully registered',
        agent: {
          id: agentId,
          name,
          wallet_address: address,
          socialLink: socialLink || '',
          profileUrl: profileUrl || '',
          description: description || name
        },
        transaction: {
          hash: receipt.transactionHash,
          blockNumber: receipt.blockNumber,
          gasUsed: receipt.gasUsed.toString(),
          effectiveGasPrice: ethers.utils.formatUnits(receipt.effectiveGasPrice, "gwei") + " Gwei"
        },
        saveSecretCommand: saveCommand
      };
      
      // If there's a pending message, send it
      if (pendingMessageTo && pendingMessageText) {
        try {
          const senderWallet = authService.getWalletFromAuth(auth, provider);
          const txResult = await messageService.sendMessage(
            senderWallet, 
            pendingMessageTo, 
            pendingMessageText
          );
          
          response.pendingMessage = {
            status: 'sent',
            to: pendingMessageTo,
            text: pendingMessageText,
            transaction: {
              hash: txResult.hash,
              blockNumber: txResult.blockNumber,
              gasUsed: txResult.gasUsed,
              effectiveGasPrice: txResult.effectiveGasPrice
            }
          };
        } catch (messageError) {
          response.pendingMessage = {
            status: 'failed',
            error: messageError.message
          };
        }
      }
      
      return res.json(response);
      
    } catch (error) {
      // If we get a gas-related error, retry once with higher gas
      if (error.code === 'UNPREDICTABLE_GAS_LIMIT' || 
          error.message.includes('max fee per gas less than block base fee')) {
        
        try {
          console.log('Retrying with higher gas price...');
          
          const address = authService.getAddressFromAuth(auth);
          
          // Use a higher gas price for the retry
          const tx = await contract.addAgent(
            name,
            address,
            socialLink || '',
            profileUrl || '',
            description || name,
            address,
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
          
          // Generate command to save auth locally
          const saveCommand = authService.generateSaveCommand(auth);
          
          // Return success response
          const response = {
            success: true,
            message: 'Agent successfully registered (retry)',
            agent: {
              id: agentId,
              name,
              wallet_address: address,
              socialLink: socialLink || '',
              profileUrl: profileUrl || '',
              description: description || name
            },
            transaction: {
              hash: receipt.transactionHash,
              blockNumber: receipt.blockNumber,
              gasUsed: gasUsed.toString(),
              effectiveGasPrice: ethers.utils.formatUnits(effectiveGasPrice, "gwei") + " Gwei"
            },
            saveSecretCommand: saveCommand
          };
          
          // If there's a pending message, send it
          if (pendingMessageTo && pendingMessageText) {
            try {
              const senderWallet = authService.getWalletFromAuth(auth, provider);
              const txResult = await messageService.sendMessage(
                senderWallet, 
                pendingMessageTo, 
                pendingMessageText
              );
              
              response.pendingMessage = {
                status: 'sent',
                to: pendingMessageTo,
                text: pendingMessageText,
                transaction: {
                  hash: txResult.hash,
                  blockNumber: txResult.blockNumber,
                  gasUsed: txResult.gasUsed,
                  effectiveGasPrice: txResult.effectiveGasPrice
                }
              };
            } catch (messageError) {
              response.pendingMessage = {
                status: 'failed',
                error: messageError.message
              };
            }
          }
          
          return res.json(response);
          
        } catch (retryError) {
          console.error('Retry also failed:', retryError);
          return res.status(500).json(responseFormatter.error(
            `Initial attempt: ${error.message}, Retry: ${retryError.message}`, 500
          ));
        }
      }
      
      return res.status(400).json(responseFormatter.error(
        `Registration error: ${error.message}`
      ));
    }
  } catch (error) {
    console.error('Error processing registration:', error);
    return res.status(500).json(responseFormatter.error(
      `Server error: ${error.message}`, 500
    ));
  }
});

// Status endpoint for health checks
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    contractAddress: CONTRACT_ADDRESS,
    rpcUrl: RPC_URL
  });
});

// Start the server
const PORT = process.env.PORT || 5003;
app.listen(PORT, () => {
  console.log(`Agent messaging API running on port ${PORT}`);
  console.log(`Contract address: ${CONTRACT_ADDRESS}`);
  console.log(`RPC URL: ${RPC_URL}`);
});