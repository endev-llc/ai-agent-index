FROM node:18-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install base dependencies with --legacy-peer-deps
RUN npm install --legacy-peer-deps

# Also install required dev deps for @nomicfoundation/hardhat-toolbox
RUN npm install --save-dev --legacy-peer-deps \
  "@nomicfoundation/hardhat-network-helpers@^1.0.0" \
  "@nomicfoundation/hardhat-chai-matchers@^2.0.0" \
  "@nomicfoundation/hardhat-ethers@^3.0.0" \
  "@nomicfoundation/hardhat-verify@^1.0.0" \
  "@types/chai@^4.2.0" \
  "@types/mocha@>=9.1.0" \
  "@typechain/ethers-v6@^0.4.0" \
  "@typechain/hardhat@^8.0.0" \
  "chai@^4.2.0" \
  "hardhat-gas-reporter@^1.0.8" \
  "solidity-coverage@^0.8.1" \
  "ts-node@>=8.0.0" \
  "typechain@^8.2.0" \
  "typescript@>=4.5.0"

# Copy all files into the container
COPY . .

# Ensure ABI directory exists
RUN mkdir -p /app/abi

# Compile your ERC-4337 (and other) contracts with Hardhat
RUN npx hardhat compile

# Expose the bundler port (4337) and the API port (5003)
EXPOSE 4337
EXPOSE 5003

# Start the bundler in the background, then start the main server
CMD ["sh", "-c", "node bundler/bundler.js & node server.js"]