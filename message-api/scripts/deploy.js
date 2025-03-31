// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  // Get the deployer account
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with account:", deployer.address);

  // Deploy EntryPoint
  console.log("Deploying EntryPoint...");
  const EntryPoint = await hre.ethers.getContractFactory("EntryPoint");
  const entryPoint = await EntryPoint.deploy();
  
  // Wait for deployment and get address (compatible with both ethers v5 and v6)
  let entryPointAddress;
  if (entryPoint.deployTransaction) {
    // ethers v5
    await entryPoint.deployTransaction.wait();
    entryPointAddress = entryPoint.address;
  } else {
    // ethers v6
    await entryPoint.waitForDeployment();
    entryPointAddress = await entryPoint.getAddress();
  }
  console.log("EntryPoint deployed at:", entryPointAddress);

  // Deploy SimpleAccountFactory
  console.log("Deploying SimpleAccountFactory...");
  const Factory = await hre.ethers.getContractFactory("SimpleAccountFactory");
  const factory = await Factory.deploy(entryPointAddress);
  
  // Wait for deployment and get address
  let factoryAddress;
  if (factory.deployTransaction) {
    // ethers v5
    await factory.deployTransaction.wait();
    factoryAddress = factory.address;
  } else {
    // ethers v6
    await factory.waitForDeployment();
    factoryAddress = await factory.getAddress();
  }
  console.log("Factory deployed at:", factoryAddress);

  // Deploy SimplePaymaster
  console.log("Deploying SimplePaymaster...");
  const Paymaster = await hre.ethers.getContractFactory("SimplePaymaster");
  const paymaster = await Paymaster.deploy(entryPointAddress);
  
  // Wait for deployment and get address
  let paymasterAddress;
  if (paymaster.deployTransaction) {
    // ethers v5
    await paymaster.deployTransaction.wait();
    paymasterAddress = paymaster.address;
  } else {
    // ethers v6
    await paymaster.waitForDeployment();
    paymasterAddress = await paymaster.getAddress();
  }
  console.log("Paymaster deployed at:", paymasterAddress);

  // Fund the paymaster directly
  console.log("Funding paymaster directly...");
  const parseEther = hre.ethers.utils?.parseEther || hre.ethers.parseEther;
  const fundingTx = await deployer.sendTransaction({
    to: paymasterAddress,
    value: parseEther("0.01")
  });
  await fundingTx.wait();
  console.log("Paymaster funded with 0.01 ETH");

  // Fund the EntryPoint contract
  console.log("Funding EntryPoint for paymaster...");
  let depositTx;
  try {
    depositTx = await entryPoint.depositFor(paymasterAddress, {
      value: parseEther("0.005")
    });
  } catch (error) {
    console.error("Error depositing to EntryPoint:", error.message);
    console.log("Attempting alternative deposit method...");
    
    // Alternative: just send ETH directly to the EntryPoint
    depositTx = await deployer.sendTransaction({
      to: entryPointAddress,
      value: parseEther("0.005"),
      data: hre.ethers.utils?.defaultAbiCoder.encode(
        ["address"], 
        [paymasterAddress]
      ) || hre.ethers.AbiCoder.defaultAbiCoder().encode(
        ["address"], 
        [paymasterAddress]
      )
    });
  }
  await depositTx.wait();
  console.log("EntryPoint funded for paymaster");

  console.log("\nDeployment Summary:");
  console.log(`EntryPoint: ${entryPointAddress}`);
  console.log(`SimpleAccountFactory: ${factoryAddress}`);
  console.log(`SimplePaymaster: ${paymasterAddress}`);
  console.log("\nAdd these to your .env file:");
  console.log(`ENTRYPOINT_ADDRESS=${entryPointAddress}`);
  console.log(`FACTORY_ADDRESS=${factoryAddress}`);
  console.log(`PAYMASTER_ADDRESS=${paymasterAddress}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });