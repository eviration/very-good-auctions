// User types
export interface User {
  id: string
  email: string
  name: string
  avatarUrl?: string
  phone?: string
  address?: Address
  stripeCustomerId?: string
  createdAt?: string
}

export interface Address {
  line1: string
  line2?: string
  city: string
  state: string
  postalCode: string
  country: string
}

// Auction types
export interface Auction {
  id: string
  sellerId: string
  seller?: User
  categoryId: number
  category?: Category
  title: string
  description: string
  condition: AuctionCondition
  startingPrice: number
  reservePrice?: number
  currentBid: number
  bidCount: number
  startTime: string
  endTime: string
  status: AuctionStatus
  shippingInfo: string
  images: AuctionImage[]
  createdAt: string
  updatedAt: string
}

export interface AuctionImage {
  id: string
  auctionId: string
  blobUrl: string
  displayOrder: number
  isPrimary: boolean
}

export interface Category {
  id: number
  name: string
  slug: string
  description?: string
  icon?: string
}

export type AuctionCondition = 
  | 'new'
  | 'like-new'
  | 'excellent'
  | 'very-good'
  | 'good'
  | 'fair'
  | 'poor'

export type AuctionStatus = 
  | 'draft'
  | 'active'
  | 'ended'
  | 'cancelled'
  | 'sold'

// Bid types
export interface Bid {
  id: string
  auctionId: string
  auction?: Auction
  bidderId: string
  bidder?: User
  amount: number
  maxAmount?: number
  isWinning: boolean
  createdAt: string
}

export interface PlaceBidRequest {
  amount: number
  maxAmount?: number
}

// Payment types
export interface Payment {
  id: string
  auctionId: string
  payerId: string
  amount: number
  currency: string
  stripePaymentIntentId?: string
  stripeChargeId?: string
  paymentMethod: PaymentMethod
  status: PaymentStatus
  createdAt: string
  updatedAt: string
}

export type PaymentMethod = 
  | 'card'
  | 'paypal'
  | 'apple_pay'
  | 'google_pay'

export type PaymentStatus = 
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'refunded'

export interface CreatePaymentIntentRequest {
  auctionId: string
  amount: number
}

export interface CreatePaymentIntentResponse {
  clientSecret: string
  paymentIntentId: string
}

// Notification types
export interface Notification {
  id: string
  userId: string
  type: NotificationType
  title: string
  message: string
  data?: Record<string, unknown>
  isRead: boolean
  createdAt: string
}

export type NotificationType = 
  | 'outbid'
  | 'auction_won'
  | 'auction_ending'
  | 'payment_received'
  | 'bid_placed'

// API response types
export interface PaginatedResponse<T> {
  data: T[]
  pagination: {
    page: number
    pageSize: number
    totalItems: number
    totalPages: number
  }
}

export interface ApiError {
  code: string
  message: string
  details?: Record<string, string[]>
}

// SignalR event types
export interface BidUpdateEvent {
  auctionId: string
  currentBid: number
  bidCount: number
  bidderId: string
  bidderName: string
}

export interface AuctionEndedEvent {
  auctionId: string
  winnerId?: string
  winnerName?: string
  finalBid: number
}

// Organization types
export interface Organization {
  id: string
  name: string
  slug: string
  description?: string
  logoUrl?: string
  websiteUrl?: string
  orgType: OrganizationType
  status: OrganizationStatus
  isFeatured: boolean
  memberCount?: number
  contactEmail?: string
  contactPhone?: string
  taxId?: string
  address?: Address
  stripeOnboardingComplete?: boolean
  stripeChargesEnabled?: boolean
  stripePayoutsEnabled?: boolean
  membership?: OrganizationMembership
  createdAt: string
}

export type OrganizationType =
  | 'nonprofit'
  | 'school'
  | 'religious'
  | 'club'
  | 'company'
  | 'other'

export type OrganizationStatus =
  | 'pending'
  | 'unverified'
  | 'verified'
  | 'suspended'

export interface OrganizationMembership {
  role: OrganizationRole
  canCreateAuctions: boolean
  canManageMembers: boolean
  canViewFinancials: boolean
}

export type OrganizationRole = 'owner' | 'admin' | 'member'

export interface OrganizationMember {
  id: string
  userId: string
  email: string
  displayName: string
  role: OrganizationRole
  canCreateAuctions: boolean
  canManageMembers: boolean
  canViewFinancials: boolean
  joinedAt: string
}

export interface OrganizationInvitation {
  id: string
  email: string
  role: OrganizationRole
  token?: string
  organization?: {
    name: string
    slug: string
    logoUrl?: string
  }
  inviterName?: string
  status: 'pending' | 'accepted' | 'declined' | 'expired'
  expiresAt: string
  createdAt: string
}

export interface CreateOrganizationRequest {
  name: string
  description?: string
  orgType: OrganizationType
  contactEmail: string
  contactPhone?: string
  websiteUrl?: string
  taxId?: string
  address?: Address
}

export interface UpdateOrganizationRequest {
  name?: string
  description?: string
  contactEmail?: string
  contactPhone?: string
  websiteUrl?: string
  address?: Address
}
