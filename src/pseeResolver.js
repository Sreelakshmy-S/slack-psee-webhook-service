/**
 * PSEE Resolver
 * Core business logic for finding and resolving PSEEs
 */

const mondayClient = require('./mondayClient');
const slackClient = require('./slackClient');
const config = require('./config');
const logger = require('./logger');

class PSEEResolver {
  /**
   * Resolve PSEE or PSA for a given product and customer
   * @param {string} productName - Product name from alert
   * @param {string} customer - Customer name
   * @returns {Promise<Object>} Resolution result with user information
   */
  async resolve(productName, customer) {
    try {
      logger.info('Starting PSEE resolution', { productName, customer });

      // Step 1: Try to find PSEE in Monday.com
      const pseeInfo = await mondayClient.findPSEEForProduct(productName, customer);

      let primaryUsers = [];
      let fallbackReason = null;

      if (pseeInfo && pseeInfo.email) {
        // PSEE found - use email directly (no Slack lookup)
        logger.info('PSEE found in Monday.com', {
          email: pseeInfo.email,
          name: pseeInfo.name
        });
        
        primaryUsers.push({
          email: pseeInfo.email,
          name: pseeInfo.name
        });
      } else {
        logger.info('No PSEE found in Monday.com, using PSA fallback', {
          productName,
          customer
        });
        fallbackReason = 'No PSEE configured for this product';
      }

      // Step 2: If no PSEE found, use PSA fallback
      if (primaryUsers.length === 0) {
        const psaEmails = config.psaEmails[customer];
        
        if (!psaEmails || psaEmails.length === 0) {
          throw new Error(`No PSA configured for customer: ${customer}`);
        }

        logger.info('Using PSA fallback', { psaEmails });
        
        // Use PSA emails directly (no Slack lookup)
        primaryUsers = psaEmails.map(email => ({
          email: email,
          name: email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase())
        }));
      }

      // Step 3: Always include CC users
      const ccEmails = config.alwaysCC;
      logger.info('Adding CC users', { ccEmails });
      
      const ccUsers = ccEmails.map(email => ({
        email: email,
        name: email.split('@')[0].replace(/\./g, ' ').replace(/\b\w/g, l => l.toUpperCase())
      }));

      // Step 4: Build response
      const response = {
        success: true,
        customer,
        productName,
        pseeFound: pseeInfo && pseeInfo.email && !fallbackReason,
        fallbackReason,
        primaryUsers: primaryUsers.map(u => ({
          name: u.name,
          email: u.email
        })),
        ccUsers: ccUsers.map(u => ({
          name: u.name,
          email: u.email
        })),
        pseeInfo: pseeInfo ? {
          name: pseeInfo.name,
          email: pseeInfo.email,
          productName: pseeInfo.productName
        } : null
      };

      logger.info('PSEE resolution completed', {
        customer,
        productName,
        pseeFound: response.pseeFound,
        primaryUserCount: primaryUsers.length,
        ccUserCount: ccUsers.length
      });

      return response;

    } catch (error) {
      logger.error('Error resolving PSEE', {
        productName,
        customer,
        error: error.message,
        stack: error.stack
      });

      return {
        success: false,
        error: error.message,
        customer,
        productName
      };
    }
  }

  /**
   * Format notification message for Slack
   * @param {Object} resolution - Resolution result
   * @param {string} incidentNumber - Incident number from alert
   * @returns {string} Formatted message
   */
  formatNotificationMessage(resolution, incidentNumber) {
    if (!resolution.success) {
      return `⚠️ Error processing alert for incident ${incidentNumber}: ${resolution.error}`;
    }

    const primaryEmails = resolution.primaryUsers.map(u => u.email).join(', ');
    const ccEmails = resolution.ccUsers.map(u => u.email).join(', ');

    let message = '';

    if (resolution.pseeFound) {
      // PSEE found
      message = `🔔 Alert for **${resolution.productName}** requires attention\n`;
      message += `📋 Incident: ${incidentNumber}\n`;
      message += `👤 PSEE: ${resolution.pseeInfo.name} (${resolution.pseeInfo.email})`;
    } else {
      // PSA fallback
      message = `🔔 No PSEE found for **${resolution.productName}**, please assign\n`;
      message += `📋 Incident: ${incidentNumber}\n`;
      message += `ℹ️ Reason: ${resolution.fallbackReason || 'Product not configured'}\n`;
      message += `👥 PSA: ${primaryEmails}`;
    }

    // Add CC
    if (ccEmails) {
      message += `\n\n📧 CC: ${ccEmails}`;
    }

    return message;
  }

  /**
   * Extract product name from OCM alert description
   * @param {string} description - Alert description
   * @returns {string|null} Product name or null
   */
  extractProductName(description) {
    try {
      // Try multiple formats to extract product name
      
      // Format 1: "Description: Name: TS021494518 Db2 Linux, Unix and Windows"
      let match = description.match(/Description:\s*Name:\s*[A-Z0-9]+\s+(.+)/i);
      
      if (match && match[1]) {
        const productName = match[1].trim();
        logger.debug('Extracted product name (Format 1)', { description, productName });
        return productName;
      }
      
      // Format 2: "Description: COMPANY opened a Severity X Case TSXXXXXX related to ProductName"
      match = description.match(/related to\s+(.+?)(?:\s*$|\n)/i);
      
      if (match && match[1]) {
        const productName = match[1].trim();
        logger.debug('Extracted product name (Format 2)', { description, productName });
        return productName;
      }
      
      // Format 3: Try to find product after "Case TSXXXXXX"
      match = description.match(/Case\s+[A-Z0-9]+\s+(.+?)(?:\s*$|\n)/i);
      
      if (match && match[1]) {
        // Remove "related to" if present
        let productName = match[1].replace(/related to\s+/i, '').trim();
        logger.debug('Extracted product name (Format 3)', { description, productName });
        return productName;
      }
      
      // Format 4: "Description: TSXXXXXX ProductName" (ticket number followed by product)
      match = description.match(/Description:\s*[A-Z0-9]+\s+(.+?)(?:\s*$|\n)/i);
      
      if (match && match[1]) {
        const productName = match[1].trim();
        logger.debug('Extracted product name (Format 4)', { description, productName });
        return productName;
      }

      logger.warn('Could not extract product name from description', { description });
      return null;

    } catch (error) {
      logger.error('Error extracting product name', {
        description,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Extract incident number from OCM alert
   * @param {string} alertText - Full alert text
   * @returns {string|null} Incident number or null
   */
  extractIncidentNumber(alertText) {
    try {
      // Format: "Incident: #0000-0320"
      const match = alertText.match(/Incident:\s*(#?\d+-\d+)/i);
      
      if (match && match[1]) {
        const incidentNumber = match[1];
        logger.debug('Extracted incident number', { incidentNumber });
        return incidentNumber;
      }

      logger.warn('Could not extract incident number from alert', { alertText });
      return null;

    } catch (error) {
      logger.error('Error extracting incident number', {
        alertText,
        error: error.message
      });
      return null;
    }
  }
}

module.exports = new PSEEResolver();

// Made with Bob
