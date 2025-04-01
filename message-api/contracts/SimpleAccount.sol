// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/interfaces/IERC20.sol";

contract SimpleAccount {
    using ECDSA for bytes32;

    address public owner;
    uint256 public nonce;
    address public entryPoint;

    event TransactionExecuted(address indexed target, uint256 value, bytes data);
    // Standard event for ETH transfers that block explorers recognize
    event Transfer(address indexed from, address indexed to, uint256 value);

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
        require(_nonce == nonce, "invalid nonce");
        
        bytes32 hash = keccak256(abi.encodePacked(address(this), block.chainid, _nonce, callData));
        address recovered = hash.toEthSignedMessageHash().recover(signature);
        
        if (recovered == owner) {
            return (true, "");
        }
        return (false, "Invalid Signature");
    }

    function execTransaction(
        address target,
        uint256 value,
        bytes calldata data
    ) external onlyOwnerOrEntryPoint returns (bool success, bytes memory result) {
        ++nonce; // Increment nonce with each transaction
        
        // For ETH transfers that need to show up in block explorer transaction histories
        if (data.length == 0 || value > 0) {
            // This is a standard ETH transfer
            emit Transfer(address(this), target, value);
        }
        
        // For token transfers
        if (data.length >= 4) {
            // Check if this is a token transfer (ERC20)
            bytes4 methodId = bytes4(data[:4]);
            if (methodId == IERC20.transfer.selector) {
                // This will help block explorers recognize token transfers
                address to;
                uint256 amount;
                
                // Parse the token transfer parameters (recipient address and amount)
                assembly {
                    // Skip first 4 bytes (method ID) and load the first parameter (address)
                    to := calldataload(add(data.offset, 4))
                    // Skip first parameter (32 bytes) and load the second parameter (amount)
                    amount := calldataload(add(data.offset, 36))
                }
                
                // Log it with Transfer event for better indexing
                emit Transfer(owner, to, amount);
            }
        }
        
        // Execute the actual transaction
        (success, result) = target.call{value: value}(data);
        
        if (success) {
            emit TransactionExecuted(target, value, data);
        }
        
        return (success, result);
    }

    // Allow receiving ETH
    fallback() external payable {}
    receive() external payable {}
}