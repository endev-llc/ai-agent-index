const hre = require("hardhat");

async function main() {
  console.log("Starting deployment...");

  // Configuration
  const feeCollector = "0xEEFD3e2CF0c5b38B26a95C317DA3C23E10de5336"; // Replace with your address
  const initialFee = hre.ethers.parseEther("0.001"); // Initial listing fee (0.001 ETH)

  // First deploy the implementation contract
  const AIAgentIndex = await hre.ethers.getContractFactory("AIAgentIndex");
  console.log("Deploying AIAgentIndex implementation...");
  const implementation = await AIAgentIndex.deploy(feeCollector, initialFee);
  await implementation.waitForDeployment();
  
  const implementationAddress = await implementation.getAddress();
  console.log("AIAgentIndex implementation deployed to:", implementationAddress);

  // Deploy the proxy contract
  const AIAgentIndexProxy = await hre.ethers.getContractFactory("AIAgentIndexProxy");
  console.log("Deploying AIAgentIndexProxy...");
  const proxy = await AIAgentIndexProxy.deploy();
  await proxy.waitForDeployment();
  
  const proxyAddress = await proxy.getAddress();
  console.log("AIAgentIndexProxy deployed to:", proxyAddress);

  // Set the implementation in the proxy
  console.log("Setting implementation in proxy...");
  await proxy.upgradeTo(implementationAddress);
  console.log("Implementation set successfully");

  // Verify the implementation contract
  console.log("Verifying implementation contract...");
  try {
    await hre.run("verify:verify", {
      address: implementationAddress,
      constructorArguments: [feeCollector, initialFee]  // Include constructor arguments here too
    });
    console.log("Implementation contract verified successfully");
  } catch (error) {
    console.log("Error verifying implementation:", error);
  }

  // Verify the proxy contract
  console.log("Verifying proxy contract...");
  try {
    await hre.run("verify:verify", {
      address: proxyAddress,
      constructorArguments: []
    });
    console.log("Proxy contract verified successfully");
  } catch (error) {
    console.log("Error verifying proxy:", error);
  }

  console.log("\nDeployment Summary:");
  console.log("Implementation:", implementationAddress);
  console.log("Proxy:", proxyAddress);
  console.log("Fee Collector:", feeCollector);
  console.log("Initial Fee:", hre.ethers.formatEther(initialFee), "ETH");
  console.log("\nUse the PROXY address for all interactions!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });