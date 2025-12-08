# UAT Environment & Testing Plan

## Overview

This document outlines the implementation of a User Acceptance Testing (UAT) environment for Very Good Auctions. The UAT environment allows invited testers to interact with the platform in a sandbox that mirrors production but with time controls and no real payments.

**Key Features:**
- Separate UAT environment accessible via different URL
- Email invitation system for UAT participants
- Time/phase manipulation controls for testing auction flows
- Feedback collection from testers
- Isolated test data

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PRODUCTION                                         │
│                     verygoodauctions.com                                     │
│                                                                              │
│  • Real users                                                                │
│  • Real payments (Stripe Connect)                                            │
│  • Real emails                                                               │
│  • Real time                                                                 │
│  • Production database                                                       │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                              UAT                                             │
│                     uat.verygoodauctions.com                                 │
│                                                                              │
│  • Invited testers only                                                      │
│  • Stripe test mode (fake payments)                                          │
│  • Emails only to testers (or captured)                                      │
│  • Simulated time controls                                                   │
│  • Separate UAT database                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: UAT Environment Setup

### 1.1 Infrastructure Options

| Option | Pros | Cons | Cost |
|--------|------|------|------|
| **Separate Azure App Service** | Full isolation, independent scaling | Higher cost, more maintenance | ~$50-100/mo |
| **Deployment Slot** | Easy swap, same resources | Shares resources with prod | ~$20/mo |
| **Container Instance** | Cheap, disposable | Manual setup, no auto-scale | ~$30/mo |
| **Feature Flag in Prod** | No extra infra | Risk of data mixing | $0 |

**Recommendation:** Deployment Slot for Azure App Service (or separate environment in your hosting platform).

### 1.2 Environment Configuration

**UAT Environment Variables:**

```bash
# UAT-specific settings
NODE_ENV=uat
APP_URL=https://uat.verygoodauctions.com
FRONTEND_URL=https://uat.verygoodauctions.com

# Separate database
DATABASE_URL=<uat-database-connection-string>

# Stripe TEST mode keys (not production!)
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxx
STRIPE_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxx

# Email configuration - use test mode or capture
EMAIL_MODE=capture  # Options: capture, sandbox, restricted
EMAIL_CAPTURE_ADDRESS=uat-emails@verygoodauctions.com
# Or use services like Mailtrap, Mailhog

# UAT features enabled
UAT_MODE=true
UAT_TIME_CONTROLS=true
UAT_FEEDBACK_ENABLED=true

# Optional: Seed data on deploy
UAT_SEED_ON_DEPLOY=true
```

### 1.3 Database Setup

Create a separate database for UAT with seed data:

```sql
-- UAT database should be a copy of production schema
-- but with test data, not real user data

-- Add UAT-specific tables
CREATE TABLE uat_sessions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    name NVARCHAR(255) NOT NULL,           -- "Sprint 5 Testing", "Beta Round 2"
    description NVARCHAR(MAX),
    
    -- Session timing
    starts_at DATETIME2 NOT NULL,
    ends_at DATETIME2,
    status NVARCHAR(20) DEFAULT 'scheduled' CHECK (status IN (
        'scheduled',
        'active',
        'paused',
        'completed'
    )),
    
    -- Configuration
    features_to_test NVARCHAR(MAX),         -- JSON array of features
    test_scenarios NVARCHAR(MAX),           -- JSON array of scenarios
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    created_by NVARCHAR(128)
);

CREATE TABLE uat_testers (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    
    -- Invitation
    email NVARCHAR(255) NOT NULL,
    name NVARCHAR(255),
    invitation_token NVARCHAR(64) UNIQUE,
    invitation_sent_at DATETIME2,
    invitation_expires_at DATETIME2,
    
    -- Status
    status NVARCHAR(20) DEFAULT 'invited' CHECK (status IN (
        'invited',        -- Email sent, not yet registered
        'registered',     -- Created account
        'active',         -- Participating in testing
        'inactive'        -- No longer testing
    )),
    registered_at DATETIME2,
    last_active_at DATETIME2,
    
    -- Linked user (after registration)
    user_id NVARCHAR(128),
    
    -- UAT session (optional - can be session-specific or general)
    uat_session_id UNIQUEIDENTIFIER,
    
    -- Tester role
    role NVARCHAR(20) DEFAULT 'tester' CHECK (role IN (
        'tester',         -- Regular tester
        'power_tester',   -- Can access more controls
        'admin'           -- Full UAT admin
    )),
    
    -- Contact preferences
    notify_on_new_session BIT DEFAULT 1,
    notify_on_session_start BIT DEFAULT 1,
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (uat_session_id) REFERENCES uat_sessions(id)
);

CREATE INDEX idx_uat_testers_email ON uat_testers(email);
CREATE INDEX idx_uat_testers_token ON uat_testers(invitation_token);

CREATE TABLE uat_feedback (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    
    -- Who submitted
    tester_id UNIQUEIDENTIFIER NOT NULL,
    user_id NVARCHAR(128),
    
    -- Context
    uat_session_id UNIQUEIDENTIFIER,
    page_url NVARCHAR(500),
    feature_area NVARCHAR(100),             -- e.g., "bidding", "checkout", "org-dashboard"
    
    -- Feedback content
    feedback_type NVARCHAR(20) CHECK (feedback_type IN (
        'bug',
        'suggestion',
        'question',
        'praise',
        'other'
    )),
    title NVARCHAR(255),
    description NVARCHAR(MAX),
    steps_to_reproduce NVARCHAR(MAX),
    expected_behavior NVARCHAR(MAX),
    actual_behavior NVARCHAR(MAX),
    
    -- Attachments
    screenshot_urls NVARCHAR(MAX),          -- JSON array of URLs
    
    -- Browser/device info (auto-captured)
    browser_info NVARCHAR(500),
    device_info NVARCHAR(255),
    screen_resolution NVARCHAR(50),
    
    -- Status tracking
    status NVARCHAR(20) DEFAULT 'new' CHECK (status IN (
        'new',
        'reviewed',
        'in_progress',
        'resolved',
        'wont_fix',
        'duplicate'
    )),
    priority NVARCHAR(20) CHECK (priority IN (
        'critical',
        'high',
        'medium',
        'low'
    )),
    assigned_to NVARCHAR(128),
    resolution_notes NVARCHAR(MAX),
    resolved_at DATETIME2,
    
    -- Metadata
    submitted_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (tester_id) REFERENCES uat_testers(id),
    FOREIGN KEY (uat_session_id) REFERENCES uat_sessions(id)
);

CREATE INDEX idx_uat_feedback_session ON uat_feedback(uat_session_id, status);
CREATE INDEX idx_uat_feedback_tester ON uat_feedback(tester_id);
```

---

## Phase 2: Tester Invitation System

