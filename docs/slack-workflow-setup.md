# Slack Workflow Setup Guide

This guide walks you through setting up the Slack Workflow Builder to integrate with the PSEE webhook service.

## Prerequisites

- Slack Workflow Builder access in your workspace
- Webhook service deployed and accessible
- Webhook URL (e.g., `https://your-service.com/lookup-psee`)

## Step-by-Step Setup

### 1. Open Workflow Builder

1. In Slack, click your workspace name in the top-left
2. Select **Tools** → **Workflow Builder**
3. Click **Create** → **Start from scratch**
4. Name your workflow: `PSEE Auto-Tagger for OCM Alerts`

### 2. Configure Trigger

1. **Select Trigger Type**: "Message is posted in a channel"
2. **Choose Channels**: Select all target channels:
   - `platinum-support-allianz-internal`
   - `platinum-support-bradesco-internal`
   - `platinum-support-mastercard-internal`
   - `platinum-support-volkswagen-internal`
3. **Add Filter**: Message contains `IBM On Call Manager`
4. Click **Save**

### 3. Extract Product Name

1. Click **Add Step**
2. Select **Extract data from message**
3. **Variable Name**: `product_name`
4. **Pattern**: Use regex or text manipulation
   - Look for: `Description: Name: [Ticket] `
   - Extract: Everything after the ticket number
5. **Example**: 
   - Input: `Description: Name: TS021494518 Db2 Linux, Unix and Windows`
   - Output: `Db2 Linux, Unix and Windows`
6. Click **Save**

### 4. Identify Customer

1. Click **Add Step**
2. Select **Set a variable**
3. **Variable Name**: `customer_name`
4. **Logic**: Map channel ID to customer name
   ```
   If channel_id = C0A7C3CH4LW → Allianz
   If channel_id = C0A5UTEGZJT → Bradesco
   If channel_id = C0A5KDHSCRE → Mastercard
   If channel_id = C0A6DPP5NJ1 → Volkswagen
   ```
5. Click **Save**

### 5. Call Webhook Service

1. Click **Add Step**
2. Select **Send a webhook**
3. **Webhook URL**: `https://your-service.com/lookup-psee`
4. **Method**: POST
5. **Headers**:
   ```
   Content-Type: application/json
   ```
6. **Body**:
   ```json
   {
     "product": "{{product_name}}",
     "customer": "{{customer_name}}",
     "channel_id": "{{channel_id}}",
     "message_ts": "{{message_timestamp}}",
     "alert_text": "{{message_text}}"
   }
   ```
7. **Save response as**: `webhook_response`
8. Click **Save**

### 6. Post Notification

1. Click **Add Step**
2. Select **Send a message**
3. **Channel**: Same as trigger channel
4. **Thread**: Reply to original message (use `{{message_timestamp}}`)
5. **Message**: Use the formatted message from webhook response
   ```
   {{webhook_response.message}}
   ```
   
   Or build custom message:
   ```
   {{webhook_response.primary_mentions}} - Alert for {{webhook_response.product_name}} requires attention
   
   📋 Incident: {{webhook_response.incident_number}}
   
   CC: {{webhook_response.cc_mentions}}
   ```
6. Click **Save**

### 7. Test Workflow

1. Click **Test workflow**
2. Post a sample OCM alert in one of the channels:
   ```
   IBM On Call Manager
   Incident: #0000-0320
   State: Unassigned 
   Priority: 1
   Last Changed: 2026-02-19T01:33:55.135Z
   Description: Name: TS021494518 Db2 Linux, Unix and Windows
   ```
3. Verify the workflow triggers and posts the correct notification
4. Check that the right users are tagged

### 8. Publish Workflow

1. Review all steps
2. Click **Publish**
3. Confirm publication

## Alternative: Simplified Workflow

If Slack Workflow Builder has limitations, use this simpler approach:

### Option A: Single Webhook Call

Send the entire alert text to `/process-alert` endpoint:

```json
{
  "alert_text": "{{message_text}}",
  "customer": "{{customer_name}}",
  "channel_id": "{{channel_id}}",
  "message_ts": "{{message_timestamp}}"
}
```

The webhook will extract the product name automatically.

### Option B: Slack App with Event Subscription

If Workflow Builder doesn't meet your needs, create a Slack App:

1. Create new Slack App at https://api.slack.com/apps
2. Enable Event Subscriptions
3. Subscribe to `message.channels` event
4. Point to your webhook service
5. Install app to workspace

## Troubleshooting

### Workflow Not Triggering

**Issue**: Workflow doesn't activate when OCM alert is posted.

**Solutions**:
- Verify filter text matches exactly: `IBM On Call Manager`
- Check workflow is published
- Ensure channels are correctly selected
- Verify bot has access to channels

### Product Name Not Extracted

**Issue**: `product_name` variable is empty.

**Solutions**:
- Review regex pattern
- Test with actual alert format
- Check for extra spaces or line breaks
- Use the `/process-alert` endpoint instead

### Webhook Call Fails

**Issue**: Webhook step shows error.

**Solutions**:
- Verify webhook URL is accessible
- Check service is running
- Review webhook service logs
- Test endpoint with curl:
  ```bash
  curl -X POST https://your-service.com/lookup-psee \
    -H "Content-Type: application/json" \
    -d '{"product":"Db2","customer":"Allianz"}'
  ```

### Wrong Users Tagged

**Issue**: Incorrect users are mentioned.

**Solutions**:
- Verify customer mapping in config
- Check Monday.com data is correct
- Review PSA fallback emails
- Check Slack user emails match Monday.com

## Advanced Configuration

### Add Error Handling

Add a conditional step after webhook call:

```
If webhook_response.success = false
  Then: Send error message to admin channel
  Else: Continue with notification
```

### Multiple Notifications

To notify different channels based on priority:

```
If alert contains "Priority: 1"
  Then: Also post to #critical-alerts
```

### Custom Formatting

Enhance the notification message:

```
🚨 **HIGH PRIORITY ALERT** 🚨

{{webhook_response.primary_mentions}}

📦 Product: {{webhook_response.product_name}}
🏢 Customer: {{webhook_response.customer_name}}
📋 Incident: {{webhook_response.incident_number}}
⏰ Time: {{current_time}}

{{#if webhook_response.psee_found}}
✅ PSEE Assigned: {{webhook_response.psee_info.name}}
{{else}}
⚠️ No PSEE - PSA Fallback
{{/if}}

CC: {{webhook_response.cc_mentions}}
```

## Best Practices

1. **Test Thoroughly**: Test with various product names before going live
2. **Monitor Initially**: Watch the first few days for any issues
3. **Document Changes**: Keep track of any workflow modifications
4. **Regular Reviews**: Periodically review and optimize the workflow
5. **Backup Plan**: Have manual process documented as fallback

## Support

For help with Slack Workflow Builder:
- Slack Help Center: https://slack.com/help/articles/360035692513
- Internal Slack: #slack-workflow-help
- Email: jaswinder@ibm.com