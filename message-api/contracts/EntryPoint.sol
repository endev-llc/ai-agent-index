// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.19;

contract EntryPoint {
    error InvalidSignature();
    error ExecutionFailed();

    struct UserOperation {
        address sender;
        bytes callData;
        uint256 nonce;
        bytes signature;
        address paymaster;
    }

    mapping(address => uint256) public nonces;
    mapping(address => uint256) public balances;

    // Standard transaction event - NOT an ERC20 Transfer
    event UserOperationExecuted(
        address indexed sender,
        address indexed target,
        bytes callData,
        bool success
    );
    
    // Value transfer event that looks like a native transaction
    event NativeTransfer(address indexed from, address indexed to, uint256 value);

    // Allow paymasters to deposit funds for gas
    function depositFor(address account) external payable {
        balances[account] += msg.value;
    }

    function handleOps(UserOperation[] calldata ops) external {
        for (uint256 i = 0; i < ops.length; i++) {
            _handleOp(ops[i]);
        }
    }

    function _handleOp(UserOperation calldata op) internal {
        // Validate nonce
        require(op.nonce == nonces[op.sender], "Invalid nonce");
        nonces[op.sender]++;
        
        // Validate signature - we'll use a simpler approach here
        (bool sigOk, ) = op.sender.call(
            abi.encodeWithSignature(
                "validateUserOp(address,bytes,uint256,bytes)",
                address(this),
                op.callData,
                op.nonce,
                op.signature
            )
        );
        
        if (!sigOk) {
            revert InvalidSignature();
        }

        // Validate paymaster is willing to sponsor the transaction
        if (op.paymaster != address(0)) {
            require(balances[op.paymaster] > 0, "paymaster has no balance");
        }

        // Execute the transaction
        (bool success, ) = op.sender.call(op.callData);
        
        // Try to extract target address from callData - simplified approach
        address target = address(0);
        if (op.callData.length >= 36) { // At least function selector (4 bytes) + address param (32 bytes)
            // Try to extract the first parameter which should be the target address
            // This is a simplification that assumes the first parameter is always the target
            bytes memory firstParamBytes = new bytes(32);
            for (uint i = 0; i < 32 && i + 4 < op.callData.length; i++) {
                firstParamBytes[i] = op.callData[i + 4];
            }
            
            assembly {
                target := mload(add(firstParamBytes, 32))
            }
        }
        
        // Emit standard transaction-like event
        emit UserOperationExecuted(op.sender, target, op.callData, success);
        
        // Also emit a native transfer-like event so it shows in the Transactions tab
        if (target != address(0)) {
            emit NativeTransfer(op.sender, target, 0);
        }

        // Deduct from paymaster's balance
        if (op.paymaster != address(0)) {
            balances[op.paymaster] -= 1; // Symbolic deduction
        }

        if (!success) {
            revert ExecutionFailed();
        }
    }
}