# Monday Integration Design for PSEE Auto-Tagging

## 🎯 Project Overview

**Objective**: Automatically tag the on-call PSEE (Product SME) when IBM OCM or NHub posts a Platinum Support case in Slack channel `C09L50MAXS5`, using Monday's native Slack integration to simplify the workflow.

**Key Improvement**: Instead of using a custom webhook service, leverage Monday's registered Slack app permissions to directly interact with Slack, eliminating the need for separate Slack bot tokens and reducing infrastructure complexity.

---

## 📋 Current vs. Proposed Architecture

### Current Architecture (Webhook-Based)
```
┌─────────────────┐
│  Slack Channel  │
│  (OCM Alert)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Slack Workflow  │
│  (Extracts)     │
└────────┬────────┘
         │ HTTP POST
         ▼
┌─────────────────────────┐
│  Custom Webhook Service │
│  - Monday API Client    │
│  - Slack API Client     │
│  - PSEE Resolver        │
└────────┬────────────────┘
         │
         ▼
┌─────────────────┐
│ Slack Response  │
└─────────────────┘
```

### Proposed Architecture (Monday Integration)
```
┌─────────────────────────┐
│  Slack Channel          │
│  C09L50MAXS5            │
│  (OCM/NHub Posts Case)  │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Monday Automation      │
│  (Triggered by Slack)   │
│  - Extract Customer     │
│  - Extract Product      │
│  - Find PSEE on Board   │
│  - Check On-Call Status │
└────────┬────────────────┘
         │
         ▼
┌─────────────────────────┐
│  Monday → Slack Reply   │
│  (Using Monday's Slack  │
│   App Permissions)      │
│  - Tag PSEE             │
│  - Reply to Thread      │
└─────────────────────────┘
```

---

## 🏗️ Detailed Design

### 1. Monday Board Structure

**Board Name**: `Platinum Support PSEE Roster`  
**Board ID**: `18402249639` (existing)

#### Required Columns:

| Column Name | Type | Purpose | Example |
|------------|------|---------|---------|
| Product Name | Text | Product identifier | "Db2 Linux, Unix and Windows" |
| Customer | Dropdown | Customer name | Allianz, Bradesco, Mastercard, Volkswagen |
| PSEE Name | People | Primary PSEE | John Doe |
| PSEE Email | Email | PSEE email (for Slack lookup) | john.doe@ibm.com |
| PSEE Slack ID | Text | Cached Slack user ID | U123456789 |
| On-Call Status | Status | Current on-call status | 🟢 On-Call, 🔴 Off-Call, 🟡 Backup |
| PSA Fallback | People | Backup PSA | Ben Cornwell |
| PSA Email | Email | PSA email | ben.cornwell@uk.ibm.com |
| Last Updated | Date | Last roster update | 2026-06-08 |

#### Groups (Customer Sections):
- `allianz_psees` - Allianz products
- `bradesco_psees` - Bradesco products  
- `mastercard_psees` - Mastercard products
- `vw_psees` - Volkswagen products

### 2. Monday Automation Recipe

**Trigger**: When a message is posted in Slack channel `C09L50MAXS5`

**Conditions**:
1. Message contains "IBM On Call Manager" OR "Case opened"
2. Message contains customer identifier (Allianz/Bradesco/Mastercard/Volkswagen)

**Actions**:

#### Step 1: Extract Information
```javascript
// Parse message text to extract:
// - Customer name (from channel or message content)
// - Product name (from description field)
// - Incident number (from case ID)
// - Message timestamp (for threading)

const messageText = trigger.message_text;
const channelId = trigger.channel_id;
const messageTs = trigger.message_ts;

// Extract customer
const customer = extractCustomer(messageText, channelId);

// Extract product name
// Format: "Description: Name: TS021494518 Db2 Linux, Unix and Windows"
const productMatch = messageText.match(/Description:\s*Name:\s*[A-Z0-9]+\s+(.+)/i);
const productName = productMatch ? productMatch[1].trim() : null;

// Extract incident number
const incidentMatch = messageText.match(/Incident:\s*(#?\d+-\d+)/i);
const incidentNumber = incidentMatch ? incidentMatch[1] : "Unknown";
```

