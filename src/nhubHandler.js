/**
 * NHub/OCM Alert Handler
 * Processes incoming alerts from NHub and posts PSEE notifications to Slack
 */

const logger = require('./logger');
const config = require('./config');
const pseeResolver = require('./pseeResolver');
const slackClient = require('./slackClient');

// Map Account CMR IDs to customer names
const accountIdToCustomer = {
  '0737019': 'Allianz',
  '5552042': 'Bradesco',
  '5551517': 'Mastercard',
  '5550950': 'Volkswagen'
};

// Map customer names to Slack channels
// const customerToChannel = {
//   'Allianz': 'C0A7C3CH4LW',
//   'Bradesco': 'C0A5UTEGZJT',
//   'Mastercard': 'C0A5KDHSCRE',
//   'Volkswagen': 'C0A6DPP5NJ1'
// };

const customerToChannel = {
  'Allianz': 'C0BBB31EC1Y',
  'Bradesco': 'C0BBB31EC1Y',
  'Mastercard': 'C0BBB31EC1Y',
  'Volkswagen': 'C0BBB31EC1Y'

  
};

/**
 * Process NHub/OCM alert and post PSEE notification to Slack
 */
async function processNHubAlert(alertData) {
  try {
    logger.info('Processing NHub alert', { alertData });

    // Extract customer from Account CMR ID
    const accountCmr = alertData.account_cmr || alertData.customer || alertData.accountCmr;
    const customerName = accountIdToCustomer[accountCmr] || accountCmr;
    
    // Extract product name
    const productName = alertData.product || 
                       alertData.productName ||
                       pseeResolver.extractProductName(alertData.description || '');
    
    // Get incident number
    const incidentNumber = alertData.incident_number || 
                          alertData.case_number || 
                          alertData.incidentNumber ||
                          alertData.caseNumber ||
                          'Unknown';
    
    logger.info('Extracted data', { customerName, productName, incidentNumber });
    
    if (!productName) {
      logger.warn('Missing product name', { alertData });
      return {
        success: false,
        error: 'Could not extract product name from alert'
      };
    }

    if (!customerName || !accountIdToCustomer[accountCmr]) {
      logger.warn('Unknown customer', { accountCmr, customerName });
      return {
        success: false,
        error: `Unknown customer: ${accountCmr}`
      };
    }

    // Get Slack channel for this customer
    const channelId = customerToChannel[customerName];
    
    if (!channelId) {
      logger.warn('No channel configured for customer', { customerName });
      return {
        success: false,
        error: `No Slack channel configured for ${customerName}`
      };
    }

    logger.info('Resolving PSEE', { productName, customerName, incidentNumber });

    // Resolve PSEE using existing logic
    const resolution = await pseeResolver.resolve(productName, customerName);

    if (!resolution.success) {
      logger.error('PSEE resolution failed', { resolution });
      return {
        success: false,
        error: resolution.error
      };
    }

    // Format notification message
    let message = pseeResolver.formatNotificationMessage(resolution, incidentNumber);
    
    // Add priority/severity if available
    if (alertData.priority) {
      message += `\n📊 Priority: ${alertData.priority}`;
    }
    if (alertData.severity) {
      message += `\n🔴 Severity: ${alertData.severity}`;
    }
    if (alertData.state) {
      message += `\n📌 State: ${alertData.state}`;
    }

    // Post to Slack channel
    await slackClient.postMessage(channelId, message);

    logger.info('NHub alert processed successfully', {
      customer: customerName,
      product: productName,
      channel: channelId,
      pseeFound: resolution.pseeFound
    });

    return {
      success: true,
      pseeFound: resolution.pseeFound,
      customer: customerName,
      product: productName,
      channel: channelId,
      incidentNumber: incidentNumber,
      // Include PSEE details for verification
      psee: resolution.pseeFound ? {
        name: resolution.pseeInfo?.name || 'Unknown',
        email: resolution.pseeInfo?.email || 'Unknown',
        slackId: resolution.primaryUsers?.[0]?.id || 'Unknown'
      } : null,
      fallbackReason: resolution.fallbackReason,
      // Include all notified users
      notifiedUsers: {
        primary: resolution.primaryUsers?.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email
        })) || [],
        cc: resolution.ccUsers?.map(u => ({
          id: u.id,
          name: u.name,
          email: u.email
        })) || []
      }
    };

  } catch (error) {
    logger.error('Error processing NHub alert', {
      error: error.message,
      stack: error.stack,
      alertData
    });
    
    return {
      success: false,
      error: error.message
    };
  }
}

module.exports = { processNHubAlert };

// Made with Bob
