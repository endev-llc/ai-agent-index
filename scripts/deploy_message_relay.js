const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying MessageRelay contract...");

  // Deploy the MessageRelay contract
  const MessageRelay = await ethers.getContractFactory("MessageRelay");
  const messageRelay = await MessageRelay.deploy();
  await messageRelay.waitForDeployment();
  
  // Get the deployed contract address
  const messageRelayAddress = await messageRelay.getAddress();
  console.log(`MessageRelay deployed to: ${messageRelayAddress}`);
  
  // Deploy the MessageReceiver contract for demonstration
  const MessageReceiver = await ethers.getContractFactory("MessageReceiver");
  const receiver = await MessageReceiver.deploy();
  await receiver.waitForDeployment();
  
  // Get the receiver address
  const receiverAddress = await receiver.getAddress();
  console.log(`MessageReceiver deployed to: ${receiverAddress}`);
  
  console.log(`Add MESSAGE_RELAY_ADDRESS=${messageRelayAddress} to your .env file`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });