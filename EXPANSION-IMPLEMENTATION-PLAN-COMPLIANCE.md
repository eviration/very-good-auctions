# Very Good Auctions - Expansion Implementation Plan

## Overview

This document outlines the complete implementation plan for expanding Very Good Auctions to support:

1. **Organizations** - Verified entities that can run fundraiser events
2. **Private Auctions** - Invite-only auctions with access codes
3. **Silent Auctions** - Hidden bids revealed at end
4. **Individual Listings** - Single-item auctions by any user
5. **Flat Fee Pricing** - Transparent, low-cost pricing model

---

## Phase 1: Database Schema

### 1.1 Organizations

```sql
-- Organizations table
CREATE TABLE organizations (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    
    -- Basic info
    name NVARCHAR(255) NOT NULL,
    slug NVARCHAR(100) NOT NULL UNIQUE,
    description NVARCHAR(MAX),
    logo_url NVARCHAR(500),
    website_url NVARCHAR(500),
    
    -- Contact
    contact_email NVARCHAR(255) NOT NULL,
    contact_phone NVARCHAR(50),
    
    -- Address
    address_line1 NVARCHAR(255),
    address_line2 NVARCHAR(255),
    city NVARCHAR(100),
    state NVARCHAR(50),
    postal_code NVARCHAR(20),
    country NVARCHAR(3) DEFAULT 'USA',
    
    -- Organization type
    org_type NVARCHAR(50) NOT NULL CHECK (org_type IN (
        'nonprofit',
        'school',
        'religious',
        'club',
        'company',
        'other'
    )),
    tax_id NVARCHAR(50),
    
    -- Verification status (via Stripe Connect)
    status NVARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'unverified',
        'verified',
        'suspended'
    )),
    
    -- Stripe Connect
    stripe_account_id NVARCHAR(255),
    stripe_onboarding_complete BIT DEFAULT 0,
    stripe_charges_enabled BIT DEFAULT 0,
    stripe_payouts_enabled BIT DEFAULT 0,
    
    -- Platform settings
    platform_fee_percent DECIMAL(5,2) DEFAULT 5.00,
    is_featured BIT DEFAULT 0,
    
    -- Subscription (future use)
    subscription_tier NVARCHAR(50) DEFAULT 'pay_per_event' CHECK (subscription_tier IN (
        'pay_per_event',
        'monthly'
    )),
    
    -- Metadata
    created_by NVARCHAR(128) NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE()
);

CREATE INDEX idx_org_slug ON organizations(slug);
CREATE INDEX idx_org_status ON organizations(status);
```

### 1.2 Organization Members

```sql
CREATE TABLE organization_members (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    organization_id UNIQUEIDENTIFIER NOT NULL,
    user_id NVARCHAR(128) NOT NULL,
    
    role NVARCHAR(50) NOT NULL CHECK (role IN (
        'owner',
        'admin',
        'member'
    )),
    
    -- Custom permissions
    can_create_auctions BIT DEFAULT 0,
    can_manage_members BIT DEFAULT 0,
    can_view_financials BIT DEFAULT 0,
    
    invited_by NVARCHAR(128),
    joined_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON organization_members(user_id);
CREATE INDEX idx_org_members_org ON organization_members(organization_id);
```

### 1.3 Organization Invitations

```sql
CREATE TABLE organization_invitations (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    organization_id UNIQUEIDENTIFIER NOT NULL,
    
    email NVARCHAR(255) NOT NULL,
    role NVARCHAR(50) NOT NULL DEFAULT 'member',
    
    invited_by NVARCHAR(128) NOT NULL,
    token NVARCHAR(100) NOT NULL UNIQUE,
    
    status NVARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',
        'accepted',
        'declined',
        'expired'
    )),
    
    expires_at DATETIME2 NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX idx_org_invitations_email ON organization_invitations(email);
CREATE INDEX idx_org_invitations_token ON organization_invitations(token);
```

### 1.4 Organization Refunds

```sql
CREATE TABLE organization_refunds (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    organization_id UNIQUEIDENTIFIER NOT NULL,
    fee_id UNIQUEIDENTIFIER NOT NULL,
    
    amount DECIMAL(10,2) NOT NULL,
    reason NVARCHAR(255),
    
    refund_year INT NOT NULL,
    
    processed_at DATETIME2 DEFAULT GETUTCDATE(),
    processed_by NVARCHAR(128),
    
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (fee_id) REFERENCES platform_fees(id)
);

CREATE INDEX idx_org_refunds_year ON organization_refunds(organization_id, refund_year);
```

### 1.5 Platform Fees

```sql
CREATE TABLE platform_fees (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    
    -- Who paid
    user_id NVARCHAR(128),
    organization_id UNIQUEIDENTIFIER,
    
    -- What they paid for
    auction_id UNIQUEIDENTIFIER,
    event_id UNIQUEIDENTIFIER,
    
    fee_type NVARCHAR(50) NOT NULL CHECK (fee_type IN (
        'individual_listing',
        'seller_pass',
        'org_small',
        'org_medium',
        'org_large',
        'org_unlimited'
    )),
    
    amount DECIMAL(10,2) NOT NULL,
    
    -- Payment info
    stripe_payment_intent_id NVARCHAR(255),
    status NVARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',
        'paid',
        'refunded',
        'waived'
    )),
    
    -- Refund eligibility
    refund_eligible_until DATETIME2,
    refunded_at DATETIME2,
    refund_reason NVARCHAR(255),
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (auction_id) REFERENCES auctions(id)
);
```

### 1.6 Seller Passes (Individual Sellers)

```sql
CREATE TABLE seller_passes (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id NVARCHAR(128) NOT NULL,
    
    starts_at DATETIME2 NOT NULL DEFAULT GETUTCDATE(),
    expires_at DATETIME2 NOT NULL,
    
    fee_id UNIQUEIDENTIFIER NOT NULL,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (fee_id) REFERENCES platform_fees(id)
);
```

### 1.7 Update Users Table

```sql
ALTER TABLE users ADD
    is_seller BIT DEFAULT 0,
    paypal_email NVARCHAR(255),
    paypal_verified_at DATETIME2,
    
    total_listings INT DEFAULT 0,
    total_sales INT DEFAULT 0,
    total_earned DECIMAL(12,2) DEFAULT 0,
    
    seller_pass_expires_at DATETIME2;
```

### 1.8 Individual Payouts

```sql
CREATE TABLE individual_payouts (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id NVARCHAR(128) NOT NULL,
    auction_id UNIQUEIDENTIFIER NOT NULL,
    
    -- Amount breakdown
    sale_amount DECIMAL(10,2) NOT NULL,
    stripe_fee DECIMAL(10,2) NOT NULL,
    platform_fee DECIMAL(10,2) NOT NULL,
    payout_amount DECIMAL(10,2) NOT NULL,
    
    -- PayPal
    paypal_email NVARCHAR(255) NOT NULL,
    paypal_batch_id NVARCHAR(255),
    paypal_transaction_id NVARCHAR(255),
    
    -- Status
    status NVARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',
        'processing',
        'completed',
        'failed',
        'unclaimed'
    )),
    
    -- Timing
    eligible_at DATETIME2 NOT NULL,
    processed_at DATETIME2,
    completed_at DATETIME2,
    
    error_message NVARCHAR(500),
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (auction_id) REFERENCES auctions(id)
);

CREATE INDEX idx_payouts_user ON individual_payouts(user_id);
CREATE INDEX idx_payouts_status ON individual_payouts(status, eligible_at);
```

### 1.9 Update Auctions Table (for Individual Sellers)

```sql
ALTER TABLE auctions ADD
    -- Auction type
    auction_type NVARCHAR(20) DEFAULT 'standard' CHECK (auction_type IN (
        'standard',
        'silent'
    )),
    
    -- Privacy settings
    visibility NVARCHAR(20) DEFAULT 'public' CHECK (visibility IN (
        'public',
        'private'
    )),
    access_code NVARCHAR(6),
    access_code_expires_at DATETIME2,
    max_participants INT DEFAULT 25,
    allow_participant_sharing BIT DEFAULT 0,
    require_email_verification BIT DEFAULT 1,
    short_slug NVARCHAR(10) UNIQUE,
    
    -- Silent auction settings
    silent_min_increment DECIMAL(10,2),
    
    -- Buy now option
    buy_now_enabled BIT DEFAULT 0,
    buy_now_price DECIMAL(10,2),
    buy_now_purchased_by NVARCHAR(128),
    buy_now_purchased_at DATETIME2;

CREATE INDEX idx_auction_visibility ON auctions(visibility);
CREATE INDEX idx_auction_access_code ON auctions(access_code);
CREATE INDEX idx_auction_short_slug ON auctions(short_slug);
CREATE INDEX idx_auctions_type ON auctions(auction_type);
```

### 1.10 Auction Participants (Private Auctions)

```sql
CREATE TABLE auction_participants (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    auction_id UNIQUEIDENTIFIER NOT NULL,
    user_id NVARCHAR(128) NOT NULL,
    
    granted_via NVARCHAR(50) NOT NULL CHECK (granted_via IN (
        'code',
        'direct',
        'shared_link'
    )),
    granted_by NVARCHAR(128),
    
    status NVARCHAR(50) DEFAULT 'active' CHECK (status IN (
        'active',
        'removed'
    )),
    removed_reason NVARCHAR(255),
    
    joined_at DATETIME2 DEFAULT GETUTCDATE(),
    removed_at DATETIME2,
    
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (auction_id, user_id)
);

CREATE INDEX idx_participants_auction ON auction_participants(auction_id);
CREATE INDEX idx_participants_user ON auction_participants(user_id);
```

### 1.11 Access Code Attempts (Rate Limiting)

```sql
CREATE TABLE access_code_attempts (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    auction_id UNIQUEIDENTIFIER NOT NULL,
    
    ip_address NVARCHAR(45),
    user_id NVARCHAR(128),
    
    success BIT NOT NULL,
    attempted_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE
);

CREATE INDEX idx_code_attempts_auction ON access_code_attempts(auction_id, attempted_at);
```

### 1.12 Silent Bids

```sql
CREATE TABLE silent_bids (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    auction_id UNIQUEIDENTIFIER NOT NULL,
    bidder_id NVARCHAR(128) NOT NULL,
    
    amount DECIMAL(10,2) NOT NULL,
    initial_amount DECIMAL(10,2) NOT NULL,
    increase_count INT DEFAULT 0,
    last_increased_at DATETIME2,
    
    is_winner BIT DEFAULT 0,
    winner_notified_at DATETIME2,
    
    notify_on_outbid BIT DEFAULT 1,
    last_outbid_notification_at DATETIME2,
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (auction_id) REFERENCES auctions(id) ON DELETE CASCADE,
    FOREIGN KEY (bidder_id) REFERENCES users(id),
    UNIQUE (auction_id, bidder_id)
);

CREATE INDEX idx_silent_bids_auction ON silent_bids(auction_id);
CREATE INDEX idx_silent_bids_bidder ON silent_bids(bidder_id);
CREATE INDEX idx_silent_bids_winner ON silent_bids(auction_id, is_winner);
CREATE INDEX idx_silent_bids_ranking ON silent_bids(auction_id, amount DESC, created_at ASC);
```

### 1.13 Silent Bid History

```sql
CREATE TABLE silent_bid_history (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    silent_bid_id UNIQUEIDENTIFIER NOT NULL,
    
    previous_amount DECIMAL(10,2) NOT NULL,
    new_amount DECIMAL(10,2) NOT NULL,
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (silent_bid_id) REFERENCES silent_bids(id) ON DELETE CASCADE
);
```

### 1.14 Security Alerts

```sql
CREATE TABLE security_alerts (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    
    alert_type NVARCHAR(50) NOT NULL CHECK (alert_type IN (
        'rapid_joins',
        'code_brute_force',
        'participant_removed',
        'code_regenerated'
    )),
    
    auction_id UNIQUEIDENTIFIER,
    organization_id UNIQUEIDENTIFIER,
    user_id NVARCHAR(128),
    
    details NVARCHAR(MAX),
    
    acknowledged BIT DEFAULT 0,
    acknowledged_by NVARCHAR(128),
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (auction_id) REFERENCES auctions(id),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX idx_security_alerts_auction ON security_alerts(auction_id, created_at);
```

### 1.15 Auction Events (Organization Events Container)

```sql
CREATE TABLE auction_events (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    organization_id UNIQUEIDENTIFIER NOT NULL,
    
    -- Basic info
    name NVARCHAR(255) NOT NULL,
    slug NVARCHAR(100) NOT NULL,
    description NVARCHAR(MAX),
    cover_image_url NVARCHAR(500),
    
    -- Timing
    start_time DATETIME2 NOT NULL,
    end_time DATETIME2 NOT NULL,
    
    -- Settings
    auction_type NVARCHAR(20) DEFAULT 'standard' CHECK (auction_type IN (
        'standard',
        'silent'
    )),
    visibility NVARCHAR(20) DEFAULT 'public' CHECK (visibility IN (
        'public',
        'private'
    )),
    
    -- Private event settings
    access_code NVARCHAR(6),
    access_code_expires_at DATETIME2,
    max_participants INT,
    allow_participant_sharing BIT DEFAULT 0,
    
    -- Silent auction settings
    silent_min_increment DECIMAL(10,2) DEFAULT 5.00,
    buy_now_enabled BIT DEFAULT 0,
    
    -- Tier & limits
    tier NVARCHAR(20) NOT NULL CHECK (tier IN (
        'small',
        'medium',
        'large',
        'unlimited'
    )),
    max_items INT NOT NULL,
    
    -- Status
    status NVARCHAR(50) DEFAULT 'draft' CHECK (status IN (
        'draft',
        'scheduled',
        'active',
        'ended',
        'cancelled'
    )),
    
    -- Payment
    fee_id UNIQUEIDENTIFIER,
    
    -- Stats
    item_count INT DEFAULT 0,
    total_bids INT DEFAULT 0,
    total_raised DECIMAL(12,2) DEFAULT 0,
    
    -- Metadata
    created_by NVARCHAR(128) NOT NULL,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    FOREIGN KEY (fee_id) REFERENCES platform_fees(id),
    UNIQUE (organization_id, slug)
);

CREATE INDEX idx_events_org ON auction_events(organization_id);
CREATE INDEX idx_events_status ON auction_events(status, start_time);
CREATE INDEX idx_events_slug ON auction_events(organization_id, slug);
```

### 1.16 Event Items

```sql
CREATE TABLE event_items (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    event_id UNIQUEIDENTIFIER NOT NULL,
    
    -- Item info
    title NVARCHAR(255) NOT NULL,
    description NVARCHAR(MAX),
    condition NVARCHAR(50),
    
    -- Pricing
    starting_price DECIMAL(10,2) NOT NULL,
    buy_now_price DECIMAL(10,2),
    current_bid DECIMAL(10,2),
    bid_count INT DEFAULT 0,
    
    -- Buy now tracking
    buy_now_purchased_by NVARCHAR(128),
    buy_now_purchased_at DATETIME2,
    
    -- Winner
    winning_bid_id UNIQUEIDENTIFIER,
    winner_id NVARCHAR(128),
    winner_notified_at DATETIME2,
    winner_paid_at DATETIME2,
    
    -- Added by
    added_by NVARCHAR(128) NOT NULL,
    added_on_behalf_of NVARCHAR(128),
    
    -- Status
    status NVARCHAR(50) DEFAULT 'active' CHECK (status IN (
        'active',
        'sold',
        'won',
        'unsold'
    )),
    
    display_order INT DEFAULT 0,
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (event_id) REFERENCES auction_events(id) ON DELETE CASCADE,
    FOREIGN KEY (added_by) REFERENCES users(id),
    FOREIGN KEY (winner_id) REFERENCES users(id)
);

CREATE INDEX idx_event_items_event ON event_items(event_id);
```

### 1.17 Event Item Images

```sql
CREATE TABLE event_item_images (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    item_id UNIQUEIDENTIFIER NOT NULL,
    
    blob_url NVARCHAR(500) NOT NULL,
    display_order INT DEFAULT 0,
    is_primary BIT DEFAULT 0,
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE CASCADE
);
```

### 1.18 Event Participants

```sql
CREATE TABLE event_participants (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    event_id UNIQUEIDENTIFIER NOT NULL,
    user_id NVARCHAR(128) NOT NULL,
    
    granted_via NVARCHAR(50) NOT NULL CHECK (granted_via IN (
        'code',
        'direct',
        'shared_link'
    )),
    granted_by NVARCHAR(128),
    
    status NVARCHAR(50) DEFAULT 'active' CHECK (status IN (
        'active',
        'removed'
    )),
    
    joined_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (event_id) REFERENCES auction_events(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE (event_id, user_id)
);

CREATE INDEX idx_event_participants_event ON event_participants(event_id);
```

### 1.19 Event Item Bids (Standard)

```sql
CREATE TABLE event_item_bids (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    item_id UNIQUEIDENTIFIER NOT NULL,
    bidder_id NVARCHAR(128) NOT NULL,
    
    amount DECIMAL(10,2) NOT NULL,
    is_winning BIT DEFAULT 0,
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE CASCADE,
    FOREIGN KEY (bidder_id) REFERENCES users(id)
);

CREATE INDEX idx_event_item_bids_item ON event_item_bids(item_id);
```

### 1.20 Event Item Silent Bids

```sql
CREATE TABLE event_item_silent_bids (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    item_id UNIQUEIDENTIFIER NOT NULL,
    bidder_id NVARCHAR(128) NOT NULL,
    
    amount DECIMAL(10,2) NOT NULL,
    initial_amount DECIMAL(10,2) NOT NULL,
    increase_count INT DEFAULT 0,
    last_increased_at DATETIME2,
    
    is_winner BIT DEFAULT 0,
    winner_notified_at DATETIME2,
    
    notify_on_outbid BIT DEFAULT 1,
    last_outbid_notification_at DATETIME2,
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (item_id) REFERENCES event_items(id) ON DELETE CASCADE,
    FOREIGN KEY (bidder_id) REFERENCES users(id),
    UNIQUE (item_id, bidder_id)
);

CREATE INDEX idx_event_silent_bids_item ON event_item_silent_bids(item_id);
CREATE INDEX idx_event_silent_bids_ranking ON event_item_silent_bids(item_id, amount DESC, created_at ASC);
```

### 1.21 Organization Payouts (Secure Payout System)

```sql
-- Update auction_events to include payout fields
ALTER TABLE auction_events ADD
    payout_eligible_at DATETIME2,           -- end_time + 7 days
    payout_status NVARCHAR(50) DEFAULT 'pending' CHECK (payout_status IN (
        'pending',       -- Waiting for hold period
        'eligible',      -- Ready to pay out
        'processing',    -- Transfer initiated
        'completed',     -- Money sent
        'held',          -- Flagged for review
        'failed'
    )),
    payout_held_reason NVARCHAR(255),
    payout_transferred_at DATETIME2,
    payout_amount DECIMAL(12,2);

-- Organization payout records
CREATE TABLE organization_payouts (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    organization_id UNIQUEIDENTIFIER NOT NULL,
    event_id UNIQUEIDENTIFIER NOT NULL,
    
    -- Amounts
    gross_amount DECIMAL(12,2) NOT NULL,      -- Total sales
    stripe_fees DECIMAL(12,2) NOT NULL,        -- Processing fees
    platform_fee DECIMAL(12,2) NOT NULL,       -- Your fee (already paid)
    reserve_amount DECIMAL(12,2) NOT NULL,     -- 10% held back
    net_payout DECIMAL(12,2) NOT NULL,         -- What they get now
    
    -- Stripe transfer
    stripe_transfer_id NVARCHAR(255),
    
    -- Status
    status NVARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',
        'processing',
        'completed',
        'failed',
        'held'
    )),
    
    -- Review
    flags NVARCHAR(MAX),                       -- JSON array of flags
    requires_review BIT DEFAULT 0,
    reviewed_by NVARCHAR(128),
    reviewed_at DATETIME2,
    review_notes NVARCHAR(MAX),
    
    -- Timing
    eligible_at DATETIME2 NOT NULL,
    processed_at DATETIME2,
    completed_at DATETIME2,
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (event_id) REFERENCES auction_events(id)
);

CREATE INDEX idx_org_payouts_org ON organization_payouts(organization_id);
CREATE INDEX idx_org_payouts_status ON organization_payouts(status, eligible_at);
CREATE INDEX idx_org_payouts_review ON organization_payouts(requires_review, status);
```

### 1.22 Payout Reserves

```sql
-- Track the 10% reserve held for 30 days after initial payout
CREATE TABLE payout_reserves (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    payout_id UNIQUEIDENTIFIER NOT NULL,
    
    amount DECIMAL(12,2) NOT NULL,
    release_at DATETIME2 NOT NULL,            -- 30 days after initial payout
    
    status NVARCHAR(50) DEFAULT 'held' CHECK (status IN (
        'held',
        'released',
        'forfeited'                            -- If chargebacks exceeded reserve
    )),
    
    stripe_transfer_id NVARCHAR(255),
    released_at DATETIME2,
    
    FOREIGN KEY (payout_id) REFERENCES organization_payouts(id)
);

CREATE INDEX idx_reserves_status ON payout_reserves(status, release_at);
```

### 1.23 Chargebacks

```sql
-- Track chargebacks for fraud prevention
CREATE TABLE chargebacks (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    organization_id UNIQUEIDENTIFIER NOT NULL,
    event_id UNIQUEIDENTIFIER,
    payment_id UNIQUEIDENTIFIER NOT NULL,
    
    amount DECIMAL(10,2) NOT NULL,
    stripe_dispute_id NVARCHAR(255) NOT NULL,
    reason NVARCHAR(100),
    
    status NVARCHAR(50) DEFAULT 'open' CHECK (status IN (
        'open',
        'won',          -- You won dispute
        'lost',         -- Buyer won
        'closed'
    )),
    
    deducted_from_reserve BIT DEFAULT 0,
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    resolved_at DATETIME2,
    
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    FOREIGN KEY (event_id) REFERENCES auction_events(id)
);

CREATE INDEX idx_chargebacks_org ON chargebacks(organization_id);
CREATE INDEX idx_chargebacks_status ON chargebacks(status);
```

