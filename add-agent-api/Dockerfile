FROM node:18-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy all files
COPY . .

# Make sure the ABI directory exists in the image
RUN mkdir -p /app/abi

# Expose the API port
EXPOSE 5002

# Start the API server
CMD ["node", "server.js"]