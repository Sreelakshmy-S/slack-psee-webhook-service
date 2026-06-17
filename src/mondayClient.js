/**
 * Monday.com API Client
 * Handles all interactions with Monday.com board
 */

const axios = require('axios');
const config = require('./config');
const logger = require('./logger');

class MondayClient {
  constructor() {
    this.apiUrl = config.monday.apiUrl;
    this.apiToken = config.monday.apiToken;
    this.boardId = config.monday.boardId;
  }

  /**
   * Execute a GraphQL query against Monday.com API
   * @param {string} query - GraphQL query string
   * @returns {Promise<Object>} API response data
   */
  async executeQuery(query) {
    try {
      logger.debug('Executing Monday.com query', { query });

      const response = await axios.post(
        this.apiUrl,
        { query },
        {
          headers: {
            'Authorization': this.apiToken,
            'Content-Type': 'application/json',
            'API-Version': '2024-01'
          },
          timeout: 10000 // 10 second timeout
        }
      );

      if (response.data.errors) {
        logger.error('Monday.com API returned errors', { errors: response.data.errors });
        throw new Error(`Monday.com API error: ${JSON.stringify(response.data.errors)}`);
      }

      return response.data.data;
    } catch (error) {
      logger.error('Failed to execute Monday.com query', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get board structure including groups
   * @returns {Promise<Object>} Board structure
   */
  async getBoardStructure() {
    const query = `
      query {
        boards(ids: ${this.boardId}) {
          id
          name
          groups {
            id
            title
          }
        }
      }
    `;

    const data = await this.executeQuery(query);
    return data.boards[0];
  }

  /**
   * Query items in a specific group (customer section)
   * @param {string} customer - Customer name (e.g., 'Allianz')
   * @returns {Promise<Array>} Array of items with their column values
   */
  async queryCustomerItems(customer) {
    const groupId = config.mondayGroups[customer];
    
    if (!groupId) {
      throw new Error(`No Monday.com group configured for customer: ${customer}`);
    }

    const query = `
      query {
        boards(ids: ${this.boardId}) {
          groups(ids: ["${groupId}"]) {
            title
            items_page(limit: 100) {
              items {
                id
                name
                column_values {
                  id
                  text
                  value
                }
              }
            }
          }
        }
      }
    `;

    logger.info('Querying Monday.com items', { customer, groupId });

    const data = await this.executeQuery(query);
    
    if (!data.boards[0]?.groups[0]) {
      logger.warn('No group found for customer', { customer, groupId });
      return [];
    }

    return data.boards[0].groups[0].items_page.items;
  }

  /**
   * Find PSEE for a specific product and customer
   * @param {string} productName - Product name from alert
   * @param {string} customer - Customer name
   * @returns {Promise<Object|null>} PSEE information or null if not found
   */
  async findPSEEForProduct(productName, customer) {
    try {
      const items = await this.queryCustomerItems(customer);

      logger.info('Searching for PSEE', {
        productName,
        customer,
        itemCount: items.length
      });

      // Search for matching product
      const match = items.find(item => {
        // Check if product name matches item name
        if (this.isProductMatch(item.name, productName)) {
          return true;
        }

        // Check product name column (using column id since title is not available)
        const productColumn = item.column_values.find(
          col => col.id && (
            col.id.toLowerCase().includes('product') ||
            col.id.toLowerCase().includes('name')
          )
        );

        if (productColumn && this.isProductMatch(productColumn.text, productName)) {
          return true;
        }

        return false;
      });

      if (!match) {
        logger.info('No PSEE found for product', { productName, customer });
        return null;
      }

      // Extract PSEE information
      const pseeInfo = this.extractPSEEInfo(match);
      
      logger.info('PSEE found', {
        productName,
        customer,
        psee: pseeInfo
      });

      return pseeInfo;

    } catch (error) {
      logger.error('Error finding PSEE', {
        error: error.message,
        productName,
        customer
      });
      throw error;
    }
  }

  /**
   * Check if product names match (case-insensitive, partial match)
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {boolean} True if match found
   */
  isProductMatch(str1, str2) {
    if (!str1 || !str2) return false;

    const s1 = str1.toLowerCase().trim();
    const s2 = str2.toLowerCase().trim();

    // Exact match
    if (s1 === s2) return true;

    // Partial match (either direction)
    if (s1.includes(s2) || s2.includes(s1)) return true;

    // Fuzzy match for common variations
    // e.g., "Db2" vs "DB2", "Watson Assistant" vs "WatsonAssistant"
    const normalized1 = s1.replace(/[^a-z0-9]/g, '');
    const normalized2 = s2.replace(/[^a-z0-9]/g, '');

    return normalized1.includes(normalized2) || normalized2.includes(normalized1);
  }

  /**
   * Extract PSEE information from Monday.com item
   * @param {Object} item - Monday.com item
   * @returns {Object} PSEE information
   */
  extractPSEEInfo(item) {
    const columnValues = item.column_values;

    // Find email column (using column id since title is not available)
    const emailColumn = columnValues.find(col =>
      col.id && col.id.toLowerCase().includes('email')
    );

    // Find name column (using column id since title is not available)
    const nameColumn = columnValues.find(col =>
      col.id && (
        col.id.toLowerCase().includes('psee') ||
        col.id.toLowerCase().includes('name') ||
        col.id.toLowerCase().includes('person')
      )
    );

    return {
      email: emailColumn?.text || null,
      name: nameColumn?.text || item.name,
      productName: item.name
    };
  }
}

module.exports = new MondayClient();

// Made with Bob