### 1.24 Organization Trust Levels

```sql
-- Track organization trust for payout limits
CREATE TABLE organization_trust (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    organization_id UNIQUEIDENTIFIER NOT NULL UNIQUE,
    
    -- Stats
    successful_events INT DEFAULT 0,
    total_payouts DECIMAL(12,2) DEFAULT 0,
    chargeback_count INT DEFAULT 0,
    chargeback_amount DECIMAL(12,2) DEFAULT 0,
    
    -- Trust level
    trust_level NVARCHAR(50) DEFAULT 'new' CHECK (trust_level IN (
        'new',           -- First event
        'established',   -- 2-5 successful events
        'trusted',       -- 5+ events, good standing
        'verified_np',   -- Verified nonprofit
        'flagged'        -- Has chargeback history
    )),
    
    -- Limits
    auto_payout_limit DECIMAL(12,2) DEFAULT 500,
    
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);
```

---

## Phase 2: Backend API Routes

### 2.1 Organizations

```
POST   /api/organizations              - Create organization
GET    /api/organizations              - List organizations (public)
GET    /api/organizations/:slug        - Get organization by slug
PUT    /api/organizations/:id          - Update organization
DELETE /api/organizations/:id          - Delete organization (owner only)

POST   /api/organizations/:id/stripe-connect   - Start Stripe Connect onboarding
GET    /api/organizations/:id/stripe-status    - Check Stripe verification status

GET    /api/organizations/:id/members          - List members
POST   /api/organizations/:id/members          - Add member directly
DELETE /api/organizations/:id/members/:userId  - Remove member

POST   /api/organizations/:id/invitations      - Send invitation
GET    /api/organizations/:id/invitations      - List pending invitations
DELETE /api/organizations/:id/invitations/:id  - Cancel invitation

POST   /api/invitations/:token/accept          - Accept invitation
POST   /api/invitations/:token/decline         - Decline invitation

GET    /api/my/organizations                   - List user's organizations
```

### 2.2 Organization Payouts (NEW)

```
GET    /api/organizations/:id/payouts          - List org's payouts
GET    /api/organizations/:id/payouts/:id      - Get payout details
GET    /api/organizations/:id/trust            - Get trust level & limits

# Admin only
GET    /api/admin/payouts                      - List all pending payouts
GET    /api/admin/payouts/review               - List payouts requiring review
POST   /api/admin/payouts/:id/approve          - Approve held payout
POST   /api/admin/payouts/:id/reject           - Reject payout
GET    /api/admin/chargebacks                  - List chargebacks
```

### 2.3 Organization Events

```
POST   /api/organizations/:orgId/events        - Create event
GET    /api/organizations/:orgId/events        - List org's events
GET    /api/events/:id                         - Get event details
PUT    /api/events/:id                         - Update event
DELETE /api/events/:id                         - Delete/cancel event
POST   /api/events/:id/publish                 - Publish event (pay fee)

POST   /api/events/:id/items                   - Add item to event
GET    /api/events/:id/items                   - List event items
PUT    /api/events/:id/items/:itemId           - Update item
DELETE /api/events/:id/items/:itemId           - Remove item

POST   /api/events/:id/join                    - Join event with access code
GET    /api/events/:id/participants            - List participants (admin)
DELETE /api/events/:id/participants/:userId    - Remove participant

POST   /api/events/:id/regenerate-code         - Generate new access code
```

### 2.4 Event Item Bidding

```
POST   /api/event-items/:id/bids               - Place bid (standard)
GET    /api/event-items/:id/bids               - Get bid history (standard)

POST   /api/event-items/:id/silent-bids        - Place/increase silent bid
GET    /api/event-items/:id/my-bid             - Get user's silent bid status

POST   /api/event-items/:id/buy-now            - Buy now
```

### 2.5 Individual Auctions (Updated)

```
POST   /api/auctions                           - Create auction
GET    /api/auctions                           - List public auctions
GET    /api/auctions/:id                       - Get auction details
PUT    /api/auctions/:id                       - Update auction
DELETE /api/auctions/:id                       - Cancel auction

POST   /api/auctions/:id/join                  - Join private auction
GET    /api/auctions/:id/participants          - List participants
DELETE /api/auctions/:id/participants/:userId  - Remove participant
POST   /api/auctions/:id/regenerate-code       - New access code

POST   /api/auctions/:id/bids                  - Place bid (standard)
POST   /api/auctions/:id/silent-bids           - Place silent bid
POST   /api/auctions/:id/buy-now               - Buy now
```

### 2.6 Platform Fees & Payouts

```
POST   /api/fees/individual-listing            - Pay $1 listing fee
POST   /api/fees/seller-pass                   - Purchase $5 seller pass
POST   /api/fees/event                         - Pay event fee
POST   /api/fees/:id/refund                    - Request refund

GET    /api/my/payouts                         - List user's payouts
POST   /api/my/paypal                          - Set PayPal email
```

### 2.7 Webhooks

```
POST   /api/webhooks/stripe                    - Stripe events
POST   /api/webhooks/stripe-connect            - Stripe Connect events
POST   /api/webhooks/paypal                    - PayPal payout events
```

---

## Phase 3: Business Logic

### 3.1 Pricing Tiers

| Type | Fee | Item Limit | Participant Limit |
|------|-----|------------|-------------------|
| Individual (per auction) | $1 | 1 | 25 |
| Individual (seller pass) | $5/month | Unlimited | 25 per auction |
| Org Small | $15 | 25 | 50 |
| Org Medium | $35 | 100 | 200 |
| Org Large | $75 | 500 | 500 |
| Org Unlimited | $150 | Unlimited | 1,000 |

