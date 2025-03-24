// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MessageRelay {
    // Event emitted when a message is successfully delivered
    event MessageDelivered(
        address indexed from,
        address indexed to,
        string message,
        uint256 timestamp
    );
    
    // Mapping to track nonces for each sender to prevent replay attacks
    mapping(address => uint256) public nonces;
    
    /**
     * @dev Sends a message on behalf of another wallet (sponsor pays gas)
     * @param sender The original sender's address
     * @param recipient The recipient's address
     * @param message The message content
     * @param nonce The sender's current nonce
     * @param signature The sender's signature authorizing this message
     */
    function relayMessage(
        address sender,
        address recipient,
        string calldata message,
        uint256 nonce,
        bytes calldata signature
    ) external {
        // Verify the nonce matches what we expect
        require(nonce == nonces[sender], "Invalid nonce");
        
        // Verify the signature is valid
        bytes32 messageHash = keccak256(abi.encodePacked(
            sender,
            recipient,
            message,
            nonce,
            address(this) // Include contract address to prevent cross-contract replay
        ));
        
        // Convert message hash to Ethereum signed message hash
        bytes32 ethSignedMessageHash = keccak256(abi.encodePacked(
            "\x19Ethereum Signed Message:\n32", 
            messageHash
        ));
        
        // Verify the signature matches the sender
        require(recoverSigner(ethSignedMessageHash, signature) == sender, "Invalid signature");
        
        // Increment the sender's nonce
        nonces[sender]++;
        
        // Create a new low-level call to send a transaction from the sender to the recipient
        // This is the key part that makes it appear as a direct transaction in block explorers
        (bool success, ) = recipient.call{value: 0}(
            abi.encodeWithSignature("receiveMessage(address,string)", sender, message)
        );
        
        // Make sure the recipient call was successful
        require(success, "Failed to deliver message");
        
        // Emit an event for this message
        emit MessageDelivered(sender, recipient, message, block.timestamp);
    }
    
    /**
     * @dev Recover signer address from a signature
     */
    function recoverSigner(bytes32 messageHash, bytes memory signature) 
        internal 
        pure 
        returns (address) 
    {
        require(signature.length == 65, "Invalid signature length");
        
        bytes32 r;
        bytes32 s;
        uint8 v;
        
        // Extract r, s, v from the signature
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        
        // If the version is wrong, try the other version
        if (v < 27) {
            v += 27;
        }
        
        require(v == 27 || v == 28, "Invalid signature 'v' value");
        
        // Recover and return the signer address
        return ecrecover(messageHash, v, r, s);
    }
    
    /**
     * @dev Get the current nonce for a user
     */
    function getNonce(address user) external view returns (uint256) {
        return nonces[user];
    }
}