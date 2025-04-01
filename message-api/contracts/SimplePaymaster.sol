// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

contract SimplePaymaster {
    address public owner;
    address public entryPoint;

    event PaymasterFunded(uint256 amount);
    
    constructor(address _entryPoint) {
        owner = msg.sender;
        entryPoint = _entryPoint;
    }

    // Fund the paymaster for gas sponsoring
    receive() external payable {
        emit PaymasterFunded(msg.value);
    }
    
    // Validate paymaster data - simplified version
    function validatePaymasterUserOp(
        address sender,
        uint256 nonce,
        bytes calldata initCode,
        bytes calldata callData,
        bytes calldata paymasterAndData
    ) external view returns (bool valid, bytes memory context) {
        // Only entryPoint can call this function
        require(msg.sender == entryPoint, "not from EntryPoint");
        
        // In a simplified implementation, we'll sponsor all transactions
        return (true, "");
    }

    // Allow owner to withdraw funds
    function withdraw(address payable to, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        to.transfer(amount);
    }
}