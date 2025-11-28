/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string
  readonly VITE_AZURE_AD_TENANT_NAME: string
  readonly VITE_AZURE_AD_TENANT_ID: string
  readonly VITE_AZURE_AD_CLIENT_ID: string
  readonly VITE_AZURE_AD_SUSI_POLICY: string
  readonly VITE_SIGNALR_URL: string
  readonly VITE_STRIPE_PUBLIC_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
