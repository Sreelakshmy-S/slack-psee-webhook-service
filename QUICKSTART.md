# Quick Start Guide

Get the PSEE webhook service up and running in 5 minutes.

## 🚀 Quick Setup

### 1. Install Dependencies

```bash
cd slack-psee-webhook-service
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
# Required
MONDAY_API_TOKEN=your_monday_token_here
SLACK_BOT_TOKEN=xoxb-your_slack_token_here

# Get these from Monday.com board structure
MONDAY_GROUP_ALLIANZ=allianz_psees
MONDAY_GROUP_BRADESCO=bradesco_psees
MONDAY_GROUP_MASTERCARD=mastercard_psees
MONDAY_GROUP_VOLKSWAGEN=vw_psees
```

### 3. Get Monday.com Group IDs

```bash
node scripts/get-board-structure.js
```

Copy the output group IDs to your `.env` file.

### 4. Start the Service

```bash
npm start
```

Service runs on `http://localhost:3000`

### 5. Test It

```bash
# Health check
curl http://localhost:3000/health

# Test PSEE lookup
curl -X POST http://localhost:3000/lookup-psee \
  -H "Content-Type: application/json" \
  -d '{
    "product": "Db2 Linux, Unix and Windows",
    "customer": "Allianz"
  }'
```

## 📝 Next Steps

1. **Set up Slack Workflow** - See [docs/slack-workflow-setup.md](docs/slack-workflow-setup.md)
2. **Deploy to Production** - See [docs/deployment.md](docs/deployment.md)
3. **Test End-to-End** - Post a test alert in Slack

## 🔑 Getting API Tokens

### Monday.com API Token

1. Go to https://ibm.monday.com
2. Click your profile picture → Admin → API
3. Generate new token
4. Copy to `.env` as `MONDAY_API_TOKEN`

### Slack Bot Token

1. Go to https://api.slack.com/apps
2. Select your app (or create new)
3. Go to "OAuth & Permissions"
4. Add these scopes:
   - `users:read`
   - `users:read.email`
   - `chat:write`
5. Install app to workspace
6. Copy "Bot User OAuth Token" to `.env` as `SLACK_BOT_TOKEN`

## ❓ Troubleshooting

### "MONDAY_API_TOKEN not found"
- Ensure `.env` file exists
- Check token is set correctly
- Verify no extra spaces

### "Slack user not found"
- Verify bot has `users:read.email` permission
- Check email matches Slack profile
- Ensure user is active in workspace

### "No PSEE found"
- Check product name spelling
- Verify Monday.com board has data
- Review group IDs in `.env`

## 📚 Full Documentation

- [README.md](README.md) - Complete documentation
- [docs/slack-workflow-setup.md](docs/slack-workflow-setup.md) - Slack integration
- [docs/deployment.md](docs/deployment.md) - Production deployment

## 🆘 Support

- Email: jaswinder@ibm.com
- Slack: #platinum-support-internal