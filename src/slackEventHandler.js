/**
 * Slack Event Handler
 * Processes incoming Slack events and posts PSEE notifications
 */

const logger = require('./logger');
const config = require('./config');
const pseeResolver = require('./pseeResolver');
const slackClient = require('./slackClient');

/**
 * Process Slack message events
 */
async function processSlackEvent(event) {
  try {
    // Only process channel messages (not DMs, not bot messages)
    if (event.type !== 'message' || event.subtype || event.bot_id) {
      return;
    }

    const messageText = event.text;
    const channelId = event.channel;
    const messageTs = event.ts;

    logger.info('Received Slack message', { channelId, messageTs });

    // Check if message contains OCM alert keywords
    if (!messageText.includes('IBM On Call Manager') && 
        !messageText.includes('Case opened') &&
        !messageText.includes('Incident:')) {
      logger.debug('Message does not contain OCM alert keywords');
      return;
    }

    logger.info('OCM alert detected, processing...', { channelId });

    // Determine customer from channel
    const customer = config.channels[channelId];
    
    if (!customer) {
      logger.warn('Unknown channel, skipping', { channelId });
      return;
    }

    // Extract product name
    const productName = pseeResolver.extractProductName(messageText);
    
    if (!productName) {
      logger.warn('Could not extract product name', { messageText });
      await slackClient.postMessage(
        channelId,
        '⚠️ Could not extract product name from alert',
        messageTs
      );
      return;
    }

    // Extract incident number
    const incidentNumber = pseeResolver.extractIncidentNumber(messageText) || 'Unknown';

    logger.info('Processing PSEE lookup', { productName, customer, incidentNumber });

    // Resolve PSEE
    const resolution = await pseeResolver.resolve(productName, customer);

    if (!resolution.success) {
      logger.error('PSEE resolution failed', { resolution });
      await slackClient.postMessage(
        channelId,
        `⚠️ Error resolving PSEE: ${resolution.error}`,
        messageTs
      );
      return;
    }

    // Format notification message
    const message = pseeResolver.formatNotificationMessage(resolution, incidentNumber);

    // Post threaded reply
    await slackClient.postMessage(channelId, message, messageTs);

    logger.info('PSEE notification posted successfully', {
      customer,
      product: productName,
      pseeFound: resolution.pseeFound
    });

  } catch (error) {
    logger.error('Error in processSlackEvent', {
      error: error.message,
      stack: error.stack
    });
  }
}

module.exports = { processSlackEvent };
