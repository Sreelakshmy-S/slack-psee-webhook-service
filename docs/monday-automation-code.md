# Monday Automation Code Implementation

This document provides the actual code to implement in Monday's automation builder for PSEE auto-tagging.

---

## 📋 Automation Configuration

### Trigger Configuration

**Trigger Type**: When a message is posted in a Slack channel

**Settings**:
```json
{
  "channel_id": "C09L50MAXS5",
  "filter": {
    "contains_any": ["IBM On Call Manager", "Case opened", "Incident:"]
  }
}
```

---

## 💻 Main Automation Code

### Complete Implementation

```javascript
/**
 * Monday Automation: PSEE Auto-Tagger
 * Triggered when OCM/NHub posts a case in Slack
 */

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
  BOARD_ID: "18402249639",
  
  // Customer to Monday group mapping
  CUSTOMER_GROUPS: {
    "Allianz": "allianz_psees",
    "Bradesco": "bradesco_psees", 
    "Mastercard": "mastercard_psees",
    "Volkswagen": "vw_psees"
  },
  
  // PSA fallback emails by customer
  PSA_FALLBACK: {
    "Allianz": "ben.cornwell@uk.ibm.com",
    "Bradesco": "roberto.palma@br.ibm.com",
    "Mastercard": "Mark.Vachher@ibm.com",
    "Volkswagen": "pkaiser@ie.ibm.com"
  },
  
  // Always CC these users
  ALWAYS_CC: ["jaswinder@ibm.com"],
  
  // Column IDs (update these based on your board)
  COLUMNS: {
    PRODUCT_NAME: "text",
    CUSTOMER: "dropdown",
    PSEE_SLACK_ID: "text4",
    ON_CALL_STATUS: "status",
    PSA_EMAIL: "email"
  }
};

// ============================================
// MAIN EXECUTION
// ============================================

async function main() {
  try {
    // Get trigger data
    const messageText = inputFields.message_text;
    const channelId = inputFields.channel_id;
    const messageTs = inputFields.message_ts;
    
    console.log("Processing alert:", { messageText, channelId, messageTs });
    
    // Step 1: Extract information from message
    const extractedData = extractAlertInfo(messageText);
    
    if (!extractedData.customer || !extractedData.product) {
      throw new Error("Could not extract customer or product from message");
    }
    
    console.log("Extracted data:", extractedData);
    
    // Step 2: Find PSEE in Monday board
    const pseeResult = await findOnCallPSEE(
      extractedData.product,
      extractedData.customer
    );
    
    console.log("PSEE lookup result:", pseeResult);
    
    // Step 3: Get Slack user IDs
    const primaryUser = await getSlackUserId(pseeResult.email);
    const ccUsers = await getSlackUserIds(CONFIG.ALWAYS_CC);
    
    // Step 4: Format and post message
    const message = formatSlackMessage({
      primaryUser,
      ccUsers,
      product: extractedData.product,
      incident: extractedData.incident,
      customer: extractedData.customer,
      pseeFound: pseeResult.found,
      pseeName: pseeResult.name,
      reason: pseeResult.reason
    });
    
    // Step 5: Post to Slack as threaded reply
    await postToSlack(channelId, messageTs, message);
    
    console.log("Successfully posted PSEE notification");
    
    return {
      success: true,
      psee: pseeResult.name,
      customer: extractedData.customer,
      product: extractedData.product
    };
    
  } catch (error) {
    console.error("Automation failed:", error);
    
    // Post error notification
    await postErrorNotification(error);
    
    return {
      success: false,
      error: error.message
    };
  }
}

// ============================================
// EXTRACTION FUNCTIONS
// ============================================

function extractAlertInfo(messageText) {
  const result = {
    customer: null,
    product: null,
    incident: "Unknown"
  };
  
  // Extract customer name
  const customerMatch = messageText.match(/\b(Allianz|Bradesco|Mastercard|Volkswagen)\b/i);
  if (customerMatch) {
    result.customer = customerMatch[1];
  }
  
  // Extract product name
  // Format 1: "Description: Name: TS021494518 Db2 Linux, Unix and Windows"
  let productMatch = messageText.match(/Description:\s*Name:\s*[A-Z0-9]+\s+(.+?)(?:\n|$)/i);
  
  if (productMatch) {
    result.product = productMatch[1].trim();
  } else {
    // Format 2: "related to ProductName"
    productMatch = messageText.match(/related to\s+(.+?)(?:\n|$)/i);
    if (productMatch) {
      result.product = productMatch[1].trim();
    }
  }
  
  // Extract incident number
  const incidentMatch = messageText.match(/Incident:\s*(#?\d+-\d+)/i);
  if (incidentMatch) {
    result.incident = incidentMatch[1];
  }
  
  return result;
}

// ============================================
// MONDAY BOARD QUERY FUNCTIONS
// ============================================

async function findOnCallPSEE(productName, customer) {
  try {
    const groupId = CONFIG.CUSTOMER_GROUPS[customer];
    
    if (!groupId) {
      throw new Error(`No group configured for customer: ${customer}`);
    }
    
    // Query Monday board
    const query = `
      query {
        boards(ids: ${CONFIG.BOARD_ID}) {
          groups(ids: ["${groupId}"]) {
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
    
    const response = await monday.api(query);
    const items = response.data.boards[0].groups[0].items_page.items;
    
    console.log(`Found ${items.length} items in ${customer} group`);
    
    // Find matching product with on-call PSEE
    for (const item of items) {
      if (isProductMatch(item.name, productName)) {
        const onCallStatus = getColumnValue(item, CONFIG.COLUMNS.ON_CALL_STATUS);
        
        if (onCallStatus === "🟢 On-Call" || onCallStatus === "On-Call") {
          const pseeSlackId = getColumnValue(item, CONFIG.COLUMNS.PSEE_SLACK_ID);
          const psaEmail = getColumnValue(item, CONFIG.COLUMNS.PSA_EMAIL);
          
          if (pseeSlackId) {
            return {
              found: true,
              email: pseeSlackId, // Actually Slack ID
              name: item.name,
              reason: "PSEE on-call"
            };
          } else if (psaEmail) {
            return {
              found: false,
              email: psaEmail,
              name: "PSA",
              reason: "PSEE Slack ID not cached, using PSA"
            };
          }
        }
      }
    }
    
    // No match found - use PSA fallback
    const psaEmail = CONFIG.PSA_FALLBACK[customer];
    return {
      found: false,
      email: psaEmail,
      name: "PSA",
      reason: "No on-call PSEE found for product"
    };
    
  } catch (error) {
    console.error("Error finding PSEE:", error);
    
    // Fallback to PSA
    const psaEmail = CONFIG.PSA_FALLBACK[customer];
    return {
      found: false,
      email: psaEmail,
      name: "PSA",
      reason: `Error: ${error.message}`
    };
  }
}

function getColumnValue(item, columnId) {
  const column = item.column_values.find(col => col.id === columnId);
  return column ? column.text : null;
}

function isProductMatch(str1, str2) {
  if (!str1 || !str2) return false;
  
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();
  
  // Exact match
  if (s1 === s2) return true;
  
  // Partial match
  if (s1.includes(s2) || s2.includes(s1)) return true;
  
  // Fuzzy match (remove special characters)
  const normalized1 = s1.replace(/[^a-z0-9]/g, '');
  const normalized2 = s2.replace(/[^a-z0-9]/g, '');
  
  return normalized1.includes(normalized2) || normalized2.includes(normalized1);
}

// ============================================
// SLACK FUNCTIONS
// ============================================

async function getSlackUserId(emailOrId) {
  // If already a Slack ID (starts with U), return it
  if (emailOrId && emailOrId.startsWith('U')) {
    return emailOrId;
  }
  
  // Otherwise, lookup by email
  try {
    const user = await monday.slack.getUserByEmail(emailOrId);
    return user.id;
  } catch (error) {
    console.error(`Could not find Slack user for ${emailOrId}:`, error);
    return null;
  }
}

async function getSlackUserIds(emails) {
  const userIds = [];
  
  for (const email of emails) {
    const userId = await getSlackUserId(email);
    if (userId) {
      userIds.push(userId);
    }
  }
  
  return userIds;
}

function formatSlackMessage(data) {
  let message = "";
  
  if (data.primaryUser) {
    message += `🔔 <@${data.primaryUser}>`;
  } else {
    message += `🔔 @channel`;
  }
  
  message += ` - Alert for **${data.product}** requires your attention\n\n`;
  message += `📋 Incident: ${data.incident}\n`;
  message += `🏢 Customer: ${data.customer}\n`;
  
  if (data.pseeFound) {
    message += `✅ PSEE: ${data.pseeName}`;
  } else {
    message += `⚠️ ${data.reason}`;
  }
  
  // Add CC users
  if (data.ccUsers && data.ccUsers.length > 0) {
    const ccMentions = data.ccUsers.map(id => `<@${id}>`).join(' ');
    message += `\n\n📧 CC: ${ccMentions}`;
  }
  
  return message;
}

async function postToSlack(channelId, threadTs, message) {
  try {
    await monday.slack.postMessage({
      channel: channelId,
      thread_ts: threadTs, // Reply in thread
      text: message,
      unfurl_links: false,
      unfurl_media: false
    });
    
    console.log("Posted to Slack successfully");
  } catch (error) {
    console.error("Failed to post to Slack:", error);
    throw error;
  }
}

async function postErrorNotification(error) {
  try {
    // Post to admin channel or log
    await monday.slack.postMessage({
      channel: "C_ADMIN_CHANNEL", // Replace with actual admin channel
      text: `⚠️ PSEE Automation Error: ${error.message}`,
      unfurl_links: false
    });
  } catch (e) {
    console.error("Could not post error notification:", e);
  }
}

// ============================================
// EXECUTE
// ============================================

main();
```

---

## 🔧 Setup Instructions

### Step 1: Create Automation in Monday

1. Go to your Monday board (ID: 18402249639)
2. Click **Automations** → **Create Custom Automation**
3. Choose trigger: **When a message is posted in Slack**
4. Select channel: `C09L50MAXS5`
5. Add filter: Message contains "IBM On Call Manager"

### Step 2: Add Custom Code

1. Add action: **Run custom code**
2. Copy the entire code above
3. Update the `CONFIG` section with your actual column IDs
4. Save the automation

### Step 3: Get Column IDs

Run this query in Monday's API playground to get your column IDs:

```graphql
query {
  boards(ids: 18402249639) {
    columns {
      id
      title
      type
    }
  }
}
```

Update the `CONFIG.COLUMNS` object with the correct IDs.

### Step 4: Test

1. Post a test message in channel `C09L50MAXS5`:
   ```
   IBM On Call Manager
   Incident: #0000-0320
   State: Unassigned
   Priority: 1
   Description: Name: TS021494518 Db2 Linux, Unix and Windows
   Customer: Allianz
   ```

2. Check Monday activity log for execution
3. Verify Slack reply is posted
4. Confirm correct user is tagged

---

## 🎨 Alternative: Simplified Version

If Monday's code editor has limitations, use this simplified version:

```javascript
// Simplified PSEE Auto-Tagger

const messageText = inputFields.message_text;
const channelId = inputFields.channel_id;
const messageTs = inputFields.message_ts;

// Extract product name
const productMatch = messageText.match(/Description:\s*Name:\s*[A-Z0-9]+\s+(.+)/i);
const product = productMatch ? productMatch[1].trim() : "Unknown";

// Extract customer
const customerMatch = messageText.match(/\b(Allianz|Bradesco|Mastercard|Volkswagen)\b/i);
const customer = customerMatch ? customerMatch[1] : "Unknown";

// Extract incident
const incidentMatch = messageText.match(/Incident:\s*(#?\d+-\d+)/i);
const incident = incidentMatch ? incidentMatch[1] : "Unknown";

// Query board for PSEE
const groupMap = {
  "Allianz": "allianz_psees",
  "Bradesco": "bradesco_psees",
  "Mastercard": "mastercard_psees",
  "Volkswagen": "vw_psees"
};

const groupId = groupMap[customer];

// Search for product in Monday board
const items = await monday.api(`
  query {
    boards(ids: 18402249639) {
      groups(ids: ["${groupId}"]) {
        items_page {
          items {
            name
            column_values {
              id
              text
            }
          }
        }
      }
    }
  }
`);

// Find matching product and get PSEE Slack ID
let pseeSlackId = null;
for (const item of items.data.boards[0].groups[0].items_page.items) {
  if (item.name.toLowerCase().includes(product.toLowerCase())) {
    const slackIdColumn = item.column_values.find(c => c.id === "text4");
    pseeSlackId = slackIdColumn ? slackIdColumn.text : null;
    break;
  }
}

// Fallback to PSA if no PSEE found
if (!pseeSlackId) {
  const psaMap = {
    "Allianz": "ben.cornwell@uk.ibm.com",
    "Bradesco": "roberto.palma@br.ibm.com",
    "Mastercard": "Mark.Vachher@ibm.com",
    "Volkswagen": "pkaiser@ie.ibm.com"
  };
  
  const psaEmail = psaMap[customer];
  const psaUser = await monday.slack.getUserByEmail(psaEmail);
  pseeSlackId = psaUser.id;
}

// Post to Slack
const message = `🔔 <@${pseeSlackId}> - Alert for **${product}** requires attention\n📋 Incident: ${incident}\n🏢 Customer: ${customer}`;

await monday.slack.postMessage({
  channel: channelId,
  thread_ts: messageTs,
  text: message
});
```

---

## 📊 Testing Checklist

- [ ] Test with Allianz case
- [ ] Test with Bradesco case
- [ ] Test with Mastercard case
- [ ] Test with Volkswagen case
- [ ] Test with unknown product (PSA fallback)
- [ ] Test with PSEE not on-call (PSA fallback)
- [ ] Test threading (reply to original message)
- [ ] Test CC functionality
- [ ] Test error handling
- [ ] Test with malformed message

---

## 🐛 Debugging

### Enable Debug Logging

Add this at the start of your code:

```javascript
const DEBUG = true;

function debug(message, data) {
  if (DEBUG) {
    console.log(`[DEBUG] ${message}`, JSON.stringify(data, null, 2));
  }
}
```

### View Logs

1. Go to Monday board
2. Click **Automations**
3. Find your automation
4. Click **Activity Log**
5. View execution history and console logs

### Common Issues

**Issue**: "Cannot read property 'items' of undefined"
- **Fix**: Check group ID is correct for customer

**Issue**: "User not found by email"
- **Fix**: Verify email matches Slack workspace

**Issue**: "Message not posted to Slack"
- **Fix**: Check Monday Slack integration is connected

---

## 📈 Monitoring

Add this monitoring code to track performance:

```javascript
// At start of main()
const startTime = Date.now();

// At end of main()
const duration = Date.now() - startTime;
console.log(`Automation completed in ${duration}ms`);

// Log to Monday board
await monday.api(`
  mutation {
    create_update(
      item_id: ${MONITORING_ITEM_ID},
      body: "Automation ran in ${duration}ms - PSEE: ${pseeResult.name}"
    ) {
      id
    }
  }
`);
```

---

*Last Updated: 2026-06-08*  
*Version: 1.0*