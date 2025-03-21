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

// Import services
const authService = require('./services/authService');
const MessageService = require('./services/messageService');
const responseFormatter = require('./utils/responseFormatter');

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
    
    if (!auth) {
      return res.status(400).json(responseFormatter.error('Authentication is required'));
    }
    
    // Get sender's wallet from auth
    try {
      const senderWallet = authService.getWalletFromAuth(auth, provider);
      const senderAddress = senderWallet.address;
      
      // Check if agent exists in registry
      const agentExists = await messageService.checkAgentExists(senderAddress);
      
      if (!agentExists) {
        // Agent needs to register first
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
      return res.status(400).json(responseFormatter.error(
        `Authentication error: ${error.message}`
      ));
    }
  } catch (error) {
    console.error('Error processing message:', error);
    return res.status(500).json(responseFormatter.error(
      `Server error: ${error.message}`, 500
    ));
  }
});

// Registration endpoint (for new agents)
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
      
      // Register the agent in the contract
      const tx = await contract.addAgent(
        name,
        address,
        socialLink || '',
        profileUrl || '',
        description || name,
        address
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