# Self-Managed Payments Implementation Plan

## Overview

Add a "Self-Managed Payments" option alongside the existing Stripe Connect integrated payments model. Organizations can choose how they want to handle payments when creating events.

**Goal:** Allow organizations to use their own payment methods (Venmo, PayPal, cash, check, their website) while the platform handles auction mechanics, winner notifications, and fulfillment tracking.

---

## Prerequisites

Before starting, verify:
- [ ] Existing auction events system is working
- [ ] Winner determination logic exists
- [ ] Email notification system exists
- [ ] Organization dashboard exists

---

## Phase 1: Database Schema Changes

### 1.1 Alter `auction_events` Table

Add columns for payment mode and self-managed payment configuration:

```sql
ALTER TABLE auction_events ADD
    -- Payment model selection
    payment_mode NVARCHAR(20) DEFAULT 'integrated' CHECK (payment_mode IN (
        'self_managed',     -- Org handles payment externally
        'integrated'        -- Stripe Connect (existing)
    )),
    
    -- Self-managed payment info (only used when payment_mode = 'self_managed')
    payment_instructions NVARCHAR(MAX),    -- Free-form text instructions
    payment_link NVARCHAR(500),            -- URL to org's payment page
    payment_qr_code_url NVARCHAR(500),     -- URL to QR code image (uploaded or generated)
    
    -- Fulfillment configuration
    fulfillment_type NVARCHAR(20) DEFAULT 'shipping' CHECK (fulfillment_type IN (
        'shipping',
        'pickup',
        'both',
        'digital'           -- For digital items/gift cards
    )),
    pickup_instructions NVARCHAR(MAX),
    pickup_location NVARCHAR(500),
    pickup_address_line1 NVARCHAR(255),
    pickup_address_line2 NVARCHAR(255),
    pickup_city NVARCHAR(100),
    pickup_state NVARCHAR(50),
    pickup_postal_code NVARCHAR(20),
    pickup_dates NVARCHAR(500),            -- e.g., "Dec 15-17, 10am-4pm"
    
    -- Payment reminder settings
    payment_due_days INT DEFAULT 7,        -- Days after auction end to pay
    send_payment_reminders BIT DEFAULT 1;
```

### 1.2 Alter `event_items` Table (or `auction_items`)

Add columns for payment and fulfillment status tracking:

```sql
ALTER TABLE event_items ADD
    -- Winner info (may already exist)
    winner_user_id NVARCHAR(128),
    winning_bid DECIMAL(10,2),
    won_at DATETIME2,
    
    -- Payment status (org confirms manually for self-managed)
    payment_status NVARCHAR(20) DEFAULT 'pending' CHECK (payment_status IN (
        'pending',          -- Awaiting payment
        'paid',             -- Org confirmed payment received
        'payment_issue',    -- Problem with payment
        'waived',           -- Org waived payment (donation, error, etc.)
        'refunded'          -- Payment was refunded
    )),
    payment_confirmed_at DATETIME2,
    payment_confirmed_by NVARCHAR(128),
    payment_method_used NVARCHAR(100),     -- Optional: "Venmo", "Cash", etc.
    payment_notes NVARCHAR(500),
    
    -- Fulfillment status
    fulfillment_status NVARCHAR(20) DEFAULT 'pending' CHECK (fulfillment_status IN (
        'pending',          -- Not yet fulfilled
        'processing',       -- Being prepared
        'ready_for_pickup', -- At pickup location
        'shipped',          -- In transit
        'out_for_delivery', -- With carrier for delivery
        'delivered',        -- Confirmed delivered
        'picked_up',        -- Winner picked up item
        'issue'             -- Problem with fulfillment
    )),
    fulfillment_type NVARCHAR(20) CHECK (fulfillment_type IN (
        'shipping',
        'pickup',
        'digital'
    )),
    
    -- Shipping info (when fulfillment_type = 'shipping')
    tracking_number NVARCHAR(100),
    tracking_carrier NVARCHAR(50),         -- UPS, USPS, FedEx, etc.
    tracking_url NVARCHAR(500),            -- Full tracking URL
    shipped_at DATETIME2,
    estimated_delivery NVARCHAR(100),
    
    -- Pickup info (when fulfillment_type = 'pickup')
    pickup_ready_at DATETIME2,
    pickup_completed_at DATETIME2,
    pickup_completed_by NVARCHAR(255),     -- Name of person who picked up
    
    -- Digital delivery (when fulfillment_type = 'digital')
    digital_delivery_info NVARCHAR(MAX),   -- Code, link, instructions
    digital_delivered_at DATETIME2,
    
    -- General fulfillment
    fulfillment_notes NVARCHAR(500),
    fulfilled_at DATETIME2,
    fulfilled_by NVARCHAR(128);
```

### 1.3 Create `payment_reminders` Table

Track payment reminder emails sent:

```sql
CREATE TABLE payment_reminders (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    event_item_id UNIQUEIDENTIFIER NOT NULL,
    user_id NVARCHAR(128) NOT NULL,
    
    reminder_number INT NOT NULL,          -- 1st, 2nd, 3rd reminder
    sent_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (event_item_id) REFERENCES event_items(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_reminders_item ON payment_reminders(event_item_id);
```

### 1.4 Create Migration Script

Create a migration file: `migrations/YYYYMMDD_add_self_managed_payments.sql`

