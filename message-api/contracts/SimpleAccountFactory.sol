// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "./SimpleAccount.sol";

contract SimpleAccountFactory {
    address public immutable entryPoint;
    
    event AccountCreated(address indexed account, address indexed owner);

    constructor(address _entryPoint) {
        entryPoint = _entryPoint;
    }

    function createAccount(address owner) external returns (address) {
        // Create deterministic address based on owner
        bytes32 salt = bytes32(uint256(uint160(owner)));
        SimpleAccount account = new SimpleAccount{salt: salt}(owner, entryPoint);
        
        emit AccountCreated(address(account), owner);
        return address(account);
    }
    
    // Get the counterfactual address before deployment
    function getAddress(address owner) external view returns (address) {
        bytes32 salt = bytes32(uint256(uint160(owner)));
        bytes32 hash = keccak256(
            abi.encodePacked(
                bytes1(0xff),
                address(this),
                salt,
                keccak256(abi.encodePacked(
                    type(SimpleAccount).creationCode,
                    abi.encode(owner, entryPoint)
                ))
            )
        );
        return address(uint160(uint256(hash)));
    }
}