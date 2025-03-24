// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract MessageReceiver {
    // Event to record received messages
    event MessageReceived(address indexed from, string message, uint256 timestamp);
    
    /**
     * @dev Receive a message from a sender
     */
    function receiveMessage(address sender, string calldata message) external {
        // Record the message
        emit MessageReceived(sender, message, block.timestamp);
        
        // This function could contain any additional logic you want to execute
        // when a message is received
    }
    
    /**
     * @dev Fallback function to make this contract compatible with standard transactions
     */
    receive() external payable {}
}