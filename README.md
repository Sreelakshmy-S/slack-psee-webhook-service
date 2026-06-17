# Slack PSEE Auto-Tagging Webhook Service

Automated webhook service that monitors IBM On Call Manager (OCM) alerts in Slack channels and tags the appropriate Product SME (PSEE) based on Monday.com data. Falls back to PSA (Product Support Architect) if no PSEE is found.

## 🎯 Features

- **Automatic PSEE Resolution**: Queries Monday.com board to find the right PSEE for each product
- **PSA Fallback**: Automatically tags PSA if no PSEE is configured
- **Multi-Customer Support**: Handles Allianz, Bradesco, Mastercard, and Volkswagen
- **Smart Product Matching**: Fuzzy matching for product names
- **Always CC**: Automatically includes specified users on all notifications
- **Comprehensive Logging**: Structured logging with Winston
- **Multiple Deployment Options**: Run locally, on Heroku, or AWS Lambda

## 📋 Prerequisites

- Node.js 18+ 
- Monday.com API access token
- Slack Bot token with appropriate permissions
- Access to target Slack workspace

## 🚀 Quick Start

### 1. Clone and Install

```bash
cd slack-psee-webhook-service
npm install
```

### 2. Configure Environment

Copy `.env.example` to `.env` and fill in your credentials:

```bash
cp .env.example .env
```

Edit `.env`:

```env
# Monday.com
MONDAY_API_TOKEN=your_monday_api_token_here

# Slack
SLACK_BOT_TOKEN=xoxb-your-slack-bot-token-here
SLACK_SIGNING_SECRET=your_slack_signing_secret_here

# Monday.com Group IDs (get these from board structure)
MONDAY_GROUP_ALLIANZ=allianz_psees
MONDAY_GROUP_BRADESCO=bradesco_psees
MONDAY_GROUP_MASTERCARD=mastercard_psees
MONDAY_GROUP_VOLKSWAGEN=vw_psees
```

### 3. Get Monday.com Group IDs

Run this script to discover your board structure:

```bash
node scripts/get-board-structure.js
```

Update the group IDs in your `.env` file.

### 4. Run Locally

```bash
npm start
# or for development with auto-reload
npm run dev
```

The service will start on `http://localhost:3000`

## 🔧 API Endpoints

### POST /lookup-psee

Main endpoint for PSEE lookup.

**Request:**
```json
{
  "product": "Db2 Linux, Unix and Windows",
  "customer": "Allianz",
  "channel_id": "C0A7C3CH4LW",
  "message_ts": "1234567890.123456",
  "alert_text": "IBM On Call Manager\nIncident: #0000-0320..."
}
```

**Response:**
```json
{
  "success": true,
  "psee_found": true,
  "primary_users": [
    {
      "id": "U123456",
      "name": "John Doe",
      "email": "john.doe@ibm.com"
    }
  ],
  "primary_mentions": "<@U123456>",
  "cc_users": [
    {
      "id": "U789012",
      "name": "Jaswinder Singh",
      "email": "jaswinder@ibm.com"
    }
  ],
  "cc_mentions": "<@U789012>",
  "message": "🔔 <@U123456> - Alert for **Db2 Linux, Unix and Windows** requires your attention\n📋 Incident: #0000-0320\n👤 PSEE: John Doe\n\n📧 CC: <@U789012>",
  "product_name": "Db2 Linux, Unix and Windows",
  "customer_name": "Allianz",
  "incident_number": "#0000-0320"
}
```

### POST /process-alert

Alternative endpoint that accepts full alert text and extracts product name.

**Request:**
```json
{
  "alert_text": "IBM On Call Manager\nIncident: #0000-0320\nState: Unassigned\nPriority: 1\nLast Changed: 2026-02-19T01:33:55.135Z\nDescription: Name: TS021494518 Db2 Linux, Unix and Windows",
  "customer": "Allianz",
  "channel_id": "C0A7C3CH4LW"
}
```

### GET /health

Health check endpoint.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-03-04T17:54:00.000Z",
  "version": "1.0.0"
}
```

## 🏗️ Architecture

```
┌─────────────────┐
│  Slack Channel  │
│  (OCM Alert)    │
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Slack Workflow  │
│   (Extracts     │
│   Product Name) │
└────────┬────────┘
         │
         ▼ HTTP POST
