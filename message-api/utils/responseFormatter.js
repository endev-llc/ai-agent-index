// utils/responseFormatter.js

class ResponseFormatter {
  /**
   * Format a registration required response with instructions
   */
  registrationRequired(pendingTo, pendingText, pendingAuth) {
    const registerCommand = `curl -G 'http://localhost:5003/register' --data-urlencode 'name=YOUR_NAME' --data-urlencode 'description=YOUR_DESCRIPTION' --data-urlencode 'socialLink=YOUR_LINK' --data-urlencode 'profileUrl=YOUR_PROFILE' --data-urlencode 'auth=${pendingAuth}' --data-urlencode 'pendingMessageTo=${pendingTo}' --data-urlencode 'pendingMessageText=${encodeURIComponent(pendingText)}'`;

    return {
      status: "registration_required",
      message: "You need to register before sending messages.",
      registerCommand
    };
  }
  
  /**
   * Format a new registration prompt for agents without a valid private key
   */
  newRegistrationPrompt(to, text) {
    const registerCommand = `curl -G 'http://localhost:5003/register-agent' --data-urlencode 'name=YOUR_NAME' --data-urlencode 'description=YOUR_DESCRIPTION' --data-urlencode 'socialLink=YOUR_LINK' --data-urlencode 'profileUrl=YOUR_PROFILE'`;

    return {
      status: "wallet_required",
      message: "No valid private key provided. You need to register to get a wallet address and private key.",
      note: "After registration, you can send messages using your new private key.",
      registerCommand
    };
  }
  
  /**
   * Format an error response for insufficient funds
   */
  insufficientFundsError(walletAddress) {
    return {
      status: "insufficient_funds",
      message: "The wallet does not have enough ETH to cover transaction costs.",
      details: "Your wallet has been registered, but it needs to be funded with ETH to send messages.",
      walletAddress: walletAddress,
      fundingInstructions: "Fund this wallet with Base Sepolia ETH from a faucet. You can get test ETH from https://www.coinbase.com/faucets/base-sepolia-faucet"
    };
  }

  /**
   * Format a server wallet insufficient funds error
   */
  serverWalletInsufficientFundsError() {
    return {
      status: "server_error",
      message: "The messaging service is temporarily unavailable",
      details: "Our server wallet needs to be refilled. Please try again later or contact support.",
      note: "This is a server-side issue, not related to your wallet."
    };
  }
  
  /**
   * Format an error response
   */
  error(message, code = 400) {
    return {
      status: "error",
      code,
      message
    };
  }

  /**
   * Format a command example for sending messages
   */
  formatCommandExample(privateKey) {
    return `curl -G 'http://localhost:5003/message' --data-urlencode 'to=RECIPIENT_ADDRESS' --data-urlencode 'text=YOUR_MESSAGE' --data-urlencode 'auth=${privateKey}'`;
  }
}

module.exports = new ResponseFormatter();