### 2.1 Invitation Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    ADMIN INVITES TESTERS                                     │
│                                                                              │
│  • Enter email addresses (bulk or individual)                                │
│  • Optionally assign to UAT session                                          │
│  • Set role (tester, power_tester)                                           │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    INVITATION EMAIL SENT                                     │
│                                                                              │
│  Subject: You're invited to test Very Good Auctions!                         │
│                                                                              │
│  Contains:                                                                   │
│  • Unique invitation link                                                    │
│  • What to expect                                                            │
│  • Testing guidelines                                                        │
│  • Link expires in 7 days                                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TESTER CLICKS LINK                                        │
│                                                                              │
│  uat.verygoodauctions.com/invite/[TOKEN]                                    │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TESTER REGISTERS                                          │
│                                                                              │
│  • Create account (or link existing)                                         │
│  • Accept testing agreement                                                  │
│  • See welcome/orientation                                                   │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                    TESTER ACCESSES UAT                                       │
│                                                                              │
│  • Full access to UAT environment                                            │
│  • Feedback widget always visible                                            │
│  • UAT controls panel (if power_tester)                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Invitation API Endpoints

**File:** `src/routes/uat/testers.ts`

```typescript
import { Router } from 'express';
import { requireAuth, requireUatAdmin } from '../../middleware/auth';
import crypto from 'crypto';

const router = Router();

/**
 * POST /api/uat/testers/invite
 * 
 * Invite one or more testers to UAT.
 */
router.post(
  '/invite',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    const { emails, sessionId, role = 'tester', message } = req.body;
    
    // Normalize emails to array
    const emailList = Array.isArray(emails) 
      ? emails 
      : emails.split(/[,;\n]/).map(e => e.trim()).filter(Boolean);
    
    const results = [];
    
    for (const email of emailList) {
      // Check if already invited
      const existing = await db.query(
        `SELECT id, status FROM uat_testers WHERE email = @email`,
        { email: email.toLowerCase() }
      );
      
      if (existing.length > 0) {
        results.push({ 
          email, 
          status: 'already_invited',
          currentStatus: existing[0].status 
        });
        continue;
      }
      
      // Generate invitation token
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      
      // Create tester record
      const testerId = await db.query(`
        INSERT INTO uat_testers (
          email, invitation_token, invitation_expires_at, 
          role, uat_session_id, invitation_sent_at
        ) OUTPUT INSERTED.id VALUES (
          @email, @token, @expiresAt, @role, @sessionId, GETUTCDATE()
        )
      `, {
        email: email.toLowerCase(),
        token,
        expiresAt,
        role,
        sessionId: sessionId || null,
      });
      
      // Send invitation email
      await sendUatInvitation({
        to: email,
        inviteUrl: `${process.env.APP_URL}/invite/${token}`,
        expiresAt,
        customMessage: message,
        sessionName: sessionId ? await getSessionName(sessionId) : null,
      });
      
      results.push({ email, status: 'invited', testerId: testerId[0].id });
    }
    
    return res.json({
      success: true,
      results,
      summary: {
        invited: results.filter(r => r.status === 'invited').length,
        alreadyInvited: results.filter(r => r.status === 'already_invited').length,
      }
    });
  }
);

/**
 * POST /api/uat/testers/invite/:testerId/resend
 * 
 * Resend invitation email.
 */
router.post(
  '/invite/:testerId/resend',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    const { testerId } = req.params;
    
    const tester = await db.query(
      `SELECT * FROM uat_testers WHERE id = @id`,
      { id: testerId }
    );
    
    if (!tester.length) {
      return res.status(404).json({ error: 'Tester not found' });
    }
    
    if (tester[0].status !== 'invited') {
      return res.status(400).json({ error: 'Tester has already registered' });
    }
    
    // Generate new token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    await db.query(`
      UPDATE uat_testers SET
        invitation_token = @token,
        invitation_expires_at = @expiresAt,
        invitation_sent_at = GETUTCDATE()
      WHERE id = @id
    `, { id: testerId, token, expiresAt });
    
    await sendUatInvitation({
      to: tester[0].email,
      inviteUrl: `${process.env.APP_URL}/invite/${token}`,
      expiresAt,
    });
    
    return res.json({ success: true });
  }
);

/**
 * GET /api/uat/testers
 * 
 * List all testers.
 */
router.get(
  '/',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    const { status, sessionId } = req.query;
    
    let query = `
      SELECT 
        t.*,
        u.email as user_email,
        u.display_name as user_name,
        s.name as session_name,
        (SELECT COUNT(*) FROM uat_feedback WHERE tester_id = t.id) as feedback_count
      FROM uat_testers t
      LEFT JOIN users u ON t.user_id = u.id
      LEFT JOIN uat_sessions s ON t.uat_session_id = s.id
      WHERE 1=1
    `;
    
    const params: any = {};
    
    if (status) {
      query += ` AND t.status = @status`;
      params.status = status;
    }
    
    if (sessionId) {
      query += ` AND t.uat_session_id = @sessionId`;
      params.sessionId = sessionId;
    }
    
    query += ` ORDER BY t.created_at DESC`;
    
    const testers = await db.query(query, params);
    
    // Get counts by status
    const counts = await db.query(`
      SELECT status, COUNT(*) as count
      FROM uat_testers
      GROUP BY status
    `);
    
    return res.json({
      testers,
      counts: {
        invited: counts.find(c => c.status === 'invited')?.count || 0,
        registered: counts.find(c => c.status === 'registered')?.count || 0,
        active: counts.find(c => c.status === 'active')?.count || 0,
        inactive: counts.find(c => c.status === 'inactive')?.count || 0,
        total: testers.length,
      }
    });
  }
);

/**
 * DELETE /api/uat/testers/:testerId
 * 
 * Remove a tester.
 */
router.delete(
  '/:testerId',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    const { testerId } = req.params;
    
    // Soft delete - mark as inactive
    await db.query(`
      UPDATE uat_testers SET status = 'inactive' WHERE id = @id
    `, { id: testerId });
    
    return res.json({ success: true });
  }
);

/**
 * PATCH /api/uat/testers/:testerId/role
 * 
 * Update tester role.
 */
router.patch(
  '/:testerId/role',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    const { testerId } = req.params;
    const { role } = req.body;
    
    if (!['tester', 'power_tester', 'admin'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    
    await db.query(`
      UPDATE uat_testers SET role = @role WHERE id = @id
    `, { id: testerId, role });
    
    return res.json({ success: true });
  }
);

export default router;
```

### 2.3 Invitation Acceptance Endpoint

**File:** `src/routes/uat/invite.ts`

