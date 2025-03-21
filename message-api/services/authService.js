// services/authService.js
const { ethers } = require('ethers');
const bip39 = require('bip39');
const crypto = require('crypto');

class AuthService {
  /**
   * Detect auth type and derive wallet
   */
  detectAuthType(authString) {
    // Check if it's a valid private key (64 hex chars)
    if (/^(0x)?[0-9a-fA-F]{64}$/.test(authString)) {
      return {
        type: 'privateKey',
        value: authString.startsWith('0x') ? authString : `0x${authString}`
      };
    }
    
    // Check if it's a valid BIP-39 mnemonic (12 or 24 words)
    const words = authString.split(/\s+/).filter(Boolean);
    if ((words.length === 12 || words.length === 24) && bip39.validateMnemonic(authString)) {
      return {
        type: 'mnemonic',
        value: authString
      };
    }
    
    // Otherwise treat as a secret phrase
    return {
      type: 'secret',
      value: authString
    };
  }

  /**
   * Generate wallet from auth string
   */
  getWalletFromAuth(authString, provider) {
    const auth = this.detectAuthType(authString);
    
    try {
      switch (auth.type) {
        case 'privateKey':
          return new ethers.Wallet(auth.value, provider);
        
        case 'mnemonic':
          return ethers.Wallet.fromMnemonic(auth.value).connect(provider);
        
        case 'secret':
          // Generate deterministic private key from secret
          const hash = crypto.createHash('sha256')
            .update(auth.value)
            .digest('hex');
          
          // Ensure it's a valid private key (must be less than curve order)
          const privateKey = `0x${hash}`;
          return new ethers.Wallet(privateKey, provider);
      }
    } catch (error) {
      throw new Error(`Invalid authentication: ${error.message}`);
    }
  }

  /**
   * Get wallet address without requiring provider connection
   */
  getAddressFromAuth(authString) {
    const auth = this.detectAuthType(authString);
    
    try {
      switch (auth.type) {
        case 'privateKey':
          return new ethers.Wallet(auth.value).address;
        
        case 'mnemonic':
          return ethers.Wallet.fromMnemonic(auth.value).address;
        
        case 'secret':
          const hash = crypto.createHash('sha256')
            .update(auth.value)
            .digest('hex');
          
          const privateKey = `0x${hash}`;
          return new ethers.Wallet(privateKey).address;
      }
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