# Migration Guide: Webhook Service → Monday Integration

This guide provides step-by-step instructions for migrating from the current webhook-based solution to the Monday integration approach.

---

## 📊 Executive Summary

### Why Migrate?

| Benefit | Impact |
|---------|--------|
| **Reduced Complexity** | Eliminate separate webhook service, hosting, and deployment pipeline |
| **Lower Costs** | No hosting fees (Heroku/AWS), included in Monday subscription |
| **Easier Maintenance** | Visual automation builder, no code deployments needed |
| **Better Reliability** | Monday's 99.9% SLA vs. self-hosted uptime |
| **Simplified Permissions** | Use Monday's existing Slack integration |
| **Team Empowerment** | Non-developers can update roster and automation |

### Migration Timeline

- **Phase 1 (Week 1)**: Preparation & Setup
- **Phase 2 (Week 2)**: Parallel Testing
- **Phase 3 (Week 3)**: Cutover & Monitoring
- **Phase 4 (Week 4)**: Decommission Old Service

---

## 🎯 Pre-Migration Checklist

### 1. Verify Monday.com Access

- [ ] Confirm Monday.com subscription is active
- [ ] Verify board ID `18402249639` is accessible
- [ ] Check you have admin permissions on the board
- [ ] Confirm Monday Slack integration is available

### 2. Document Current State

- [ ] Export current PSEE roster from Monday board
- [ ] Document all customer-to-channel mappings
- [ ] List all PSA fallback emails
- [ ] Record current webhook service URL
- [ ] Note any custom configurations

### 3. Stakeholder Communication

- [ ] Notify team of upcoming migration
- [ ] Schedule migration window
- [ ] Prepare rollback plan
- [ ] Identify key stakeholders for testing

---

## 📋 Phase 1: Preparation & Setup (Week 1)

### Day 1-2: Monday Board Enhancement

#### Task 1.1: Add Required Columns

Add these columns to your Monday board if not already present:

```
1. On-Call Status (Status column)
   - Options: 🟢 On-Call, 🔴 Off-Call, 🟡 Backup
   
2. PSEE Slack ID (Text column)
   - Purpose: Cache Slack user IDs for faster lookup
   
3. PSA Fallback Email (Email column)
   - Purpose: Backup contact if PSEE unavailable
   
4. Last Updated (Date column)
   - Purpose: Track roster freshness
```

**How to Add**:
1. Open board `18402249639`
2. Click **+** to add column
3. Select column type
4. Name the column
5. Configure options (for Status column)

#### Task 1.2: Populate Slack IDs

Run this script to cache Slack IDs for all PSEEs:

```javascript
// Run in Monday automation or external script
const items = await monday.api(`
  query {
    boards(ids: 18402249639) {
      items_page {
        items {
          id
          column_values(ids: ["email"]) {
            text
          }
        }
      }
    }
  }
`);

for (const item of items.data.boards[0].items_page.items) {
  const email = item.column_values[0].text;
  
  if (email) {
    try {
      const slackUser = await monday.slack.getUserByEmail(email);
      
      // Update Slack ID column
      await monday.api(`
        mutation {
          change_simple_column_value(
            item_id: ${item.id},
            board_id: 18402249639,
            column_id: "text4",
            value: "${slackUser.id}"
          ) {
            id
          }
        }
      `);
      
      console.log(`Updated ${email} → ${slackUser.id}`);
    } catch (error) {
      console.error(`Failed to lookup ${email}:`, error);
    }
  }
}
```

#### Task 1.3: Set On-Call Statuses

For each customer group:
1. Review current on-call roster
2. Set "🟢 On-Call" for active PSEEs
3. Set "🔴 Off-Call" for others
4. Set "🟡 Backup" for backup PSEEs

### Day 3-4: Monday-Slack Integration Setup

#### Task 2.1: Connect Monday to Slack

1. **In Monday.com**:
   - Go to **Integrations** → **Slack**
   - Click **Connect to Slack**
   - Select your workspace
   - Authorize the app

2. **Grant Permissions**:
   - `channels:read` - Read channel info
   - `chat:write` - Post messages
   - `users:read` - Look up users
   - `users:read.email` - Read user emails

3. **Configure Channel Monitoring**:
   - Add channel `C09L50MAXS5` to monitoring
   - Enable "Trigger automations from messages"

#### Task 2.2: Test Slack Connection

Post a test message in a test channel:

```javascript
await monday.slack.postMessage({
  channel: "C_TEST_CHANNEL",
  text: "🧪 Testing Monday-Slack integration"
});
```

Verify the message appears in Slack.

### Day 5: Create Automation

#### Task 3.1: Create Base Automation

1. Go to board → **Automations** → **Create Custom Automation**
2. **Trigger**: When a message is posted in Slack
3. **Channel**: `C09L50MAXS5`
4. **Filter**: Message contains "IBM On Call Manager"
5. **Action**: Run custom code

#### Task 3.2: Add Automation Code

Copy the code from [`docs/monday-automation-code.md`](monday-automation-code.md) into the automation editor.

Update the `CONFIG` section:

```javascript
const CONFIG = {
    
  BOARD_ID: "18402249639",
  
  CUSTOMER_GROUPS: {
    "Allianz": "allianz_psees",      // Update with actual group IDs
    "Bradesco": "bradesco_psees",
    "Mastercard": "mastercard_psees",
    "Volkswagen": "vw_psees"
  },
  
  COLUMNS: {
    PRODUCT_NAME: "text",      // Update with actual column IDs
    PSEE_SLACK_ID: "text4",
    ON_CALL_STATUS: "status",
    PSA_EMAIL: "email"
  }
};
```

#### Task 3.3: Get Actual Column IDs

Run this query in Monday API playground:

```graphql
query {
  boards(ids: 18402249639) {
    columns {
      id
      title
      type
    }
    groups {
      id
      title
    }
  }
}
```

Update your automation code with the correct IDs.

---

## 🧪 Phase 2: Parallel Testing (Week 2)

### Day 1-3: Test Channel Setup

#### Task 4.1: Create Test Channel

1. Create a new Slack channel: `#psee-automation-test`
2. Add test users
3. Update Monday automation to monitor this channel
4. Keep production webhook service running

#### Task 4.2: Run Parallel Tests

For each customer, post test cases:

**Test Case 1: Allianz - Known Product**
```
IBM On Call Manager
Incident: #TEST-001
State: Unassigned
Priority: 1
Description: Name: TS999999 Db2 Linux, Unix and Windows
Customer: Allianz
```

**Expected**: PSEE for Db2 is tagged

**Test Case 2: Bradesco - Unknown Product**
```
IBM On Call Manager
Incident: #TEST-002
State: Unassigned
Priority: 1
Description: Name: TS999998 Unknown Product XYZ
Customer: Bradesco
```

**Expected**: PSA fallback is tagged

**Test Case 3: Mastercard - PSEE Off-Call**
```
IBM On Call Manager
Incident: #TEST-003
State: Unassigned
Priority: 1
Description: Name: TS999997 Watson Assistant
Customer: Mastercard
```

**Expected**: Backup PSEE or PSA is tagged

#### Task 4.3: Compare Results

Create a comparison spreadsheet:

| Test Case | Webhook Result | Monday Result | Match? | Notes |
|-----------|---------------|---------------|--------|-------|
| Allianz Db2 | @john.doe | @john.doe | ✅ | Perfect match |
| Bradesco Unknown | @psa | @psa | ✅ | Correct fallback |
| Mastercard Watson | @jane.smith | @jane.smith | ✅ | Correct PSEE |

### Day 4-5: Performance Testing

#### Task 5.1: Measure Response Times

Add timing code to both systems:

```javascript
// Monday automation
const startTime = Date.now();
// ... automation logic ...
const duration = Date.now() - startTime;
console.log(`Monday automation: ${duration}ms`);

// Webhook service (add to index.js)
const startTime = Date.now();
// ... webhook logic ...
logger.info('Webhook response time', { duration: Date.now() - startTime });
```

#### Task 5.2: Load Testing

Post 10 test cases in quick succession:
- Monitor both systems
- Check for any failures
- Verify all messages are processed
- Compare response times

**Target Metrics**:
- Response time: < 30 seconds
- Success rate: > 99%
- No duplicate notifications

---

## 🚀 Phase 3: Cutover & Monitoring (Week 3)

### Day 1: Pre-Cutover Checklist

- [ ] All parallel tests passed
- [ ] Performance metrics acceptable
- [ ] Team trained on new system
- [ ] Rollback plan documented
- [ ] Stakeholders notified

### Day 2: Production Cutover

#### Task 6.1: Update Monday Automation

1. Change channel from test to production: `C09L50MAXS5`
2. Save and publish automation
3. Test with one real case (if available)

#### Task 6.2: Disable Webhook Service

**Option A: Soft Disable** (Recommended)
```javascript
// Add to index.js
app.post('/lookup-psee', async (req, res) => {
  logger.warn('Webhook service deprecated - using Monday integration');
  
  res.status(410).json({
    error: 'Service deprecated',
    message: 'PSEE tagging now handled by Monday automation'
  });
});
```

**Option B: Hard Disable**
- Stop the service
- Keep code for rollback

### Day 3-7: Intensive Monitoring

#### Task 7.1: Monitor Every Case

For each case posted:
1. Verify automation triggers
2. Check correct PSEE is tagged
3. Confirm threading works
4. Validate CC users included
5. Monitor response time

#### Task 7.2: Daily Review

Create a daily report:

```markdown
## PSEE Automation Daily Report - [Date]

### Cases Processed: X
- Successful: Y (Z%)
- Failed: N
- Fallback to PSA: M

### Average Response Time: Xs

### Issues:
- [List any issues]

### Actions Taken:
- [List any fixes]
```

#### Task 7.3: Gather Feedback

Survey the team:
1. Is the automation working correctly?
2. Are response times acceptable?
3. Any issues or concerns?
4. Suggestions for improvement?

---

## 🗑️ Phase 4: Decommission (Week 4)

### Day 1-2: Final Validation

- [ ] No issues reported for 1 week
- [ ] All metrics within targets
- [ ] Team satisfied with new system
- [ ] No rollback requests

### Day 3: Archive Webhook Service

#### Task 8.1: Create Archive

```bash
# Create archive branch
git checkout -b archive/webhook-service
git push origin archive/webhook-service

# Tag the last production version
git tag -a v1.0.0-final -m "Final webhook service version"
git push origin v1.0.0-final
```

#### Task 8.2: Update Documentation

Add to README.md:

```markdown
## ⚠️ DEPRECATED

This webhook service has been replaced by Monday.com automation.

**Migration Date**: [Date]
**New System**: Monday Integration
**Documentation**: See docs/monday-integration-design.md

For historical reference only.
```

### Day 4: Shutdown Infrastructure

#### If Hosted on Heroku:
```bash
# Scale down to 0 dynos
heroku ps:scale web=0

# Wait 1 week, then delete app
heroku apps:destroy --app slack-psee-webhook --confirm slack-psee-webhook
```

#### If Hosted on AWS Lambda:
```bash
# Remove the deployment
serverless remove

# Delete CloudWatch logs after 30 days
```

### Day 5: Final Documentation

#### Task 9.1: Update All Documentation

Update these files:
- [ ] README.md - Add deprecation notice
- [ ] docs/deployment.md - Mark as archived
- [ ] docs/slack-workflow-setup.md - Reference Monday integration

#### Task 9.2: Knowledge Transfer

Create final handover document:

