const hre = require("hardhat");

async function main() {
  console.log("Starting deployment...");

  // Get the ContractFactory
  const AIAgentIndex = await hre.ethers.getContractFactory("AIAgentIndex");
  
  // Deploy the contract
  console.log("Deploying AIAgentIndex...");
  const aiAgentIndex = await AIAgentIndex.deploy();

  // Wait for deployment to finish
  await aiAgentIndex.waitForDeployment();
  
  // Get the deployed contract address
  const contractAddress = await aiAgentIndex.getAddress();
  console.log("AIAgentIndex deployed to:", contractAddress);

  // Verify the contract on Basescan
  console.log("Waiting for deployment confirmations...");
  await aiAgentIndex.deploymentTransaction().wait(5); // Wait for 5 block confirmations

  console.log("Verifying contract on Basescan...");
  try {
    await hre.run("verify:verify", {
      address: contractAddress,
      constructorArguments: [],
    });
    console.log("Contract verified successfully");
  } catch (error) {
    console.log("Error verifying contract:", error);
  }
}

// Execute deployment
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });