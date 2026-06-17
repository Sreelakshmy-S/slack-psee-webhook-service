/**
 * AWS Lambda Handler
 * Wraps Express app for Lambda execution
 */

const serverless = require('serverless-http');
const app = require('./src/index');

// Create serverless handler
const handler = serverless(app, {
  request(request, event, context) {
    // Add Lambda context to request
    request.context = context;
    request.event = event;
  }
});

module.exports.handler = async (event, context) => {
  // Set context to not wait for empty event loop
  context.callbackWaitsForEmptyEventLoop = false;
  
  return await handler(event, context);
};

// Made with Bob
