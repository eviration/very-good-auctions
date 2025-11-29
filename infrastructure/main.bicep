// Main Bicep template for Very Good Auctions infrastructure
// Deploy with: az deployment sub create --location eastus --template-file main.bicep --parameters parameters/prod.json

targetScope = 'subscription'

@description('Environment name (dev, staging, prod)')
@allowed(['dev', 'staging', 'prod'])
param environment string = 'dev'

@description('Azure region for resources')
param location string = 'westus2'

@description('Base name for resources')
param baseName string = 'vgauctions'

@description('SQL Server administrator login')
@secure()
param sqlAdminLogin string

@description('SQL Server administrator password')
@secure()
param sqlAdminPassword string

@description('Microsoft Entra External ID tenant name')
param entraTenantName string

@description('Microsoft Entra External ID tenant ID')
param entraTenantId string

@description('Microsoft Entra External ID client ID')
param entraClientId string

@description('Stripe secret key')
@secure()
param stripeSecretKey string

// Variables
var resourceGroupName = 'rg-${baseName}-${environment}'
var tags = {
  Environment: environment
  Application: baseName
  ManagedBy: 'Bicep'
}

// Resource Group
resource resourceGroup 'Microsoft.Resources/resourceGroups@2023-07-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

// Deploy all resources to the resource group
module resources 'modules/resources.bicep' = {
  name: 'resources-deployment'
  scope: resourceGroup
  params: {
    environment: environment
    location: location
    baseName: baseName
    sqlAdminLogin: sqlAdminLogin
    sqlAdminPassword: sqlAdminPassword
    entraTenantName: entraTenantName
    entraTenantId: entraTenantId
    entraClientId: entraClientId
    stripeSecretKey: stripeSecretKey
    tags: tags
  }
}

// Outputs
output resourceGroupName string = resourceGroup.name
output staticWebAppUrl string = resources.outputs.staticWebAppUrl
output apiUrl string = resources.outputs.apiUrl
output sqlServerFqdn string = resources.outputs.sqlServerFqdn
output storageAccountName string = resources.outputs.storageAccountName
output keyVaultName string = resources.outputs.keyVaultName