```typescript
import { Router } from 'express';

const router = Router();

/**
 * GET /api/uat/invite/:token
 * 
 * Validate invitation token and return info.
 */
router.get('/:token', async (req, res) => {
  const { token } = req.params;
  
  const tester = await db.query(`
    SELECT 
      t.*,
      s.name as session_name,
      s.description as session_description
    FROM uat_testers t
    LEFT JOIN uat_sessions s ON t.uat_session_id = s.id
    WHERE t.invitation_token = @token
  `, { token });
  
  if (!tester.length) {
    return res.status(404).json({ error: 'Invalid invitation link' });
  }
  
  const t = tester[0];
  
  // Check expiration
  if (new Date(t.invitation_expires_at) < new Date()) {
    return res.status(410).json({ error: 'This invitation has expired' });
  }
  
  // Check if already registered
  if (t.status !== 'invited') {
    return res.status(400).json({ 
      error: 'This invitation has already been used',
      redirectTo: '/login'
    });
  }
  
  return res.json({
    email: t.email,
    name: t.name,
    session: t.session_name ? {
      name: t.session_name,
      description: t.session_description,
    } : null,
  });
});

/**
 * POST /api/uat/invite/:token/accept
 * 
 * Accept invitation and create/link account.
 */
router.post('/:token/accept', async (req, res) => {
  const { token } = req.params;
  const { 
    name, 
    password,
    existingUserId,  // If linking existing account
    acceptTerms 
  } = req.body;
  
  if (!acceptTerms) {
    return res.status(400).json({ error: 'You must accept the testing agreement' });
  }
  
  const tester = await db.query(`
    SELECT * FROM uat_testers WHERE invitation_token = @token
  `, { token });
  
  if (!tester.length) {
    return res.status(404).json({ error: 'Invalid invitation' });
  }
  
  const t = tester[0];
  
  if (new Date(t.invitation_expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invitation expired' });
  }
  
  if (t.status !== 'invited') {
    return res.status(400).json({ error: 'Already registered' });
  }
  
  let userId: string;
  
  if (existingUserId) {
    // Link to existing account (user logged in)
    userId = existingUserId;
  } else {
    // Create new account
    const user = await createUser({
      email: t.email,
      name: name || t.name,
      password,
      isUatTester: true,
    });
    userId = user.id;
  }
  
  // Update tester record
  await db.query(`
    UPDATE uat_testers SET
      status = 'registered',
      registered_at = GETUTCDATE(),
      user_id = @userId,
      name = COALESCE(@name, name),
      invitation_token = NULL
    WHERE id = @testerId
  `, {
    testerId: t.id,
    userId,
    name,
  });
  
  // Create session for user
  const authToken = await createAuthSession(userId);
  
  return res.json({
    success: true,
    token: authToken,
    redirectTo: '/uat/welcome',
  });
});

export default router;
```

### 2.4 Invitation Email Template

**File:** `src/emails/templates/uat-invitation.ts`

```
Subject: You're invited to test Very Good Auctions! 🧪

---

Hi{{#if name}} {{name}}{{/if}},

You've been invited to participate in User Acceptance Testing (UAT) 
for Very Good Auctions!

{{#if sessionName}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

TESTING SESSION: {{sessionName}}

{{#if sessionDescription}}
{{sessionDescription}}
{{/if}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{/if}}

WHAT IS UAT?

You'll have access to a test version of our auction platform where 
you can explore features, place fake bids, and help us find bugs 
before we launch to real users.

• No real money involved - all payments are simulated
• Your feedback directly shapes the product
• Test at your own pace

{{#if customMessage}}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

MESSAGE FROM THE TEAM:

{{customMessage}}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{{/if}}

[JOIN UAT TESTING → {{inviteUrl}}]

This invitation expires on {{formatDate expiresAt}}.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

WHAT TO EXPECT

1. Click the link above to create your test account
2. Explore the platform - browse auctions, place bids, create organizations
3. Use the feedback button (bottom right) to report bugs or suggestions
4. All data is test data - feel free to experiment!

Thank you for helping us build something great!

The Very Good Auctions Team

---

Questions? Reply to this email or contact us at support@verygoodauctions.com

This is a UAT testing environment. Do not use real payment information.
```

---

## Phase 3: Time & Phase Controls

### 3.1 Add to Existing Events Table

```sql
-- These fields were defined in the previous discussion
-- Adding here for completeness

ALTER TABLE auction_events ADD
    -- Test mode flag
    is_test_event BIT DEFAULT 0,
    
    -- Time simulation
    simulated_current_time DATETIME2,
    
    -- Manual phase override
    phase_override NVARCHAR(20) CHECK (phase_override IN (
        'draft',
        'scheduled',
        'active', 
        'ending_soon',
        'ended',
        'closed'
    ));
```

### 3.2 Global UAT Time Control

For testing, you may want a global time offset that affects all events:

```sql
-- Global UAT settings table
CREATE TABLE uat_settings (
    id INT PRIMARY KEY DEFAULT 1 CHECK (id = 1),  -- Only one row
    
    -- Global time offset (in seconds)
    -- Positive = future, Negative = past
    global_time_offset_seconds BIGINT DEFAULT 0,
    
    -- Pause time (freeze at this moment)
    time_frozen_at DATETIME2,
    is_time_frozen BIT DEFAULT 0,
    
    -- Last modified
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_by NVARCHAR(128)
);

INSERT INTO uat_settings (id) VALUES (1);
```

### 3.3 Phase Service with Global Controls

**File:** `src/services/uatTime.ts`

```typescript
/**
 * Get the effective current time for UAT.
 * Considers: frozen time, global offset, and per-event simulation.
 */
export async function getEffectiveTime(event?: AuctionEvent): Promise<Date> {
  // 1. If event has simulated time, use that
  if (event?.simulated_current_time) {
    return new Date(event.simulated_current_time);
  }
  
  // 2. Check global UAT settings
  const settings = await getUatSettings();
  
  // 3. If time is frozen globally, use frozen time
  if (settings.is_time_frozen && settings.time_frozen_at) {
    return new Date(settings.time_frozen_at);
  }
  
  // 4. Apply global offset
  const now = new Date();
  if (settings.global_time_offset_seconds) {
    return new Date(now.getTime() + (settings.global_time_offset_seconds * 1000));
  }
  
  // 5. Default to real time
  return now;
}

/**
 * Get UAT settings (cached for performance).
 */
let settingsCache: UatSettings | null = null;
let settingsCacheTime = 0;
const CACHE_TTL = 5000; // 5 seconds

async function getUatSettings(): Promise<UatSettings> {
  if (settingsCache && Date.now() - settingsCacheTime < CACHE_TTL) {
    return settingsCache;
  }
  
  const result = await db.query(`SELECT * FROM uat_settings WHERE id = 1`);
  settingsCache = result[0] || { global_time_offset_seconds: 0, is_time_frozen: false };
  settingsCacheTime = Date.now();
  return settingsCache;
}

export function clearSettingsCache() {
  settingsCache = null;
}
```

