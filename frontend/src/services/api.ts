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
  Feedback,
  FeedbackResponse,
  CreateFeedbackRequest,
  FeedbackStats,
  FeedbackStatus,
  FeedbackType,
  FeedbackPriority,
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
        // Handle nested error objects (e.g., {error: {message: "..."}})
        if (errorJson.error && typeof errorJson.error === 'object') {
          errorMessage = errorJson.error.message || JSON.stringify(errorJson.error)
        } else {
          errorMessage = errorJson.message || errorJson.error || errorText || errorMessage
        }
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

  async getOrganizationDeletionSummary(id: string): Promise<{
    canDelete: boolean
    blockers: string[]
    organization: {
      name: string
      createdAt: string
      hasStripeAccount: boolean
    }
    willDelete: {
      events: number
      items: number
      members: number
    }
    financial: {
      totalRaised: number
      totalPaidOut: number
      completedPayouts: number
    }
  }> {
    return this.request(`/organizations/${id}/deletion-summary`)
  }

  async deleteOrganization(id: string): Promise<void> {
    return this.request(`/organizations/${id}`, {
      method: 'DELETE',
    })
  }

  async uploadOrganizationLogo(
    orgId: string,
    file: File
  ): Promise<{ logoUrl: string }> {
    const formData = new FormData()
    formData.append('logo', file)

    const token = this.getAccessToken ? await this.getAccessToken() : null
    const headers: HeadersInit = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(
      `${API_BASE_URL}/organizations/${orgId}/logo`,
      {
        method: 'POST',
        headers,
        body: formData,
      }
    )

    if (!response.ok) {
      let errorMessage = `Logo upload failed (${response.status})`
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

  async deleteOrganizationLogo(orgId: string): Promise<void> {
    return this.request(`/organizations/${orgId}/logo`, {
      method: 'DELETE',
    })
  }

  async getMyOrganizations(): Promise<Organization[]> {
    return this.request('/organizations/my/list')
  }

  // Stripe Connect
  async startStripeConnect(orgId: string): Promise<{ url: string }> {
    return this.request(`/organizations/${orgId}/stripe-connect`, {
      method: 'POST',
    })
  }

  async getStripeConnectStatus(orgId: string): Promise<{
    accountId: string | null
    onboardingComplete: boolean
    chargesEnabled: boolean
    payoutsEnabled: boolean
    detailsSubmitted: boolean
    requirements?: {
      currentlyDue: string[]
      eventuallyDue: string[]
      pastDue: string[]
    }
  }> {
    return this.request(`/organizations/${orgId}/stripe-status`)
  }

  async getStripeDashboardLink(orgId: string): Promise<{ url: string }> {
    return this.request(`/organizations/${orgId}/stripe-dashboard`)
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

  async publishEvent(id: string): Promise<{
    success: boolean
    eventName: string
    message: string
    feeInfo: {
      feePerItem: number
      description: string
    }
  }> {
    return this.request(`/events/${id}/publish`, {
      method: 'POST',
    })
  }

  async cancelEvent(id: string): Promise<{
    cancelled: boolean
    message: string
  }> {
    return this.request(`/events/${id}/cancel`, {
      method: 'POST',
    })
  }

  async uploadEventCoverImage(
    eventId: string,
    file: File
  ): Promise<{ coverImageUrl: string }> {
    const formData = new FormData()
    formData.append('coverImage', file)

    const token = this.getAccessToken ? await this.getAccessToken() : null
    const headers: HeadersInit = {}
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }

    const response = await fetch(
      `${API_BASE_URL}/events/${eventId}/cover-image`,
      {
        method: 'POST',
        headers,
        body: formData,
      }
    )

    if (!response.ok) {
      let errorMessage = `Cover image upload failed (${response.status})`
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

  async deleteEventCoverImage(eventId: string): Promise<void> {
    return this.request(`/events/${eventId}/cover-image`, {
      method: 'DELETE',
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

  async getPricingInfo(): Promise<{ feePerItem: number; description: string }> {
    return this.request('/events/pricing/info')
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
    const response = await this.request<{ data: EventItem[] }>(`/events/${eventId}/items${query ? `?${query}` : ''}`)
    return response.data
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
    // Self-managed payment info
    paymentMode: 'integrated' | 'self_managed'
    paymentInstructions?: string
    paymentLink?: string
    paymentQrCodeUrl?: string
    paymentDueDays?: number
    organizationName?: string
    // Item-level payment/fulfillment tracking
    paymentStatus: 'pending' | 'paid' | 'payment_issue' | 'waived' | 'refunded'
    fulfillmentStatus: 'pending' | 'processing' | 'ready_for_pickup' | 'shipped' | 'out_for_delivery' | 'delivered' | 'picked_up' | 'issue'
    fulfillmentType?: 'shipping' | 'pickup' | 'digital'
    trackingNumber?: string
    trackingCarrier?: string
    trackingUrl?: string
    pickupReadyAt?: string
    // Event-level pickup info
    pickupInstructions?: string
    pickupLocation?: string
    pickupAddress?: {
      line1: string
      city: string
      state: string
    }
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

  // User Event Bids (across all events)
  async getAllMyBids(): Promise<{
    id: string
    amount: number
    isWinning: boolean
    createdAt: string
    item: {
      id: string
      title: string
      currentBid: number | null
      status: string
      imageUrl: string | null
    }
    event: {
      id: string
      name: string
      slug: string
      status: string
      endTime: string
      auctionType: string
    }
  }[]> {
    return this.request('/users/me/event-bids')
  }

  // User Submitted Items (across all events)
  async getMySubmittedItems(): Promise<{
    id: string
    title: string
    description: string | null
    condition: string | null
    startingPrice: number | null
    buyNowPrice: number | null
    currentBid: number | null
    bidCount: number
    submissionStatus: string
    rejectionReason: string | null
    allowResubmit: boolean
    status: string
    imageUrl: string | null
    createdAt: string
    event: {
      id: string
      name: string
      slug: string
      status: string
      endTime: string
    }
  }[]> {
    return this.request('/users/me/submitted-items')
  }

  // =====================================================
  // Tax / Compliance
  // =====================================================

  async getTaxStatus(): Promise<{
    status: 'not_submitted' | 'pending' | 'verified' | 'expired'
    submittedAt?: string
    tinLastFour?: string
    tinType?: 'ssn' | 'ein'
    requiresUpdate: boolean
  }> {
    return this.request('/tax/status')
  }

  async getTaxInfo(): Promise<{
    submitted: boolean
    taxInfo?: {
      id: string
      taxFormType: string
      legalName: string
      businessName?: string
      taxClassification: string
      tinType: 'ssn' | 'ein'
      tinLastFour: string
      address: {
        line1?: string
        line2?: string
        city?: string
        state?: string
        postalCode?: string
        country: string
      }
      status: string
      signatureDate: string
      verifiedAt?: string
    }
  }> {
    return this.request('/tax/info')
  }

  async getTaxRequirements(): Promise<{
    w9Required: boolean
    reason?: string
    currentYearEarnings: number
    threshold: number
  }> {
    return this.request('/tax/requirements')
  }

  async submitW9(data: {
    legalName: string
    businessName?: string
    taxClassification: string
    tinType: 'ssn' | 'ein'
    tin: string
    address: {
      line1: string
      line2?: string
      city: string
      state: string
      postalCode: string
    }
    certify: boolean
    signatureName: string
    organizationId?: string
  }): Promise<{
    success: boolean
    taxInfoId: string
    lastFour: string
    message: string
  }> {
    return this.request('/tax/w9', {
      method: 'POST',
      body: JSON.stringify({
        ...data,
        isUsPerson: true,
      }),
    })
  }

  // =====================================================
  // Feedback
  // =====================================================

  async submitFeedback(data: CreateFeedbackRequest): Promise<Feedback> {
    return this.request('/feedback', {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getMyFeedback(params?: {
    limit?: number
    offset?: number
    status?: FeedbackStatus
  }): Promise<{ data: Feedback[]; pagination: { limit: number; offset: number; total: number } }> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    if (params?.offset) searchParams.append('offset', params.offset.toString())
    if (params?.status) searchParams.append('status', params.status)
    const query = searchParams.toString()
    return this.request(`/feedback/my${query ? `?${query}` : ''}`)
  }

  async getFeedback(id: string): Promise<Feedback> {
    return this.request(`/feedback/${id}`)
  }

  async addFeedbackResponse(feedbackId: string, message: string): Promise<FeedbackResponse> {
    return this.request(`/feedback/${feedbackId}/responses`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  async voteFeedback(feedbackId: string): Promise<{ success: boolean; voteCount: number }> {
    return this.request(`/feedback/${feedbackId}/vote`, {
      method: 'POST',
    })
  }

  async unvoteFeedback(feedbackId: string): Promise<{ success: boolean; voteCount: number }> {
    return this.request(`/feedback/${feedbackId}/vote`, {
      method: 'DELETE',
    })
  }

  // Admin feedback endpoints
  async getAllFeedback(params?: {
    limit?: number
    offset?: number
    status?: FeedbackStatus
    type?: FeedbackType
    priority?: FeedbackPriority
    search?: string
  }): Promise<{ data: Feedback[]; pagination: { limit: number; offset: number; total: number } }> {
    const searchParams = new URLSearchParams()
    if (params?.limit) searchParams.append('limit', params.limit.toString())
    if (params?.offset) searchParams.append('offset', params.offset.toString())
    if (params?.status) searchParams.append('status', params.status)
    if (params?.type) searchParams.append('type', params.type)
    if (params?.priority) searchParams.append('priority', params.priority)
    if (params?.search) searchParams.append('search', params.search)
    const query = searchParams.toString()
    return this.request(`/feedback/admin/all${query ? `?${query}` : ''}`)
  }

  async updateFeedback(
    feedbackId: string,
    data: {
      status?: FeedbackStatus
      priority?: FeedbackPriority
      category?: string
      tags?: string
      resolutionNotes?: string
    }
  ): Promise<Feedback> {
    return this.request(`/feedback/admin/${feedbackId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async addInternalNote(feedbackId: string, message: string): Promise<FeedbackResponse> {
    return this.request(`/feedback/admin/${feedbackId}/internal-note`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    })
  }

  async getFeedbackStats(): Promise<FeedbackStats> {
    return this.request('/feedback/admin/stats')
  }

  // Admin management endpoints
  async checkPlatformAdminStatus(): Promise<{ isPlatformAdmin: boolean }> {
    return this.request('/admin/me')
  }

  async getPlatformAdmins(): Promise<{
    admins: Array<{
      id: string
      email: string
      displayName: string
      isPlatformAdmin: boolean
      createdAt: string
    }>
  }> {
    return this.request('/admin/users')
  }

  async searchUsers(query: string): Promise<{
    users: Array<{
      id: string
      email: string
      displayName: string
      isPlatformAdmin: boolean
    }>
  }> {
    return this.request(`/admin/users/search?q=${encodeURIComponent(query)}`)
  }

  async grantAdminAccess(
    userId: string,
    reason?: string
  ): Promise<{
    success: boolean
    message: string
    user: { id: string; email: string; displayName: string; isPlatformAdmin: boolean }
  }> {
    return this.request(`/admin/users/${userId}/grant`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  async revokeAdminAccess(
    userId: string,
    reason?: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/users/${userId}/revoke`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    })
  }

  async getAdminAuditLog(params?: { limit?: number; offset?: number }): Promise<{
    entries: Array<{
      id: string
      action: string
      targetUserId: string
      targetEmail: string
      performedByUserId: string
      performedByEmail: string
      reason: string | null
      createdAt: string
    }>
    pagination: { limit: number; offset: number; total: number }
  }> {
    const queryParams = new URLSearchParams()
    if (params?.limit) queryParams.set('limit', String(params.limit))
    if (params?.offset) queryParams.set('offset', String(params.offset))
    const queryString = queryParams.toString()
    return this.request(`/admin/audit-log${queryString ? `?${queryString}` : ''}`)
  }

  // =====================================================
  // Admin Tax / W-9 Endpoints
  // =====================================================

  async getAdminTaxStats(): Promise<{
    total: number
    pending: number
    verified: number
    invalid: number
    expired: number
  }> {
    return this.request('/admin/tax/stats')
  }

  async getAdminTaxSubmissions(params?: {
    limit?: number
    offset?: number
    status?: 'pending' | 'verified' | 'invalid' | 'expired'
    search?: string
  }): Promise<{
    submissions: Array<{
      id: string
      userId?: string
      organizationId?: string
      taxFormType: string
      legalName: string
      businessName?: string
      taxClassification: string
      tinType: 'ssn' | 'ein'
      tinLastFour: string
      address: {
        line1?: string
        line2?: string
        city?: string
        state?: string
        postalCode?: string
        country: string
      }
      status: 'pending' | 'verified' | 'invalid' | 'expired'
      signatureName: string
      signatureDate: string
      verifiedAt?: string
      verifiedBy?: string
      createdAt: string
      expiresAt?: string
    }>
    pagination: { limit: number; offset: number; total: number }
  }> {
    const queryParams = new URLSearchParams()
    if (params?.limit) queryParams.set('limit', String(params.limit))
    if (params?.offset) queryParams.set('offset', String(params.offset))
    if (params?.status) queryParams.set('status', params.status)
    if (params?.search) queryParams.set('search', params.search)
    const queryString = queryParams.toString()
    return this.request(`/admin/tax/all${queryString ? `?${queryString}` : ''}`)
  }

  async getPendingTaxSubmissions(params?: {
    limit?: number
    offset?: number
  }): Promise<{
    submissions: Array<{
      id: string
      userId?: string
      organizationId?: string
      taxFormType: string
      legalName: string
      businessName?: string
      taxClassification: string
      tinType: 'ssn' | 'ein'
      tinLastFour: string
      address: {
        line1?: string
        line2?: string
        city?: string
        state?: string
        postalCode?: string
        country: string
      }
      status: 'pending'
      signatureName: string
      signatureDate: string
      createdAt: string
    }>
    pagination: { limit: number; offset: number; total: number }
  }> {
    const queryParams = new URLSearchParams()
    if (params?.limit) queryParams.set('limit', String(params.limit))
    if (params?.offset) queryParams.set('offset', String(params.offset))
    const queryString = queryParams.toString()
    return this.request(`/admin/tax/pending${queryString ? `?${queryString}` : ''}`)
  }

  async verifyTaxSubmission(
    taxInfoId: string,
    status: 'verified' | 'invalid',
    notes?: string
  ): Promise<{ success: boolean; message: string }> {
    return this.request(`/admin/tax/${taxInfoId}/verify`, {
      method: 'POST',
      body: JSON.stringify({ status, notes }),
    })
  }

  // =====================================================
  // Self-Managed Payment & Fulfillment Management
  // =====================================================

  async updateItemPaymentStatus(
    itemId: string,
    data: {
      paymentStatus: 'pending' | 'paid' | 'payment_issue' | 'waived' | 'refunded'
      paymentMethodUsed?: string
      paymentNotes?: string
    }
  ): Promise<EventItem> {
    return this.request(`/event-items/${itemId}/payment-status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async updateItemFulfillmentStatus(
    itemId: string,
    data: {
      fulfillmentStatus: 'pending' | 'processing' | 'ready_for_pickup' | 'shipped' | 'out_for_delivery' | 'delivered' | 'picked_up' | 'issue'
      fulfillmentType?: 'shipping' | 'pickup' | 'digital'
      trackingNumber?: string
      trackingCarrier?: string
      trackingUrl?: string
      estimatedDelivery?: string
      digitalDeliveryInfo?: string
      fulfillmentNotes?: string
    }
  ): Promise<EventItem> {
    return this.request(`/event-items/${itemId}/fulfillment-status`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async getEventPaymentSummary(eventId: string): Promise<{
    totalItems: number
    pending: number
    paid: number
    paymentIssue: number
    waived: number
    refunded: number
    totalAmount: number
    paidAmount: number
  }> {
    return this.request(`/event-items/events/${eventId}/payment-summary`)
  }

  async getEventFulfillmentSummary(eventId: string): Promise<{
    totalItems: number
    pending: number
    processing: number
    readyForPickup: number
    shipped: number
    outForDelivery: number
    delivered: number
    pickedUp: number
    issue: number
  }> {
    return this.request(`/event-items/events/${eventId}/fulfillment-summary`)
  }

  async bulkUpdatePaymentStatus(
    eventId: string,
    data: {
      itemIds: string[]
      paymentStatus: 'pending' | 'paid' | 'payment_issue' | 'waived' | 'refunded'
      paymentMethodUsed?: string
      paymentNotes?: string
    }
  ): Promise<{ success: boolean; updatedCount: number }> {
    return this.request(`/event-items/events/${eventId}/bulk-payment-status`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async bulkUpdateFulfillmentStatus(
    eventId: string,
    data: {
      itemIds: string[]
      fulfillmentStatus: 'pending' | 'processing' | 'ready_for_pickup' | 'shipped' | 'out_for_delivery' | 'delivered' | 'picked_up' | 'issue'
      fulfillmentType?: 'shipping' | 'pickup' | 'digital'
      fulfillmentNotes?: string
    }
  ): Promise<{ success: boolean; updatedCount: number }> {
    return this.request(`/event-items/events/${eventId}/bulk-fulfillment-status`, {
      method: 'POST',
      body: JSON.stringify(data),
    })
  }

  async getEventWonItems(eventId: string): Promise<EventItem[]> {
    return this.request(`/event-items/events/${eventId}/won-items`)
  }

  // =====================================================
  // Feature Flags (Admin)
  // =====================================================

  async getFeatureFlags(): Promise<{
    flags: Array<{
      id: string
      flagKey: string
      flagValue: boolean
      description: string | null
      updatedBy: string | null
      createdAt: string
      updatedAt: string
    }>
  }> {
    return this.request('/admin/feature-flags')
  }

  async updateFeatureFlag(
    flagKey: string,
    data: { value: boolean; reason?: string }
  ): Promise<{
    id: string
    flagKey: string
    flagValue: boolean
    description: string | null
    updatedBy: string | null
    createdAt: string
    updatedAt: string
  }> {
    return this.request(`/admin/feature-flags/${flagKey}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    })
  }

  async getFeatureFlagAuditLog(params?: {
    flagKey?: string
    limit?: number
  }): Promise<{
    entries: Array<{
      id: string
      flagKey: string
      oldValue: boolean | null
      newValue: boolean
      changedByUserId: string
      changedByEmail: string
      reason: string | null
      createdAt: string
    }>
  }> {
    const queryParams = new URLSearchParams()
    if (params?.flagKey) queryParams.set('flagKey', params.flagKey)
    if (params?.limit) queryParams.set('limit', String(params.limit))
    const queryString = queryParams.toString()
    return this.request(`/admin/feature-flags/audit-log${queryString ? `?${queryString}` : ''}`)
  }

  async getPublicFeatureFlags(): Promise<{
    integrated_payments_enabled: boolean
    self_managed_payments_enabled: boolean
    free_mode_enabled: boolean
    silent_auctions_enabled: boolean
    standard_auctions_enabled: boolean
  }> {
    return this.request('/admin/feature-flags/public')
  }
}

export const apiClient = new ApiClient()
