// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

contract SimpleAccount {
    using ECDSA for bytes32;

    address public owner;
    uint256 public nonce;
    address public entryPoint;

    event TransactionExecuted(address indexed target, uint256 value, bytes data);

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
        // Only allow calls from the entryPoint
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