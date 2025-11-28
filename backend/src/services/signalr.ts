import { Server as HttpServer } from 'http'
import { WebSocketServer, WebSocket } from 'ws'

interface BidUpdateEvent {
  auctionId: string
  currentBid: number
  bidCount: number
  bidderId: string
  bidderName: string
}

interface AuctionEndedEvent {
  auctionId: string
  winnerId?: string
  winnerName?: string
  finalBid: number
}

interface Client {
  ws: WebSocket
  auctionGroups: Set<string>
}

const clients = new Map<string, Client>()
let wss: WebSocketServer | null = null

export function initializeSignalR(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: '/hubs/auction' })

  wss.on('connection', (ws: WebSocket) => {
    const clientId = generateClientId()
    
    clients.set(clientId, {
      ws,
      auctionGroups: new Set(),
    })

    console.log(`Client connected: ${clientId}`)

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString())
        handleMessage(clientId, message)
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error)
      }
    })

    ws.on('close', () => {
      clients.delete(clientId)
      console.log(`Client disconnected: ${clientId}`)
    })

    ws.on('error', (error) => {
      console.error(`WebSocket error for client ${clientId}:`, error)
      clients.delete(clientId)
    })

    // Send connection acknowledgment
    ws.send(JSON.stringify({ type: 'connected', clientId }))
  })
}

function generateClientId(): string {
  return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
}

function handleMessage(clientId: string, message: any): void {
  const client = clients.get(clientId)
  if (!client) return

  switch (message.type) {
    case 'JoinAuctionGroup':
      client.auctionGroups.add(message.auctionId)
      console.log(`Client ${clientId} joined auction group: ${message.auctionId}`)
      break

    case 'LeaveAuctionGroup':
      client.auctionGroups.delete(message.auctionId)
      console.log(`Client ${clientId} left auction group: ${message.auctionId}`)
      break

    default:
      console.log(`Unknown message type: ${message.type}`)
  }
}

export function broadcastBidUpdate(event: BidUpdateEvent): void {
  const message = JSON.stringify({
    type: 'BidUpdate',
    data: event,
  })

  clients.forEach((client) => {
    if (client.auctionGroups.has(event.auctionId) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message)
    }
  })
}

export function broadcastAuctionEnded(event: AuctionEndedEvent): void {
  const message = JSON.stringify({
    type: 'AuctionEnded',
    data: event,
  })

  clients.forEach((client) => {
    if (client.auctionGroups.has(event.auctionId) && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message)
    }
  })
}

export function broadcastToUser(userId: string, type: string, data: any): void {
  // In production, you'd track user-to-client mappings
  // For now, broadcast to all clients (they filter client-side)
  const message = JSON.stringify({ type, data, targetUserId: userId })

  clients.forEach((client) => {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(message)
    }
  })
}
