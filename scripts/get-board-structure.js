#!/usr/bin/env node
/**
 * Script to discover Monday.com board structure
 * Run this to get group IDs for configuration
 */

require('dotenv').config();
const axios = require('axios');

const MONDAY_API_URL = 'https://api.monday.com/v2';
const MONDAY_API_TOKEN = process.env.MONDAY_API_TOKEN;
const BOARD_ID = '18402249639';

async function getBoardStructure() {
  if (!MONDAY_API_TOKEN) {
    console.error('❌ Error: MONDAY_API_TOKEN not found in environment variables');
    console.log('Please set MONDAY_API_TOKEN in your .env file');
    process.exit(1);
  }

  console.log('🔍 Fetching Monday.com board structure...\n');

  const query = `
    query {
      boards(ids: ${BOARD_ID}) {
        id
        name
        description
        groups {
          id
          title
          color
        }
        columns {
          id
          title
          type
        }
      }
    }
  `;

  try {
    const response = await axios.post(
      MONDAY_API_URL,
      { query },
      {
        headers: {
          'Authorization': MONDAY_API_TOKEN,
          'Content-Type': 'application/json',
          'API-Version': '2024-01'
        }
      }
    );

    if (response.data.errors) {
      console.error('❌ Monday.com API Error:', response.data.errors);
      process.exit(1);
    }

    const board = response.data.data.boards[0];

    console.log('📋 Board Information:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Name: ${board.name}`);
    console.log(`ID: ${board.id}`);
    if (board.description) {
      console.log(`Description: ${board.description}`);
    }
    console.log('');

    console.log('📁 Groups (Sections):');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    board.groups.forEach(group => {
      console.log(`\n  Title: ${group.title}`);
      console.log(`  ID: ${group.id}`);
      console.log(`  Color: ${group.color}`);
    });
    console.log('');

    console.log('📊 Columns:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    board.columns.forEach(column => {
      console.log(`\n  Title: ${column.title}`);
      console.log(`  ID: ${column.id}`);
      console.log(`  Type: ${column.type}`);
    });
    console.log('');

    console.log('⚙️  Configuration for .env:');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('# Add these to your .env file:\n');
    
    // Try to match groups to customers
    const customerGroups = {
      'Allianz': null,
      'Bradesco': null,
      'Mastercard': null,
      'Volkswagen': null
    };

    board.groups.forEach(group => {
      const title = group.title.toLowerCase();
      if (title.includes('allianz')) {
        customerGroups.Allianz = group.id;
      } else if (title.includes('bradesco')) {
        customerGroups.Bradesco = group.id;
      } else if (title.includes('mastercard')) {
        customerGroups.Mastercard = group.id;
      } else if (title.includes('volkswagen') || title.includes('vw')) {
        customerGroups.Volkswagen = group.id;
      }
    });

    Object.entries(customerGroups).forEach(([customer, groupId]) => {
      if (groupId) {
        console.log(`MONDAY_GROUP_${customer.toUpperCase()}=${groupId}`);
      } else {
        console.log(`# MONDAY_GROUP_${customer.toUpperCase()}=<group_id_here> # Not found automatically`);
      }
    });

    console.log('\n✅ Board structure retrieved successfully!');
    console.log('\n💡 Next steps:');
    console.log('   1. Copy the MONDAY_GROUP_* variables to your .env file');
    console.log('   2. Verify the group IDs match your customer sections');
    console.log('   3. Update any missing group IDs manually');

  } catch (error) {
    console.error('❌ Error fetching board structure:', error.message);
    if (error.response) {
      console.error('Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the script
getBoardStructure();

// Made with Bob