```sql
-- Migration: Add Self-Managed Payments Support
-- Date: [DATE]
-- Description: Adds payment mode, fulfillment tracking, and self-managed payment fields

BEGIN TRANSACTION;

-- 1. Add columns to auction_events
ALTER TABLE auction_events ADD
    payment_mode NVARCHAR(20) DEFAULT 'integrated',
    payment_instructions NVARCHAR(MAX),
    payment_link NVARCHAR(500),
    payment_qr_code_url NVARCHAR(500),
    fulfillment_type NVARCHAR(20) DEFAULT 'shipping',
    pickup_instructions NVARCHAR(MAX),
    pickup_location NVARCHAR(500),
    pickup_address_line1 NVARCHAR(255),
    pickup_address_line2 NVARCHAR(255),
    pickup_city NVARCHAR(100),
    pickup_state NVARCHAR(50),
    pickup_postal_code NVARCHAR(20),
    pickup_dates NVARCHAR(500),
    payment_due_days INT DEFAULT 7,
    send_payment_reminders BIT DEFAULT 1;

-- 2. Add check constraint for payment_mode
ALTER TABLE auction_events ADD CONSTRAINT chk_payment_mode 
    CHECK (payment_mode IN ('self_managed', 'integrated'));

-- 3. Add check constraint for fulfillment_type
ALTER TABLE auction_events ADD CONSTRAINT chk_event_fulfillment_type 
    CHECK (fulfillment_type IN ('shipping', 'pickup', 'both', 'digital'));

-- 4. Add columns to event_items
ALTER TABLE event_items ADD
    payment_status NVARCHAR(20) DEFAULT 'pending',
    payment_confirmed_at DATETIME2,
    payment_confirmed_by NVARCHAR(128),
    payment_method_used NVARCHAR(100),
    payment_notes NVARCHAR(500),
    fulfillment_status NVARCHAR(20) DEFAULT 'pending',
    fulfillment_type NVARCHAR(20),
    tracking_number NVARCHAR(100),
    tracking_carrier NVARCHAR(50),
    tracking_url NVARCHAR(500),
    shipped_at DATETIME2,
    estimated_delivery NVARCHAR(100),
    pickup_ready_at DATETIME2,
    pickup_completed_at DATETIME2,
    pickup_completed_by NVARCHAR(255),
    digital_delivery_info NVARCHAR(MAX),
    digital_delivered_at DATETIME2,
    fulfillment_notes NVARCHAR(500),
    fulfilled_at DATETIME2,
    fulfilled_by NVARCHAR(128);

-- 5. Add check constraints for event_items
ALTER TABLE event_items ADD CONSTRAINT chk_item_payment_status 
    CHECK (payment_status IN ('pending', 'paid', 'payment_issue', 'waived', 'refunded'));

ALTER TABLE event_items ADD CONSTRAINT chk_item_fulfillment_status 
    CHECK (fulfillment_status IN ('pending', 'processing', 'ready_for_pickup', 'shipped', 'out_for_delivery', 'delivered', 'picked_up', 'issue'));

ALTER TABLE event_items ADD CONSTRAINT chk_item_fulfillment_type 
    CHECK (fulfillment_type IN ('shipping', 'pickup', 'digital'));

-- 6. Create payment_reminders table
CREATE TABLE payment_reminders (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    event_item_id UNIQUEIDENTIFIER NOT NULL,
    user_id NVARCHAR(128) NOT NULL,
    reminder_number INT NOT NULL,
    sent_at DATETIME2 DEFAULT GETUTCDATE(),
    FOREIGN KEY (event_item_id) REFERENCES event_items(id),
    FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX idx_reminders_item ON payment_reminders(event_item_id);

-- 7. Update existing events to use integrated mode
UPDATE auction_events SET payment_mode = 'integrated' WHERE payment_mode IS NULL;

COMMIT;
```

---

## Phase 2: Backend API Endpoints

### 2.1 Update Event Creation/Update Endpoints

Modify existing event endpoints to handle new fields.

**File:** `src/routes/events.ts` or similar

```typescript
// POST /api/organizations/:orgId/events
// PUT /api/organizations/:orgId/events/:eventId

interface CreateEventRequest {
  // ... existing fields ...
  
  // New payment mode fields
  paymentMode: 'self_managed' | 'integrated';
  
  // Self-managed payment config (required if paymentMode === 'self_managed')
  paymentInstructions?: string;
  paymentLink?: string;
  paymentQrCodeUrl?: string;
  
  // Fulfillment config
  fulfillmentType: 'shipping' | 'pickup' | 'both' | 'digital';
  pickupInstructions?: string;
  pickupLocation?: string;
  pickupAddress?: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
  };
  pickupDates?: string;
  
  // Payment settings
  paymentDueDays?: number;      // Default: 7
  sendPaymentReminders?: boolean; // Default: true
}

// Validation logic:
// - If paymentMode === 'self_managed', at least one of paymentInstructions, 
//   paymentLink, or paymentQrCodeUrl must be provided
// - If fulfillmentType includes 'pickup', pickup details should be provided
// - If paymentMode === 'integrated', Stripe Connect must be set up for org
```

### 2.2 Create Payment Status Endpoints

**File:** `src/routes/eventItems.ts` (new or existing)

```typescript
// PATCH /api/event-items/:itemId/payment-status
// Org admin confirms payment received

interface UpdatePaymentStatusRequest {
  status: 'paid' | 'payment_issue' | 'waived' | 'refunded';
  paymentMethodUsed?: string;  // "Venmo", "Cash", "Check", etc.
  notes?: string;
}

// Response includes updated item with payment status

// GET /api/organizations/:orgId/events/:eventId/payment-summary
// Returns summary of payment statuses for all items in event

interface PaymentSummaryResponse {
  totalItems: number;
  totalValue: number;
  byStatus: {
    pending: { count: number; value: number };
    paid: { count: number; value: number };
    paymentIssue: { count: number; value: number };
    waived: { count: number; value: number };
    refunded: { count: number; value: number };
  };
  items: EventItemWithPaymentStatus[];
}
```

### 2.3 Create Fulfillment Status Endpoints

**File:** `src/routes/eventItems.ts`

```typescript
// PATCH /api/event-items/:itemId/fulfillment-status
// Org updates fulfillment status

interface UpdateFulfillmentStatusRequest {
  status: 'processing' | 'ready_for_pickup' | 'shipped' | 'delivered' | 'picked_up' | 'issue';
  
  // For shipping
  trackingNumber?: string;
  trackingCarrier?: string;  // 'ups' | 'usps' | 'fedex' | 'dhl' | 'other'
  estimatedDelivery?: string;
  
  // For pickup
  pickupCompletedBy?: string;  // Name of person who picked up
  
  // For digital
  digitalDeliveryInfo?: string;
  
  notes?: string;
}

// Helper: Generate tracking URL based on carrier
function getTrackingUrl(carrier: string, trackingNumber: string): string {
  const urls: Record<string, string> = {
    ups: `https://www.ups.com/track?tracknum=${trackingNumber}`,
    usps: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${trackingNumber}`,
    fedex: `https://www.fedex.com/fedextrack/?trknbr=${trackingNumber}`,
    dhl: `https://www.dhl.com/en/express/tracking.html?AWB=${trackingNumber}`,
  };
  return urls[carrier] || '';
}
```

### 2.4 Create Winner Items Endpoint

**File:** `src/routes/users.ts` or `src/routes/myItems.ts`

```typescript
// GET /api/my/won-items
// Returns all items the current user has won

