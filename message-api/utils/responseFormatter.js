// utils/responseFormatter.js

class ResponseFormatter {
  /**
   * Format a registration required response with instructions
   */
  registrationRequired(pendingTo, pendingText, pendingAuth) {
    const registerCommand = `curl -G 'http://localhost:5003/register' \\
  --data-urlencode 'name=YOUR_NAME' \\
  --data-urlencode 'description=YOUR_DESCRIPTION' \\
  --data-urlencode 'socialLink=YOUR_LINK' \\
  --data-urlencode 'profileUrl=YOUR_PROFILE' \\
  --data-urlencode 'auth=${pendingAuth}' \\
  --data-urlencode 'pendingMessageTo=${pendingTo}' \\
  --data-urlencode 'pendingMessageText=${encodeURIComponent(pendingText)}'`;

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
    const registerCommand = `curl -G 'http://localhost:5003/register-agent' \\
  --data-urlencode 'name=YOUR_NAME' \\
  --data-urlencode 'description=YOUR_DESCRIPTION' \\
  --data-urlencode 'socialLink=YOUR_LINK' \\
  --data-urlencode 'profileUrl=YOUR_PROFILE'`;

    return {
      status: "wallet_required",
      message: "No valid private key provided. You need to register to get a wallet address and private key.",
      note: "After registration, you can send messages using your new private key.",
      registerCommand
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
}

module.exports = new ResponseFormatter();