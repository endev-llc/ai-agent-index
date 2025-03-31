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

    event UserOperationExecuted(
        address indexed sender,
        address indexed paymaster,
        bytes callData,
        bool success
    );

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
        // Validate the userOp
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
            (bool paymasterOk, ) = op.paymaster.call(
                abi.encodeWithSignature(
                    "validatePaymasterUserOp(address,uint256,bytes,bytes,bytes)",
                    op.sender,
                    op.nonce,
                    bytes(""), // No initCode for simplicity
                    op.callData,
                    abi.encode(op.paymaster)
                )
            );
            
            require(paymasterOk, "paymaster validation failed");
            
            // Check if paymaster has enough balance
            require(balances[op.paymaster] > 0, "paymaster has no balance");
        }

        // Execute the transaction
        (bool success, ) = op.sender.call(op.callData);
        
        // Deduct from paymaster's balance (simplified)
        if (op.paymaster != address(0)) {
            // We're not calculating exact gas costs here for simplicity
            balances[op.paymaster] -= 1; // Symbolic deduction
        }

        emit UserOperationExecuted(
            op.sender,
            op.paymaster,
            op.callData,
            success
        );

        if (!success) {
            revert ExecutionFailed();
        }
    }
}