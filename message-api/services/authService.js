// services/authService.js
const { ethers } = require('ethers');

class AuthService {
  /**
   * Validate if string is a valid private key
   */
  isValidPrivateKey(authString) {
    if (!authString || authString.trim() === '') {
      return false;
    }
    
    // Check if it's a valid private key (64 hex chars)
    try {
      if (/^(0x)?[0-9a-fA-F]{64}$/.test(authString)) {
        // Try to create a wallet to verify it's a valid key
        const privateKey = authString.startsWith('0x') ? authString : `0x${authString}`;
        new ethers.Wallet(privateKey);
        return true;
      }
      return false;
    } catch (e) {
      return false;
    }
  }

  /**
   * Generate wallet from private key
   */
  getWalletFromAuth(authString, provider) {
    try {
      const privateKey = this.validatePrivateKey(authString);
      return new ethers.Wallet(privateKey, provider);
    } catch (error) {
      throw new Error(`Invalid authentication: ${error.message}`);
    }
  }

  /**
   * Validate private key format
   */
  validatePrivateKey(authString) {
    // Check if it's a valid private key (64 hex chars)
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(authString)) {
      return authString.startsWith('0x') ? authString : `0x${authString}`;
    }
    
    throw new Error('Invalid private key format. Must be 64 hex characters with optional 0x prefix.');
  }

  /**
   * Get wallet address without requiring provider connection
   */
  getAddressFromAuth(authString) {
    try {
      const privateKey = this.validatePrivateKey(authString);
      return new ethers.Wallet(privateKey).address;
    } catch (error) {
      throw new Error(`Invalid authentication: ${error.message}`);
    }
  }

  /**
   * Generate a shell command to save auth to local file
   */
  generateSaveCommand(auth) {
    return `echo '${auth}' > ~/.agent_secret && chmod 600 ~/.agent_secret && echo "Secret saved to ~/.agent_secret"`;
  }
}

module.exports = new AuthService();