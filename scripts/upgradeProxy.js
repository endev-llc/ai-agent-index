const { ethers } = require("hardhat");

async function main() {
  const proxyAddress = "0xDe438021611C7878ECeb271FCEF15Fc12890019f"; // Your existing proxy address
  const newImplementationAddress = "0x06327C0Db1d12e5Eb80D8dF0C1a57099ADBEDB91";

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