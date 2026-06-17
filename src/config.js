/**
 * Configuration module for PSEE Webhook Service
 * Centralizes all configuration settings
 */

require('dotenv').config();

module.exports = {
  // Server configuration
  server: {
    port: process.env.PORT || 3000,
    env: process.env.NODE_ENV || 'development'
  },

  // Monday.com configuration
  monday: {
    apiToken: process.env.MONDAY_API_TOKEN,
    apiUrl: 'https://api.monday.com/v2',
    boardId: '18402249639'
  },

  // Slack configuration
  slack: {
    botToken: process.env.SLACK_BOT_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET
  },

  // Customer to Slack channel mapping
  channels: {
    'C0A7C3CH4LW': 'Allianz',
    'C0A5UTEGZJT': 'Bradesco',
    'C0A5KDHSCRE': 'Mastercard',
    'C0A6DPP5NJ1': 'Volkswagen',
    'C09L50MAXS5': 'Multi-Customer'  // Your test channel

  },

  // Monday.com group IDs for each customer
  // These need to be populated after querying the board structure
  mondayGroups: {
    'Allianz': process.env.MONDAY_GROUP_ALLIANZ || 'allianz_psees',
    'Bradesco': process.env.MONDAY_GROUP_BRADESCO || 'bradesco_psees',
    'Mastercard': process.env.MONDAY_GROUP_MASTERCARD || 'mastercard_psees',
    'Volkswagen': process.env.MONDAY_GROUP_VOLKSWAGEN || 'vw_psees'
  },

  // PSA (Product Support Architect) fallback emails
  psaEmails: {
    'Allianz': ['ben.cornwell@uk.ibm.com'],
    'Bradesco': ['roberto.palma@br.ibm.com'],
    'Mastercard': ['Mark.Vachher@ibm.com', 'praveensogalad@in.ibm.com'],
    'Volkswagen': ['pkaiser@ie.ibm.com']
  },

  // Always CC these users
  alwaysCC: ['jaswinder@ibm.com'],

  // Logging configuration
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'json'
  },

  // Cache configuration (optional, for performance)
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true',
    ttl: parseInt(process.env.CACHE_TTL || '300', 10) // 5 minutes default
  }
};

// Made with Bob
