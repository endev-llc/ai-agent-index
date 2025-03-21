// services/messageService.js
const { ethers } = require('ethers');

class MessageService {
  constructor(contract, provider) {
    this.contract = contract;
    this.provider = provider;
  }

  /**
   * Send a message on-chain by calling a custom transaction
   */
  async sendMessage(fromWallet, toAddress, message) {
    try {
      // Get optimal gas settings
      const gasSettings = await this.getMinimumViableGasPrice();
      
      // Create transaction data - a simple transfer with message in data field
      const tx = {
        to: toAddress, 
        value: 0,
        data: ethers.utils.toUtf8Bytes(message),
        ...gasSettings
      };
      
      // Sign and send transaction
      const signedTx = await fromWallet.sendTransaction(tx);
      console.log(`Message transaction submitted: ${signedTx.hash}`);
      
      // Wait for confirmation
      const receipt = await signedTx.wait();
      console.log(`Gas used: ${receipt.gasUsed.toString()}`);
      
      return {
        success: true,
        hash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        effectiveGasPrice: ethers.utils.formatUnits(receipt.effectiveGasPrice, "gwei") + " Gwei"
      };
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Get minimum viable gas price for Base network
   */
  async getMinimumViableGasPrice() {
    try {
      // Get current fee data
      const feeData = await this.provider.getFeeData();
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

  /**
   * Check if an agent exists in the registry
   */
  async checkAgentExists(address) {
    try {
      // Search through agents to check if this address is registered
      let exists = false;
      let i = 0;
      const pageSize = 10;
      
      while (!exists) {
        // Get a page of agents
        const results = await this.contract.searchPaginated("", i, pageSize);
        
        // Check if this address is in the results
        for (const result of results[0]) {
          if (result.agent.wallet_address.toLowerCase() === address.toLowerCase()) {
            exists = true;
            break;
          }
        }
        
        // Check if we've reached the end or should continue
        if (!results[2] || results[0].length === 0) {
          break;
        }
        
        i += pageSize;
        
        // Failsafe to prevent infinite loops
        if (i > 10000) break;
      }
      
      return exists;
    } catch (error) {
      console.error('Error checking if agent exists:', error);
      return false;
    }
  }
  
  /**
   * Format a message response
   */
  formatMessageResponse(tx, fromAddress, toAddress, message) {
    return {
      success: true,
      message: "Message sent successfully",
      from: fromAddress,
      to: toAddress,
      text: message,
      transaction: {
        hash: tx.hash,
        blockNumber: tx.blockNumber,
        gasUsed: tx.gasUsed,
        effectiveGasPrice: tx.effectiveGasPrice
      }
    };
  }
}

module.exports = MessageService;