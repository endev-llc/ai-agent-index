const fs = require('fs');
const { parse } = require('csv-parse/sync');
const { ethers } = require('hardhat');
const path = require('path');

// Progress tracking file
const PROGRESS_FILE = 'upload_progress.json';

async function loadProgress() {
    try {
        if (fs.existsSync(PROGRESS_FILE)) {
            const data = fs.readFileSync(PROGRESS_FILE, 'utf8');
            return JSON.parse(data);
        }
    } catch (error) {
        console.error('Error reading progress file:', error);
    }
    return { lastProcessedIndex: -1, successfulUploads: 0, failedUploads: [] };
}

function saveProgress(lastIndex, successCount, failedUploads) {
    try {
        fs.writeFileSync(PROGRESS_FILE, JSON.stringify({
            lastProcessedIndex: lastIndex,
            successfulUploads: successCount,
            failedUploads: failedUploads,
            timestamp: new Date().toISOString()
        }, null, 2));
    } catch (error) {
        console.error('Error saving progress:', error);
    }
}

async function checkBalance(signer, contract) {
    const balance = await signer.provider.getBalance(signer.address);
    const fee = await contract.listingFee();
    const gasPrice = await signer.provider.getFeeData();
    const estimatedGasUsage = 300000n; // Conservative estimate
    const estimatedCostPerTx = fee + (gasPrice.gasPrice * estimatedGasUsage);
    
    return {
        balance,
        estimatedCostPerTx,
        remainingTransactions: Number(balance / estimatedCostPerTx)
    };
}

async function main() {
    // Load progress from previous run
    const progress = await loadProgress();
    const startIndex = progress.lastProcessedIndex + 1;
    let successCount = progress.successfulUploads;
    let failedUploads = progress.failedUploads;

    console.log(`Resuming from index ${startIndex}`);
    console.log(`Previous successful uploads: ${successCount}`);
    console.log(`Previous failed uploads: ${failedUploads.length}`);

    // Contract address from your deployment
    const CONTRACT_ADDRESS = '0xDe438021611C7878ECeb271FCEF15Fc12890019f';
    
    // Read the CSV file
    const fileContent = fs.readFileSync('data/agents.csv', 'utf-8');
    const records = parse(fileContent, {
        columns: true,
        skip_empty_lines: true
    });

    // Get the contract instance
    const AIAgentIndex = await ethers.getContractFactory('AIAgentIndex');
    const contract = await AIAgentIndex.attach(CONTRACT_ADDRESS);
    const signer = (await ethers.getSigners())[0];

    // Check initial balance
    const { balance, estimatedCostPerTx, remainingTransactions } = await checkBalance(signer, contract);
    console.log(`\nInitial wallet balance: ${ethers.formatEther(balance)} ETH`);
    console.log(`Estimated cost per transaction: ${ethers.formatEther(estimatedCostPerTx)} ETH`);
    console.log(`Estimated remaining transactions possible: ${remainingTransactions}\n`);

    // Handle graceful shutdown
    let isShuttingDown = false;
    process.on('SIGINT', async () => {
        console.log('\nReceived shutdown signal. Completing current transaction...');
        isShuttingDown = true;
    });

    console.log(`Starting to upload agents from index ${startIndex}...`);
    console.log('Press Ctrl+C to pause the upload process at any time.\n');

    // Upload each agent
    for (let i = startIndex; i < records.length; i++) {
        const record = records[i];
        
        // Check balance before each transaction
        const balanceCheck = await checkBalance(signer, contract);
        if (balanceCheck.balance < balanceCheck.estimatedCostPerTx) {
            console.log('\nInsufficient funds to continue. Saving progress...');
            saveProgress(i - 1, successCount, failedUploads);
            console.log(`Upload paused at index ${i}. You can resume later.`);
            process.exit(0);
        }

        try {
            // Match CSV columns to smart contract parameters
            const tx = await contract.addAgent(
                record.name,
                record.address,
                record.social_link,
                record.profile_url,
                record.description,
                record.owner_address || "",  // Pass empty string if owner_address is blank/null
                { value: await contract.listingFee() }
            );
            await tx.wait();
            successCount++;
            console.log(`Added agent ${i + 1}/${records.length}: ${record.name}`);
            
            // Save progress after every successful upload
            saveProgress(i, successCount, failedUploads);

        } catch (error) {
            console.error(`Error adding agent ${record.name}:`, error.message);
            failedUploads.push({
                index: i,
                name: record.name,
                error: error.message
            });
            saveProgress(i, successCount, failedUploads);
        }

        // Check if we should shut down
        if (isShuttingDown) {
            console.log('\nGracefully shutting down...');
            saveProgress(i, successCount, failedUploads);
            console.log(`Upload paused at index ${i + 1}. You can resume later.`);
            process.exit(0);
        }
    }

    console.log('\nUpload complete!');
    console.log(`Successfully uploaded: ${successCount} agents`);
    console.log(`Failed uploads: ${failedUploads.length} agents`);
    
    if (failedUploads.length > 0) {
        console.log('\nFailed uploads have been saved to upload_progress.json');
        console.log('You can retry failed uploads separately if needed.');
    }
}

// Execute with better error handling
main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error('Fatal error:', error);
        process.exit(1);
    });