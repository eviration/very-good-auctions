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
  type: NotificationType
  title: string
  message: string
  eventId: string | null
  itemId: string | null
  readAt: string | null
  createdAt: string
}

export type NotificationType =
  | 'item_approved'
  | 'item_rejected'
  | 'resubmit_requested'
  | 'event_live'
  | 'outbid'
  | 'auction_won'
  | 'auction_lost'
  | 'item_removed'
  | 'bid_cancelled'
  // Self-managed payment notification types
  | 'payment_reminder'
  | 'payment_confirmed'
  | 'item_shipped'
  | 'ready_for_pickup'
  | 'item_delivered'
  | 'digital_delivered'

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
  eventCount?: number
  totalRaised?: number
  contactEmail?: string
  contactPhone?: string
  taxId?: string
  address?: Address
  stripeOnboardingComplete?: boolean
  stripeChargesEnabled?: boolean
  stripePayoutsEnabled?: boolean
  membership?: OrganizationMembership
  userRole?: OrganizationRole
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

// Event types
export interface AuctionEvent {
  id: string
  name: string
  slug: string
  description?: string
  coverImageUrl?: string
  organization?: {
    id: string
    name: string
    slug: string
  }
  owner?: {
    id: string
    name: string
  }
  startTime: string
  endTime: string
  submissionDeadline?: string
  auctionType: 'standard' | 'silent'
  isMultiItem: boolean
  incrementType: 'fixed' | 'percent'
  incrementValue: number
  buyNowEnabled: boolean
  accessCode?: string
  tier: EventTier
  maxItems: number
  status: EventStatus
  itemCount: number
  totalBids: number
  totalRaised: number
  isAdmin?: boolean
  createdAt: string
  // Payment mode settings (self-managed payments)
  paymentMode?: PaymentMode
  paymentInstructions?: string
  paymentLink?: string
  paymentQrCodeUrl?: string
  // Fulfillment settings
  fulfillmentType?: FulfillmentType
  pickupInstructions?: string
  pickupLocation?: string
  pickupAddressLine1?: string
  pickupAddressLine2?: string
  pickupCity?: string
  pickupState?: string
  pickupPostalCode?: string
  pickupDates?: string
  // Payment reminder settings
  paymentDueDays?: number
  sendPaymentReminders?: boolean
}

export type EventTier = 'small' | 'medium' | 'large' | 'unlimited'

export type EventStatus = 'draft' | 'scheduled' | 'active' | 'ended' | 'cancelled'

export type PaymentMode = 'integrated' | 'self_managed'
export type FulfillmentType = 'shipping' | 'pickup' | 'both' | 'digital'
export type ItemPaymentStatus = 'pending' | 'paid' | 'payment_issue' | 'waived' | 'refunded'
export type ItemFulfillmentStatus = 'pending' | 'processing' | 'ready_for_pickup' | 'shipped' | 'out_for_delivery' | 'delivered' | 'picked_up' | 'issue'

export interface CreateEventRequest {
  name: string
  description?: string
  organizationId: string // Required - all auctions must belong to an organization
  startTime: string
  endTime: string
  submissionDeadline?: string
  auctionType?: 'standard' | 'silent'
  isMultiItem?: boolean
  incrementType?: 'fixed' | 'percent'
  incrementValue?: number
  buyNowEnabled?: boolean
  // Payment mode settings
  paymentMode?: PaymentMode
  paymentInstructions?: string
  paymentLink?: string
  paymentQrCodeUrl?: string
  // Fulfillment settings
  fulfillmentType?: FulfillmentType
  pickupInstructions?: string
  pickupLocation?: string
  pickupAddressLine1?: string
  pickupAddressLine2?: string
  pickupCity?: string
  pickupState?: string
  pickupPostalCode?: string
  pickupDates?: string
  // Payment reminder settings
  paymentDueDays?: number
  sendPaymentReminders?: boolean
}

export interface UpdateEventRequest {
  name?: string
  description?: string
  startTime?: string
  endTime?: string
  submissionDeadline?: string
  incrementType?: 'fixed' | 'percent'
  incrementValue?: number
  buyNowEnabled?: boolean
  // Payment mode settings
  paymentMode?: PaymentMode
  paymentInstructions?: string
  paymentLink?: string
  paymentQrCodeUrl?: string
  // Fulfillment settings
  fulfillmentType?: FulfillmentType
  pickupInstructions?: string
  pickupLocation?: string
  pickupAddressLine1?: string
  pickupAddressLine2?: string
  pickupCity?: string
  pickupState?: string
  pickupPostalCode?: string
  pickupDates?: string
  // Payment reminder settings
  paymentDueDays?: number
  sendPaymentReminders?: boolean
}

