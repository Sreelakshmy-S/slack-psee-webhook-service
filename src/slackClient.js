/**
 * Slack API Client
 * Handles all interactions with Slack API
 */

const { WebClient } = require('@slack/web-api');
const config = require('./config');
const logger = require('./logger');

class SlackClient {
  constructor() {
    this.client = new WebClient(config.slack.botToken);
    this.userCache = new Map(); // Cache for user lookups
  }

  /**
   * Lookup Slack user by email address
   * @param {string} email - User's email address
   * @returns {Promise<Object>} User information
   */
  async lookupUserByEmail(email) {
    try {
      // MOCK MODE: If no bot token, return mock data
      if (!this.client.token || this.client.token === '') {
       logger.info('MOCK MODE: Returning mock user data', { email });
       return {
          id: 'U' + Math.random().toString(36).substr(2, 9).toUpperCase(),
         name: email.split('@')[0].replace('.', ' ').replace(/\b\w/g, l => l.toUpperCase()),
          email: email,
          displayName: email.split('@')[0]
        };
      }
      // Check cache first
      if (this.userCache.has(email)) {
        logger.debug('User found in cache', { email });
        return this.userCache.get(email);
      }

      logger.info('Looking up Slack user', { email });

      const result = await this.client.users.lookupByEmail({ email });

      const userInfo = {
        id: result.user.id,
        name: result.user.real_name,
        email: result.user.profile.email,
        displayName: result.user.profile.display_name
      };

      // Cache the result
      this.userCache.set(email, userInfo);

      logger.info('Slack user found', { email, userId: userInfo.id });

      return userInfo;

    } catch (error) {
      if (error.data?.error === 'users_not_found') {
        logger.warn('Slack user not found', { email });
        throw new Error(`Slack user not found: ${email}`);
      }

      logger.error('Error looking up Slack user', {
        email,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Lookup multiple users by email addresses
   * @param {Array<string>} emails - Array of email addresses
   * @returns {Promise<Array<Object>>} Array of user information
   */
  async lookupMultipleUsers(emails) {
    const uniqueEmails = [...new Set(emails)]; // Remove duplicates
    
    logger.info('Looking up multiple Slack users', { count: uniqueEmails.length });

    const results = await Promise.allSettled(
      uniqueEmails.map(email => this.lookupUserByEmail(email))
    );

    const users = [];
    const errors = [];

    results.forEach((result, index) => {
      if (result.status === 'fulfilled') {
        users.push(result.value);
      } else {
        errors.push({
          email: uniqueEmails[index],
          error: result.reason.message
        });
      }
    });

    if (errors.length > 0) {
      logger.warn('Some users could not be found', { errors });
    }

    return users;
  }

  /**
   * Post a message to a Slack channel
   * @param {string} channelId - Channel ID
   * @param {string} text - Message text
   * @param {string} threadTs - Thread timestamp (optional)
   * @returns {Promise<Object>} Message response
   */
  async postMessage(channelId, text, threadTs = null) {
    try {
      // MOCK MODE: If no bot token, return mock response
      if (!this.client.token || this.client.token === '') {
        logger.info('MOCK MODE: Simulating Slack message post', { channelId, text, threadTs });
        return {
          ok: true,
          channel: channelId,
          ts: Date.now().toString() + '.000000',
          message: {
            text: text,
            username: 'PSEE Bot (Mock)',
            bot_id: 'B_MOCK_BOT',
            type: 'message',
            ts: Date.now().toString() + '.000000'
          }
        };
      }

      logger.info('Posting message to Slack', { channelId, threadTs });

      const params = {
        channel: channelId,
        text: text,
        unfurl_links: false,
        unfurl_media: false
      };

      if (threadTs) {
        params.thread_ts = threadTs;
      }

      const result = await this.client.chat.postMessage(params);

      logger.info('Message posted successfully', {
        channelId,
        messageTs: result.ts
      });

      return result;

    } catch (error) {
      logger.error('Error posting message to Slack', {
        channelId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Format user mentions for Slack message
   * @param {Array<Object>} users - Array of user objects with id property
   * @returns {string} Formatted mention string
   */
  formatUserMentions(users) {
    return users.map(user => `<@${user.id}>`).join(' ');
  }

  /**
   * Clear user cache (useful for testing or periodic refresh)
   */
  clearCache() {
    logger.info('Clearing Slack user cache');
    this.userCache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache statistics
   */
  getCacheStats() {
    return {
      size: this.userCache.size,
      entries: Array.from(this.userCache.keys())
    };
  }
}

module.exports = new SlackClient();

// Made with Bob
