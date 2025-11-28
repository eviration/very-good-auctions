// Resources module for Very Good Auctions

@description('Environment name')
param environment string

@description('Azure region')
param location string

@description('Base name for resources')
param baseName string

@description('SQL admin login')
@secure()
param sqlAdminLogin string

@description('SQL admin password')
@secure()
param sqlAdminPassword string

@description('Microsoft Entra External ID tenant name')
param entraTenantName string

@description('Stripe secret key')
@secure()
param stripeSecretKey string

@description('Resource tags')
param tags object

// Variables
var uniqueSuffix = uniqueString(resourceGroup().id)
var appServicePlanName = 'asp-${baseName}-${environment}'
var appServiceName = 'app-${baseName}-api-${environment}'
var staticWebAppName = 'swa-${baseName}-${environment}'
var sqlServerName = 'sql-${baseName}-${environment}-${uniqueSuffix}'
var sqlDatabaseName = 'sqldb-${baseName}-${environment}'
var storageAccountName = 'st${replace(baseName, '-', '')}${environment}'
var keyVaultName = 'kv-${baseName}-${environment}'
var signalRName = 'sigr-${baseName}-${environment}'
var appInsightsName = 'appi-${baseName}-${environment}'
var logAnalyticsName = 'log-${baseName}-${environment}'

// App Service Plan tier based on environment
var appServicePlanSku = environment == 'prod' ? {
  name: 'S1'
  tier: 'Standard'
  capacity: 1
} : {
  name: 'B1'
  tier: 'Basic'
  capacity: 1
}

// SQL Database tier based on environment
var sqlDatabaseSku = environment == 'prod' ? {
  name: 'S1'
  tier: 'Standard'
} : {
  name: 'Basic'
  tier: 'Basic'
}

// Log Analytics Workspace
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

// Application Insights
resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// Storage Account
resource storageAccount 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    accessTier: 'Hot'
    supportsHttpsTrafficOnly: true
    minimumTlsVersion: 'TLS1_2'
    allowBlobPublicAccess: true
  }
}

// Blob container for auction images
resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storageAccount
  name: 'default'
}

resource imagesContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'auction-images'
  properties: {
    publicAccess: 'Blob'
  }
}

// Key Vault
resource keyVault 'Microsoft.KeyVault/vaults@2023-07-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    accessPolicies: []
    enableRbacAuthorization: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 7
  }
}

// Store secrets in Key Vault
resource sqlPasswordSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'sql-admin-password'
  properties: {
    value: sqlAdminPassword
  }
}

resource stripeSecret 'Microsoft.KeyVault/vaults/secrets@2023-07-01' = {
  parent: keyVault
  name: 'stripe-secret-key'
  properties: {
    value: stripeSecretKey
  }
}

// SQL Server
resource sqlServer 'Microsoft.Sql/servers@2023-05-01-preview' = {
  name: sqlServerName
  location: location
  tags: tags
  properties: {
    administratorLogin: sqlAdminLogin
    administratorLoginPassword: sqlAdminPassword
    version: '12.0'
    minimalTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

// SQL Database
resource sqlDatabase 'Microsoft.Sql/servers/databases@2023-05-01-preview' = {
  parent: sqlServer
  name: sqlDatabaseName
  location: location
  tags: tags
  sku: sqlDatabaseSku
  properties: {
    collation: 'SQL_Latin1_General_CP1_CI_AS'
    maxSizeBytes: 2147483648 // 2GB
  }
}

// Allow Azure services to access SQL
resource sqlFirewallRule 'Microsoft.Sql/servers/firewallRules@2023-05-01-preview' = {
  parent: sqlServer
  name: 'AllowAzureServices'
  properties: {
    startIpAddress: '0.0.0.0'
    endIpAddress: '0.0.0.0'
  }
}

// SignalR Service
resource signalR 'Microsoft.SignalRService/signalR@2023-06-01-preview' = {
  name: signalRName
  location: location
  tags: tags
  sku: {
    name: environment == 'prod' ? 'Standard_S1' : 'Free_F1'
    capacity: 1
  }
  kind: 'SignalR'
  properties: {
    features: [
      {
        flag: 'ServiceMode'
        value: 'Default'
      }
    ]
    cors: {
      allowedOrigins: ['*']
    }
  }
}

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2023-01-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  sku: appServicePlanSku
  kind: 'linux'
  properties: {
    reserved: true
  }
}

// App Service (Backend API)
resource appService 'Microsoft.Web/sites@2023-01-01' = {
  name: appServiceName
  location: location
  tags: tags
  kind: 'app,linux'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: environment == 'prod'
      cors: {
        allowedOrigins: ['*']
      }
      appSettings: [
        {
          name: 'NODE_ENV'
          value: environment == 'prod' ? 'production' : 'development'
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: appInsights.properties.ConnectionString
        }
        {
          name: 'DB_SERVER'
          value: sqlServer.properties.fullyQualifiedDomainName
        }
        {
          name: 'DB_NAME'
          value: sqlDatabaseName
        }
        {
          name: 'DB_USER'
          value: sqlAdminLogin
        }
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccount.name};AccountKey=${storageAccount.listKeys().keys[0].value}'
        }
        {
          name: 'AZURE_SIGNALR_CONNECTION_STRING'
          value: signalR.listKeys().primaryConnectionString
        }
        {
          name: 'ENTRA_TENANT_NAME'
          value: entraTenantName
        }
        {
          name: 'KEY_VAULT_URI'
          value: keyVault.properties.vaultUri
        }
      ]
    }
  }
}

// Grant App Service access to Key Vault
resource keyVaultAccessPolicy 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(keyVault.id, appService.id, 'Key Vault Secrets User')
  scope: keyVault
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', '4633458b-17de-408a-b874-0445c86b69e6') // Key Vault Secrets User
    principalId: appService.identity.principalId
    principalType: 'ServicePrincipal'
  }
}

// Static Web App (Frontend)
resource staticWebApp 'Microsoft.Web/staticSites@2023-01-01' = {
  name: staticWebAppName
  location: location
  tags: tags
  sku: {
    name: environment == 'prod' ? 'Standard' : 'Free'
  }
  properties: {
    stagingEnvironmentPolicy: 'Enabled'
    allowConfigFileUpdates: true
    buildProperties: {
      appLocation: 'frontend'
      outputLocation: 'dist'
    }
  }
}

// Outputs
output staticWebAppUrl string = 'https://${staticWebApp.properties.defaultHostname}'
output apiUrl string = 'https://${appService.properties.defaultHostName}'
output sqlServerFqdn string = sqlServer.properties.fullyQualifiedDomainName
output storageAccountName string = storageAccount.name
output keyVaultName string = keyVault.name
output signalRHostname string = signalR.properties.hostName
output appInsightsInstrumentationKey string = appInsights.properties.InstrumentationKey