#### Step 2: Query Monday Board
```javascript
// Search for matching product in customer's group
const boardId = "18402249639";
const groupId = getGroupIdForCustomer(customer); // e.g., "allianz_psees"

// Find item where:
// - Product Name matches (fuzzy match)
// - Customer matches
// - On-Call Status = "🟢 On-Call"

const pseeItem = monday.api(`
  query {
    boards(ids: ${boardId}) {
      groups(ids: ["${groupId}"]) {
        items_page(limit: 100) {
          items {
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
`);

// Filter for matching product
const matchedItem = pseeItem.items.find(item => 
  fuzzyMatch(item.name, productName) && 
  getColumnValue(item, "on_call_status") === "🟢 On-Call"
);
```

#### Step 3: Determine Who to Tag
```javascript
let userToTag;
let tagReason;

if (matchedItem) {
  // PSEE found and on-call
  const pseeSlackId = getColumnValue(matchedItem, "psee_slack_id");
  
  if (pseeSlackId) {
    userToTag = pseeSlackId;
    tagReason = "PSEE on-call";
  } else {
    // Fallback to PSA if Slack ID not cached
    const psaEmail = getColumnValue(matchedItem, "psa_email");
    userToTag = lookupSlackUserByEmail(psaEmail);
    tagReason = "PSEE Slack ID not found, using PSA";
  }
} else {
  // No PSEE found or not on-call - use PSA fallback
  const psaEmail = getPSAForCustomer(customer);
  userToTag = lookupSlackUserByEmail(psaEmail);
  tagReason = "No on-call PSEE found, using PSA";
}

// Always CC
const ccUsers = ["jaswinder@ibm.com"].map(lookupSlackUserByEmail);
```

#### Step 4: Post Reply to Slack
```javascript
// Use Monday's Slack integration to post threaded reply
monday.slack.postMessage({
  channel: channelId,
  thread_ts: messageTs, // Reply in thread
  text: formatMessage({
    userToTag,
    ccUsers,
    productName,
    incidentNumber,
    customer,
    tagReason
  })
});

function formatMessage(data) {
  let message = `🔔 <@${data.userToTag}> - Alert for **${data.productName}** requires your attention\n`;
  message += `📋 Incident: ${data.incidentNumber}\n`;
  message += `🏢 Customer: ${data.customer}\n`;
  message += `ℹ️ ${data.tagReason}`;
  
  if (data.ccUsers.length > 0) {
    const ccMentions = data.ccUsers.map(u => `<@${u}>`).join(' ');
    message += `\n\n📧 CC: ${ccMentions}`;
  }
  
  return message;
}
```

### 3. Monday Integration Setup

#### A. Enable Monday Slack Integration

1. **In Monday.com**:
   - Go to Integrations → Slack
   - Click "Connect to Slack"
   - Authorize Monday app in your Slack workspace
   - Grant permissions:
     - `channels:read` - Read channel information
     - `chat:write` - Post messages
     - `users:read` - Look up users by email
     - `users:read.email` - Read user email addresses

2. **Configure Channel Monitoring**:
   - Add channel `C09L50MAXS5` to Monday's monitoring list
   - Enable "Trigger automations from Slack messages"

#### B. Create Automation in Monday

1. **Navigate to**: Board → Automations → Create Custom Automation

2. **Trigger Setup**:
   ```
   When a message is posted in Slack channel "C09L50MAXS5"
   AND message contains "IBM On Call Manager"
   ```

3. **Add Custom Code Block**:
   - Use Monday's automation code editor
   - Implement the logic from Step 1-4 above
   - Use Monday's built-in Slack API wrapper

4. **Test Automation**:
   - Post test message in channel
   - Verify extraction works
   - Confirm correct PSEE is tagged
   - Check threading works properly

### 4. Fallback Mechanisms

#### Priority Order:
1. **Primary**: On-call PSEE from Monday board
2. **Fallback 1**: Backup PSEE (if primary unavailable)
3. **Fallback 2**: PSA for customer
4. **Fallback 3**: Global support team

#### Error Handling:
```javascript
try {
  // Attempt PSEE lookup
  const psee = findOnCallPSEE(product, customer);
  
  if (!psee) {
    // Log to Monday activity log
    monday.log.error(`No PSEE found for ${product} - ${customer}`);
    
    // Use PSA fallback
    return getPSAFallback(customer);
  }
  
  return psee;
  
} catch (error) {
  // Log error
  monday.log.error(`PSEE lookup failed: ${error.message}`);
  
  // Notify admin channel
  monday.slack.postMessage({
    channel: "C_ADMIN_CHANNEL",
    text: `⚠️ PSEE automation failed for incident. Manual intervention needed.`
  });
  
  // Use PSA fallback
  return getPSAFallback(customer);
}
```

---

## 🔧 Implementation Steps

### Phase 1: Monday Board Preparation (Week 1)

1. **Update Board Structure**:
   - [ ] Add "On-Call Status" column
   - [ ] Add "PSEE Slack ID" column (for caching)
   - [ ] Add "PSA Fallback" columns
   - [ ] Populate all customer groups

2. **Data Migration**:
   - [ ] Import existing PSEE roster
   - [ ] Verify all email addresses
   - [ ] Cache Slack IDs for all PSEEs
   - [ ] Set initial on-call statuses

3. **Validation**:
   - [ ] Verify all products are listed
   - [ ] Confirm customer groupings
   - [ ] Test fuzzy matching logic

### Phase 2: Monday-Slack Integration (Week 2)

1. **Connect Integrations**:
   - [ ] Install Monday Slack app
   - [ ] Authorize in workspace
   - [ ] Configure channel monitoring
   - [ ] Test basic connectivity

2. **Create Automation Recipe**:
   - [ ] Set up trigger (Slack message)
   - [ ] Add extraction logic
   - [ ] Implement PSEE lookup
   - [ ] Add Slack reply action

3. **Testing**:
   - [ ] Test with sample messages
   - [ ] Verify threading works
   - [ ] Test all customer scenarios
   - [ ] Validate fallback logic

### Phase 3: Deployment & Monitoring (Week 3)

1. **Soft Launch**:
   - [ ] Enable automation in test channel
   - [ ] Monitor for 2-3 days
   - [ ] Collect feedback
   - [ ] Fix any issues

2. **Production Deployment**:
   - [ ] Switch to production channel `C09L50MAXS5`
   - [ ] Notify team of go-live
   - [ ] Monitor closely for first week

3. **Documentation**:
   - [ ] Create user guide
   - [ ] Document troubleshooting steps
   - [ ] Train team on roster updates

---

## 📊 Comparison: Current vs. Proposed

| Aspect | Current (Webhook) | Proposed (Monday Integration) |
|--------|------------------|------------------------------|
| **Infrastructure** | Separate webhook service + hosting | Monday automation only |
| **Slack Permissions** | Separate bot token required | Uses Monday's existing permissions |
| **Maintenance** | Code updates, deployments | Visual automation editor |
| **Reliability** | Depends on webhook uptime | Monday's 99.9% SLA |
| **Cost** | Hosting costs (Heroku/AWS) | Included in Monday subscription |
| **Setup Complexity** | High (code, deploy, configure) | Medium (automation builder) |
| **Debugging** | Server logs, external monitoring | Monday activity log, built-in |
| **Scalability** | Manual scaling needed | Auto-scales with Monday |
| **Team Access** | Requires developer access | Any Monday user can update |

---

## 🎯 Key Benefits

### 1. **Simplified Architecture**
- No separate webhook service to maintain
- No hosting infrastructure needed
- Single source of truth (Monday board)

### 2. **Leverages Existing Permissions**
- Monday already registered in Slack
- No need for separate bot tokens
- Unified permission management

### 3. **Easier Maintenance**
- Visual automation builder
- No code deployments
- Team can update roster directly

### 4. **Better Reliability**
- Monday's enterprise SLA
- Built-in error handling
- Automatic retries

### 5. **Enhanced Visibility**
- All actions logged in Monday
- Activity feed shows automation runs
- Easy audit trail

---

## 🔐 Security Considerations

1. **Access Control**:
   - Limit Monday board access to authorized personnel
   - Use Monday's role-based permissions
   - Audit log for all changes

2. **Data Privacy**:
   - PSEE emails stored in Monday (already compliant)
   - Slack IDs cached for performance
   - No sensitive data in automation logs

3. **Slack Permissions**:
   - Monday app uses minimal required scopes
   - Cannot read DMs or private channels
   - Only posts to authorized channels

---

## 🐛 Troubleshooting Guide

### Issue: Automation Not Triggering

**Symptoms**: No response when case posted in channel

**Solutions**:
1. Verify channel `C09L50MAXS5` is monitored
2. Check automation is enabled
3. Confirm trigger conditions match message format
4. Review Monday activity log for errors

### Issue: Wrong PSEE Tagged

**Symptoms**: Incorrect user mentioned

**Solutions**:
1. Verify product name in Monday board
2. Check on-call status is set correctly
3. Review fuzzy matching logic
4. Confirm Slack ID is cached correctly

### Issue: No User Tagged (PSA Fallback)

**Symptoms**: Always falls back to PSA

**Solutions**:
1. Check PSEE has on-call status set
2. Verify product name matches exactly
3. Confirm PSEE Slack ID is populated
4. Review customer group assignment

---

## 📈 Success Metrics

Track these KPIs to measure success:

1. **Response Time**: Time from case post to PSEE tag
   - Target: < 30 seconds
   
2. **Accuracy**: Correct PSEE tagged
   - Target: > 95%
   
3. **Fallback Rate**: How often PSA fallback is used
   - Target: < 10%
   
4. **Automation Reliability**: Successful runs
   - Target: > 99%

---

## 🔄 Migration Path

### Option A: Parallel Run (Recommended)
1. Keep existing webhook service running
2. Deploy Monday automation
3. Run both for 1 week
4. Compare results
5. Switch to Monday automation
6. Decommission webhook service

### Option B: Direct Cutover
1. Deploy Monday automation
2. Test thoroughly in staging
3. Schedule maintenance window
4. Switch to Monday automation
5. Monitor closely

---

## 📞 Support & Resources

- **Monday Automation Docs**: https://support.monday.com/hc/en-us/articles/360002899920
- **Monday Slack Integration**: https://support.monday.com/hc/en-us/articles/360001386760
- **Internal Support**: #platinum-support-internal
- **Technical Contact**: jaswinder@ibm.com

---

## ✅ Next Steps

1. **Review this design** with the team
2. **Get approval** from stakeholders
3. **Schedule implementation** timeline
4. **Assign resources** for each phase
5. **Begin Phase 1** (Board preparation)

---

*Document Version: 1.0*  
*Last Updated: 2026-06-08*  
*Author: Bob (AI Assistant)*