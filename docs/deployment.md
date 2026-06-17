# Deployment Guide

This guide covers deploying the PSEE webhook service to various platforms.

## Prerequisites

- Service code tested locally
- Environment variables configured
- Monday.com API access verified
- Slack Bot token configured

## Deployment Options

### Option 1: AWS Lambda (Recommended)

AWS Lambda provides serverless deployment with automatic scaling and minimal maintenance.

#### Prerequisites

- AWS account with appropriate permissions
- AWS CLI installed and configured
- Serverless Framework installed globally

#### Steps

1. **Install Serverless Framework**

```bash
npm install -g serverless
```

2. **Configure AWS Credentials**

```bash
aws configure
# Enter your AWS Access Key ID
# Enter your AWS Secret Access Key
# Enter your default region (e.g., us-east-1)
```

3. **Set Environment Variables**

Create a `.env` file with all required variables (see `.env.example`).

4. **Deploy to AWS**

```bash
cd slack-psee-webhook-service
npm run deploy:lambda
```

5. **Note the Endpoint URL**

After deployment, you'll see output like:
```
endpoints:
  POST - https://abc123.execute-api.us-east-1.amazonaws.com/dev/lookup-psee
  POST - https://abc123.execute-api.us-east-1.amazonaws.com/dev/process-alert
  GET - https://abc123.execute-api.us-east-1.amazonaws.com/dev/health
```

6. **Test the Deployment**

```bash
curl https://your-api-url.amazonaws.com/dev/health
```

7. **View Logs**

```bash
npm run logs:lambda
```

#### Update Deployment

```bash
npm run deploy:lambda
```

#### Remove Deployment

```bash
serverless remove
```

---

### Option 2: Heroku

Heroku provides easy deployment with built-in logging and monitoring.

#### Prerequisites

- Heroku account
- Heroku CLI installed

#### Steps

1. **Login to Heroku**

```bash
heroku login
```

2. **Create Heroku App**

```bash
cd slack-psee-webhook-service
heroku create slack-psee-webhook
```

3. **Set Environment Variables**

```bash
heroku config:set MONDAY_API_TOKEN=your_token
heroku config:set SLACK_BOT_TOKEN=your_token
heroku config:set SLACK_SIGNING_SECRET=your_secret
heroku config:set MONDAY_GROUP_ALLIANZ=allianz_psees
heroku config:set MONDAY_GROUP_BRADESCO=bradesco_psees
heroku config:set MONDAY_GROUP_MASTERCARD=mastercard_psees
heroku config:set MONDAY_GROUP_VOLKSWAGEN=vw_psees
heroku config:set NODE_ENV=production
```

4. **Create Procfile**

```bash
echo "web: node src/index.js" > Procfile
```

5. **Deploy**

```bash
git add .
git commit -m "Deploy to Heroku"
git push heroku main
```

6. **Scale Dynos**

```bash
heroku ps:scale web=1
```

7. **View Logs**

```bash
heroku logs --tail
```

8. **Test Deployment**

```bash
curl https://your-app-name.herokuapp.com/health
```

#### Update Deployment

```bash
git push heroku main
```

---

### Option 3: Docker Container

Deploy as a Docker container to any platform (AWS ECS, Google Cloud Run, Azure Container Instances, etc.).

#### Prerequisites

- Docker installed
- Container registry access (Docker Hub, AWS ECR, etc.)

#### Steps

1. **Create Dockerfile**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/index.js"]
```

2. **Create .dockerignore**

```
node_modules
npm-debug.log
.env
.git
.gitignore
README.md
tests
coverage
.vscode
```

3. **Build Image**

```bash
docker build -t slack-psee-webhook:latest .
```

4. **Test Locally**

```bash
docker run -p 3000:3000 --env-file .env slack-psee-webhook:latest
```

5. **Push to Registry**

```bash
# Docker Hub
docker tag slack-psee-webhook:latest yourusername/slack-psee-webhook:latest
docker push yourusername/slack-psee-webhook:latest