### 3.4 UAT Time Control Endpoints

**File:** `src/routes/uat/time.ts`

```typescript
import { Router } from 'express';
import { requireAuth, requireUatAdmin } from '../../middleware/auth';
import { clearSettingsCache } from '../../services/uatTime';

const router = Router();

/**
 * GET /api/uat/time
 * 
 * Get current UAT time settings.
 */
router.get('/', requireAuth, async (req, res) => {
  const settings = await db.query(`SELECT * FROM uat_settings WHERE id = 1`);
  const s = settings[0];
  
  const realNow = new Date();
  let effectiveNow = realNow;
  
  if (s.is_time_frozen && s.time_frozen_at) {
    effectiveNow = new Date(s.time_frozen_at);
  } else if (s.global_time_offset_seconds) {
    effectiveNow = new Date(realNow.getTime() + (s.global_time_offset_seconds * 1000));
  }
  
  return res.json({
    realTime: realNow.toISOString(),
    effectiveTime: effectiveNow.toISOString(),
    isFrozen: s.is_time_frozen,
    frozenAt: s.time_frozen_at,
    offsetSeconds: s.global_time_offset_seconds,
    offsetHuman: formatOffset(s.global_time_offset_seconds),
  });
});

/**
 * POST /api/uat/time/offset
 * 
 * Set global time offset.
 */
router.post(
  '/offset',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    const { offset } = req.body;  // e.g., "+2h", "-30m", "+1d", or seconds as number
    
    let offsetSeconds: number;
    
    if (typeof offset === 'number') {
      offsetSeconds = offset;
    } else {
      offsetSeconds = parseOffsetString(offset);
    }
    
    await db.query(`
      UPDATE uat_settings SET
        global_time_offset_seconds = @offset,
        is_time_frozen = 0,
        time_frozen_at = NULL,
        updated_at = GETUTCDATE(),
        updated_by = @userId
      WHERE id = 1
    `, { offset: offsetSeconds, userId: req.user.id });
    
    clearSettingsCache();
    
    return res.json({
      success: true,
      offsetSeconds,
      effectiveTime: new Date(Date.now() + (offsetSeconds * 1000)).toISOString(),
    });
  }
);

/**
 * POST /api/uat/time/freeze
 * 
 * Freeze time at current effective time.
 */
router.post(
  '/freeze',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    const { at } = req.body;  // Optional: specific time to freeze at
    
    const freezeAt = at ? new Date(at) : new Date();
    
    await db.query(`
      UPDATE uat_settings SET
        is_time_frozen = 1,
        time_frozen_at = @freezeAt,
        updated_at = GETUTCDATE(),
        updated_by = @userId
      WHERE id = 1
    `, { freezeAt, userId: req.user.id });
    
    clearSettingsCache();
    
    return res.json({
      success: true,
      frozenAt: freezeAt.toISOString(),
    });
  }
);

/**
 * POST /api/uat/time/unfreeze
 * 
 * Unfreeze time.
 */
router.post(
  '/unfreeze',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    await db.query(`
      UPDATE uat_settings SET
        is_time_frozen = 0,
        time_frozen_at = NULL,
        updated_at = GETUTCDATE(),
        updated_by = @userId
      WHERE id = 1
    `, { userId: req.user.id });
    
    clearSettingsCache();
    
    return res.json({ success: true });
  }
);

/**
 * POST /api/uat/time/reset
 * 
 * Reset to real time (clear offset and unfreeze).
 */
router.post(
  '/reset',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    await db.query(`
      UPDATE uat_settings SET
        global_time_offset_seconds = 0,
        is_time_frozen = 0,
        time_frozen_at = NULL,
        updated_at = GETUTCDATE(),
        updated_by = @userId
      WHERE id = 1
    `, { userId: req.user.id });
    
    clearSettingsCache();
    
    return res.json({ 
      success: true,
      effectiveTime: new Date().toISOString(),
    });
  }
);

/**
 * POST /api/uat/time/advance
 * 
 * Advance time by a duration.
 */
router.post(
  '/advance',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    const { duration } = req.body;  // e.g., "5m", "1h", "1d"
    
    const advanceSeconds = parseOffsetString(duration);
    
    const settings = await db.query(`SELECT * FROM uat_settings WHERE id = 1`);
    const currentOffset = settings[0].global_time_offset_seconds || 0;
    const newOffset = currentOffset + advanceSeconds;
    
    await db.query(`
      UPDATE uat_settings SET
        global_time_offset_seconds = @offset,
        updated_at = GETUTCDATE(),
        updated_by = @userId
      WHERE id = 1
    `, { offset: newOffset, userId: req.user.id });
    
    clearSettingsCache();
    
    return res.json({
      success: true,
      advanced: duration,
      newOffsetSeconds: newOffset,
      effectiveTime: new Date(Date.now() + (newOffset * 1000)).toISOString(),
    });
  }
);

// Helper functions
function parseOffsetString(offset: string): number {
  const match = offset.match(/^([+-]?)(\d+)(s|m|h|d|w)$/);
  if (!match) throw new Error('Invalid offset format. Use format like +2h, -30m, +1d');
  
  const sign = match[1] === '-' ? -1 : 1;
  const value = parseInt(match[2]);
  const unit = match[3];
  
  const multipliers: Record<string, number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
    w: 604800,
  };
  
  return sign * value * multipliers[unit];
}

function formatOffset(seconds: number): string {
  if (seconds === 0) return 'none';
  
  const abs = Math.abs(seconds);
  const sign = seconds > 0 ? '+' : '-';
  
  if (abs >= 604800) return `${sign}${Math.round(abs / 604800)}w`;
  if (abs >= 86400) return `${sign}${Math.round(abs / 86400)}d`;
  if (abs >= 3600) return `${sign}${Math.round(abs / 3600)}h`;
  if (abs >= 60) return `${sign}${Math.round(abs / 60)}m`;
  return `${sign}${abs}s`;
}

export default router;
```

---

## Phase 4: Feedback System

### 4.1 Feedback Widget Component

**File:** `src/components/UatFeedbackWidget.tsx`