### 3.2 Access Code Generation

```javascript
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function generateAccessCode() {
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}
```

- 6 characters, uppercase
- No confusing characters (0/O, 1/I/L)
- Expires when auction/event ends

### 3.3 Refund Policy

**Full Refund Eligible If:**
- Event/auction has not started (before start_time)
- Zero bids placed
- Under 2 refunds this calendar year for the organization

**Auto-deny If:**
- Event has started
- Any bids placed
- Refund limit exceeded

### 3.4 Silent Auction Tie-Breaker

Highest bid wins. If tied, earliest bid (by created_at) wins.

```sql
ORDER BY amount DESC, created_at ASC
```

### 3.5 Outbid Notifications

- Rate limit: max 1 notification per hour per item per user
- User can opt out via notify_on_outbid flag
- Only notify when user loses the #1 position

### 3.6 Payout Flow (Individual Sellers)

```
Buyer Pays $100
    ↓
Stripe Takes: $3.20 (2.9% + $0.30)
    ↓
Platform Takes: $1.00 (or $0 with seller pass)
    ↓
Seller Receives: $95.80 via PayPal
    ↓
Payout via daily batch
```

### 3.7 Secure Organization Payout System

#### Payout Flow Overview

```
Auction/Event Ends
      ↓
Buyers Charged (funds held by Stripe)
      ↓
7-Day Hold Period (for chargebacks)
      ↓
Fraud Check (auto-flag suspicious patterns)
      ↓
Release 90% to Org's Stripe Connect Account
      ↓
Hold 10% Reserve for 30 More Days
      ↓
Release Reserve (if no chargebacks)
```

#### Fraud Risks & Controls

| Risk | Control |
|------|---------|
| Chargeback after payout | 7-day hold + 10% reserve |
| Self-bidding | Suspicious bidding pattern detection |
| Fake auctions | New org limits + manual review |
| Rapid withdrawal | Velocity limits |
| Bot activity | Rate limiting |

#### Auto-Payout Limits by Trust Level

| Org History | Max Auto-Payout | Above This |
|-------------|-----------------|------------|
| First event | $500 | Manual review |
| 2-5 events | $2,500 | Manual review |
| 5+ events, good standing | $10,000 | Manual review |
| Verified nonprofit | $25,000 | Manual review |
| Has chargeback history | $0 | Always manual |

#### Fraud Detection Flags

```javascript
async function checkPayoutEligibility(event) {
  const flags = [];
  
  // New organization (first event)
  const orgEventCount = await getOrgEventCount(event.organization_id);
  if (orgEventCount === 1) {
    flags.push('first_event');
  }
  
  // High value event (over $5,000)
  if (event.total_raised > 5000) {
    flags.push('high_value');
  }
  
  // Unusual bidding patterns (same users bidding on multiple items)
  const suspiciousBids = await checkBiddingPatterns(event.id);
  if (suspiciousBids) {
    flags.push('suspicious_bidding');
  }
  
  // High percentage of single-bidder items (>70%)
  const singleBidderRate = await getSingleBidderRate(event.id);
  if (singleBidderRate > 0.7) {
    flags.push('low_competition');
  }
  
  // Org created recently (within 14 days of event)
  const org = await getOrganization(event.organization_id);
  const daysSinceCreation = daysBetween(org.created_at, event.created_at);
  if (daysSinceCreation < 14) {
    flags.push('new_organization');
  }
  
  return flags;
}
```

#### Payout Processing Logic

```javascript
async function processPayout(payout) {
  const org = await getOrganization(payout.organization_id);
  
  // Check auto-payout limit
  const autoLimit = await getAutoPayoutLimit(org.id);
  if (payout.net_payout > autoLimit) {
    await markForReview(payout.id, 'exceeds_auto_limit');
    return;
  }
  
  // Check for recent chargebacks
  const recentChargebacks = await getChargebacksSince(
    payout.event_id, 
    payout.created_at
  );
  if (recentChargebacks.length > 0) {
    await markForReview(payout.id, 'chargebacks_pending');
    return;
  }
  
  // Execute transfer via Stripe Connect
  const transfer = await stripe.transfers.create({
    amount: Math.round(payout.net_payout * 100),
    currency: 'usd',
    destination: org.stripe_account_id,
    metadata: {
      event_id: payout.event_id,
      payout_id: payout.id,
    },
  });
  
  await markPayoutCompleted(payout.id, transfer.id);
  
  // Schedule 10% reserve release (30 days later)
  await scheduleReserveRelease(payout.id, payout.reserve_amount);
  
  // Update org trust level
  await updateTrustLevel(org.id);
}
```

#### Velocity Limits

```javascript
const VELOCITY_LIMITS = {
  events_per_month: 4,           // Max events per org per month
  total_monthly_payout: 50000,   // Max payout per org per month
  events_before_faster: 3,       // Events needed before reduced hold
};
```

#### Reserve Release

```javascript
// Run daily - release reserves after 30 days if no chargebacks
async function processReserveReleases() {
  const eligibleReserves = await db.query(`
    SELECT * FROM payout_reserves
    WHERE status = 'held'
      AND release_at <= GETUTCDATE()
  `);
  
  for (const reserve of eligibleReserves) {
    // Check for chargebacks on this event
    const chargebacks = await getChargebacksForPayout(reserve.payout_id);
    
    if (chargebacks.totalLost > reserve.amount) {
      // Chargebacks exceeded reserve - forfeit
      await markReserveForfeited(reserve.id);
    } else if (chargebacks.totalLost > 0) {
      // Partial release (reserve minus chargeback amount)
      const releaseAmount = reserve.amount - chargebacks.totalLost;
      await releasePartialReserve(reserve.id, releaseAmount);
    } else {
      // No chargebacks - release full reserve
      await releaseFullReserve(reserve.id);
    }
  }
}
```

