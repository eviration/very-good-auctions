import { BlobServiceClient, ContainerClient } from '@azure/storage-blob'
import { v4 as uuidv4 } from 'uuid'
import path from 'path'

let containerClient: ContainerClient | null = null

function getContainerClient(): ContainerClient {
  if (containerClient) {
    return containerClient
  }

  const connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING
  if (!connectionString) {
    throw new Error('Azure Storage connection string not configured')
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString)
  containerClient = blobServiceClient.getContainerClient(
    process.env.AZURE_STORAGE_CONTAINER || 'auction-images'
  )

  return containerClient
}

export async function uploadImage(
  buffer: Buffer,
  originalFilename: string,
  auctionId: string
): Promise<string> {
  const container = getContainerClient()

  // Ensure container exists
  await container.createIfNotExists({
    access: 'blob', // Public read access for blobs
  })

  // Generate unique filename
  const ext = path.extname(originalFilename).toLowerCase()
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp']
  
  if (!allowedExtensions.includes(ext)) {
    throw new Error('Invalid file type. Allowed: jpg, jpeg, png, gif, webp')
  }

  const blobName = `${auctionId}/${uuidv4()}${ext}`
  const blockBlobClient = container.getBlockBlobClient(blobName)

  // Determine content type
  const contentTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
  }

  await blockBlobClient.uploadData(buffer, {
    blobHTTPHeaders: {
      blobContentType: contentTypes[ext] || 'application/octet-stream',
    },
  })

  return blockBlobClient.url
}

export async function deleteImage(blobUrl: string): Promise<void> {
  const container = getContainerClient()
  
  // Extract blob name from URL
  const url = new URL(blobUrl)
  const blobName = url.pathname.split('/').slice(2).join('/')
  
  const blockBlobClient = container.getBlockBlobClient(blobName)
  await blockBlobClient.deleteIfExists()
}

export async function deleteAuctionImages(auctionId: string): Promise<void> {
  const container = getContainerClient()
  
  // List and delete all blobs with the auction ID prefix
  for await (const blob of container.listBlobsFlat({ prefix: `${auctionId}/` })) {
    const blockBlobClient = container.getBlockBlobClient(blob.name)
    await blockBlobClient.deleteIfExists()
  }
}
