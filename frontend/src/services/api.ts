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
  Organization,
  OrganizationMember,
  OrganizationInvitation,
  CreateOrganizationRequest,
  UpdateOrganizationRequest,
  OrganizationRole,
  OrganizationType,
  AuctionEvent,
  CreateEventRequest,
  UpdateEventRequest,
  EventItem,
  SubmitItemRequest,
  UpdateItemRequest,
  EventItemBid,
  SilentBidStatus,
  CurrentBidInfo,
  PricingTiers,
  EventStatus,
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


  // Organizations
  async getOrganizations(params?: {
    page?: number
    pageSize?: number
    search?: string
    orgType?: OrganizationType
  }): Promise<PaginatedResponse<Organization>> {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.set(key, String(value))
        }
      })
    }
    const query = searchParams.toString()
    return this.request(`/organizations${query ? `?${query}` : ''}`)
  }

  async getOrganization(slug: string): Promise<Organization> {
    return this.request(`/organizations/${slug}`)
  }

  async createOrganization(data: CreateOrganizationRequest): Promise<Organization> {
    return this.request('/organizations', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateOrganization(id: string, data: UpdateOrganizationRequest): Promise<void> {
    return this.request(`/organizations/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteOrganization(id: string): Promise<void> {
    return this.request(`/organizations/${id}`, {
      method: 'DELETE',
    })
  }

  async getMyOrganizations(): Promise<Organization[]> {
    return this.request('/organizations/my/list')
  }

  // Organization Members
  async getOrganizationMembers(orgId: string): Promise<OrganizationMember[]> {
    return this.request(`/organizations/${orgId}/members`)
  }

  async addOrganizationMember(
    orgId: string,
    data: {
      userId: string
      role: OrganizationRole
      canCreateAuctions?: boolean
      canManageMembers?: boolean
      canViewFinancials?: boolean
    }
  ): Promise<void> {
    return this.request(`/organizations/${orgId}/members`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateOrganizationMember(
    orgId: string,
    memberId: string,
    data: {
      role?: OrganizationRole
      canCreateAuctions?: boolean
      canManageMembers?: boolean
      canViewFinancials?: boolean
    }
  ): Promise<void> {
    return this.request(`/organizations/${orgId}/members/${memberId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async removeOrganizationMember(orgId: string, userId: string): Promise<void> {
    return this.request(`/organizations/${orgId}/members/${userId}`, {
      method: 'DELETE',
    })
  }

  // Organization Invitations
  async sendOrganizationInvitation(
    orgId: string,
    data: { email: string; role: OrganizationRole }
  ): Promise<{ token: string }> {
    return this.request(`/organizations/${orgId}/invitations`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getOrganizationInvitations(orgId: string): Promise<OrganizationInvitation[]> {
    return this.request(`/organizations/${orgId}/invitations`)
  }

  async cancelOrganizationInvitation(orgId: string, invitationId: string): Promise<void> {
    return this.request(`/organizations/${orgId}/invitations/${invitationId}`, {
      method: 'DELETE',
    })
  }

  // Public invitation endpoints
  async getInvitation(token: string): Promise<OrganizationInvitation> {
    return this.request(`/invitations/${token}`)
  }

  async acceptInvitation(token: string): Promise<{ organization: { id: string; name: string } }> {
    return this.request(`/invitations/${token}/accept`, {
      method: 'POST',
    })
  }

  async declineInvitation(token: string): Promise<void> {
    return this.request(`/invitations/${token}/decline`, {
      method: 'POST',
    })
  }

  async getMyPendingInvitations(): Promise<OrganizationInvitation[]> {
    return this.request('/invitations/my/pending')
  }

  // Events
  async getEvents(params?: {
    page?: number
    pageSize?: number
    search?: string
    status?: EventStatus
    organizationId?: string
  }): Promise<PaginatedResponse<AuctionEvent>> {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.set(key, String(value))
        }
      })
    }
    const query = searchParams.toString()
    return this.request(`/events${query ? `?${query}` : ''}`)
  }

  async getEvent(idOrSlug: string): Promise<AuctionEvent> {
    return this.request(`/events/${idOrSlug}`)
  }

  async createEvent(data: CreateEventRequest): Promise<AuctionEvent> {
    return this.request('/events', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateEvent(id: string, data: UpdateEventRequest): Promise<AuctionEvent> {
    return this.request(`/events/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async deleteEvent(id: string): Promise<void> {
    return this.request(`/events/${id}`, {
      method: 'DELETE',
    })
  }

  async publishEvent(id: string): Promise<AuctionEvent> {
    return this.request(`/events/${id}/publish`, {
      method: 'POST',
    })
  }

  async getMyEvents(): Promise<AuctionEvent[]> {
    return this.request('/events/my/list')
  }

  async getEventSubmissionLink(id: string): Promise<{ url: string; accessCode: string }> {
    return this.request(`/events/${id}/submission-link`)
  }

  async verifyEventAccess(id: string, accessCode: string): Promise<{ valid: boolean; eventName?: string }> {
    return this.request(`/events/${id}/verify-access`, {
      method: 'POST',
      body: JSON.stringify({ accessCode }),
    })
  }

  async getPricingTiers(): Promise<PricingTiers> {
    return this.request('/events/pricing/tiers')
  }

  // Event Items
  async getEventItems(eventId: string, params?: {
    status?: string
    submissionStatus?: string
  }): Promise<EventItem[]> {
    const searchParams = new URLSearchParams()
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) {
          searchParams.set(key, String(value))
        }
      })
    }
    const query = searchParams.toString()
    return this.request(`/events/${eventId}/items${query ? `?${query}` : ''}`)
  }

  async getEventItem(eventId: string, itemId: string): Promise<EventItem> {
    return this.request(`/events/${eventId}/items/${itemId}`)
  }

  async submitEventItem(eventId: string, data: SubmitItemRequest): Promise<EventItem> {
    return this.request(`/events/${eventId}/items`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async updateEventItem(eventId: string, itemId: string, data: UpdateItemRequest): Promise<EventItem> {
    return this.request(`/events/${eventId}/items/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async removeEventItem(eventId: string, itemId: string): Promise<void> {
    return this.request(`/events/${eventId}/items/${itemId}`, {
      method: 'DELETE',
    })
  }

  async approveEventItem(eventId: string, itemId: string): Promise<EventItem> {
    return this.request(`/events/${eventId}/items/${itemId}/approve`, {
      method: 'POST',
    })
  }

  async rejectEventItem(eventId: string, itemId: string, reason: string): Promise<EventItem> {
    return this.request(`/events/${eventId}/items/${itemId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  async requestItemResubmit(
    eventId: string,
    itemId: string,
    reason: string
  ): Promise<EventItem> {
    return this.request(`/events/${eventId}/items/${itemId}/request-resubmit`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  async uploadEventItemImage(
    eventId: string,
    itemId: string,
    file: File
  ): Promise<{ url: string; id: string }> {
    const formData = new FormData()
    formData.append('image', file)

    const token = this.getAccessToken ? await this.getAccessToken() : null
    const headers: HeadersInit = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(
      `${API_BASE_URL}/events/${eventId}/items/${itemId}/images`,
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
      } catch {
        // Ignore JSON parse errors
      }
      throw new Error(errorMessage)
    }

    return response.json()
  }

  async deleteEventItemImage(eventId: string, itemId: string, imageId: string): Promise<void> {
    return this.request(`/events/${eventId}/items/${itemId}/images/${imageId}`, {
      method: 'DELETE',
    })
  }

  async reorderEventItemImages(
    eventId: string,
    itemId: string,
    imageIds: string[]
  ): Promise<void> {
    return this.request(`/events/${eventId}/items/${itemId}/images/reorder`, {
      method: 'POST',
      body: JSON.stringify({ imageIds }),
    })
  }

  // Event Bids
  async getEventItemBids(eventId: string, itemId: string): Promise<EventItemBid[]> {
    return this.request(`/events/${eventId}/items/${itemId}/bids`)
  }

  async placeEventBid(
    eventId: string,
    itemId: string,
    data: { amount: number; accessCode?: string }
  ): Promise<EventItemBid> {
    return this.request(`/events/${eventId}/items/${itemId}/bids`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getCurrentBidInfo(eventId: string, itemId: string): Promise<CurrentBidInfo> {
    return this.request(`/events/${eventId}/items/${itemId}/current-bid`)
  }

  // Silent Bids
  async getSilentBidStatus(eventId: string, itemId: string): Promise<SilentBidStatus> {
    return this.request(`/events/${eventId}/items/${itemId}/silent-bid`)
  }

  async placeSilentBid(
    eventId: string,
    itemId: string,
    data: { amount: number; notifyOnOutbid?: boolean; accessCode?: string }
  ): Promise<SilentBidStatus> {
    return this.request(`/events/${eventId}/items/${itemId}/silent-bid`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async increaseSilentBid(
    eventId: string,
    itemId: string,
    data: { increaseBy: number }
  ): Promise<SilentBidStatus> {
    return this.request(`/events/${eventId}/items/${itemId}/silent-bid/increase`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // Buy Now
  async buyNow(
    eventId: string,
    itemId: string,
    data: { accessCode?: string }
  ): Promise<{ success: boolean; item: EventItem }> {
    return this.request(`/events/${eventId}/items/${itemId}/buy-now`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  // My Event Activity
  async getMyEventBids(eventId: string): Promise<EventItemBid[]> {
    return this.request(`/events/${eventId}/my/bids`)
  }

  async getMyEventSubmissions(eventId: string): Promise<EventItem[]> {
    return this.request(`/events/${eventId}/my/submissions`)
  }

  // Platform Fees
  async getPlatformFeePricing(): Promise<{
    tiers: Record<string, { maxItems: number | null }>
    platformFeePercent: number
    minimumFee: number
    description: string
  }> {
    return this.request('/platform-fees/pricing')
  }

  async calculatePlatformFee(amount: number): Promise<{
    amount: number
    platformFee: number
    total: number
  }> {
    return this.request(`/platform-fees/calculate?amount=${amount}`)
  }

  async getMyWins(): Promise<{
    id: string
    title: string
    winningAmount: number
    platformFee: number
    total: number
    status: string
    eventName: string
    eventSlug: string
    eventEndedAt: string
    imageUrl?: string
    paymentPending: boolean
  }[]> {
    return this.request('/platform-fees/my-wins')
  }

  async createWinnerPayment(itemId: string): Promise<{
    clientSecret: string
    paymentIntentId: string
    breakdown: {
      winningBid: number
      platformFee: number
      total: number
    }
  }> {
    return this.request(`/platform-fees/items/${itemId}/pay`, {
      method: 'POST',
    })
  }

  async getEventFeeSummary(eventId: string): Promise<{
    totalRaised: number
    totalPlatformFees: number
    pendingPayments: number
    completedPayments: number
    items: {
      id: string
      title: string
      winningBid: number | null
      platformFee: number | null
      paymentStatus: 'pending' | 'paid' | null
    }[]
  }> {
    return this.request(`/platform-fees/event/${eventId}/summary`)
  }

  async completeEvent(eventId: string): Promise<{
    success: boolean
    message: string
    totalRaised: number
    totalPlatformFees: number
  }> {
    return this.request(`/platform-fees/event/${eventId}/complete`, {
      method: 'POST',
    })
  }

  // =====================================================
  // Notifications
  // =====================================================

  async getNotifications(options?: {
    limit?: number
    offset?: number
    unreadOnly?: boolean
  }): Promise<{
    notifications: Notification[]
    total: number
    unreadCount: number
  }> {
    const params = new URLSearchParams()
    if (options?.limit) params.append('limit', String(options.limit))
    if (options?.offset) params.append('offset', String(options.offset))
    if (options?.unreadOnly) params.append('unreadOnly', 'true')
    const query = params.toString() ? `?${params.toString()}` : ''
    return this.request(`/notifications${query}`)
  }

  async getUnreadNotificationCount(): Promise<{ unreadCount: number }> {
    return this.request('/notifications/unread-count')
  }

  async markNotificationAsRead(notificationId: string): Promise<{ success: boolean }> {
    return this.request(`/notifications/${notificationId}/read`, {
      method: 'POST',
    })
  }

  async markAllNotificationsAsRead(): Promise<{ success: boolean; markedRead: number }> {
    return this.request('/notifications/read-all', {
      method: 'POST',
    })
  }

  async deleteNotification(notificationId: string): Promise<{ success: boolean }> {
    return this.request(`/notifications/${notificationId}`, {
      method: 'DELETE',
    })
  }
}

export const apiClient = new ApiClient()