```tsx
import { useState } from 'react';

function UatFeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [feedbackType, setFeedbackType] = useState<string>('bug');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  async function captureScreenshot() {
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(document.body);
      setScreenshot(canvas.toDataURL('image/png'));
    } catch (err) {
      console.error('Failed to capture screenshot:', err);
    }
  }
  
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    
    try {
      // Upload screenshot if captured
      let screenshotUrl: string | undefined;
      if (screenshot) {
        const res = await fetch('/api/uat/feedback/upload-screenshot', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: screenshot }),
        });
        const data = await res.json();
        screenshotUrl = data.url;
      }
      
      await fetch('/api/uat/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          feedbackType,
          title,
          description,
          pageUrl: window.location.href,
          screenshotUrls: screenshotUrl ? [screenshotUrl] : [],
          browserInfo: navigator.userAgent,
          screenResolution: `${window.screen.width}x${window.screen.height}`,
        }),
      });
      
      setSubmitted(true);
      setTimeout(() => {
        setIsOpen(false);
        setSubmitted(false);
        setTitle('');
        setDescription('');
        setScreenshot(null);
      }, 2000);
    } catch (err) {
      console.error('Failed to submit feedback:', err);
    } finally {
      setSubmitting(false);
    }
  }
  
  // Only show in UAT environment
  if (process.env.REACT_APP_ENVIRONMENT !== 'uat') {
    return null;
  }
  
  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-4 right-4 w-14 h-14 bg-purple-600 text-white rounded-full shadow-lg hover:bg-purple-700 flex items-center justify-center z-50"
        title="Submit Feedback"
      >
        <span className="text-2xl">💬</span>
      </button>
      
      {/* Feedback Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center">
              <h2 className="text-lg font-semibold">Submit Feedback</h2>
              <button onClick={() => setIsOpen(false)} className="text-gray-500 hover:text-gray-700">
                ✕
              </button>
            </div>
            
            {submitted ? (
              <div className="p-8 text-center">
                <div className="text-4xl mb-4">✅</div>
                <p className="text-lg font-medium">Thank you for your feedback!</p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-4 space-y-4">
                {/* Feedback Type */}
                <div>
                  <label className="block text-sm font-medium mb-2">Type</label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { value: 'bug', label: '🐛 Bug', color: 'red' },
                      { value: 'suggestion', label: '💡 Suggestion', color: 'blue' },
                      { value: 'question', label: '❓ Question', color: 'yellow' },
                      { value: 'praise', label: '👍 Praise', color: 'green' },
                    ].map(type => (
                      <button
                        key={type.value}
                        type="button"
                        onClick={() => setFeedbackType(type.value)}
                        className={`px-3 py-1.5 rounded-full text-sm border-2 ${
                          feedbackType === type.value
                            ? `border-${type.color}-500 bg-${type.color}-50`
                            : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        {type.label}
                      </button>
                    ))}
                  </div>
                </div>
                
                {/* Title */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={e => setTitle(e.target.value)}
                    placeholder="Brief summary of the issue or suggestion"
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                
                {/* Description */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Description <span className="text-red-500">*</span>
                  </label>
                  <textarea
                    required
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                    placeholder={
                      feedbackType === 'bug'
                        ? "What happened? What did you expect to happen?"
                        : "Tell us more..."
                    }
                    rows={4}
                    className="w-full border rounded-lg px-3 py-2"
                  />
                </div>
                
                {/* Screenshot */}
                <div>
                  <label className="block text-sm font-medium mb-1">Screenshot</label>
                  {screenshot ? (
                    <div className="relative">
                      <img 
                        src={screenshot} 
                        alt="Screenshot" 
                        className="w-full rounded border"
                      />
                      <button
                        type="button"
                        onClick={() => setScreenshot(null)}
                        className="absolute top-2 right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={captureScreenshot}
                      className="w-full border-2 border-dashed rounded-lg p-4 text-gray-500 hover:border-gray-400 hover:text-gray-600"
                    >
                      📸 Capture Screenshot
                    </button>
                  )}
                </div>
                
                {/* Current Page (read-only) */}
                <div className="text-sm text-gray-500">
                  Page: {window.location.pathname}
                </div>
                
                {/* Submit */}
                <div className="flex gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 bg-purple-600 text-white rounded-lg px-4 py-2 hover:bg-purple-700 disabled:opacity-50"
                  >
                    {submitting ? 'Submitting...' : 'Submit Feedback'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="px-4 py-2 border rounded-lg hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

export default UatFeedbackWidget;
```

### 4.2 Feedback API Endpoints

**File:** `src/routes/uat/feedback.ts`

```typescript
import { Router } from 'express';
import { requireAuth, requireUatAdmin } from '../../middleware/auth';

const router = Router();

/**
 * POST /api/uat/feedback
 * 
 * Submit feedback.
 */
router.post('/', requireAuth, async (req, res) => {
  const {
    feedbackType,
    title,
    description,
    stepsToReproduce,
    expectedBehavior,
    actualBehavior,
    pageUrl,
    featureArea,
    screenshotUrls,
    browserInfo,
    deviceInfo,
    screenResolution,
  } = req.body;
  
  // Get tester record
  const tester = await db.query(
    `SELECT id FROM uat_testers WHERE user_id = @userId`,
    { userId: req.user.id }
  );
  
  if (!tester.length) {
    return res.status(403).json({ error: 'Not a registered UAT tester' });
  }
  
  // Get active session if any
  const session = await db.query(`
    SELECT id FROM uat_sessions WHERE status = 'active' ORDER BY starts_at DESC
  `);
  
  const feedbackId = await db.query(`
    INSERT INTO uat_feedback (
      tester_id, user_id, uat_session_id, page_url, feature_area,
      feedback_type, title, description, steps_to_reproduce,
      expected_behavior, actual_behavior, screenshot_urls,
      browser_info, device_info, screen_resolution
    ) OUTPUT INSERTED.id VALUES (
      @testerId, @userId, @sessionId, @pageUrl, @featureArea,
      @feedbackType, @title, @description, @stepsToReproduce,
      @expectedBehavior, @actualBehavior, @screenshotUrls,
      @browserInfo, @deviceInfo, @screenResolution
    )
  `, {
    testerId: tester[0].id,
    userId: req.user.id,
    sessionId: session[0]?.id || null,
    pageUrl,
    featureArea: featureArea || inferFeatureArea(pageUrl),
    feedbackType,
    title,
    description,
    stepsToReproduce,
    expectedBehavior,
    actualBehavior,
    screenshotUrls: JSON.stringify(screenshotUrls || []),
    browserInfo,
    deviceInfo,
    screenResolution,
  });
  
  // Update tester's last active time
  await db.query(`
    UPDATE uat_testers SET 
      last_active_at = GETUTCDATE(),
      status = 'active'
    WHERE id = @testerId
  `, { testerId: tester[0].id });
  
  return res.json({ 
    success: true, 
    feedbackId: feedbackId[0].id,
    message: 'Thank you for your feedback!'
  });
});

/**
 * POST /api/uat/feedback/upload-screenshot
 * 
 * Upload a screenshot for feedback.
 */
router.post('/upload-screenshot', requireAuth, async (req, res) => {
  const { image } = req.body;  // Base64 data URL
  
  // Convert base64 to buffer
  const matches = image.match(/^data:image\/(\w+);base64,(.+)$/);
  if (!matches) {
    return res.status(400).json({ error: 'Invalid image format' });
  }
  
  const imageType = matches[1];
  const buffer = Buffer.from(matches[2], 'base64');
  
  // Upload to storage
  const filename = `feedback-${Date.now()}.${imageType}`;
  const url = await uploadToStorage(buffer, 'uat-screenshots', filename);
  
  return res.json({ url });
});

/**
 * GET /api/uat/feedback
 * 
 * List all feedback (admin).
 */
router.get(
  '/',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    const { status, type, sessionId } = req.query;
    
    let query = `
      SELECT 
        f.*,
        t.name as tester_name,
        t.email as tester_email,
        u.display_name as user_name
      FROM uat_feedback f
      JOIN uat_testers t ON f.tester_id = t.id
      LEFT JOIN users u ON f.user_id = u.id
      WHERE 1=1
    `;
    
    const params: any = {};
    
    if (status) {
      query += ` AND f.status = @status`;
      params.status = status;
    }
    
    if (type) {
      query += ` AND f.feedback_type = @type`;
      params.type = type;
    }
    
    if (sessionId) {
      query += ` AND f.uat_session_id = @sessionId`;
      params.sessionId = sessionId;
    }
    
    query += ` ORDER BY f.submitted_at DESC`;
    
    const feedback = await db.query(query, params);
    
    // Parse screenshot URLs
    feedback.forEach(f => {
      f.screenshot_urls = JSON.parse(f.screenshot_urls || '[]');
    });
    
    return res.json({ feedback });
  }
);

/**
 * PATCH /api/uat/feedback/:feedbackId
 * 
 * Update feedback status (admin).
 */
router.patch(
  '/:feedbackId',
  requireAuth,
  requireUatAdmin,
  async (req, res) => {
    const { feedbackId } = req.params;
    const { status, priority, assignedTo, resolutionNotes } = req.body;
    
    const updates: string[] = [];
    const params: any = { feedbackId };
    
    if (status) {
      updates.push('status = @status');
      params.status = status;
      
      if (status === 'resolved') {
        updates.push('resolved_at = GETUTCDATE()');
      }
    }
    
    if (priority) {
      updates.push('priority = @priority');
      params.priority = priority;
    }
    
    if (assignedTo !== undefined) {
      updates.push('assigned_to = @assignedTo');
      params.assignedTo = assignedTo;
    }
    
    if (resolutionNotes) {
      updates.push('resolution_notes = @resolutionNotes');
      params.resolutionNotes = resolutionNotes;
    }
    
    if (updates.length === 0) {
      return res.status(400).json({ error: 'No updates provided' });
    }
    
    await db.query(`
      UPDATE uat_feedback SET ${updates.join(', ')} WHERE id = @feedbackId
    `, params);
    
    return res.json({ success: true });
  }
);

function inferFeatureArea(pageUrl: string): string {
  if (!pageUrl) return 'unknown';
  
  if (pageUrl.includes('/auctions/')) return 'auctions';
  if (pageUrl.includes('/organizations/')) return 'organizations';
  if (pageUrl.includes('/checkout')) return 'checkout';
  if (pageUrl.includes('/my/')) return 'user-dashboard';
  if (pageUrl.includes('/admin')) return 'admin';
  if (pageUrl.includes('/donate')) return 'donations';
  
  return 'general';
}

export default router;
```

---

## Phase 5: UAT Admin Dashboard

### 5.1 Admin Dashboard Page

**File:** `src/pages/UatAdmin.tsx`

```tsx
// Route: /uat/admin

function UatAdminDashboard() {
  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">UAT Administration</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <StatCard 
          title="Active Testers" 
          value={stats.activeTesters}
          icon="👥"
        />
        <StatCard 
          title="Pending Feedback" 
          value={stats.pendingFeedback}
          icon="📝"
          variant={stats.pendingFeedback > 0 ? 'warning' : 'default'}
        />
        <StatCard 
          title="Active Sessions" 
          value={stats.activeSessions}
          icon="🧪"
        />
        <StatCard 
          title="Time Offset" 
          value={timeStatus.offsetHuman}
          icon="⏰"
          variant={timeStatus.offsetSeconds !== 0 ? 'info' : 'default'}
        />
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Time Controls Card */}
        <Card title="⏰ Time Controls">
          <TimeControlPanel />
        </Card>
        
        {/* Quick Actions Card */}
        <Card title="🚀 Quick Actions">
          <div className="space-y-3">
            <Button onClick={() => navigate('/uat/admin/testers/invite')}>
              Invite Testers
            </Button>
            <Button onClick={() => navigate('/uat/admin/sessions/new')}>
              Create Testing Session
            </Button>
            <Button onClick={() => navigate('/uat/admin/data/seed')}>
              Seed Test Data
            </Button>
            <Button onClick={() => navigate('/uat/admin/data/reset')} variant="destructive">
              Reset UAT Database
            </Button>
          </div>
        </Card>
        
        {/* Recent Feedback */}
        <Card title="📝 Recent Feedback" className="lg:col-span-2">
          <RecentFeedbackList limit={5} />
          <Link to="/uat/admin/feedback" className="text-blue-600 hover:underline">
            View All Feedback →
          </Link>
        </Card>
      </div>
    </div>
  );
}
```

### 5.2 Time Control Panel Component

**File:** `src/components/TimeControlPanel.tsx`

```tsx
function TimeControlPanel() {
  const { data: timeStatus, refetch } = useUatTime();
  const [loading, setLoading] = useState(false);
  
  async function setOffset(offset: string) {
    setLoading(true);
    await fetch('/api/uat/time/offset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offset }),
    });
    refetch();
    setLoading(false);
  }
  
  async function advance(duration: string) {
    setLoading(true);
    await fetch('/api/uat/time/advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ duration }),
    });
    refetch();
    setLoading(false);
  }
  
  async function freeze() {
    setLoading(true);
    await fetch('/api/uat/time/freeze', { method: 'POST' });
    refetch();
    setLoading(false);
  }
  
  async function unfreeze() {
    setLoading(true);
    await fetch('/api/uat/time/unfreeze', { method: 'POST' });
    refetch();
    setLoading(false);
  }
  
  async function reset() {
    setLoading(true);
    await fetch('/api/uat/time/reset', { method: 'POST' });
    refetch();
    setLoading(false);
  }
  
  if (!timeStatus) return <Loading />;
  
  return (
    <div className="space-y-4">
      {/* Current Time Display */}
      <div className="bg-gray-100 rounded-lg p-4">
        <div className="text-sm text-gray-500 mb-1">Effective Time</div>
        <div className="text-2xl font-mono">
          {new Date(timeStatus.effectiveTime).toLocaleString()}
        </div>
        <div className="flex gap-2 mt-2 text-sm">
          {timeStatus.isFrozen && (
            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
              ❄️ Frozen
            </span>
          )}
          {timeStatus.offsetSeconds !== 0 && (
            <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded">
              Offset: {timeStatus.offsetHuman}
            </span>
          )}
          {!timeStatus.isFrozen && timeStatus.offsetSeconds === 0 && (
            <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded">
              ✓ Real Time
            </span>
          )}
        </div>
      </div>
      
      {/* Quick Advance */}
      <div>
        <div className="text-sm font-medium mb-2">Advance Time</div>
        <div className="flex flex-wrap gap-2">
          {['5m', '15m', '1h', '6h', '1d', '1w'].map(duration => (
            <button
              key={duration}
              onClick={() => advance(duration)}
              disabled={loading}
              className="px-3 py-1.5 bg-white border rounded hover:bg-gray-50"
            >
              +{duration}
            </button>
          ))}
        </div>
      </div>
      
      {/* Jump to Offset */}
      <div>
        <div className="text-sm font-medium mb-2">Jump to Offset</div>
        <div className="flex flex-wrap gap-2">
          {['+1h', '+1d', '+1w', '-1h', '-1d', '-1w'].map(offset => (
            <button
              key={offset}
              onClick={() => setOffset(offset)}
              disabled={loading}
              className="px-3 py-1.5 bg-white border rounded hover:bg-gray-50"
            >
              {offset}
            </button>
          ))}
        </div>
      </div>
      
      {/* Freeze/Unfreeze */}
      <div className="flex gap-2">
        {timeStatus.isFrozen ? (
          <button
            onClick={unfreeze}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            ▶️ Unfreeze Time
          </button>
        ) : (
          <button
            onClick={freeze}
            disabled={loading}
            className="flex-1 px-4 py-2 bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
          >
            ❄️ Freeze Time
          </button>
        )}
        
        <button
          onClick={reset}
          disabled={loading}
          className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
        >
          Reset
        </button>
      </div>
    </div>
  );
}
```

---

## Phase 6: Test Data Seeding

### 6.1 Seed Script

**File:** `src/scripts/seedUatData.ts`

```typescript
/**
 * Seeds the UAT database with realistic test data.
 * Run with: npm run seed:uat
 */

