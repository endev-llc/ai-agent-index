// bundler/bundler.js
const express = require('express');
const bodyParser = require('body-parser');
const { ethers } = require('ethers');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

// Initialize Express for the bundler API
const app = express();
app.use(bodyParser.json());

// Contract configuration
const ENTRYPOINT_ADDRESS = process.env.ENTRYPOINT_ADDRESS;
const PAYMASTER_ADDRESS = process.env.PAYMASTER_ADDRESS;
const RPC_URL = process.env.RPC_URL || 'https://sepolia.base.org';
const BUNDLER_PRIVATE_KEY = process.env.PRIVATE_KEY;

// EntryPoint minimal ABI
const entryPointAbi = [
  "function handleOps((address sender, bytes callData, uint256 nonce, bytes signature, address paymaster)[]) external",
  "function nonces(address) view returns (uint256)"
];

// Provider setup
const provider = new ethers.providers.JsonRpcProvider(RPC_URL);
const bundlerWallet = new ethers.Wallet(BUNDLER_PRIVATE_KEY, provider);
const entryPointContract = new ethers.Contract(ENTRYPOINT_ADDRESS, entryPointAbi, bundlerWallet);

// In-memory storage for pending operations
let pendingOps = [];

// POST /relay - Queue UserOps for future submission
app.post('/relay', async (req, res) => {
  try {
    const { ops } = req.body;
    if (!ops || !Array.isArray(ops)) {
      return res.status(400).json({ error: "Invalid request format. Expected {ops: [UserOperation]}" });
    }

    console.log(`Received ${ops.length} UserOperations`);
    
    // Add paymaster to all operations if not specified
    const processedOps = ops.map(op => {
      if (!op.paymaster) {
        return {
          ...op,
          paymaster: PAYMASTER_ADDRESS
        };
      }
      return op;
    });
    
    // Store the operations for later submission
    pendingOps.push(...processedOps);
    
    return res.json({ 
      success: true, 
      message: `Queued ${ops.length} UserOperation(s)`,
      opsQueued: ops.length,
      totalPending: pendingOps.length
    });
  } catch (error) {
    console.error("Error in /relay:", error);
    return res.status(500).json({ error: error.message });
  }
});

// POST /submitAll - Submit all pending UserOps to EntryPoint
app.post('/submitAll', async (req, res) => {
  try {
    if (pendingOps.length === 0) {
      return res.status(400).json({ error: "No operations to submit" });
    }

    console.log(`Submitting ${pendingOps.length} UserOperations to EntryPoint...`);
    
    try {
      // Create a copy of pending ops that we'll submit
      const opsToSubmit = [...pendingOps];
      
      // Clear the queue before we submit to avoid double-submission
      pendingOps = [];
      
      // Get current gas prices from the network with adequate buffer
      const feeData = await provider.getFeeData();
      console.log("Current network fee data:", {
        maxFeePerGas: ethers.utils.formatUnits(feeData.maxFeePerGas || feeData.gasPrice, "gwei") + " gwei",
        maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? 
          ethers.utils.formatUnits(feeData.maxPriorityFeePerGas, "gwei") + " gwei" : "not available"
      });
      
      // Set gas prices with a buffer to ensure the transaction is accepted
      // Using factor of 3 to ensure it's definitely high enough
      const maxFeePerGas = feeData.maxFeePerGas ? 
        feeData.maxFeePerGas.mul(3) : 
        ethers.utils.parseUnits("1", "gwei");
        
      const maxPriorityFeePerGas = feeData.maxPriorityFeePerGas ?
        feeData.maxPriorityFeePerGas.mul(3) :
        ethers.utils.parseUnits("0.1", "gwei");
      
      console.log("Using gas settings:", {
        maxFeePerGas: ethers.utils.formatUnits(maxFeePerGas, "gwei") + " gwei",
        maxPriorityFeePerGas: ethers.utils.formatUnits(maxPriorityFeePerGas, "gwei") + " gwei"
      });
      
      // Debug: print out the operations we're about to submit
      console.log("Operations to submit:", JSON.stringify(opsToSubmit));
      
      // Submit the operations to the EntryPoint with higher gas limit for safety
      const tx = await entryPointContract.handleOps(opsToSubmit, {
        gasLimit: 5000000,  // Increased gas limit to handle potential complexity
        maxFeePerGas,
        maxPriorityFeePerGas
      });
      
      console.log(`Transaction submitted: ${tx.hash}`);
      
      // Wait for confirmation with additional timeout for network congestion
      const receipt = await tx.wait(1); // Wait for 1 confirmation
      
      console.log(`Transaction confirmed in block ${receipt.blockNumber} with status ${receipt.status}`);
      
      if (receipt.status === 0) {
        console.error("Transaction was mined but failed. Gas used:", receipt.gasUsed.toString());
        return res.status(500).json({ 
          error: "Transaction execution failed",
          txHash: receipt.transactionHash
        });
      }
      
      return res.json({
        success: true,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        opsSubmitted: opsToSubmit.length,
        gasUsed: receipt.gasUsed.toString()
      });
    } catch (error) {
      console.error("Error submitting UserOps:", error);
      
      // Put the operations back in the queue
      pendingOps = [...pendingOps];
      
      return res.status(500).json({ error: error.message });
    }
  } catch (error) {
    console.error("Error in /submitAll:", error);
    return res.status(500).json({ error: error.message });
  }
});

// GET /status - Check bundler status
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    pendingOps: pendingOps.length,
    entryPointAddress: ENTRYPOINT_ADDRESS,
    paymasterAddress: PAYMASTER_ADDRESS
  });
});

// Start the bundler server
const PORT = process.env.BUNDLER_PORT || 4337;
app.listen(PORT, () => {
  console.log(`Bundler running on port ${PORT}`);
  console.log(`EntryPoint address: ${ENTRYPOINT_ADDRESS}`);
  console.log(`Paymaster address: ${PAYMASTER_ADDRESS}`);
});