interface WonItemsResponse {
  items: WonItem[];
}

interface WonItem {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  winningBid: number;
  wonAt: string;
  
  // Event info
  event: {
    id: string;
    name: string;
    organizationName: string;
    paymentMode: 'self_managed' | 'integrated';
    
    // Self-managed payment info (only if paymentMode === 'self_managed')
    paymentInstructions?: string;
    paymentLink?: string;
    paymentQrCodeUrl?: string;
    paymentDueDays: number;
  };
  
  // Status
  paymentStatus: string;
  paymentDueDate: string;      // Calculated: wonAt + paymentDueDays
  fulfillmentStatus: string;
  fulfillmentType: string;
  
  // Shipping info (if shipped)
  tracking?: {
    number: string;
    carrier: string;
    url: string;
    estimatedDelivery?: string;
  };
  
  // Pickup info (if pickup)
  pickup?: {
    location: string;
    address?: string;
    dates: string;
    instructions?: string;
    isReady: boolean;
  };
  
  // Digital info (if digital)
  digital?: {
    deliveryInfo: string;
    deliveredAt?: string;
  };
}
```

### 2.5 Bulk Actions Endpoint

**File:** `src/routes/eventItems.ts`

```typescript
// POST /api/organizations/:orgId/events/:eventId/bulk-update
// Bulk update payment or fulfillment status

interface BulkUpdateRequest {
  itemIds: string[];
  update: {
    paymentStatus?: 'paid' | 'payment_issue' | 'waived';
    fulfillmentStatus?: 'processing' | 'ready_for_pickup' | 'shipped';
    trackingCarrier?: string;
    // Note: Each item needs its own tracking number, so bulk shipping 
    // would require a different approach or individual tracking numbers
  };
}

// For bulk marking as paid:
// POST /api/organizations/:orgId/events/:eventId/bulk-mark-paid
// Body: { itemIds: string[] }

// For bulk marking ready for pickup:
// POST /api/organizations/:orgId/events/:eventId/bulk-ready-pickup
// Body: { itemIds: string[] }
```

### 2.6 QR Code Upload Endpoint

**File:** `src/routes/uploads.ts` or `src/routes/events.ts`

```typescript
// POST /api/organizations/:orgId/events/:eventId/payment-qr
// Upload payment QR code image

// Accept multipart form data with image file
// Store in blob storage (Azure Blob, S3, etc.)
// Return URL to stored image

// Alternatively, generate QR code from payment link:
// POST /api/organizations/:orgId/events/:eventId/generate-qr
// Body: { paymentLink: string }
// Uses a QR library to generate QR code image
```

---

## Phase 3: Email Notifications

### 3.1 Winner Notification Email (Self-Managed)

**File:** `src/emails/templates/winner-self-managed.ts` or `.hbs`

Create a new email template for winners when payment is self-managed:

```
Subject: 🎉 You won "[Item Name]" from [Organization Name]!

---

Congratulations, [Winner Name]!

You won the following item:

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📦 [Item Name]
💰 Winning Bid: $[Amount]
📅 Won on: [Date]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW TO PAY

Please complete your payment within [X] days using 
[Organization Name]'s preferred method:

[Payment Instructions - rendered as formatted text]