import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcrypt';

async function seedUatData() {
  console.log('🌱 Seeding UAT data...');
  
  // 1. Create test users
  console.log('Creating test users...');
  const users = await createTestUsers();
  
  // 2. Create test organizations
  console.log('Creating test organizations...');
  const orgs = await createTestOrganizations(users);
  
  // 3. Create test events with various states
  console.log('Creating test events...');
  const events = await createTestEvents(orgs);
  
  // 4. Create test items
  console.log('Creating test items...');
  await createTestItems(events);
  
  // 5. Create test bids
  console.log('Creating test bids...');
  await createTestBids(events, users);
  
  console.log('✅ UAT data seeded successfully!');
  console.log(`
  Test Accounts:
  - buyer@test.com / password123 (Regular buyer)
  - seller@test.com / password123 (Org admin)
  - admin@test.com / password123 (Platform admin)
  `);
}

async function createTestUsers() {
  const passwordHash = await bcrypt.hash('password123', 10);
  
  const users = [
    { email: 'buyer@test.com', name: 'Test Buyer', role: 'user' },
    { email: 'buyer2@test.com', name: 'Jane Bidder', role: 'user' },
    { email: 'buyer3@test.com', name: 'Bob Collector', role: 'user' },
    { email: 'seller@test.com', name: 'Org Admin', role: 'user' },
    { email: 'admin@test.com', name: 'Platform Admin', role: 'admin' },
  ];
  
  const created = [];
  
  for (const user of users) {
    const id = uuidv4();
    await db.query(`
      INSERT INTO users (id, email, password_hash, display_name, role, email_verified)
      VALUES (@id, @email, @password, @name, @role, 1)
    `, { id, email: user.email, password: passwordHash, name: user.name, role: user.role });
    
    created.push({ ...user, id });
  }
  
  return created;
}

