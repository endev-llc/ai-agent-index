// services/messageService.js
const { ethers } = require('ethers');
const fetch = require('node-fetch');

class MessageService {
  constructor(contract, provider) {
    this.contract = contract;
    this.provider = provider;
    this.subgraphUrl = 'https://api.studio.thegraph.com/query/103943/ai-agent-index/version/latest';
    this.PAGE_SIZE = 1000; // TheGraph typically returns at most 1000 records per query
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
      // Make sure we preserve the original error code
      if (error.code) {
        throw error;
      } else {
        throw new Error(`Message sending failed: ${error.message}`);
      }
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
   * Check if an agent exists in the registry by querying the subgraph with pagination
   */
  async checkAgentExists(address) {
    try {
      console.log(`Checking if agent with address ${address} exists in subgraph...`);
      
      // Normalize the address (convert to lowercase)
      const normalizedAddress = address.toLowerCase();
      
      let skip = 0;
      let foundAgent = false;
      let totalFetched = 0;
      
      // Pagination loop - continue until we find the agent or run out of results
      while (true) {
        console.log(`Fetching agents from subgraph (skip=${skip}, limit=${this.PAGE_SIZE})...`);
        
        const query = {
          query: `
            query($first: Int!, $skip: Int!) {
              agents(
                first: $first, 
                skip: $skip
              ) {
                id
                address
                name
                isActive
              }
            }
          `,
          variables: {
            first: this.PAGE_SIZE,
            skip: skip
          }
        };
        
        // Make request to the subgraph
        const response = await fetch(this.subgraphUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(query)
        });
        
        if (!response.ok) {
          throw new Error(`Subgraph query failed: ${response.statusText}`);
        }
        
        const result = await response.json();
        
        // Check for errors in response
        if (result.errors) {
          throw new Error(`GraphQL errors: ${JSON.stringify(result.errors)}`);
        }
        
        // Extract agents from response
        const agents = result.data.agents;
        console.log(`Fetched ${agents.length} agents (page ${skip/this.PAGE_SIZE + 1})`);
        
        // Check if our agent exists in this batch
        for (const agent of agents) {
          // Compare addresses (case-insensitive)
          if (agent.address.toLowerCase() === normalizedAddress) {
            console.log(`Found agent with ID ${agent.id} and name "${agent.name}"`);
            // Only return true if the agent is active
            foundAgent = agent.isActive;
            console.log(`Agent is ${foundAgent ? 'active' : 'inactive'}`);
            break;
          }
        }
        
        // If we found the agent or reached the end of results, exit loop
        if (foundAgent || agents.length < this.PAGE_SIZE) {
          break;
        }
        
        // Move to next page
        skip += this.PAGE_SIZE;
        totalFetched += agents.length;
        
        // Safety check to prevent infinite loops (stop after ~100k agents)
        if (totalFetched > 100000) {
          console.log('Reached maximum fetch limit, stopping search');
          break;
        }
      }
      
      console.log(`Agent exists check result: ${foundAgent}`);
      return foundAgent;
    } catch (error) {
      console.error('Error querying subgraph:', error);
      
      // Fallback to contract check if subgraph fails
      console.log('Falling back to contract-based check...');
      return this.checkAgentExistsInContract(address);
    }
  }
  
  /**
   * Fallback method to check if agent exists by directly querying the contract
   */
  async checkAgentExistsInContract(address) {
    try {
      console.log(`Checking if agent with address ${address} exists via contract...`);
      
      // Get the total agent count
      const agentCount = await this.contract.agentCount();
      console.log(`Total agents in registry: ${agentCount.toString()}`);
      
      if (agentCount.toNumber() === 0) {
        console.log('No agents in registry');
        return false;
      }
      
      // Try to find the agent by checking each agent
      for (let i = 1; i <= Math.min(agentCount.toNumber(), 2000); i++) {
        try {
          const agent = await this.contract.getAgent(i);
          
          // Check if this is the agent we're looking for
          if (agent.address_.toLowerCase() === address.toLowerCase()) {
            console.log(`Found agent #${i} with matching address`);
            return agent.isActive;
          }
        } catch (err) {
          // Skip this agent if there's an error
          console.log(`Error checking agent #${i}: ${err.message}`);
        }
      }
      
      console.log('No matching agent found');
      return false;
    } catch (error) {
      console.error('Error in contract-based agent check:', error);
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