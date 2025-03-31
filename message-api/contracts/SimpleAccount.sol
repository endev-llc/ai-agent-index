// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract SimpleAccount {
    using ECDSA for bytes32;

    address public owner;
    uint256 public nonce;
    address public entryPoint;

    event TransactionExecuted(address indexed from, address indexed to, uint256 value, bytes data);

    constructor(address _owner, address _entryPoint) {
        owner = _owner;
        entryPoint = _entryPoint;
    }

    modifier onlyOwnerOrEntryPoint() {
        require(msg.sender == owner || msg.sender == entryPoint, "not authorized");
        _;
    }

    function validateUserOp(
        address _entryPoint,
        bytes calldata callData,
        uint256 _nonce,
        bytes calldata signature
    ) external view returns (bool sigOK, bytes memory errMsg) {
        require(msg.sender == entryPoint, "only entryPoint can validate");
        require(_entryPoint == entryPoint, "wrong entryPoint");
        
        bytes32 hash = keccak256(abi.encodePacked(address(this), block.chainid, _nonce, callData));
        address recovered = hash.toEthSignedMessageHash().recover(signature);
        
        if (recovered == owner) {
            return (true, "");
        }
        return (false, "Invalid Signature");
    }

    // The key function that actually performs transfers
    function execTransaction(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyOwnerOrEntryPoint returns (bool success, bytes memory result) {
        // THIS IS THE KEY CHANGE: We're doing an actual ETH transfer first
        // Even with 0 ETH, this creates a proper "transfer" in blockchain explorers
        (bool transferSuccess,) = target.call{value: 1 wei}("");
        require(transferSuccess, "ETH transfer failed");
        
        // Then execute the message data if there is any
        if (data.length > 0) {
            (success, result) = target.call(data);
            require(success, "Transaction execution failed");
        } else {
            success = true;
        }
        
        emit TransactionExecuted(owner, target, value, data);
        
        return (success, result);
    }

    // Allow receiving ETH
    receive() external payable {}
    fallback() external payable {}
}