// Event Item types
export interface EventItem {
  id: string
  eventId: string
  title: string
  description?: string
  condition?: string
  startingPrice?: number
  buyNowPrice?: number
  currentBid?: number
  bidCount: number
  auctionType?: 'standard' | 'silent'
  incrementType?: 'fixed' | 'percent'
  incrementValue?: number
  eventStatus?: EventStatus
  submissionStatus: ItemSubmissionStatus
  status: ItemStatus
  submitter?: {
    id: string
    name: string
    email?: string
  }
  submitterName?: string
  rejectionReason?: string
  allowResubmit?: boolean
  images: EventItemImage[]
  isAdmin?: boolean
  isSubmitter?: boolean
  createdAt: string
  // Winner info
  winnerId?: string
  winnerName?: string
  winnerEmail?: string
  winningBid?: number
  // Payment tracking (for self-managed payments)
  paymentStatus?: ItemPaymentStatus
  paymentConfirmedAt?: string
  paymentConfirmedBy?: string
  paymentMethodUsed?: string
  paymentNotes?: string
  // Fulfillment tracking
  fulfillmentStatus?: ItemFulfillmentStatus
  fulfillmentType?: 'shipping' | 'pickup' | 'digital'
  trackingNumber?: string
  trackingCarrier?: string
  trackingUrl?: string
  shippedAt?: string
  estimatedDelivery?: string
  pickupReadyAt?: string
  pickupCompletedAt?: string
  pickupCompletedBy?: string
  digitalDeliveryInfo?: string
  digitalDeliveredAt?: string
  fulfillmentNotes?: string
  fulfilledAt?: string
  fulfilledBy?: string
}

export type ItemSubmissionStatus = 'pending' | 'approved' | 'rejected' | 'resubmit_requested'

export type ItemStatus = 'pending' | 'active' | 'sold' | 'won' | 'unsold' | 'removed'

export interface EventItemImage {
  id: string
  blobUrl: string
  displayOrder: number
  isPrimary: boolean
}

export interface SubmitItemRequest {
  title: string
  description?: string
  condition?: string
  startingPrice?: number
  buyNowPrice?: number
  accessCode: string
}

export interface UpdateItemRequest {
  title?: string
  description?: string
  condition?: string
  startingPrice?: number
  buyNowPrice?: number
}

// Event Bid types
export interface EventItemBid {
  id: string
  itemId?: string
  amount: number
  bidderName?: string
  isWinning: boolean
  createdAt: string
  nextMinBid?: number
}

export interface SilentBidStatus {
  hasBid: boolean
  id?: string
  amount?: number
  initialAmount?: number
  increaseCount?: number
  rank?: number
  totalBidders?: number
  notifyOnOutbid?: boolean
  createdAt?: string
  lastIncreasedAt?: string
}

export interface CurrentBidInfo {
  currentBid: number | null
  startingPrice: number
  minBid: number
  bidCount: number
  incrementType: 'fixed' | 'percent'
  incrementValue: number
  buyNowPrice: number | null
}

// Pricing tiers
export interface PricingTiers {
  small: { fee: number; maxItems: number }
  medium: { fee: number; maxItems: number }
  large: { fee: number; maxItems: number }
  unlimited: { fee: number; maxItems: number | null }
}

// Feedback types
export type FeedbackType = 'bug' | 'feature' | 'improvement' | 'question' | 'other'

export type FeedbackPriority = 'low' | 'medium' | 'high' | 'critical'

export type FeedbackStatus =
  | 'new'
  | 'under_review'
  | 'planned'
  | 'in_progress'
  | 'completed'
  | 'wont_fix'
  | 'duplicate'

export interface Feedback {
  id: string
  user_id: string
  user_email: string
  user_name: string
  organization_id?: string
  event_id?: string
  feedback_type: FeedbackType
  title: string
  description: string
  priority: FeedbackPriority
  category?: string
  tags?: string
  status: FeedbackStatus
  assigned_to?: string
  resolution_notes?: string
  resolved_at?: string
  resolved_by?: string
  vote_count?: number
  has_voted?: number
  response_count?: number
  organization_name?: string
  event_name?: string
  created_at: string
  updated_at: string
  responses?: FeedbackResponse[]
}

export interface FeedbackResponse {
  id: string
  feedback_id: string
  responder_id: string
  responder_name: string
  is_admin: boolean
  message: string
  is_internal?: boolean
  created_at: string
  updated_at?: string
}

export interface CreateFeedbackRequest {
  feedbackType: FeedbackType
  title: string
  description: string
  organizationId?: string
  eventId?: string
  category?: string
}

export interface FeedbackStats {
  total: number
  new_count: number
  under_review_count: number
  planned_count: number
  in_progress_count: number
  completed_count: number
  bug_count: number
  feature_count: number
  improvement_count: number
  critical_count: number
  high_priority_count: number
}
