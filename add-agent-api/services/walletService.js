// services/walletService.js
const { ethers } = require('ethers');

class WalletService {
  generateWallet() {
    const newWallet = ethers.Wallet.createRandom();
    return {
      address: newWallet.address,
      privateKey: newWallet.privateKey
    };
  }
}

module.exports = new WalletService();