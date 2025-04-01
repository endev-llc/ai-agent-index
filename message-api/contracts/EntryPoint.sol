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
        address indexed target,
        address indexed paymaster,
        bytes callData,
        bool success
    );

    // Add Transfer event that block explorers recognize
    event Transfer(address indexed from, address indexed to, uint256 value);

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
        // Extract target address from callData if it's an execTransaction call
        address target = address(0);
        
        // Instead of using complex assembly, we'll decode the function call data
        if (op.callData.length >= 4 + 32) {
            bytes4 selector = bytes4(op.callData[:4]);
            
            // Check if this is an execTransaction call
            if (selector == bytes4(keccak256("execTransaction(address,uint256,bytes)"))) {
                // Extract the first parameter (target address) directly
                // Skip the first 4 bytes (selector) and take the next 32 bytes (address)
                bytes memory addressBytes = new bytes(32);
                for (uint i = 0; i < 32; i++) {
                    if (4 + i < op.callData.length) {
                        addressBytes[i] = op.callData[4 + i];
                    }
                }
                
                // Convert bytes to address
                assembly {
                    target := mload(add(addressBytes, 32))
                }
            }
        }
        
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
        
        // Emit events that make the transaction more visible in block explorers
        emit UserOperationExecuted(
            op.sender,
            target,
            op.paymaster,
            op.callData,
            success
        );
        
        // Also emit a Transfer event for better block explorer indexing
        if (target != address(0)) {
            emit Transfer(op.sender, target, 0);
        }

        // Deduct from paymaster's balance (simplified)
        if (op.paymaster != address(0)) {
            // We're not calculating exact gas costs here for simplicity
            balances[op.paymaster] -= 1; // Symbolic deduction
        }

        if (!success) {
            revert ExecutionFailed();
        }
    }
}