┌─────────────────────────┐
│  Webhook Service        │
│  ┌──────────────────┐   │
│  │ PSEE Resolver    │   │
│  └────────┬─────────┘   │
│           │             │
│  ┌────────▼─────────┐   │
│  │ Monday.com API   │   │
│  │ (Find PSEE)      │   │
│  └────────┬─────────┘   │
│           │             │
│  ┌────────▼─────────┐   │
│  │ Slack API        │   │
│  │ (Lookup Users)   │   │
│  └──────────────────┘   │
└────────┬────────────────┘
         │
         ▼ JSON Response
┌─────────────────┐
│ Slack Workflow  │
│ (Posts Message) │
└─────────────────┘
```

## 📦 Deployment

### Option 1: AWS Lambda (Recommended)

```bash
# Install Serverless Framework
npm install -g serverless

# Deploy to AWS
npm run deploy:lambda

# View logs
npm run logs:lambda
```

The service will be deployed with API Gateway endpoints.

### Option 2: Heroku

```bash
# Login to Heroku
heroku login

# Create app
heroku create slack-psee-webhook

# Set environment variables
heroku config:set MONDAY_API_TOKEN=your_token
heroku config:set SLACK_BOT_TOKEN=your_token
# ... set all other env vars

# Deploy
git push heroku main

# View logs
heroku logs --tail
```

### Option 3: Docker

```bash
# Build image
docker build -t slack-psee-webhook .

# Run container
docker run -p 3000:3000 --env-file .env slack-psee-webhook
```

## 🧪 Testing

### Run Tests

```bash
npm test
```

### Manual Testing

Use the test endpoint (development only):

```bash
curl -X POST http://localhost:3000/test \
  -H "Content-Type: application/json" \
  -d '{"test": "data"}'
```

Test PSEE lookup:

```bash
curl -X POST http://localhost:3000/lookup-psee \
  -H "Content-Type: application/json" \
  -d '{
    "product": "Db2 Linux, Unix and Windows",
    "customer": "Allianz",
    "channel_id": "C0A7C3CH4LW"
  }'
```

## 📊 Monitoring

### Logs

Logs are written to:
- Console (all environments)
- `logs/error.log` (production only)
- `logs/combined.log` (production only)

### Log Levels

- `error`: Errors that need attention
- `warn`: Warnings (e.g., user not found)
- `info`: General information (default)
- `debug`: Detailed debugging information

Set log level via environment variable:
```bash
LOG_LEVEL=debug npm start
```

## 🔐 Security

- All API tokens stored in environment variables
- Helmet.js for security headers
- CORS enabled for Slack domains
- Request validation on all endpoints

## 🐛 Troubleshooting

### "Slack user not found"

**Cause**: Email address in Monday.com doesn't match Slack workspace.

**Solution**: 
1. Verify email in Monday.com matches Slack profile
2. Check user is active in Slack workspace
3. Verify bot has `users:read.email` permission

### "Monday.com API error"

**Cause**: Invalid API token or board access.

**Solution**:
1. Verify `MONDAY_API_TOKEN` is correct
2. Check token has read access to board
3. Verify board ID is correct (18402249639)

### "No PSEE found"

**Cause**: Product name doesn't match Monday.com entries.

**Solution**:
1. Check product name spelling in Monday.com
2. Review fuzzy matching logic in `mondayClient.js`
3. Add product to Monday.com board

## 📝 Configuration

### Customer Mapping

Edit `src/config.js` to modify customer mappings:

```javascript
channels: {
  'C0A7C3CH4LW': 'Allianz',
  'C0A5UTEGZJT': 'Bradesco',
  'C0A5KDHSCRE': 'Mastercard',
  'C0A6DPP5NJ1': 'Volkswagen'
}
```

### PSA Emails

Update PSA fallback emails in `src/config.js`:

```javascript
psaEmails: {
  'Allianz': ['ben.cornwell@uk.ibm.com'],
  'Bradesco': ['roberto.palma@br.ibm.com'],
  'Mastercard': ['Mark.Vachher@ibm.com', 'praveensogalad@in.ibm.com'],
  'Volkswagen': ['pkaiser@ie.ibm.com']
}
```

## 📚 Additional Documentation

- [Slack Workflow Setup Guide](docs/slack-workflow-setup.md)
- [Monday.com Integration Guide](docs/monday-integration.md)
- [Deployment Guide](docs/deployment.md)
- [API Reference](docs/api-reference.md)

## 🤝 Support

For issues or questions:
- Email: jaswinder@ibm.com
- Slack: #platinum-support-internal

## 📄 License

MIT License - IBM Internal Use