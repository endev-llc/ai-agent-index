// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

contract SimplePaymaster {
    address public owner;
    address public entryPoint;

    constructor(address _entryPoint) {
        owner = msg.sender;
        entryPoint = _entryPoint;
    }

    // Fund the paymaster
    receive() external payable {}
    
    // Support older deposits too
    function deposit() external payable {}
    
    // Withdraw funds
    function withdraw(address payable to, uint256 amount) external {
        require(msg.sender == owner, "not owner");
        to.transfer(amount);
    }
    
    // Allow EntryPoint to transfer funds for paymaster operations
    function depositTo(address account) external payable {
        require(msg.sender == entryPoint, "only entryPoint can deposit");
        // Forward funds to the entryPoint to handle gas costs
        (bool success, ) = entryPoint.call{value: msg.value}(
            abi.encodeWithSignature("depositFor(address)", account)
        );
        require(success, "deposit failed");
    }
}