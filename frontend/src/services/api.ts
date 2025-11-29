import type {
  Auction,
  Bid,
  Category,
  User,
  PaginatedResponse,
  PlaceBidRequest,
  CreatePaymentIntentRequest,
  CreatePaymentIntentResponse,
  Notification,
} from '../types'

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api'

class ApiClient {
  private getAccessToken: (() => Promise<string | null>) | null = null

  setTokenProvider(provider: () => Promise<string | null>) {
    this.getAccessToken = provider
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${API_BASE_URL}${endpoint}`
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    }

    // Add auth token if available
    if (this.getAccessToken) {
      const token = await this.getAccessToken()
      if (token) {
        headers['Authorization'] = `Bearer ${token}`
      }
    }

    const response = await fetch(url, {
      ...options,
      headers,
    })

    if (!response.ok) {
      const errorText = await response.text()
      let errorMessage = `HTTP ${response.status}`

      try {
        const errorJson = JSON.parse(errorText)
        errorMessage = errorJson.message || errorJson.error || errorText || errorMessage
      } catch {
        errorMessage = errorText || errorMessage
      }

      console.error('API request failed:', {
        url,
        status: response.status,
        statusText: response.statusText,
        error: errorMessage,
        headers: Object.fromEntries(response.headers.entries())
      })

      throw new Error(errorMessage)
    }

    // Handle 204 No Content
    if (response.status === 204) {
      return undefined as T
    }

    return response.json()
  }

  // Auctions
  async getAuctions(params?: {
    page?: number
    pageSize?: number
    category?: string
    search?: string
    status?: string
    sortBy?: string
    sortOrder?: 'asc' | 'desc'
  }): Promise<PaginatedResponse<Auction>> {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.set(key, String(value))
        }
      })
    }
    const query = searchParams.toString()
    return this.request(`/auctions${query ? `?${query}` : ''}`)
  }

  async getAuction(id: string): Promise<Auction> {
    return this.request(`/auctions/${id}`)
  }

  async createAuction(data: Partial<Auction>): Promise<Auction> {
    return this.request('/auctions', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateAuction(id: string, data: Partial<Auction>): Promise<Auction> {
    return this.request(`/auctions/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteAuction(id: string): Promise<void> {
    return this.request(`/auctions/${id}`, {
      method: 'DELETE',
    })
  }

  async uploadAuctionImage(
    auctionId: string,
    file: File
  ): Promise<{ url: string }> {
    const formData = new FormData()
    formData.append('image', file)

    const token = this.getAccessToken ? await this.getAccessToken() : null
    const headers: HeadersInit = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(
      `${API_BASE_URL}/auctions/${auctionId}/images`,
      {
        method: 'POST',
        headers,
        body: formData,
      }
    )

    if (!response.ok) {
      let errorMessage = `Image upload failed (${response.status})`
      try {
        const errorData = await response.json()
        errorMessage = errorData.error || errorData.details || errorMessage
        console.error('Image upload error details:', errorData)
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage)
    }

    return response.json()
  }

  // Categories
  async getCategories(): Promise<Category[]> {
    return this.request('/categories')
  }

  // Bids
  async getAuctionBids(auctionId: string): Promise<Bid[]> {
    return this.request(`/auctions/${auctionId}/bids`)
  }

  async placeBid(auctionId: string, data: PlaceBidRequest): Promise<Bid> {
    return this.request(`/auctions/${auctionId}/bids`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getUserBids(): Promise<Bid[]> {
    return this.request('/users/me/bids')
  }

  // Users
  async getCurrentUser(): Promise<User> {
    return this.request('/users/me')
  }

  async updateCurrentUser(data: Partial<User>): Promise<User> {
    return this.request('/users/me', {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async getUserAuctions(): Promise<Auction[]> {
    return this.request('/users/me/auctions')
  }

  // Watchlist
  async getWatchlist(): Promise<Auction[]> {
    return this.request('/users/me/watchlist')
  }

  async addToWatchlist(auctionId: string): Promise<void> {
    return this.request(`/users/me/watchlist/${auctionId}`, {
      method: 'POST',
    })
  }

  async removeFromWatchlist(auctionId: string): Promise<void> {
    return this.request(`/users/me/watchlist/${auctionId}`, {
      method: 'DELETE',
    })
  }

  // Payments
  async createPaymentIntent(
    data: CreatePaymentIntentRequest
  ): Promise<CreatePaymentIntentResponse> {
    return this.request('/payments/create-intent', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async confirmPayment(paymentIntentId: string): Promise<void> {
    return this.request('/payments/confirm', {
      method: 'POST',
      body: JSON.stringify({ paymentIntentId }),
    })
  }

  // Notifications
  async getNotifications(): Promise<Notification[]> {
    return this.request('/users/me/notifications')
  }

  async markNotificationRead(id: string): Promise<void> {
    return this.request(`/users/me/notifications/${id}/read`, {
      method: 'POST',
    })
  }

  async markAllNotificationsRead(): Promise<void> {
    return this.request('/users/me/notifications/read-all', {
      method: 'POST',
    })
  }
}

export const apiClient = new ApiClient()
