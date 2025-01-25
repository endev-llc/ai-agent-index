const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { ethers } = require('hardhat');

async function main() {
    // Contract address from your deployment
    const CONTRACT_ADDRESS = '0x6DAfb6C8Cc25f8fe22E23233940774D9fF503340';
    
    // Read the CSV file
    const fileContent = fs.readFileSync('data/agents.csv', 'utf-8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true
    });

    // Get the contract instance
    const AIAgentIndex = await ethers.getContractFactory('AIAgentIndex');
    const contract = await AIAgentIndex.attach(CONTRACT_ADDRESS);

    console.log(`Starting to upload ${records.length} agents...`);

    // Upload each agent
    for (const record of records) {
        try {
            // Match CSV columns to smart contract parameters
            const tx = await contract.addAgent(
                record.name,
                record.address,       // CSV 'address' column maps to contract's 'address_'
                record.social_link,   // CSV 'social_link' maps to contract's 'socialLink'
                record.profile_url,   // CSV 'profile_url' maps to contract's 'profileUrl'
                record.description
            );
            await tx.wait();
            console.log(`Added agent: ${record.name}`);
        } catch (error) {
            console.error(`Error adding agent ${record.name}:`, error.message);
        }
    }

    console.log('Upload complete!');
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });