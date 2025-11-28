# Deployment Guide

This guide covers deploying Very Good Auctions to Azure from scratch.

## Prerequisites

- Azure CLI installed (`az --version`)
- Node.js 20+ installed
- GitHub account
- Stripe account
- Domain name (optional)

## Step 1: Azure Setup

### 1.1 Login to Azure

```bash
az login
az account set --subscription "Your Subscription Name"
```

### 1.2 Create Resource Group (if not using Bicep)

```bash
az group create --name rg-vgauctions-prod --location westus2
```

### 1.3 Deploy Infrastructure with Bicep

```bash
# Generate a secure SQL password
SQL_PASSWORD=$(openssl rand -base64 24)
echo "Save this password securely: $SQL_PASSWORD"

# Deploy development environment
az deployment sub create \
  --location westus2 \
  --template-file infrastructure/main.bicep \
  --parameters infrastructure/parameters/dev.json \
  --parameters sqlAdminPassword="$SQL_PASSWORD" \
  --parameters stripeSecretKey="sk_test_xxx"

# Get deployment outputs
az deployment sub show \
  --name resources-deployment \
  --query properties.outputs
```

## Step 2: Microsoft Entra External ID Setup

Follow the detailed guide: [entra-external-id-setup.md](entra-external-id-setup.md)

Quick summary:
1. Create External ID tenant
2. Register application
3. Create user flows (sign-up/sign-in, password reset)
4. Configure social identity providers

## Step 3: Database Setup

### 3.1 Configure Firewall

```bash
# Allow your IP (for initial setup)
MY_IP=$(curl -s ifconfig.me)
az sql server firewall-rule create \
  --resource-group rg-vgauctions-prod \
  --server sql-very-good-auctions-prod-xxx \
  --name "MyIP" \
  --start-ip-address $MY_IP \
  --end-ip-address $MY_IP
```

### 3.2 Run Schema Migration

```bash
# Using sqlcmd or Azure Data Studio
sqlcmd -S sql-very-good-auctions-prod-xxx.database.windows.net \
       -U sqladmin \
       -P "$SQL_PASSWORD" \
       -d sqldb-very-good-auctions-prod \
       -i database/schema.sql
```

Or via the backend:

```bash
cd backend
npm install
npm run migrate
```

## Step 4: Stripe Setup

### 4.1 Get API Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Get your keys from Developers → API keys:
   - Publishable key (starts with `pk_`)
   - Secret key (starts with `sk_`)

### 4.2 Configure Webhooks

1. Go to Developers → Webhooks
2. Add endpoint: `https://your-api.azurewebsites.net/api/webhooks/stripe`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
4. Copy the signing secret (starts with `whsec_`)

### 4.3 Enable Payment Methods

1. Go to Settings → Payment methods
2. Enable:
   - Cards
   - Apple Pay
   - Google Pay
   - PayPal (requires PayPal business account)

## Step 5: GitHub Repository Setup

### 5.1 Create Repository

```bash
# Initialize git
git init
git add .
git commit -m "Initial commit"

# Create GitHub repo and push
gh repo create very-good-auctions --public --source=. --push
```

### 5.2 Configure Secrets

Go to Settings → Secrets and variables → Actions:

```
AZURE_CREDENTIALS
{
  "clientId": "xxx",
  "clientSecret": "xxx",
  "subscriptionId": "xxx",
  "tenantId": "xxx"
}

AZURE_STATIC_WEB_APPS_API_TOKEN
(from Static Web App deployment token)

STRIPE_PUBLIC_KEY
pk_live_xxx

SQL_ADMIN_USER
sqladmin

SQL_ADMIN_PASSWORD
(your secure password)
```

### 5.3 Configure Variables

Go to Settings → Variables:

```
API_URL=https://app-vgauctions-api-prod.azurewebsites.net/api
ENTRA_TENANT_NAME=verygoodauctions
AZURE_AD_TENANT_ID=xxx
AZURE_AD_CLIENT_ID=xxx
AZURE_AD_SUSI_POLICY=B2C_1_signupsignin
SIGNALR_URL=https://app-vgauctions-api-prod.azurewebsites.net/hubs/auction
SQL_SERVER_NAME=sql-very-good-auctions-prod-xxx
SQL_DATABASE_NAME=sqldb-very-good-auctions-prod
```

### 5.4 Create Service Principal

```bash
# Create service principal for GitHub Actions
az ad sp create-for-rbac \
  --name "github-very-good-auctions" \
  --role contributor \
  --scopes /subscriptions/{subscription-id}/resourceGroups/rg-vgauctions-prod \
  --sdk-auth
```

Copy the JSON output to the `AZURE_CREDENTIALS` secret.

## Step 6: Deploy

### 6.1 Trigger Deployments

Push to main branch to trigger CI/CD:

```bash
git push origin main
```

Monitor in GitHub Actions tab.

### 6.2 Manual Deployment (if needed)

**Frontend:**
```bash
cd frontend
npm run build
# Upload dist/ to Static Web App via Azure Portal or CLI
```

**Backend:**
```bash
cd backend
npm run build
az webapp deploy \
  --resource-group rg-vgauctions-prod \
  --name app-vgauctions-api-prod \
  --src-path .
```

## Step 7: Configure Custom Domain (Optional)

### 7.1 Static Web App (Frontend)

1. Go to Static Web App in Azure Portal
2. Custom domains → Add
3. Add CNAME record: `www` → `xxx.azurestaticapps.net`
4. Azure handles SSL automatically

### 7.2 App Service (API)

1. Go to App Service → Custom domains
2. Add custom domain
3. Configure DNS:
   - CNAME: `api` → `xxx.azurewebsites.net`
4. Add SSL certificate (free with App Service)

## Step 8: Post-Deployment Verification

### 8.1 Health Checks

```bash
# API health
curl https://api.yourdomain.com/health

# Frontend
curl https://www.yourdomain.com
```

### 8.2 Test Authentication

1. Visit the site
2. Click Sign In
3. Create an account
4. Try social login

### 8.3 Test Bidding

1. Create a test auction
2. Place a bid from another account
3. Verify real-time updates

### 8.4 Test Payments (Test Mode)

Use Stripe test cards:
- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`

## Monitoring

### Application Insights

1. Go to Application Insights in Azure Portal
2. Check:
   - Live metrics
   - Failures
   - Performance

### Log Analytics

```kusto
// Recent errors
AppServiceHTTPLogs
| where TimeGenerated > ago(1h)
| where ScStatus >= 400
| order by TimeGenerated desc
```

## Rollback

### Frontend

Static Web Apps keeps previous versions. Redeploy via GitHub:

```bash
git revert HEAD
git push origin main
```

### Backend

```bash
# List deployment slots
az webapp deployment slot list \
  --name app-vgauctions-api-prod \
  --resource-group rg-vgauctions-prod

# Swap to previous slot
az webapp deployment slot swap \
  --name app-vgauctions-api-prod \
  --resource-group rg-vgauctions-prod \
  --slot staging
```

## Troubleshooting

### "Database connection failed"
- Check firewall rules
- Verify connection string
- Check App Service → Configuration

### "Authentication error"
- Verify Entra External ID tenant name
- Check redirect URIs match exactly
- Verify client ID

### "Payments not working"
- Check Stripe API keys (live vs test)
- Verify webhook endpoint
- Check webhook signing secret

### "SignalR not connecting"
- Check SignalR connection string
- Verify CORS settings
- Check App Service logs
