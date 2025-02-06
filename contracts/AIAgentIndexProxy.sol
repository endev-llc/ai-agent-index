// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract AIAgentIndexProxy {
    address public implementation;
    address public owner;
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner can call this");
        _;
    }
    
    function upgradeTo(address newImplementation) public onlyOwner {
        implementation = newImplementation;
    }
    
    fallback() external payable {
        address _impl = implementation;
        require(_impl != address(0), "Implementation not set");
        
        assembly {
            calldatacopy(0, 0, calldatasize())
            let result := delegatecall(gas(), _impl, 0, calldatasize(), 0, 0)
            returndatacopy(0, 0, returndatasize())
            switch result
            case 0 { revert(0, returndatasize()) }
            default { return(0, returndatasize()) }
        }
    }
    
    receive() external payable {}
}