async function createTestOrganizations(users: any[]) {
  const seller = users.find(u => u.email === 'seller@test.com');
  
  const orgs = [
    {
      name: 'Riverside Elementary PTA',
      slug: 'riverside-pta',
      description: 'Supporting education in our community',
      type: 'nonprofit',
    },
    {
      name: 'Local Animal Shelter',
      slug: 'local-animal-shelter', 
      description: 'Finding homes for pets in need',
      type: 'nonprofit',
    },
    {
      name: 'Community Art Guild',
      slug: 'art-guild',
      description: 'Promoting local artists and creativity',
      type: 'nonprofit',
    },
  ];
  
  const created = [];
  
  for (const org of orgs) {
    const id = uuidv4();
    await db.query(`
      INSERT INTO organizations (id, name, slug, description, organization_type, status)
      VALUES (@id, @name, @slug, @description, @type, 'active')
    `, { id, ...org });
    
    // Add seller as admin
    await db.query(`
      INSERT INTO organization_members (organization_id, user_id, role)
      VALUES (@orgId, @userId, 'admin')
    `, { orgId: id, userId: seller.id });
    
    created.push({ ...org, id });
  }
  
  return created;
}

async function createTestEvents(orgs: any[]) {
  const now = new Date();
  const hour = 60 * 60 * 1000;
  const day = 24 * hour;
  
  const events = [
    // Active event - ends in 2 hours
    {
      orgIndex: 0,
      name: 'Fall Fundraiser 2025',
      startsAt: new Date(now.getTime() - 2 * day),
      endsAt: new Date(now.getTime() + 2 * hour),
      status: 'active',
    },
    // Event ending soon - ends in 15 minutes
    {
      orgIndex: 0,
      name: 'Holiday Gift Auction',
      startsAt: new Date(now.getTime() - 1 * day),
      endsAt: new Date(now.getTime() + 15 * 60 * 1000),
      status: 'active',
    },
    // Scheduled event - starts in 1 day
    {
      orgIndex: 1,
      name: 'Pet Adoption Fundraiser',
      startsAt: new Date(now.getTime() + 1 * day),
      endsAt: new Date(now.getTime() + 3 * day),
      status: 'scheduled',
    },
    // Ended event - ended yesterday
    {
      orgIndex: 2,
      name: 'Art Sale 2025',
      startsAt: new Date(now.getTime() - 5 * day),
      endsAt: new Date(now.getTime() - 1 * day),
      status: 'ended',
    },
    // Draft event
    {
      orgIndex: 1,
      name: 'Spring Gala (Draft)',
      startsAt: null,
      endsAt: null,
      status: 'draft',
    },
  ];
  
  const created = [];
  
  for (const event of events) {
    const id = uuidv4();
    await db.query(`
      INSERT INTO auction_events (
        id, organization_id, name, starts_at, ends_at, status,
        payment_mode, is_test_event
      ) VALUES (
        @id, @orgId, @name, @startsAt, @endsAt, @status,
        'self_managed', 1
      )
    `, {
      id,
      orgId: orgs[event.orgIndex].id,
      name: event.name,
      startsAt: event.startsAt,
      endsAt: event.endsAt,
      status: event.status,
    });
    
    created.push({ ...event, id, organizationId: orgs[event.orgIndex].id });
  }
  
  return created;
}

