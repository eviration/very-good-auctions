import * as signalR from '@microsoft/signalr'
import type { BidUpdateEvent, AuctionEndedEvent } from '../types'

type BidUpdateHandler = (event: BidUpdateEvent) => void
type AuctionEndedHandler = (event: AuctionEndedEvent) => void

class SignalRService {
  private connection: signalR.HubConnection | null = null
  private bidUpdateHandlers: Map<string, Set<BidUpdateHandler>> = new Map()
  private auctionEndedHandlers: Map<string, Set<AuctionEndedHandler>> = new Map()
  private globalBidUpdateHandlers: Set<BidUpdateHandler> = new Set()
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5

  async connect(): Promise<void> {
    if (this.connection?.state === signalR.HubConnectionState.Connected) {
      return
    }

    const hubUrl = import.meta.env.VITE_SIGNALR_URL || '/hubs/auction'

    this.connection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl)
      .withAutomaticReconnect({
        nextRetryDelayInMilliseconds: (retryContext) => {
          if (retryContext.previousRetryCount >= this.maxReconnectAttempts) {
            return null // Stop reconnecting
          }
          // Exponential backoff: 1s, 2s, 4s, 8s, 16s
          return Math.min(1000 * Math.pow(2, retryContext.previousRetryCount), 30000)
        },
      })
      .configureLogging(signalR.LogLevel.Warning)
      .build()

    // Set up event handlers
    this.connection.on('BidUpdate', (event: BidUpdateEvent) => {
      this.handleBidUpdate(event)
    })

    this.connection.on('AuctionEnded', (event: AuctionEndedEvent) => {
      this.handleAuctionEnded(event)
    })

    // Handle connection state changes
    this.connection.onreconnecting(() => {
      console.log('SignalR reconnecting...')
    })

    this.connection.onreconnected(() => {
      console.log('SignalR reconnected')
      this.reconnectAttempts = 0
      // Re-subscribe to all watched auctions
      this.resubscribeAll()
    })

    this.connection.onclose(() => {
      console.log('SignalR connection closed')
    })

    try {
      await this.connection.start()
      console.log('SignalR connected')
      this.reconnectAttempts = 0
    } catch (error) {
      console.error('SignalR connection failed:', error)
      throw error
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.stop()
      this.connection = null
    }
  }

  async subscribeToAuction(auctionId: string): Promise<void> {
    if (this.connection?.state !== signalR.HubConnectionState.Connected) {
      await this.connect()
    }

    try {
      await this.connection?.invoke('JoinAuctionGroup', auctionId)
      console.log(`Subscribed to auction: ${auctionId}`)
    } catch (error) {
      console.error(`Failed to subscribe to auction ${auctionId}:`, error)
    }
  }

  async unsubscribeFromAuction(auctionId: string): Promise<void> {
    try {
      await this.connection?.invoke('LeaveAuctionGroup', auctionId)
      console.log(`Unsubscribed from auction: ${auctionId}`)
    } catch (error) {
      console.error(`Failed to unsubscribe from auction ${auctionId}:`, error)
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
    ])

    for (const auctionId of auctionIds) {
      await this.subscribeToAuction(auctionId)
    }
  }
}

export const signalRService = new SignalRService()