# AWS ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin your-account-id.dkr.ecr.us-east-1.amazonaws.com
docker tag slack-psee-webhook:latest your-account-id.dkr.ecr.us-east-1.amazonaws.com/slack-psee-webhook:latest
docker push your-account-id.dkr.ecr.us-east-1.amazonaws.com/slack-psee-webhook:latest
```

6. **Deploy to Cloud Platform**

Follow your cloud provider's documentation for deploying containers.

---

### Option 4: Traditional Server (VPS/EC2)

Deploy to a traditional server or virtual machine.

#### Prerequisites

- Server with Node.js 18+ installed
- SSH access to server
- Domain name (optional)

#### Steps

1. **Connect to Server**

```bash
ssh user@your-server.com
```

2. **Install Node.js**

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

3. **Clone Repository**

```bash
git clone https://github.com/your-org/slack-psee-webhook-service.git
cd slack-psee-webhook-service
```

4. **Install Dependencies**

```bash
npm ci --only=production
```

5. **Configure Environment**

```bash
cp .env.example .env
nano .env  # Edit with your values
```

6. **Install PM2 (Process Manager)**

```bash
sudo npm install -g pm2
```

7. **Start Application**

```bash
pm2 start src/index.js --name slack-psee-webhook
pm2 save
pm2 startup  # Follow instructions to enable auto-start
```

8. **Configure Nginx (Optional)**

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

9. **Enable SSL with Let's Encrypt**

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

10. **View Logs**

```bash
pm2 logs slack-psee-webhook
```

---

## Post-Deployment

### 1. Update Slack Workflow

Update the webhook URL in your Slack Workflow to point to the deployed service:

```
https://your-deployed-url.com/lookup-psee
```

### 2. Test End-to-End

Post a test OCM alert in one of the Slack channels and verify:
- Workflow triggers correctly
- Webhook receives the request
- Correct PSEE or PSA is tagged
- CC users are included

### 3. Monitor Logs

Check logs regularly for the first few days:

**AWS Lambda:**
```bash
npm run logs:lambda
```

**Heroku:**
```bash
heroku logs --tail
```

**PM2:**
```bash
pm2 logs slack-psee-webhook
```

### 4. Set Up Alerts

Configure alerts for:
- Service downtime
- High error rates
- API failures (Monday.com or Slack)

### 5. Document Deployment

Record:
- Deployment date
- Service URL
- Environment variables used
- Any issues encountered

---

## Rollback Procedures

### AWS Lambda

```bash
# List deployments
serverless deploy list

# Rollback to previous version
serverless rollback --timestamp timestamp-from-list
```

### Heroku

```bash
# View releases
heroku releases

# Rollback to previous release
heroku rollback v123
```

### Docker

```bash
# Pull previous version
docker pull yourusername/slack-psee-webhook:previous-tag

# Restart with previous version
docker stop slack-psee-webhook
docker run -d --name slack-psee-webhook -p 3000:3000 --env-file .env yourusername/slack-psee-webhook:previous-tag
```

---

## Troubleshooting

### Service Not Starting

1. Check environment variables are set correctly
2. Verify Node.js version (18+)
3. Check logs for error messages
4. Ensure all dependencies are installed

### API Errors

1. Verify Monday.com API token is valid
2. Check Slack Bot token has correct permissions
3. Test API endpoints manually with curl
4. Review service logs for detailed errors

### Performance Issues

1. Check service resource usage (CPU, memory)
2. Review Monday.com API rate limits
3. Consider enabling caching
4. Scale up resources if needed

---

## Maintenance

### Regular Tasks

- **Weekly**: Review logs for errors
- **Monthly**: Update dependencies (`npm update`)
- **Quarterly**: Review and optimize performance
- **As Needed**: Update Monday.com group IDs if board structure changes

### Updates

```bash
# Pull latest code
git pull origin main

# Install dependencies
npm install

# Run tests
npm test

# Deploy
npm run deploy:lambda  # or your deployment method
```

---

## Security Considerations

1. **Never commit `.env` file** - Use environment variables
2. **Rotate API tokens regularly** - Update every 90 days
3. **Use HTTPS only** - Ensure SSL/TLS is enabled
4. **Limit API access** - Use least privilege principle
5. **Monitor for suspicious activity** - Set up alerts

---

## Support

For deployment issues:
- Email: jaswinder@ibm.com
- Slack: #platinum-support-internal
- Documentation: See README.md