async function createTestItems(events: any[]) {
  const items = [
    { name: 'Vintage Watch', description: 'Beautiful 1960s timepiece', startingBid: 50 },
    { name: 'Handmade Quilt', description: 'Queen-size, hand-stitched', startingBid: 75 },
    { name: 'Gift Basket', description: 'Local wine and cheese selection', startingBid: 40 },
    { name: 'Signed Book', description: 'First edition, signed by author', startingBid: 25 },
    { name: 'Art Print', description: 'Limited edition local artist print', startingBid: 100 },
    { name: 'Spa Package', description: 'Full day spa experience', startingBid: 150 },
    { name: 'Concert Tickets', description: 'Two tickets to sold-out show', startingBid: 80 },
    { name: 'Cooking Class', description: 'Private lesson with local chef', startingBid: 60 },
  ];
  
  for (const event of events) {
    if (event.status === 'draft') continue;
    
    const numItems = Math.floor(Math.random() * 5) + 3;
    const shuffled = items.sort(() => Math.random() - 0.5).slice(0, numItems);
    
    for (const item of shuffled) {
      const id = uuidv4();
      await db.query(`
        INSERT INTO event_items (id, event_id, name, description, starting_bid, status)
        VALUES (@id, @eventId, @name, @description, @startingBid, 'active')
      `, {
        id,
        eventId: event.id,
        name: item.name,
        description: item.description,
        startingBid: item.startingBid,
      });
    }
  }
}

async function createTestBids(events: any[], users: any[]) {
  const buyers = users.filter(u => u.email.includes('buyer'));
  
  for (const event of events) {
    if (!['active', 'ended'].includes(event.status)) continue;
    
    const items = await db.query(
      `SELECT id, starting_bid FROM event_items WHERE event_id = @eventId`,
      { eventId: event.id }
    );
    
    for (const item of items) {
      const numBids = Math.floor(Math.random() * 5) + 1;
      let currentBid = item.starting_bid;
      
      for (let i = 0; i < numBids; i++) {
        const buyer = buyers[Math.floor(Math.random() * buyers.length)];
        currentBid += Math.floor(Math.random() * 20) + 5;
        
        await db.query(`
          INSERT INTO bids (id, event_item_id, user_id, amount, created_at)
          VALUES (NEWID(), @itemId, @userId, @amount, @createdAt)
        `, {
          itemId: item.id,
          userId: buyer.id,
          amount: currentBid,
          createdAt: new Date(Date.now() - Math.random() * 86400000),
        });
      }
      
      // Update item with current high bid
      await db.query(`
        UPDATE event_items SET current_bid = @amount WHERE id = @itemId
      `, { itemId: item.id, amount: currentBid });
    }
  }
}

// Run if called directly
seedUatData().catch(console.error);
```

---

## Deployment Checklist

### Pre-Launch
- [ ] Set up UAT Azure App Service / deployment slot
- [ ] Create UAT database
- [ ] Configure UAT environment variables
- [ ] Set up UAT subdomain (uat.verygoodauctions.com)
- [ ] Configure Stripe test mode for UAT
- [ ] Set up email capture (Mailtrap/Mailhog)
- [ ] Run database migrations
- [ ] Seed test data

### Testing the UAT Setup
- [ ] Verify UAT URL is accessible
- [ ] Verify prod URL does NOT show UAT features
- [ ] Test invitation flow end-to-end
- [ ] Test time controls
- [ ] Test feedback submission
- [ ] Verify Stripe test mode (use test cards)
- [ ] Verify emails are captured (not sent to real addresses)

### Ongoing
- [ ] Regular data resets (weekly?)
- [ ] Monitor feedback queue
- [ ] Update test data as features change

---

## API Summary

### Tester Management
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/uat/testers` | GET | List all testers |
| `/api/uat/testers/invite` | POST | Invite tester(s) |
| `/api/uat/testers/:id/resend` | POST | Resend invitation |
| `/api/uat/testers/:id/role` | PATCH | Update role |
| `/api/uat/testers/:id` | DELETE | Remove tester |

### Invitation
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/uat/invite/:token` | GET | Validate invitation |
| `/api/uat/invite/:token/accept` | POST | Accept & register |

### Time Control
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/uat/time` | GET | Get current time status |
| `/api/uat/time/offset` | POST | Set time offset |
| `/api/uat/time/advance` | POST | Advance by duration |
| `/api/uat/time/freeze` | POST | Freeze time |
| `/api/uat/time/unfreeze` | POST | Unfreeze time |
| `/api/uat/time/reset` | POST | Reset to real time |

### Event Phase Control
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/uat/events/:id/set-phase` | POST | Override phase |
| `/api/uat/events/:id/clear-phase-override` | POST | Clear override |
| `/api/uat/events/:id/jump-to-phase` | POST | Set time for phase |
| `/api/uat/events/:id/status` | GET | Get UAT status |

### Feedback
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/uat/feedback` | GET | List feedback (admin) |
| `/api/uat/feedback` | POST | Submit feedback |
| `/api/uat/feedback/:id` | PATCH | Update status |
| `/api/uat/feedback/upload-screenshot` | POST | Upload screenshot |

---

## Estimated Effort

| Phase | Time |
|-------|------|
| Environment setup (infra) | 2-4 hours |
| Database schema | 1 hour |
| Tester invitation system | 4-5 hours |
| Time controls | 3-4 hours |
| Feedback system | 3-4 hours |
| Admin dashboard | 4-5 hours |
| Seed scripts | 2 hours |
| Testing & polish | 2-3 hours |

**Total: 21-28 hours (3-4 days)**

---

## Files Summary

### New Files
| File | Purpose |
|------|---------|
| `src/routes/uat/testers.ts` | Tester management |
| `src/routes/uat/invite.ts` | Invitation acceptance |
| `src/routes/uat/time.ts` | Time controls |
| `src/routes/uat/feedback.ts` | Feedback system |
| `src/routes/uat/events.ts` | Per-event UAT controls |
| `src/services/uatTime.ts` | Time calculation |
| `src/pages/UatAdmin.tsx` | Admin dashboard |
| `src/pages/UatInviteAccept.tsx` | Invitation page |
| `src/pages/UatWelcome.tsx` | Welcome/orientation |
| `src/components/UatFeedbackWidget.tsx` | Floating feedback |
| `src/components/TimeControlPanel.tsx` | Time controls UI |
| `src/components/UatBanner.tsx` | UAT indicator |
| `src/scripts/seedUatData.ts` | Data seeding |
| `src/emails/templates/uat-invitation.ts` | Invitation email |