{{#if paymentLink}}
[PAY NOW BUTTON → paymentLink]
{{/if}}

{{#if paymentQrCodeUrl}}
Or scan this QR code:
[QR Code Image]
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

{{#if fulfillmentType === 'pickup'}}
PICKUP INFORMATION

📍 [Pickup Location]
   [Pickup Address]
📅 Available: [Pickup Dates]

{{#if pickupInstructions}}
[Pickup Instructions]
{{/if}}
{{/if}}

{{#if fulfillmentType === 'shipping'}}
SHIPPING

Once [Organization Name] confirms your payment, they will ship 
your item and you'll receive tracking information.
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TRACK YOUR ITEM

View your won items and track payment/shipping status:
[VIEW MY ITEMS BUTTON → /my/won-items]

Questions? Contact [Organization Name]:
📧 [Org Email]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Thank you for supporting [Organization Name]!

Very Good Auctions
```

### 3.2 Payment Reminder Email

**File:** `src/emails/templates/payment-reminder.ts`

```
Subject: Reminder: Payment due for "[Item Name]"

---

Hi [Winner Name],

This is a friendly reminder that payment is still pending for:

📦 [Item Name]
💰 Amount: $[Amount]
📅 Payment due: [Due Date] ([X] days remaining)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

HOW TO PAY

[Payment Instructions]

{{#if paymentLink}}
[PAY NOW BUTTON]
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

If you've already paid, please disregard this email. 
[Organization Name] will confirm receipt shortly.

Questions? Contact [Organization Name] at [Org Email]

Very Good Auctions
```

### 3.3 Payment Confirmed Email

**File:** `src/emails/templates/payment-confirmed.ts`

```
Subject: ✅ Payment confirmed for "[Item Name]"

---

Hi [Winner Name],

Great news! [Organization Name] has confirmed your payment for:

📦 [Item Name]
💰 Amount: $[Amount]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT'S NEXT

{{#if fulfillmentType === 'shipping'}}
Your item will be shipped soon. You'll receive tracking 
information once it's on its way.
{{/if}}

{{#if fulfillmentType === 'pickup'}}
Your item is ready for pickup!

📍 [Pickup Location]
   [Pickup Address]
📅 Available: [Pickup Dates]
{{/if}}

{{#if fulfillmentType === 'digital'}}
Your item will be delivered digitally. Check your won items 
page for delivery details.
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[VIEW MY ITEMS BUTTON]

Thank you for supporting [Organization Name]!

Very Good Auctions
```

### 3.4 Item Shipped Email

**File:** `src/emails/templates/item-shipped.ts`

```
Subject: 📦 Your item has shipped!

---

Hi [Winner Name],

Your item is on its way!

📦 [Item Name]
🚚 Carrier: [Carrier Name]
📋 Tracking: [Tracking Number]

[TRACK PACKAGE BUTTON → Tracking URL]

{{#if estimatedDelivery}}
📅 Estimated Delivery: [Estimated Delivery]
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[VIEW MY ITEMS BUTTON]

Very Good Auctions
```

### 3.5 Ready for Pickup Email

**File:** `src/emails/templates/ready-for-pickup.ts`

```
Subject: 📍 Your item is ready for pickup!

---

Hi [Winner Name],

Your item is ready to be picked up!

📦 [Item Name]

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

PICKUP DETAILS

📍 [Pickup Location]
   [Pickup Address]
📅 Available: [Pickup Dates]

{{#if pickupInstructions}}
[Pickup Instructions]
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

[VIEW MY ITEMS BUTTON]

Very Good Auctions
```

### 3.6 Update Email Service

**File:** `src/services/emailService.ts`

Add functions to send each email type:

```typescript
// Send winner notification for self-managed payment events
async function sendWinnerNotificationSelfManaged(params: {
  to: string;
  winnerName: string;
  itemName: string;
  winningBid: number;
  wonAt: Date;
  organizationName: string;
  organizationEmail: string;
  paymentInstructions?: string;
  paymentLink?: string;
  paymentQrCodeUrl?: string;
  paymentDueDays: number;
  fulfillmentType: string;
  pickupLocation?: string;
  pickupAddress?: string;
  pickupDates?: string;
  pickupInstructions?: string;
}): Promise<void>;

// Send payment reminder
async function sendPaymentReminder(params: {
  to: string;
  winnerName: string;
  itemName: string;
  amount: number;
  dueDate: Date;
  daysRemaining: number;
  paymentInstructions?: string;
  paymentLink?: string;
  organizationName: string;
  organizationEmail: string;
}): Promise<void>;

// Send payment confirmed notification
async function sendPaymentConfirmed(params: {
  to: string;
  winnerName: string;
  itemName: string;
  amount: number;
  organizationName: string;
  fulfillmentType: string;
  pickupLocation?: string;
  pickupAddress?: string;
  pickupDates?: string;
}): Promise<void>;

// Send shipped notification
async function sendItemShipped(params: {
  to: string;
  winnerName: string;
  itemName: string;
  carrier: string;
  trackingNumber: string;
  trackingUrl: string;
  estimatedDelivery?: string;
}): Promise<void>;

// Send ready for pickup notification
async function sendReadyForPickup(params: {
  to: string;
  winnerName: string;
  itemName: string;
  pickupLocation: string;
  pickupAddress?: string;
  pickupDates?: string;
  pickupInstructions?: string;
}): Promise<void>;
```

---

## Phase 4: Background Jobs

### 4.1 Payment Reminder Job

**File:** `src/jobs/paymentReminders.ts`

```typescript
/**
 * Runs daily to send payment reminders for self-managed payment events.
 * 
 * Reminder schedule:
 * - 1st reminder: 3 days after auction end (if still unpaid)
 * - 2nd reminder: 5 days after auction end (if still unpaid)
 * - 3rd reminder: 1 day before due date (if still unpaid)
 */
async function processPaymentReminders(): Promise<void> {
  // 1. Find all items that:
  //    - Are from self-managed payment events
  //    - Have payment_status = 'pending'
  //    - Event has ended
  //    - send_payment_reminders = true
  
  // 2. For each item, check if a reminder should be sent:
  //    - Calculate days since auction ended
  //    - Check which reminders have already been sent
  //    - Send appropriate reminder if due
  
  // 3. Log reminder sent to payment_reminders table
  
  // Example query:
  const unpaidItems = await db.query(`
    SELECT 
      ei.*,
      ae.name as event_name,
      ae.ends_at,
      ae.payment_due_days,
      ae.payment_instructions,
      ae.payment_link,
      ae.send_payment_reminders,
      o.name as org_name,
      o.contact_email as org_email,
      u.email as winner_email,
      u.display_name as winner_name,
      (SELECT MAX(reminder_number) FROM payment_reminders WHERE event_item_id = ei.id) as last_reminder
    FROM event_items ei
    JOIN auction_events ae ON ei.event_id = ae.id
    JOIN organizations o ON ae.organization_id = o.id
    JOIN users u ON ei.winner_user_id = u.id
    WHERE ae.payment_mode = 'self_managed'
      AND ei.payment_status = 'pending'
      AND ei.winner_user_id IS NOT NULL
      AND ae.ends_at < GETUTCDATE()
      AND ae.send_payment_reminders = 1
  `);
  
  for (const item of unpaidItems) {
    const daysSinceEnd = differenceInDays(new Date(), item.ends_at);
    const dueDate = addDays(item.ends_at, item.payment_due_days);
    const daysUntilDue = differenceInDays(dueDate, new Date());
    
    let shouldSendReminder = false;
    let reminderNumber = 0;
    
    if (daysSinceEnd >= 3 && (!item.last_reminder || item.last_reminder < 1)) {
      shouldSendReminder = true;
      reminderNumber = 1;
    } else if (daysSinceEnd >= 5 && item.last_reminder < 2) {
      shouldSendReminder = true;
      reminderNumber = 2;
    } else if (daysUntilDue <= 1 && daysUntilDue >= 0 && item.last_reminder < 3) {
      shouldSendReminder = true;
      reminderNumber = 3;
    }
    
    if (shouldSendReminder) {
      await sendPaymentReminder({
        to: item.winner_email,
        winnerName: item.winner_name,
        itemName: item.name,
        amount: item.winning_bid,
        dueDate,
        daysRemaining: daysUntilDue,
        paymentInstructions: item.payment_instructions,
        paymentLink: item.payment_link,
        organizationName: item.org_name,
        organizationEmail: item.org_email,
      });
      
      await db.query(`
        INSERT INTO payment_reminders (event_item_id, user_id, reminder_number)
        VALUES (@itemId, @userId, @reminderNumber)
      `, {
        itemId: item.id,
        userId: item.winner_user_id,
        reminderNumber,
      });
    }
  }
}
```

### 4.2 Register Job in Scheduler

**File:** `src/jobs/index.ts`

```typescript
// Add to existing job scheduler

// Run daily at 9 AM
schedule('0 9 * * *', processPaymentReminders);
```

---

## Phase 5: Frontend Components

### 5.1 Event Creation/Edit Form Updates

**File:** `src/components/EventForm.tsx` (or similar)

Add payment mode selection and configuration:

```tsx
// Add to event form state
interface EventFormState {
  // ... existing fields ...
  
  paymentMode: 'self_managed' | 'integrated';
  paymentInstructions: string;
  paymentLink: string;
  paymentQrCodeUrl: string;
  fulfillmentType: 'shipping' | 'pickup' | 'both' | 'digital';
  pickupInstructions: string;
  pickupLocation: string;
  pickupAddress: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
  };
  pickupDates: string;
  paymentDueDays: number;
  sendPaymentReminders: boolean;
}

// UI sections to add:

// 1. Payment Mode Selection
<RadioGroup
  label="How will winners pay?"
  value={paymentMode}
  onChange={setPaymentMode}
>
  <Radio value="self_managed">
    <strong>Self-Managed</strong>
    <p>Provide your own payment instructions (Venmo, PayPal, cash, check, etc.)</p>
  </Radio>
  <Radio value="integrated" disabled={!org.stripeConnected}>
    <strong>Integrated Payments</strong>
    <p>Accept credit cards through the platform (requires Stripe Connect)</p>
  </Radio>
</RadioGroup>

// 2. Self-Managed Payment Details (show when paymentMode === 'self_managed')
{paymentMode === 'self_managed' && (
  <div>
    <h3>Payment Instructions</h3>
    <p>Provide at least one way for winners to pay you.</p>
    
    <Textarea
      label="Payment Instructions"
      placeholder="e.g., Send payment via Venmo to @OurOrganization&#10;Include your name and item won in the memo"
      value={paymentInstructions}
      onChange={setPaymentInstructions}
    />
    
    <Input
      label="Payment Link (optional)"
      type="url"
      placeholder="https://venmo.com/YourOrg or https://paypal.me/YourOrg"
      value={paymentLink}
      onChange={setPaymentLink}
    />
    
    <FileUpload
      label="Payment QR Code (optional)"
      accept="image/*"
      value={paymentQrCodeUrl}
      onChange={handleQrUpload}
    />
    {/* Or generate QR from link */}
    {paymentLink && !paymentQrCodeUrl && (
      <Button onClick={generateQrFromLink}>Generate QR Code</Button>
    )}
    
    <Input
      label="Payment Due (days after auction ends)"
      type="number"
      min={1}
      max={30}
      value={paymentDueDays}
      onChange={setPaymentDueDays}
    />
    
    <Checkbox
      label="Send payment reminder emails to winners"
      checked={sendPaymentReminders}
      onChange={setSendPaymentReminders}
    />
  </div>
)}

// 3. Fulfillment Configuration
<RadioGroup
  label="How will items be delivered?"
  value={fulfillmentType}
  onChange={setFulfillmentType}
>
  <Radio value="shipping">Shipping - We'll mail items to winners</Radio>
  <Radio value="pickup">Pickup - Winners pick up items at a location</Radio>
  <Radio value="both">Both - Winners can choose shipping or pickup</Radio>
  <Radio value="digital">Digital - Items delivered electronically</Radio>
</RadioGroup>

{['pickup', 'both'].includes(fulfillmentType) && (
  <div>
    <h3>Pickup Details</h3>
    <Input
      label="Pickup Location Name"
      placeholder="e.g., Community Center Main Office"
      value={pickupLocation}
      onChange={setPickupLocation}
    />
    <AddressInput
      label="Pickup Address"
      value={pickupAddress}
      onChange={setPickupAddress}
    />
    <Input
      label="Pickup Dates & Times"
      placeholder="e.g., Dec 15-17, 10am-4pm"
      value={pickupDates}
      onChange={setPickupDates}
    />
    <Textarea
      label="Pickup Instructions (optional)"
      placeholder="e.g., Enter through the side door, ask for Maria"
      value={pickupInstructions}
      onChange={setPickupInstructions}
    />
  </div>
)}
```

### 5.2 Organization Payment Dashboard

**File:** `src/pages/OrgEventPayments.tsx` (new)

Dashboard for organizations to track and manage payments:

```tsx
// Route: /organizations/:slug/events/:eventId/payments

function OrgEventPayments() {
  const { eventId } = useParams();
  const { data: summary } = usePaymentSummary(eventId);
  const { data: items } = useEventItemsWithPayment(eventId);
  
  return (
    <div>
      <h1>Payment Tracking</h1>
      
      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <SummaryCard
          label="Total Items Sold"
          value={summary.totalItems}
          subtext={`$${summary.totalValue.toFixed(2)} total`}
        />
        <SummaryCard
          label="Paid"
          value={summary.byStatus.paid.count}
          subtext={`$${summary.byStatus.paid.value.toFixed(2)}`}
          variant="success"
        />
        <SummaryCard
          label="Awaiting Payment"
          value={summary.byStatus.pending.count}
          subtext={`$${summary.byStatus.pending.value.toFixed(2)}`}
          variant="warning"
        />
        <SummaryCard
          label="Issues"
          value={summary.byStatus.paymentIssue.count}
          variant="error"
        />
      </div>
      
      {/* Filter Tabs */}
      <Tabs>
        <Tab label="All" count={summary.totalItems} />
        <Tab label="Awaiting Payment" count={summary.byStatus.pending.count} />
        <Tab label="Paid" count={summary.byStatus.paid.count} />
        <Tab label="Issues" count={summary.byStatus.paymentIssue.count} />
      </Tabs>
      
      {/* Bulk Actions */}
      <div className="flex gap-2">
        <Button onClick={handleBulkMarkPaid} disabled={selectedItems.length === 0}>
          Mark Selected as Paid
        </Button>
        <Button onClick={handleSendReminders} disabled={selectedItems.length === 0}>
          Send Payment Reminder
        </Button>
        <Button onClick={handleExportCsv}>
          Export CSV
        </Button>
      </div>
      
      {/* Items Table */}
      <Table>
        <TableHead>
          <Checkbox checked={allSelected} onChange={toggleAll} />
          <Column>Item</Column>
          <Column>Winner</Column>
          <Column>Amount</Column>
          <Column>Won Date</Column>
          <Column>Payment Status</Column>
          <Column>Actions</Column>
        </TableHead>
        <TableBody>
          {items.map(item => (
            <TableRow key={item.id}>
              <Checkbox 
                checked={selectedItems.includes(item.id)} 
                onChange={() => toggleItem(item.id)} 
              />
              <Cell>
                <div className="flex items-center gap-2">
                  <img src={item.imageUrl} className="w-10 h-10 rounded" />
                  <span>{item.name}</span>
                </div>
              </Cell>
              <Cell>
                <div>
                  <div>{item.winnerName}</div>
                  <div className="text-sm text-gray-500">{item.winnerEmail}</div>
                </div>
              </Cell>
              <Cell>${item.winningBid.toFixed(2)}</Cell>
              <Cell>{formatDate(item.wonAt)}</Cell>
              <Cell>
                <PaymentStatusBadge status={item.paymentStatus} />
              </Cell>
              <Cell>
                <DropdownMenu>
                  {item.paymentStatus === 'pending' && (
                    <>
                      <MenuItem onClick={() => markAsPaid(item.id)}>
                        Mark as Paid
                      </MenuItem>
                      <MenuItem onClick={() => markAsIssue(item.id)}>
                        Mark as Issue
                      </MenuItem>
                      <MenuItem onClick={() => sendReminder(item.id)}>
                        Send Reminder
                      </MenuItem>
                    </>
                  )}
                  {item.paymentStatus === 'paid' && (
                    <MenuItem onClick={() => markAsPending(item.id)}>
                      Mark as Unpaid
                    </MenuItem>
                  )}
                  <MenuItem onClick={() => contactWinner(item)}>
                    Contact Winner
                  </MenuItem>
                  <MenuItem onClick={() => viewDetails(item.id)}>
                    View Details
                  </MenuItem>
                </DropdownMenu>
              </Cell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

### 5.3 Organization Fulfillment Dashboard

**File:** `src/pages/OrgEventFulfillment.tsx` (new)

Dashboard for organizations to track and update fulfillment:

```tsx
// Route: /organizations/:slug/events/:eventId/fulfillment

function OrgEventFulfillment() {
  const { eventId } = useParams();
  const { data: items } = useEventItemsWithFulfillment(eventId);
  
  return (
    <div>
      <h1>Fulfillment Tracking</h1>
      
      {/* Summary by status */}
      <div className="grid grid-cols-5 gap-4">
        <SummaryCard label="Pending" value={counts.pending} />
        <SummaryCard label="Processing" value={counts.processing} />
        <SummaryCard label="Ready for Pickup" value={counts.readyForPickup} />
        <SummaryCard label="Shipped" value={counts.shipped} />
        <SummaryCard label="Complete" value={counts.delivered + counts.pickedUp} variant="success" />
      </div>
      
      {/* Filter to show only paid items */}
      <Checkbox 
        label="Only show paid items" 
        checked={filterPaid}
        onChange={setFilterPaid}
      />
      
      {/* Items with fulfillment actions */}
      {items.map(item => (
        <FulfillmentCard
          key={item.id}
          item={item}
          onStatusUpdate={handleStatusUpdate}
        />
      ))}
    </div>
  );
}

function FulfillmentCard({ item, onStatusUpdate }) {
  const [showShippingForm, setShowShippingForm] = useState(false);
  
  return (
    <Card>
      <div className="flex gap-4">
        <img src={item.imageUrl} className="w-20 h-20 rounded" />
        <div className="flex-1">
          <h3>{item.name}</h3>
          <p>Winner: {item.winnerName}</p>
          <p>Payment: <PaymentStatusBadge status={item.paymentStatus} /></p>
          <p>Fulfillment: <FulfillmentStatusBadge status={item.fulfillmentStatus} /></p>
        </div>
        <div className="flex flex-col gap-2">
          {/* Actions based on current status and fulfillment type */}
          {item.paymentStatus === 'paid' && item.fulfillmentStatus === 'pending' && (
            <>
              {item.fulfillmentType === 'shipping' && (
                <Button onClick={() => setShowShippingForm(true)}>
                  Add Tracking
                </Button>
              )}
              {item.fulfillmentType === 'pickup' && (
                <Button onClick={() => onStatusUpdate(item.id, 'ready_for_pickup')}>
                  Mark Ready for Pickup
                </Button>
              )}
            </>
          )}
          
          {item.fulfillmentStatus === 'ready_for_pickup' && (
            <Button onClick={() => openPickupConfirmModal(item)}>
              Confirm Pickup
            </Button>
          )}
          
          {item.fulfillmentStatus === 'shipped' && (
            <Button onClick={() => onStatusUpdate(item.id, 'delivered')}>
              Mark Delivered
            </Button>
          )}
        </div>
      </div>
      
      {/* Shipping form */}
      {showShippingForm && (
        <ShippingForm
          itemId={item.id}
          onSubmit={async (data) => {
            await onStatusUpdate(item.id, 'shipped', data);
            setShowShippingForm(false);
          }}
          onCancel={() => setShowShippingForm(false)}
        />
      )}
      
      {/* Show tracking info if shipped */}
      {item.trackingNumber && (
        <div className="mt-4 p-3 bg-gray-50 rounded">
          <p><strong>Tracking:</strong> {item.trackingNumber}</p>
          <p><strong>Carrier:</strong> {item.trackingCarrier}</p>
          <a href={item.trackingUrl} target="_blank" className="text-blue-600">
            Track Package →
          </a>
        </div>
      )}
    </Card>
  );
}
```

### 5.4 Winner's Won Items Page

**File:** `src/pages/MyWonItems.tsx` (new)

Page for winners to see their won items and payment/fulfillment status:

```tsx
// Route: /my/won-items

function MyWonItems() {
  const { data: items, isLoading } = useMyWonItems();
  
  if (isLoading) return <Loading />;
  if (!items?.length) return <EmptyState message="You haven't won any items yet!" />;
  
  return (
    <div>
      <h1>My Won Items</h1>
      
      <div className="space-y-6">
        {items.map(item => (
          <WonItemCard key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function WonItemCard({ item }) {
  return (
    <Card>
      <div className="flex gap-4">
        <img src={item.imageUrl} className="w-24 h-24 rounded" />
        
        <div className="flex-1">
          <h3 className="font-semibold">{item.name}</h3>
          <p className="text-gray-600">From: {item.event.organizationName}</p>
          <p className="text-lg font-bold">${item.winningBid.toFixed(2)}</p>
          <p className="text-sm text-gray-500">Won on {formatDate(item.wonAt)}</p>
        </div>
        
        <div className="text-right">
          <PaymentStatusBadge status={item.paymentStatus} />
          <FulfillmentStatusBadge status={item.fulfillmentStatus} />
        </div>
      </div>
      
      {/* Payment info (if self-managed and pending) */}
      {item.event.paymentMode === 'self_managed' && item.paymentStatus === 'pending' && (
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
          <h4 className="font-semibold mb-2">Payment Required</h4>
          <p className="text-sm text-gray-600 mb-3">
            Please pay by {formatDate(item.paymentDueDate)}
          </p>
          
          {item.event.paymentInstructions && (
            <div className="mb-3 whitespace-pre-wrap">
              {item.event.paymentInstructions}
            </div>
          )}
          
          {item.event.paymentLink && (
            <a 
              href={item.event.paymentLink} 
              target="_blank"
              className="inline-block px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Pay Now →
            </a>
          )}
          
          {item.event.paymentQrCodeUrl && (
            <div className="mt-3">
              <p className="text-sm mb-2">Or scan QR code:</p>
              <img 
                src={item.event.paymentQrCodeUrl} 
                alt="Payment QR Code"
                className="w-32 h-32"
              />
            </div>
          )}
        </div>
      )}
      
      {/* Payment confirmed message */}
      {item.paymentStatus === 'paid' && item.fulfillmentStatus === 'pending' && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
          <p className="text-green-800">
            ✓ Payment confirmed! Your item will be {item.fulfillmentType === 'shipping' ? 'shipped' : 'ready for pickup'} soon.
          </p>
        </div>
      )}
      
      {/* Shipping info */}
      {item.tracking && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
          <h4 className="font-semibold mb-2">📦 Shipping Information</h4>
          <p><strong>Carrier:</strong> {item.tracking.carrier}</p>
          <p><strong>Tracking:</strong> {item.tracking.number}</p>
          {item.tracking.estimatedDelivery && (
            <p><strong>Est. Delivery:</strong> {item.tracking.estimatedDelivery}</p>
          )}
          <a 
            href={item.tracking.url}
            target="_blank"
            className="mt-2 inline-block text-blue-600 hover:underline"
          >
            Track Package →
          </a>
        </div>
      )}
      
      {/* Pickup info */}
      {item.pickup && (
        <div className="mt-4 p-4 bg-purple-50 border border-purple-200 rounded">
          <h4 className="font-semibold mb-2">📍 Pickup Information</h4>
          {item.pickup.isReady ? (
            <p className="text-green-600 font-semibold mb-2">✓ Ready for pickup!</p>
          ) : (
            <p className="text-gray-600 mb-2">Your item will be ready soon.</p>
          )}
          <p><strong>Location:</strong> {item.pickup.location}</p>
          {item.pickup.address && <p>{item.pickup.address}</p>}
          <p><strong>Available:</strong> {item.pickup.dates}</p>
          {item.pickup.instructions && (
            <p className="mt-2 text-sm">{item.pickup.instructions}</p>
          )}
        </div>
      )}
      
      {/* Digital delivery */}
      {item.digital?.deliveredAt && (
        <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded">
          <h4 className="font-semibold mb-2">📧 Digital Delivery</h4>
          <div className="whitespace-pre-wrap">{item.digital.deliveryInfo}</div>
        </div>
      )}
    </Card>
  );
}
```

### 5.5 Status Badge Components

**File:** `src/components/StatusBadges.tsx`

```tsx
function PaymentStatusBadge({ status }: { status: string }) {
  const config = {
    pending: { label: 'Awaiting Payment', color: 'yellow' },
    paid: { label: 'Paid', color: 'green' },
    payment_issue: { label: 'Payment Issue', color: 'red' },
    waived: { label: 'Waived', color: 'gray' },
    refunded: { label: 'Refunded', color: 'gray' },
  }[status] || { label: status, color: 'gray' };
  
  return <Badge color={config.color}>{config.label}</Badge>;
}

function FulfillmentStatusBadge({ status }: { status: string }) {
  const config = {
    pending: { label: 'Pending', color: 'gray' },
    processing: { label: 'Processing', color: 'blue' },
    ready_for_pickup: { label: 'Ready for Pickup', color: 'purple' },
    shipped: { label: 'Shipped', color: 'blue' },
    out_for_delivery: { label: 'Out for Delivery', color: 'blue' },
    delivered: { label: 'Delivered', color: 'green' },
    picked_up: { label: 'Picked Up', color: 'green' },
    issue: { label: 'Issue', color: 'red' },
  }[status] || { label: status, color: 'gray' };
  
  return <Badge color={config.color}>{config.label}</Badge>;
}
```

---

## Phase 6: Update Existing Logic

### 6.1 Update Winner Determination

When an auction ends, the existing winner determination logic should trigger different notifications based on payment mode:

**File:** `src/services/auctionService.ts` (or similar)

```typescript
async function handleAuctionEnd(eventId: string) {
  const event = await getEvent(eventId);
  const items = await getEventItems(eventId);
  
  for (const item of items) {
    const winner = await determineWinner(item);
    if (!winner) continue;
    
    // Update item with winner info
    await updateEventItem(item.id, {
      winnerId: winner.userId,
      winningBid: winner.amount,
      wonAt: new Date(),
      paymentStatus: 'pending',
      fulfillmentStatus: 'pending',
    });
    
    // Send appropriate notification based on payment mode
    if (event.paymentMode === 'self_managed') {
      await sendWinnerNotificationSelfManaged({
        to: winner.email,
        winnerName: winner.displayName,
        itemName: item.name,
        winningBid: winner.amount,
        wonAt: new Date(),
        organizationName: event.organization.name,
        organizationEmail: event.organization.contactEmail,
        paymentInstructions: event.paymentInstructions,
        paymentLink: event.paymentLink,
        paymentQrCodeUrl: event.paymentQrCodeUrl,
        paymentDueDays: event.paymentDueDays,
        fulfillmentType: event.fulfillmentType,
        pickupLocation: event.pickupLocation,
        pickupAddress: formatAddress(event),
        pickupDates: event.pickupDates,
        pickupInstructions: event.pickupInstructions,
      });
    } else {
      // Existing integrated payment flow
      await sendWinnerNotificationIntegrated(/* ... */);
    }
  }
}
```

### 6.2 Trigger Emails on Status Changes

When payment or fulfillment status is updated, send appropriate emails:

**File:** `src/routes/eventItems.ts`

```typescript
// In PATCH /api/event-items/:itemId/payment-status handler
if (newStatus === 'paid' && oldStatus !== 'paid') {
  await sendPaymentConfirmed({
    to: item.winner.email,
    winnerName: item.winner.displayName,
    itemName: item.name,
    amount: item.winningBid,
    organizationName: event.organization.name,
    fulfillmentType: item.fulfillmentType || event.fulfillmentType,
    pickupLocation: event.pickupLocation,
    pickupAddress: formatAddress(event),
    pickupDates: event.pickupDates,
  });
}

// In PATCH /api/event-items/:itemId/fulfillment-status handler
if (newStatus === 'shipped' && oldStatus !== 'shipped') {
  await sendItemShipped({
    to: item.winner.email,
    winnerName: item.winner.displayName,
    itemName: item.name,
    carrier: data.trackingCarrier,
    trackingNumber: data.trackingNumber,
    trackingUrl: getTrackingUrl(data.trackingCarrier, data.trackingNumber),
    estimatedDelivery: data.estimatedDelivery,
  });
}

if (newStatus === 'ready_for_pickup' && oldStatus !== 'ready_for_pickup') {
  await sendReadyForPickup({
    to: item.winner.email,
    winnerName: item.winner.displayName,
    itemName: item.name,
    pickupLocation: event.pickupLocation,
    pickupAddress: formatAddress(event),
    pickupDates: event.pickupDates,
    pickupInstructions: event.pickupInstructions,
  });
}
```

---

## Phase 7: Navigation & Routing

### 7.1 Add Routes

**File:** `src/App.tsx` or `src/routes/index.tsx`

```tsx
// Add new routes
<Route path="/my/won-items" element={<MyWonItems />} />

<Route path="/organizations/:slug/events/:eventId/payments" element={<OrgEventPayments />} />
<Route path="/organizations/:slug/events/:eventId/fulfillment" element={<OrgEventFulfillment />} />
```

### 7.2 Add Navigation Links

In organization event management:

```tsx
// Event management tabs/nav
<NavLink to={`/organizations/${slug}/events/${eventId}`}>Overview</NavLink>
<NavLink to={`/organizations/${slug}/events/${eventId}/items`}>Items</NavLink>
<NavLink to={`/organizations/${slug}/events/${eventId}/payments`}>Payments</NavLink>
<NavLink to={`/organizations/${slug}/events/${eventId}/fulfillment`}>Fulfillment</NavLink>
```

In user navigation:

```tsx
// User dropdown or sidebar
<NavLink to="/my/won-items">My Won Items</NavLink>
```

---

## Testing Checklist

### Database
- [ ] Migration runs without errors
- [ ] Existing events default to 'integrated' payment mode
- [ ] All new columns have appropriate defaults

### Event Creation
- [ ] Can create event with self-managed payments
- [ ] Validation requires payment info when self-managed
- [ ] Can upload QR code image
- [ ] Can generate QR code from link
- [ ] Pickup details save correctly

### Winner Flow
- [ ] Winner notification email sent with correct template (self-managed vs integrated)
- [ ] Payment instructions appear correctly in email
- [ ] QR code appears in email if provided
- [ ] Payment link is clickable

### Payment Tracking
- [ ] Org can mark items as paid
- [ ] Org can mark items as payment issue
- [ ] Bulk actions work
- [ ] Payment confirmation email sent to winner
- [ ] Payment status badge updates correctly

### Fulfillment Tracking
- [ ] Org can add shipping info
- [ ] Tracking URL generated correctly for each carrier
- [ ] Shipped notification email sent
- [ ] Org can mark ready for pickup
- [ ] Ready for pickup email sent
- [ ] Org can confirm pickup
- [ ] Status badges update correctly

### Winner Dashboard
- [ ] Won items page shows all won items
- [ ] Payment instructions visible for unpaid items
- [ ] Tracking info visible for shipped items
- [ ] Pickup info visible for pickup items

### Payment Reminders
- [ ] Reminder job runs without errors
- [ ] Reminders sent at correct intervals
- [ ] Reminders not sent after payment confirmed
- [ ] Reminder count tracked correctly

---

## Files to Create/Modify

### New Files
1. `migrations/YYYYMMDD_add_self_managed_payments.sql`
2. `src/emails/templates/winner-self-managed.ts`
3. `src/emails/templates/payment-reminder.ts`
4. `src/emails/templates/payment-confirmed.ts`
5. `src/emails/templates/item-shipped.ts`
6. `src/emails/templates/ready-for-pickup.ts`
7. `src/jobs/paymentReminders.ts`
8. `src/pages/OrgEventPayments.tsx`
9. `src/pages/OrgEventFulfillment.tsx`
10. `src/pages/MyWonItems.tsx`
11. `src/components/StatusBadges.tsx`
12. `src/components/ShippingForm.tsx`

### Modified Files
1. `src/routes/events.ts` - Add payment mode fields to create/update
2. `src/routes/eventItems.ts` - Add payment/fulfillment status endpoints
3. `src/routes/users.ts` - Add won items endpoint
4. `src/services/emailService.ts` - Add new email functions
5. `src/services/auctionService.ts` - Update winner notification logic
6. `src/components/EventForm.tsx` - Add payment mode UI
7. `src/App.tsx` - Add new routes
8. `src/jobs/index.ts` - Register reminder job

---

## Estimated Effort

| Phase | Estimated Time |
|-------|----------------|
| Phase 1: Database | 1-2 hours |
| Phase 2: API Endpoints | 3-4 hours |
| Phase 3: Email Templates | 2-3 hours |
| Phase 4: Background Jobs | 1-2 hours |
| Phase 5: Frontend Components | 6-8 hours |
| Phase 6: Update Existing Logic | 2-3 hours |
| Phase 7: Navigation & Routing | 1 hour |
| Testing | 2-3 hours |

**Total: 18-26 hours (3-4 days)**

---

## Notes for Claude Code

1. **Start with the database migration** - Run this first so all other code can reference the new columns

2. **Use existing patterns** - Look at how existing event creation, email sending, and status updates work and follow the same patterns

3. **TypeScript types** - Create interfaces for all new request/response shapes

4. **Error handling** - Add appropriate error handling for all new endpoints

5. **Authorization** - Ensure payment/fulfillment status updates are only allowed by org admins

6. **Email templates** - If using a template engine (Handlebars, etc.), follow existing template patterns

7. **Testing** - Create tests for critical paths (winner notification, payment status updates)
