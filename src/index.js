/**
 * Main Express Application
 * Webhook service for Slack PSEE auto-tagging
 */

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const config = require('./config');
const logger = require('./logger');
const pseeResolver = require('./pseeResolver');
const { processSlackEvent } = require('./slackEventHandler');

const app = express();

// Middleware
app.use(helmet()); // Security headers
app.use(cors()); // Enable CORS
app.use(express.json()); // Parse JSON bodies
app.use(express.urlencoded({ extended: true })); // Parse URL-encoded bodies

// Request logging middleware
app.use((req, res, next) => {
  logger.info('Incoming request', {
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: '1.0.0'
  });
});

// Slack Event Subscriptions endpoint
app.post('/slack/events', async (req, res) => {
  const { type, challenge, event } = req.body;

  // Slack URL verification challenge
  if (type === 'url_verification') {
    logger.info('Slack URL verification challenge received', { challenge });
    return res.json({ challenge });
  }

  // Acknowledge receipt immediately (Slack requires response within 3 seconds)
  res.status(200).send();

  // Process event asynchronously
  if (type === 'event_callback' && event) {
    processSlackEvent(event).catch(error => {
      logger.error('Error processing Slack event', { error: error.message });
    });
  }
});

// Main webhook endpoint for PSEE lookup
const { processNHubAlert } = require('./nhubHandler');

app.post('/n', async (req, res) => {
  try {
    logger.info('Received NHub alert', { body: req.body });
    const result = await processNHubAlert(req.body);
    
    // Return full result with PSEE details
    res.json({
      success: result.success,
      message: result.success ? 'PSEE notification sent' : `Error: ${result.error}`,
      psee_found: result.pseeFound,
      customer: result.customer,
      product: result.product,
      channel: result.channel,
      incident_number: result.incidentNumber,
      psee: result.psee,
      fallback_reason: result.fallbackReason,
      notified_users: result.notifiedUsers
    });
  } catch (error) {
    logger.error('Error in NHub webhook', { error: error.message });
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/lookup-psee', async (req, res) => {
  try {
    const { product, customer, channel_id, message_ts, alert_text } = req.body;

    // Validate required fields
    if (!product || !customer) {
      logger.warn('Missing required fields', { body: req.body });
      return res.status(400).json({
        error: 'Missing required fields: product and customer are required'
      });
    }

    logger.info('Processing PSEE lookup request', {
      product,
      customer,
      channel_id
    });

    // Extract incident number if alert_text provided
    let incidentNumber = 'Unknown';
    if (alert_text) {
      incidentNumber = pseeResolver.extractIncidentNumber(alert_text) || 'Unknown';
    }

    // Resolve PSEE or PSA
    const resolution = await pseeResolver.resolve(product, customer);

    if (!resolution.success) {
      logger.error('PSEE resolution failed', { resolution });
      return res.status(500).json({
        error: resolution.error,
        customer,
        product
      });
    }

    // Format response for Slack Workflow
    const response = {
      success: true,
      psee_found: resolution.pseeFound,
      fallback_reason: resolution.fallbackReason,
      
      // Primary users (PSEE or PSA)
      primary_users: resolution.primaryUsers,
      primary_user_ids: resolution.primaryUsers.map(u => u.id),
      primary_mentions: resolution.primaryUsers.map(u => `<@${u.id}>`).join(' '),
      
      // CC users
      cc_users: resolution.ccUsers,
      cc_user_ids: resolution.ccUsers.map(u => u.id),
      cc_mentions: resolution.ccUsers.map(u => `<@${u.id}>`).join(' '),
      
      // Formatted message
      message: pseeResolver.formatNotificationMessage(resolution, incidentNumber),
      
      // Additional context
      product_name: product,
      customer_name: customer,
      incident_number: incidentNumber,
      
      // PSEE info if found
      psee_info: resolution.pseeInfo
    };

    logger.info('PSEE lookup completed successfully', {
      customer,
      product,
      pseeFound: resolution.pseeFound,
      primaryUserCount: resolution.primaryUsers.length
    });

    res.json(response);

  } catch (error) {
    logger.error('Unexpected error in lookup-psee endpoint', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Alternative endpoint that accepts full alert text
app.post('/process-alert', async (req, res) => {
  try {
    const { alert_text, customer, channel_id, message_ts } = req.body;

    if (!alert_text || !customer) {
      return res.status(400).json({
        error: 'Missing required fields: alert_text and customer are required'
      });
    }

    logger.info('Processing full alert', { customer, channel_id });

    // Extract product name from alert
    const productName = pseeResolver.extractProductName(alert_text);
    
    if (!productName) {
      logger.warn('Could not extract product name from alert', { alert_text });
      return res.status(400).json({
        error: 'Could not extract product name from alert text'
      });
    }

    // Extract incident number
    const incidentNumber = pseeResolver.extractIncidentNumber(alert_text) || 'Unknown';

    // Resolve PSEE
    const resolution = await pseeResolver.resolve(productName, customer);

    if (!resolution.success) {
      return res.status(500).json({
        error: resolution.error,
        customer,
        product: productName
      });
    }

    // Format response
    const response = {
      success: true,
      psee_found: resolution.pseeFound,
      primary_users: resolution.primaryUsers,
      primary_mentions: resolution.primaryUsers.map(u => `<@${u.id}>`).join(' '),
      cc_users: resolution.ccUsers,
      cc_mentions: resolution.ccUsers.map(u => `<@${u.id}>`).join(' '),
      message: pseeResolver.formatNotificationMessage(resolution, incidentNumber),
      product_name: productName,
      customer_name: customer,
      incident_number: incidentNumber
    };

    res.json(response);

  } catch (error) {
    logger.error('Error processing alert', {
      error: error.message,
      stack: error.stack
    });

    res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
});

// Test endpoint for development
app.post('/test', async (req, res) => {
  if (config.server.env === 'production') {
    return res.status(404).json({ error: 'Not found' });
  }

  logger.info('Test endpoint called', { body: req.body });
  
  res.json({
    message: 'Test endpoint',
    received: req.body,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    path: req.path
  });

  res.status(500).json({
    error: 'Internal server error',
    message: config.server.env === 'development' ? err.message : 'An error occurred'
  });
});

// Start server (only if not in Lambda environment)
if (!process.env.AWS_LAMBDA_FUNCTION_NAME) {
  const PORT = config.server.port;
  
  app.listen(PORT, () => {
    logger.info(`PSEE Webhook Service started`, {
      port: PORT,
      env: config.server.env,
      nodeVersion: process.version
    });
  });
}

// Export for Lambda
module.exports = app;

// Made with Bob
