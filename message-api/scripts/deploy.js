// scripts/deploy.js
const hre = require("hardhat");

async function main() {
  console.log("Deploying EntryPoint...");
  const EntryPoint = await hre.ethers.getContractFactory("EntryPoint");
  const entryPoint = await EntryPoint.deploy();
  await entryPoint.waitForDeployment();
  const entryPointAddress = await entryPoint.getAddress();
  console.log("EntryPoint deployed at:", entryPointAddress);

  console.log("Deploying SimpleAccountFactory...");
  const Factory = await hre.ethers.getContractFactory("SimpleAccountFactory");
  const factory = await Factory.deploy(entryPointAddress);
  await factory.waitForDeployment();
  const factoryAddress = await factory.getAddress();
  console.log("Factory deployed at:", factoryAddress);

  console.log("Deploying SimplePaymaster...");
  const Paymaster = await hre.ethers.getContractFactory("SimplePaymaster");
  const paymaster = await Paymaster.deploy(entryPointAddress);
  await paymaster.waitForDeployment();
  const paymasterAddress = await paymaster.getAddress();
  console.log("Paymaster deployed at:", paymasterAddress);

  // Fund the paymaster
  console.log("Funding paymaster...");
  const tx = await entryPoint.depositFor(paymasterAddress, {
    value: hre.ethers.parseEther("0.01")
  });
  await tx.wait();
  console.log("Paymaster funded with 0.01 ETH");

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