---

## Phase 4: Frontend Components

### 4.1 New Pages

```
/organizations                           - Browse organizations
/organizations/new                       - Create organization
/organizations/:slug                     - Organization public page
/organizations/:slug/manage              - Organization admin dashboard
/organizations/:slug/members             - Manage members
/organizations/:slug/events              - List events
/organizations/:slug/events/new          - Create event
/organizations/:slug/events/:id          - Event admin view
/organizations/:slug/events/:id/items    - Manage items

/events                                  - Browse public events
/events/:id                              - Public event page
/events/:id/items/:itemId                - Item detail & bidding

/a/:shortSlug                            - Short URL for auctions
/e/:shortSlug                            - Short URL for events

/sell                                    - Individual seller dashboard
/sell/new                                - Create individual listing
/sell/pass                               - Purchase seller pass

/my/payouts                              - View payout history
/settings/payout                         - Configure PayPal email

/admin/payouts                           - Admin payout review dashboard
/admin/payouts/:id                       - Payout detail & approval
/admin/chargebacks                       - Chargeback management
```

### 4.2 New Components

```
OrganizationCard                         - Org summary card
OrganizationForm                         - Create/edit org form
MemberList                               - Member management
InviteMemberModal                        - Send invitation

EventCard                                - Event summary card
EventForm                                - Create/edit event form
EventItemCard                            - Item in event
EventItemForm                            - Add/edit item
EventTimeline                            - Start/end countdown

PrivateAccessModal                       - Enter access code
QRCodeDisplay                            - Show QR code for sharing
ParticipantList                          - Manage participants

SilentBidForm                            - Place/increase silent bid
BidRankIndicator                         - "You are #1" / "You've been outbid"
BuyNowButton                             - Buy now with confirmation

PricingTierSelector                      - Choose event tier
SellerPassPurchase                       - Buy seller pass
PayoutHistory                            - List payouts with status
PayPalSetup                              - Configure PayPal email

# Admin Components (NEW)
AdminPayoutList                          - List payouts requiring review
AdminPayoutDetail                        - Full payout details with flags
PayoutApprovalForm                       - Approve/reject with notes
ChargebackList                           - View and manage chargebacks
FraudAlertBadge                          - Display fraud flags
TrustLevelBadge                          - Display org trust level
```

---

## Phase 5: Integration Services

### 5.1 Stripe Connect

```javascript
// services/stripeConnect.ts

// Create Connect account for organization
async function createConnectAccount(orgId, email) {
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    capabilities: {
      transfers: { requested: true },
    },
  });
  return account.id;
}

// Generate onboarding link
async function createOnboardingLink(accountId, returnUrl) {
  const link = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${returnUrl}?refresh=true`,
    return_url: `${returnUrl}?success=true`,
    type: 'account_onboarding',
  });
  return link.url;
}

// Check verification status
async function getAccountStatus(accountId) {
  const account = await stripe.accounts.retrieve(accountId);
  return {
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
  };
}

// Transfer funds to organization
async function transferToOrganization(accountId, amount, eventId) {
  const transfer = await stripe.transfers.create({
    amount: Math.round(amount * 100),
    currency: 'usd',
    destination: accountId,
    metadata: { eventId },
  });
  return transfer;
}
```

### 5.2 PayPal Payouts

```javascript
// services/paypalPayout.ts

// Daily batch payout for individual sellers
async function processDailyPayouts() {
  const pendingPayouts = await getPendingPayouts();
  
  if (pendingPayouts.length === 0) return;
  
  const items = pendingPayouts.map(p => ({
    recipient_type: 'EMAIL',
    amount: {
      value: p.payout_amount.toFixed(2),
      currency: 'USD',
    },
    receiver: p.paypal_email,
    note: `Very Good Auctions payout for auction ${p.auction_id}`,
    sender_item_id: p.id,
  }));
  
  const batch = await paypal.payouts.create({
    sender_batch_header: {
      sender_batch_id: `VGA-${Date.now()}`,
      email_subject: 'You have a payout from Very Good Auctions',
    },
    items,
  });
  
  // Update payout records with batch ID
  await markPayoutsProcessing(pendingPayouts, batch.batch_header.payout_batch_id);
}
```

### 5.3 Email Notifications

```javascript
// services/email.ts

// Templates needed:
// - org-invitation
// - event-published
// - bid-placed (standard)
// - outbid-notification (silent)
// - auction-won
// - auction-lost
// - payment-received
// - payout-sent
// - payout-failed
// - event-starting-soon (24h, 1h)
// - event-ended

// Organization payout templates (NEW)
// - org-payout-processing       // Payout initiated
// - org-payout-completed        // Funds transferred
// - org-payout-held             // Flagged for review
// - org-reserve-released        // 10% reserve released
// - org-chargeback-received     // Chargeback notification
// - org-trust-level-updated     // Trust level changed
```

### 5.4 Scheduled Jobs

```javascript
// jobs/index.ts

// Run every minute
- checkAuctionEndTimes()      // End auctions, notify winners
- checkEventEndTimes()        // End events, notify all winners

