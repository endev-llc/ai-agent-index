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