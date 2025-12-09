# Token Enrichment Azure Function

This Azure Function implements a Custom Authentication Extension for Microsoft Entra External ID (CIAM). It handles the `OnTokenIssuanceStart` event to enrich tokens with claims from social identity providers, specifically the profile picture URL.

## Purpose

When users sign in with social identity providers (Google, Facebook, Apple, Microsoft), those providers include the user's profile picture URL in their claims. However, Entra External ID doesn't automatically pass these claims through to your application's tokens.

This function intercepts the token issuance process and:
1. Reads the incoming claims from the social provider
2. Extracts the profile picture URL
3. Adds it as a custom `picture` claim to the outgoing token

## Prerequisites

1. Azure subscription
2. Microsoft Entra External ID tenant configured
3. Azure Functions Core Tools (for local development)
4. Node.js 18+

## Local Development

```bash
# Install dependencies
cd functions/token-enrichment
npm install

# Build TypeScript
npm run build

# Run locally
npm start
```

## Deployment

### 1. Create Azure Function App

```bash
# Create resource group (if needed)
az group create --name rg-vgauctions-functions --location eastus

# Create storage account for the function
az storage account create \
  --name stvgauctionsfunc \
  --resource-group rg-vgauctions-functions \
  --location eastus \
  --sku Standard_LRS

# Create the function app
az functionapp create \
  --name func-vgauctions-token \
  --resource-group rg-vgauctions-functions \
  --storage-account stvgauctionsfunc \
  --consumption-plan-location eastus \
  --runtime node \
  --runtime-version 18 \
  --functions-version 4
```

### 2. Deploy the Function

```bash
# Build and deploy
npm run build
func azure functionapp publish func-vgauctions-token
```

### 3. Configure Custom Authentication Extension in Entra

1. Go to **Azure Portal** > **Microsoft Entra External ID**

2. Navigate to **Applications** > **Enterprise applications** > **Custom authentication extensions**

3. Click **Create a custom extension**

4. Select **TokenIssuanceStart** as the event type

5. Configure the endpoint:
   - **Name**: Token Enrichment - Profile Picture
   - **Endpoint URL**: `https://func-vgauctions-token.azurewebsites.net/api/tokenIssuanceStart`
   - **Timeout**: 2000 (ms)

6. Configure authentication:
   - **Authentication type**: Azure AD Authentication
   - Create or select an app registration for the function to use

7. Configure claims to send to the extension:
   - Add all available claims, especially:
     - `picture`
     - `photo`
     - Identity provider claims

8. Configure claims to receive from the extension:
   - **picture** (string) - The profile picture URL

### 4. Assign the Extension to Your Application

1. Go to your application's registration

2. Under **Authentication** > **Token configuration**

3. Add the custom extension to the token issuance flow

4. Configure which applications should use this extension

## How It Works

```
User clicks "Sign in with Google"
            ↓
Entra redirects to Google
            ↓
User authenticates with Google
            ↓
Google returns user info including 'picture' claim
            ↓
Entra calls this Azure Function with all claims
            ↓
Function extracts 'picture' and returns it
            ↓
Entra adds 'picture' to the token for your app
            ↓
Your app receives token with profile picture URL
```

## Troubleshooting

### Function not being called

1. Verify the custom extension is properly registered in Entra
2. Check that the extension is assigned to your application
3. Verify the function URL is correct and accessible

### Picture not appearing in token

1. Check Azure Function logs for the incoming claims
2. The social provider may use a different claim name
3. Verify the claim is being requested from the identity provider

### Checking Logs

```bash
# Stream live logs
func azure functionapp logstream func-vgauctions-token

# Or in Azure Portal
# Function App > Functions > tokenIssuanceStart > Monitor
```

## Security Considerations

- The function uses anonymous auth level because Entra handles authentication via the custom extension configuration
- The function validates the request structure but trusts Entra as the caller
- Sensitive data (picture URLs) are logged for debugging - disable in production if needed

## Claims Reference

| Provider | Picture Claim Name |
|----------|-------------------|
| Google | `picture` |
| Facebook | `picture` or `picture.data.url` |
| Apple | Not provided by Apple |
| Microsoft | `photo` (requires Graph API call) |

Note: Apple does not provide profile pictures via OIDC claims. For Apple users, the application should fall back to initials or allow manual upload.
