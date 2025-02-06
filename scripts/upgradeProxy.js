const { ethers } = require("hardhat");

async function main() {
  const proxyAddress = "0xDe438021611C7878ECeb271FCEF15Fc12890019f"; // Your existing proxy address
  const newImplementationAddress = "0x3a56Be669BFAa8DAf0Bba92d3F1349bF968AA461";

  // Get the proxy contract
  const proxy = await ethers.getContractAt("AIAgentIndexProxy", proxyAddress);

  // Call upgradeTo with the new implementation address
  const tx = await proxy.upgradeTo(newImplementationAddress);
  await tx.wait();

  console.log("Proxy upgraded to new implementation:", newImplementationAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });