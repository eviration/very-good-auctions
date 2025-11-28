# Microsoft Entra External ID Setup Guide

Microsoft Entra External ID (formerly Azure AD B2C replacement) provides customer identity and access management (CIAM) for your application.

> **Note**: Azure AD B2C was deprecated for new customers on May 1, 2025. This guide uses Microsoft Entra External ID, the recommended replacement.

## 1. Create an External ID Tenant

### Via Azure Portal

1. Go to [Azure Portal](https://portal.azure.com)
2. Search for **"Microsoft Entra External ID"**
3. Click **"Create a tenant"**
4. Select **"Customer"** as the tenant type
5. Configure:
   - **Tenant name**: Very Good Auctions
   - **Domain name**: `verygoodauctions` (becomes `verygoodauctions.onmicrosoft.com`)
   - **Location**: United States
6. Click **"Review + Create"**

### Via Azure CLI

```bash
# Create the External ID tenant
az rest --method POST \
  --uri "https://management.azure.com/subscriptions/{subscription-id}/resourceGroups/{resource-group}/providers/Microsoft.AzureActiveDirectory/ciamDirectories/{tenant-name}?api-version=2023-05-17-preview" \
  --body '{
    "location": "United States",
    "properties": {
      "createTenantProperties": {
        "displayName": "Very Good Auctions",
        "countryCode": "US"
      }
    }
  }'
```

## 2. Register Your Application

1. In your External ID tenant, go to **App registrations** → **New registration**
2. Configure:
   - **Name**: Very Good Auctions Web App
   - **Supported account types**: Accounts in this organizational directory only
   - **Redirect URI**: 
     - Platform: **Single-page application (SPA)**
     - URI: `http://localhost:3000/auth/callback`
3. Click **Register**
4. Note your:
   - **Application (client) ID**
   - **Directory (tenant) ID**

### Configure Authentication Settings

1. Go to **Authentication**
2. Under **Single-page application**, add additional redirect URIs:
   - `https://your-production-domain.com/auth/callback`
   - `https://your-static-web-app.azurestaticapps.net/auth/callback`
3. Under **Implicit grant and hybrid flows**:
   - ☑️ Access tokens
   - ☑️ ID tokens
4. Under **Advanced settings**:
   - Allow public client flows: **No**
5. Click **Save**

### Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission** → **Microsoft Graph** → **Delegated permissions**
3. Add:
   - `openid`
   - `profile`
   - `email`
   - `offline_access`
4. Click **Grant admin consent**

### Expose an API (for backend validation)

1. Go to **Expose an API**
2. Click **Add** next to Application ID URI
   - Accept default: `api://{client-id}`
3. Click **Add a scope**:
   - Scope name: `Read`
   - Who can consent: Admins and users
   - Admin consent display name: Read auction data
   - Admin consent description: Allows reading auction data
4. Add another scope:
   - Scope name: `Write`
   - Who can consent: Admins and users
   - Admin consent display name: Write auction data
   - Admin consent description: Allows creating and updating auctions

## 3. Configure User Flows

### Create Sign-up/Sign-in Flow

1. Go to **User flows** in your External ID tenant
2. Click **New user flow**
3. Select **Sign up and sign in**
4. Configure:
   - **Name**: `signup_signin` (becomes `B2C_1_signup_signin`)
   - **Identity providers**: Email with password
   - **Multifactor authentication**: Optional (recommended for production)
5. **User attributes to collect**:
   - ☑️ Display Name
   - ☑️ Email Address
6. **Token claims to return**:
   - ☑️ Display Name
   - ☑️ Email Addresses
   - ☑️ Identity Provider
   - ☑️ User's Object ID
7. Click **Create**

### Create Password Reset Flow (Optional)

1. **User flows** → **New user flow**
2. Select **Password reset**
3. Name: `password_reset`
4. Click **Create**

## 4. Add Social Identity Providers

### Google

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Go to **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**
4. Configure:
   - **Application type**: Web application
   - **Authorized redirect URIs**: 
     `https://verygoodauctions.ciamlogin.com/verygoodauctions.onmicrosoft.com/federation/oauth2`
5. Note the **Client ID** and **Client Secret**

In Entra External ID:
1. Go to **Identity providers** → **Google**
2. Enter Client ID and Client Secret
3. Click **Save**

### Facebook

1. Go to [Facebook Developers](https://developers.facebook.com)
2. Create a new app → **Consumer**
3. Add **Facebook Login** product
4. In **Settings** → **Basic**, note **App ID** and **App Secret**
5. In **Facebook Login** → **Settings**:
   - Valid OAuth Redirect URIs:
     `https://verygoodauctions.ciamlogin.com/verygoodauctions.onmicrosoft.com/federation/oauth2`

In Entra External ID:
1. Go to **Identity providers** → **Facebook**
2. Enter App ID and App Secret
3. Click **Save**

### Apple

1. Go to [Apple Developer](https://developer.apple.com)
2. Create an App ID with "Sign in with Apple"
3. Create a Services ID for web authentication
4. Configure return URL:
   `https://verygoodauctions.ciamlogin.com/verygoodauctions.onmicrosoft.com/federation/oauth2`
5. Generate a private key

In Entra External ID:
1. Go to **Identity providers** → **Apple**
2. Enter Service ID, Team ID, Key ID, and upload private key
3. Click **Save**

### Microsoft (Personal Accounts)

1. Go to [Azure Portal](https://portal.azure.com) → **Microsoft Entra ID**
2. **App registrations** → **New registration**
3. Configure:
   - **Supported account types**: Personal Microsoft accounts only
   - **Redirect URI**: 
     `https://verygoodauctions.ciamlogin.com/verygoodauctions.onmicrosoft.com/federation/oauth2`
4. Create a client secret

In Entra External ID:
1. Go to **Identity providers** → **Microsoft Account**
2. Enter Application ID and Client Secret
3. Click **Save**

## 5. Link Identity Providers to User Flow

1. Go to **User flows** → Select your sign-up/sign-in flow
2. Click **Identity providers**
3. Enable the providers you configured:
   - ☑️ Email signup
   - ☑️ Google
   - ☑️ Facebook
   - ☑️ Apple
   - ☑️ Microsoft Account
4. Click **Save**

## 6. Configure Your Application

### Frontend Environment Variables

Create `frontend/.env.local`:

```env
VITE_ENTRA_TENANT_NAME=verygoodauctions
VITE_ENTRA_TENANT_ID=<your-tenant-id>
VITE_ENTRA_CLIENT_ID=<your-client-id>
```

### Backend Environment Variables

Create `backend/.env`:

```env
ENTRA_TENANT_NAME=verygoodauctions
ENTRA_TENANT_ID=<your-tenant-id>
ENTRA_CLIENT_ID=<your-client-id>
```

### Find Your Tenant Details

1. Go to your External ID tenant in Azure Portal
2. **Overview** page shows:
   - **Tenant ID**: Copy this value
   - **Primary domain**: e.g., `verygoodauctions.onmicrosoft.com`
   - The subdomain (before `.onmicrosoft.com`) is your tenant name

## 7. Testing

### Local Testing

1. Run your frontend: `npm run frontend:dev`
2. Click **Sign In**
3. You should see the Microsoft login page with options for:
   - Email/password signup
   - Google (if configured)
   - Facebook (if configured)
   - Apple (if configured)
   - Microsoft Account (if configured)

### Test User Creation

1. Click **Sign up**
2. Enter email and create password
3. Complete any required profile fields
4. Verify email if required
5. You should be redirected back to your app

## 8. Production Deployment

### Add Production Redirect URIs

1. Go to **App registrations** → Your app → **Authentication**
2. Add redirect URIs:
   - `https://www.yourdomain.com/auth/callback`
   - `https://yourdomain.com/auth/callback`

### Enable MFA (Recommended)

1. Go to **User flows** → Your flow
2. **Properties** → **Multifactor authentication**
3. Select **Email** or **Phone/SMS**
4. Click **Save**

### Configure Session Lifetime

1. Go to **User flows** → Your flow
2. **Properties** → **Token configuration**
3. Configure:
   - Access token lifetime: 1 hour (recommended)
   - Refresh token lifetime: 14 days

## Troubleshooting

### "AADSTS50011: Reply URL does not match"
- Ensure redirect URI in app registration exactly matches your application
- Check for trailing slashes
- Verify you're using the correct tenant

### "AADSTS700016: Application not found"
- Verify client ID is correct
- Ensure you're using the External ID tenant, not a regular Entra ID tenant

### Social login not appearing
- Verify the identity provider is enabled in the user flow
- Check that provider credentials are correct
- Ensure the provider is linked to your user flow

### Token validation fails on backend
- Verify the issuer URL format: `https://{tenant}.ciamlogin.com/{tenant-id}/v2.0`
- Check that the audience matches your client ID
- Ensure JWKS endpoint is accessible

## Key Differences from Azure AD B2C

| Feature | Azure AD B2C | Entra External ID |
|---------|--------------|-------------------|
| Login domain | `{tenant}.b2clogin.com` | `{tenant}.ciamlogin.com` |
| User flows | Custom policies | Built-in flows |
| Pricing | Per MAU | Per MAU (similar) |
| Setup complexity | Higher | Lower |
| Migration | N/A | Microsoft provides tools |

## Resources

- [Entra External ID Documentation](https://learn.microsoft.com/en-us/entra/external-id/)
- [MSAL.js Documentation](https://learn.microsoft.com/en-us/javascript/api/@azure/msal-browser/)
- [Migration from Azure AD B2C](https://learn.microsoft.com/en-us/entra/external-id/customers/concept-planning-your-solution)
