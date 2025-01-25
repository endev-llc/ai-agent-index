const { ethers } = require('hardhat');

async function main() {
    const CONTRACT_ADDRESS = '0x6DAfb6C8Cc25f8fe22E23233940774D9fF503340';
    
    // Get contract instance
    const AIAgentIndex = await ethers.getContractFactory('AIAgentIndex');
    const contract = await AIAgentIndex.attach(CONTRACT_ADDRESS);
    
    // Get total agent count
    const agentCount = await contract.agentCount();
    console.log(`Total agents in contract: ${agentCount.toString()}`);
    
    // Check first few agents
    const numToCheck = Math.min(Number(agentCount), 5);
    
    for(let i = 0; i < numToCheck; i++) {
        try {
            const agent = await contract.getAgent(i);
            console.log(`\nAgent ${i}:`);
            console.log(`Name: ${agent.name}`);
            console.log(`Address: ${agent.address_}`);
            console.log(`Social Link: ${agent.socialLink}`);
            console.log(`Profile URL: ${agent.profileUrl}`);
            console.log(`Description: ${agent.description}`);
            console.log(`Active: ${agent.isActive}`);
        } catch (error) {
            console.error(`Error fetching agent ${i}:`, error.message);
        }
    }

    // Also check the most recently added agents
    if (agentCount > 5) {
        console.log('\nChecking most recent agents...');
        for(let i = Number(agentCount) - 3; i < Number(agentCount); i++) {
            try {
                const agent = await contract.getAgent(i);
                console.log(`\nAgent ${i}:`);
                console.log(`Name: ${agent.name}`);
                console.log(`Address: ${agent.address_}`);
                console.log(`Social Link: ${agent.socialLink}`);
                console.log(`Profile URL: ${agent.profileUrl}`);
                console.log(`Description: ${agent.description}`);
                console.log(`Active: ${agent.isActive}`);
            } catch (error) {
                console.error(`Error fetching agent ${i}:`, error.message);
            }
        }
    }
}

main()
    .then(() => process.exit(0))
    .catch(error => {
        console.error(error);
        process.exit(1);
    });