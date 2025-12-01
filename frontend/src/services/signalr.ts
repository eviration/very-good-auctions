import type { BidUpdateEvent, AuctionEndedEvent } from '../types'

type BidUpdateHandler = (event: BidUpdateEvent) => void
type AuctionEndedHandler = (event: AuctionEndedEvent) => void

// Connection states matching SignalR for compatibility
enum ConnectionState {
  Disconnected = 0,
  Connecting = 1,
  Connected = 2,
  Reconnecting = 3,
}

class SignalRService {
  private ws: WebSocket | null = null
  private connectionState: ConnectionState = ConnectionState.Disconnected
  private bidUpdateHandlers: Map<string, Set<BidUpdateHandler>> = new Map()
  private auctionEndedHandlers: Map<string, Set<AuctionEndedHandler>> = new Map()
  private globalBidUpdateHandlers: Set<BidUpdateHandler> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private subscribedAuctions: Set<string> = new Set()
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null

  async connect(): Promise<void> {
    if (this.connectionState === ConnectionState.Connected) {
      return
    }

    if (this.connectionState === ConnectionState.Connecting) {
      // Wait for existing connection attempt
      return new Promise((resolve, reject) => {
        const checkConnection = setInterval(() => {
          if (this.connectionState === ConnectionState.Connected) {
            clearInterval(checkConnection)
            resolve()
          } else if (this.connectionState === ConnectionState.Disconnected) {
            clearInterval(checkConnection)
            reject(new Error('Connection failed'))
          }
        }, 100)
      })
    }

    this.connectionState = ConnectionState.Connecting

    return new Promise((resolve, reject) => {
      const baseUrl = import.meta.env.VITE_SIGNALR_URL || this.getDefaultHubUrl()
      // Convert http(s) to ws(s) if needed
      const wsUrl = baseUrl.replace(/^http/, 'ws')

      try {
        this.ws = new WebSocket(wsUrl)

        this.ws.onopen = () => {
          console.log('WebSocket connected')
          this.connectionState = ConnectionState.Connected
          this.reconnectAttempts = 0
          this.resubscribeAll()
          resolve()
        }

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data)
            this.handleMessage(message)
          } catch (error) {
            console.error('Failed to parse WebSocket message:', error)
          }
        }

        this.ws.onclose = () => {
          console.log('WebSocket connection closed')
          this.connectionState = ConnectionState.Disconnected
          this.ws = null
          this.attemptReconnect()
        }

        this.ws.onerror = (error) => {
          console.error('WebSocket error:', error)
          if (this.connectionState === ConnectionState.Connecting) {
            this.connectionState = ConnectionState.Disconnected
            reject(new Error('WebSocket connection failed'))
          }
        }
      } catch (error) {
        this.connectionState = ConnectionState.Disconnected
        reject(error)
      }
    })
  }

  private getDefaultHubUrl(): string {
    // In production, use the API URL from environment
    const apiUrl = import.meta.env.VITE_API_URL
    if (apiUrl) {
      // Convert http(s) to ws(s)
      return apiUrl.replace(/^http/, 'ws').replace(/\/api$/, '') + '/hubs/auction'
    }
    // Development fallback
    return 'ws://localhost:4000/hubs/auction'
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('Max reconnect attempts reached')
      return
    }

    this.connectionState = ConnectionState.Reconnecting
    this.reconnectAttempts++
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts - 1), 30000)

    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    this.reconnectTimeout = setTimeout(async () => {
      try {
        await this.connect()
      } catch (error) {
        console.error('Reconnect failed:', error)
      }
    }, delay)
  }

  private handleMessage(message: { type: string; data?: unknown; clientId?: string }): void {
    switch (message.type) {
      case 'connected':
        console.log('Server acknowledged connection:', message.clientId)
        break

      case 'BidUpdate':
        this.handleBidUpdate(message.data as BidUpdateEvent)
        break

      case 'AuctionEnded':
        this.handleAuctionEnded(message.data as AuctionEndedEvent)
        break

      default:
        console.log('Unknown message type:', message.type)
    }
  }

  async disconnect(): Promise<void> {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout)
      this.reconnectTimeout = null
    }

    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    this.connectionState = ConnectionState.Disconnected
    this.subscribedAuctions.clear()
  }

  async subscribeToAuction(auctionId: string): Promise<void> {
    if (this.connectionState !== ConnectionState.Connected) {
      await this.connect()
    }

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'JoinAuctionGroup',
        auctionId,
      }))
      this.subscribedAuctions.add(auctionId)
      console.log(`Subscribed to auction: ${auctionId}`)
    }
  }

  async unsubscribeFromAuction(auctionId: string): Promise<void> {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'LeaveAuctionGroup',
        auctionId,
      }))
      this.subscribedAuctions.delete(auctionId)
      console.log(`Unsubscribed from auction: ${auctionId}`)
    }
  }

  onBidUpdate(auctionId: string, handler: BidUpdateHandler): () => void {
    if (!this.bidUpdateHandlers.has(auctionId)) {
      this.bidUpdateHandlers.set(auctionId, new Set())
    }
    this.bidUpdateHandlers.get(auctionId)!.add(handler)

    // Return unsubscribe function
    return () => {
      this.bidUpdateHandlers.get(auctionId)?.delete(handler)
    }
  }

  onAnyBidUpdate(handler: BidUpdateHandler): () => void {
    this.globalBidUpdateHandlers.add(handler)
    return () => {
      this.globalBidUpdateHandlers.delete(handler)
    }
  }

  onAuctionEnded(auctionId: string, handler: AuctionEndedHandler): () => void {
    if (!this.auctionEndedHandlers.has(auctionId)) {
      this.auctionEndedHandlers.set(auctionId, new Set())
    }
    this.auctionEndedHandlers.get(auctionId)!.add(handler)

    return () => {
      this.auctionEndedHandlers.get(auctionId)?.delete(handler)
    }
  }

  private handleBidUpdate(event: BidUpdateEvent): void {
    // Notify auction-specific handlers
    const handlers = this.bidUpdateHandlers.get(event.auctionId)
    if (handlers) {
      handlers.forEach((handler) => handler(event))
    }

    // Notify global handlers
    this.globalBidUpdateHandlers.forEach((handler) => handler(event))
  }

  private handleAuctionEnded(event: AuctionEndedEvent): void {
    const handlers = this.auctionEndedHandlers.get(event.auctionId)
    if (handlers) {
      handlers.forEach((handler) => handler(event))
    }
  }

  private async resubscribeAll(): Promise<void> {
    const auctionIds = new Set([
      ...this.bidUpdateHandlers.keys(),
      ...this.auctionEndedHandlers.keys(),
      ...this.subscribedAuctions,
    ])

    for (const auctionId of auctionIds) {
      await this.subscribeToAuction(auctionId)
    }
  }

  // Check if connected (for external status checks)
  isConnected(): boolean {
    return this.connectionState === ConnectionState.Connected
  }
}

export const signalRService = new SignalRService()