```markdown
# PSEE Automation - Final Handover

## System Overview
- **Platform**: Monday.com Automation
- **Board ID**: 18402249639
- **Slack Channel**: C09L50MAXS5

## Key Contacts
- **Primary**: [Name] - [Email]
- **Backup**: [Name] - [Email]

## Common Tasks

### Update PSEE Roster
1. Go to Monday board
2. Find product row
3. Update PSEE name and email
4. Set on-call status

### Troubleshoot Issues
1. Check Monday activity log
2. Review automation code
3. Verify Slack integration
4. Check board permissions

## Emergency Contacts
- Monday Support: support@monday.com
- Internal Slack: #platinum-support-internal
```

---

## 🔄 Rollback Plan

If issues arise, follow this rollback procedure:

### Immediate Rollback (< 1 hour)

1. **Disable Monday Automation**:
   - Go to board → Automations
   - Find PSEE automation
   - Toggle to "Inactive"

2. **Re-enable Webhook Service**:
   ```bash
   # If on Heroku
   heroku ps:scale web=1
   
   # If on AWS Lambda
   serverless deploy
   ```

3. **Update Slack Workflow**:
   - Point webhook URL back to old service
   - Test with sample case

4. **Notify Team**:
   - Post in #platinum-support-internal
   - Explain rollback reason
   - Provide timeline for fix

### Extended Rollback (> 1 hour)

If Monday integration has fundamental issues:

1. Keep webhook service running
2. Investigate Monday automation issues
3. Fix and re-test in test channel
4. Schedule new cutover date

---

## 📊 Success Criteria

The migration is successful when:

- ✅ All cases are processed automatically
- ✅ Correct PSEE tagged > 95% of time
- ✅ Response time < 30 seconds
- ✅ No manual intervention needed
- ✅ Team comfortable with new system
- ✅ Zero downtime during cutover
- ✅ Cost savings realized

---

## 🐛 Troubleshooting

### Issue: Automation Not Triggering

**Symptoms**: No response when case posted

**Debug Steps**:
1. Check Monday activity log
2. Verify channel ID is correct
3. Confirm automation is active
4. Test trigger conditions

**Solution**:
```javascript
// Add debug logging
console.log("Trigger data:", {
  channel: inputFields.channel_id,
  message: inputFields.message_text
});
```

### Issue: Wrong PSEE Tagged

**Symptoms**: Incorrect user mentioned

**Debug Steps**:
1. Check product name extraction
2. Verify Monday board data
3. Review fuzzy matching logic
4. Confirm on-call status

**Solution**:
```javascript
// Add product matching debug
console.log("Product matching:", {
  extracted: extractedProduct,
  boardItems: items.map(i => i.name),
  matched: matchedItem?.name
});
```

### Issue: Slack ID Not Found

**Symptoms**: "User not found" error

**Debug Steps**:
1. Verify email in Monday board
2. Check user exists in Slack
3. Confirm Monday-Slack integration
4. Test email lookup manually

**Solution**:
```javascript
// Fallback to email mention
if (!slackUserId) {
  message = `🔔 ${pseeEmail} - Alert requires attention`;
}
```

---

## 📞 Support Resources

- **Monday Automation Docs**: https://support.monday.com/hc/en-us/articles/360002899920
- **Monday API Reference**: https://developer.monday.com/api-reference/docs
- **Slack API Docs**: https://api.slack.com/
- **Internal Support**: #platinum-support-internal
- **Technical Lead**: jaswinder@ibm.com

---

## ✅ Post-Migration Checklist

After 30 days of stable operation:

- [ ] Webhook service fully decommissioned
- [ ] All documentation updated
- [ ] Team fully trained
- [ ] Metrics dashboard created
- [ ] Lessons learned documented
- [ ] Cost savings calculated
- [ ] Success story shared

---

*Migration Guide Version: 1.0*  
*Last Updated: 2026-06-08*  
*Author: Bob (AI Assistant)*