// Run daily at 2 AM
- processDailyPayouts()       // PayPal batch payouts (individuals)
- processOrgPayouts()         // Organization payouts (after 7-day hold)
- processReserveReleases()    // Release 10% reserves (after 30 days)
- expireOldAccessCodes()      // Clean up expired codes
- cleanupOldAttempts()        // Remove old rate limit records
- updateTrustLevels()         // Recalculate org trust levels

// Run hourly
- sendEventReminders()        // 24h and 1h before end
- retryFailedPayouts()        // Retry failed PayPal payouts
- checkForNewChargebacks()    // Sync chargebacks from Stripe
```

---

## Phase 6: Implementation Order

### Sprint 1: Organizations Foundation
1. Organizations table + CRUD API
2. Organization members + roles
3. Invitations system
4. Organization dashboard UI

### Sprint 2: Stripe Connect
1. Stripe Connect integration
2. Onboarding flow
3. Verification webhooks
4. Organization status UI

### Sprint 3: Platform Fees
1. Platform fees table + API
2. Fee payment flow (Stripe)
3. Refund logic + limits
4. Pricing UI components

### Sprint 4: Private Auctions
1. Access code generation
2. Participant tracking
3. Rate limiting
4. QR code generation
5. Join flow UI

### Sprint 5: Silent Auctions
1. Silent bids table + API
2. Bid ranking logic
3. Outbid notifications
4. Silent auction UI (rank display, no prices)

### Sprint 6: Buy Now
1. Buy now fields + logic
2. Instant purchase flow
3. Notify other bidders
4. Buy now UI

### Sprint 7: Organization Events
1. Auction events container
2. Event items
3. Event-level settings
4. Event management UI

### Sprint 8: Individual Sellers
1. User seller fields
2. Seller pass system
3. Individual listing flow
4. Seller dashboard

### Sprint 9: PayPal Payouts (Individuals)
1. PayPal integration
2. Payout tracking
3. Daily batch job
4. Payout history UI

### Sprint 10: Secure Organization Payouts
1. Organization payouts table + API
2. Payout reserves table
3. Chargebacks tracking
4. Trust levels system
5. Fraud detection flags
6. 7-day hold + 10% reserve logic
7. Auto-payout limits by trust level
8. Admin review UI
9. Payout approval workflow
10. Reserve release job

### Sprint 11: Compliance Foundation
1. Compliance database tables (tax_information, agreement_acceptances, etc.)
2. TIN encryption system
3. Agreement versioning system
4. Agreement acceptance API and UI
5. Require ToS on signup, Seller Agreement on listing

### Sprint 12: Tax Compliance
1. W-9 form component
2. W-9 submission API with encryption
3. W-9 verification admin interface
4. Block payouts when W-9 required
5. 1099 tracking and reporting
6. Stripe Tax integration (optional)

### Sprint 13: Polish & Testing
1. Email templates
2. Scheduled jobs
3. Security alerts
4. Compliance audit logging
5. End-to-end testing
6. Legal document review with attorney

---

## Phase 7: Environment Variables

### Backend (.env)

```
# Existing
DB_SERVER=
DB_NAME=
DB_USER=
DB_PASSWORD=
ENTRA_TENANT_NAME=
ENTRA_TENANT_ID=
ENTRA_CLIENT_ID=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
FRONTEND_URL=

# New
STRIPE_CONNECT_WEBHOOK_SECRET=
PAYPAL_CLIENT_ID=
PAYPAL_CLIENT_SECRET=
PAYPAL_MODE=sandbox  # or 'live'
SENDGRID_API_KEY=
FROM_EMAIL=noreply@verygoodauctions.com
```

### Frontend (.env)

```
# Existing
VITE_API_URL=
VITE_ENTRA_TENANT_NAME=
VITE_ENTRA_TENANT_ID=
VITE_ENTRA_CLIENT_ID=
VITE_STRIPE_PUBLIC_KEY=

# New
VITE_PAYPAL_CLIENT_ID=
```

---

## Summary

This expansion transforms Very Good Auctions from a simple auction site into a comprehensive platform supporting:

- **Organizations** with Stripe Connect verification
- **Fundraiser events** with multi-item support
- **Private auctions** with access codes and QR codes
- **Silent auctions** with hidden bidding
- **Individual sellers** with PayPal payouts
- **Flat fee pricing** that undercuts competitors
- **Secure payouts** with fraud prevention, hold periods, and reserves
- **Tax compliance** with W-9 collection, 1099 tracking, and optional Stripe Tax

Total new tables: 30
Total new API endpoints: ~75
Estimated implementation: 13 sprints (8-14 weeks)

### Fraud Prevention Layers

| Layer | Protection |
|-------|------------|
| 1. Stripe Connect | Identity verification, KYC/AML |
| 2. 7-day hold | Time for chargebacks to surface |
| 3. Fraud flags | Auto-flag suspicious patterns |
| 4. Payout limits | Cap auto-payouts by trust level |
| 5. 10% reserve | 30-day buffer for late chargebacks |
| 6. Velocity limits | Prevent rapid cash-out |
| 7. Manual review | Human check for flagged payouts |
| 8. Chargeback tracking | Deduct from reserves/future payouts |

### Compliance Framework

| Area | Approach |
|------|----------|
| Money Transmission | Stripe is processor; we never hold funds |
| Tax Collection | Stripe Tax (optional); sellers remit |
| 1099-K | Stripe handles for Connect accounts |
| 1099 for Individuals | W-9 collection; PayPal/manual reporting |
| KYC/AML | Stripe Connect handles verification |
| Terms of Service | Platform facilitator model |
| Nonprofit Verification | Optional IRS check; disclaimers |

### Related Documents

- [COMPLIANCE-IMPLEMENTATION.md](COMPLIANCE-IMPLEMENTATION.md) - Detailed compliance implementation guide
