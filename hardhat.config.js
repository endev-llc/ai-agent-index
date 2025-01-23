require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

module.exports = {
  solidity: "0.8.19",
  networks: {
    base_sepolia: {  // changed from base_goerli
      url: 'https://sepolia.base.org',
      accounts: [process.env.PRIVATE_KEY],
    }
  }
};
