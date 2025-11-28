# Very Good Auctions

A modern, accessible auction platform built with React, Node.js, and Azure cloud services. Designed with a focus on accessibility for elderly users.

## 🌟 Features

- **Accessible Design**: Large fonts, high contrast, simple navigation
- **Real-time Bidding**: Live bid updates via SignalR
- **Secure Authentication**: Microsoft Entra External ID with social login (Google, Facebook, Apple, Microsoft)
- **Multiple Payment Options**: Credit cards, PayPal, Apple Pay, Google Pay via Stripe
- **Cloud-Native**: Fully deployed on Azure

## 📁 Project Structure

```
very-good-auctions/
├── frontend/                 # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── auth/            # Authentication (MSAL)
│   │   ├── components/      # Reusable UI components
│   │   ├── hooks/           # Custom React hooks
│   │   ├── pages/           # Page components
│   │   ├── services/        # API & SignalR clients
│   │   └── types/           # TypeScript types
│   └── ...
├── backend/                  # Node.js API (Express + TypeScript)
│   ├── src/
│   │   ├── config/          # Database configuration
│   │   ├── middleware/      # Auth, error handling
│   │   ├── routes/          # API routes
│   │   └── services/        # Business logic
│   └── ...
├── database/                 # SQL schema and migrations
├── infrastructure/           # Azure Bicep templates
└── .github/workflows/        # CI/CD pipelines
```

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- Azure subscription
- Stripe account
- Azure AD B2C tenant (or create one)

### Local Development

1. **Clone and install dependencies**
   ```bash
   git clone https://github.com/YOUR_USERNAME/very-good-auctions.git
   cd very-good-auctions
   npm install
   ```

2. **Configure environment variables**
   ```bash
   # Frontend
   cp frontend/.env.example frontend/.env.local
   
   # Backend
   cp backend/.env.example backend/.env
   ```

3. **Start development servers**
   ```bash
   # Terminal 1: Frontend
   npm run frontend:dev
   
   # Terminal 2: Backend
   npm run backend:dev
   ```

4. **Access the application**
   - Frontend: http://localhost:3000
   - API: http://localhost:4000

## ☁️ Azure Deployment

### 1. Deploy Infrastructure

```bash
# Login to Azure
az login

# Deploy dev environment
az deployment sub create \
  --location eastus \
  --template-file infrastructure/main.bicep \
  --parameters infrastructure/parameters/dev.json \
  --parameters sqlAdminPassword='YourSecurePassword123!'

# Deploy production
az deployment sub create \
  --location eastus \
  --template-file infrastructure/main.bicep \
  --parameters infrastructure/parameters/prod.json
```

### 2. Configure Azure AD B2C

See [docs/entra-external-id-setup.md](docs/entra-external-id-setup.md) for detailed instructions.

### 3. Set up GitHub Secrets

Add these secrets to your GitHub repository:

| Secret | Description |
|--------|-------------|
| `AZURE_CREDENTIALS` | Service principal JSON |
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Static Web Apps deployment token |
| `STRIPE_PUBLIC_KEY` | Stripe publishable key |
| `SQL_ADMIN_USER` | Database admin username |
| `SQL_ADMIN_PASSWORD` | Database admin password |

### 4. Deploy via GitHub Actions

Push to `main` branch to trigger automatic deployments:
- Frontend → Azure Static Web Apps
- Backend → Azure App Service

## 📊 Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   React SPA     │────▶│  Azure AD B2C    │     │   Azure SQL     │
│ (Static Web App)│     │ (Authentication) │     │   Database      │
└────────┬────────┘     └──────────────────┘     └────────▲────────┘
         │                                                │
         │ REST API                                       │
         ▼                                                │
┌─────────────────┐     ┌──────────────────┐              │
│   Node.js API   │────▶│  Azure SignalR   │              │
│  (App Service)  │     │ (Real-time bids) │              │
└────────┬────────┘     └──────────────────┘              │
         │                                                │
         │                                                │
         ▼                                                │
┌─────────────────┐     ┌──────────────────┐              │
│ Azure Blob      │     │    Stripe        │──────────────┘
│ (Image storage) │     │  (Payments)      │
└─────────────────┘     └──────────────────┘
```

## 💰 Cost Estimates

| Environment | Monthly Cost |
|-------------|-------------|
| Development | ~$20 |
| Production | ~$220 |

See [docs/cost-breakdown.md](docs/cost-breakdown.md) for details.

## 🔐 Security

- All secrets stored in Azure Key Vault
- HTTPS enforced everywhere
- JWT token validation
- SQL injection prevention (parameterized queries)
- XSS protection (React)
- CORS restrictions
- Rate limiting on bid endpoints

## 📝 API Documentation

See [docs/api.md](docs/api.md) for full API reference.

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/auctions` | List auctions |
| GET | `/api/auctions/:id` | Get auction details |
| POST | `/api/auctions/:id/bids` | Place a bid |
| POST | `/api/payments/create-intent` | Create payment |

## 🧪 Testing

```bash
# Run all tests
npm test

# Run frontend tests
npm run frontend:test

# Run backend tests
npm run backend:test
```

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.
