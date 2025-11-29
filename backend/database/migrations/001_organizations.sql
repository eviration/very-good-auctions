-- Migration: Organizations Foundation (Sprint 1)
-- Creates organizations, organization_members, and organization_invitations tables

-- Organizations table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='organizations' AND xtype='U')
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

    -- Verification status (via Stripe Connect later)
    status NVARCHAR(50) NOT NULL DEFAULT 'pending' CHECK (status IN (
        'pending',
        'unverified',
        'verified',
        'suspended'
    )),

    -- Stripe Connect (for Sprint 2)
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
    updated_at DATETIME2 DEFAULT GETUTCDATE(),

    CONSTRAINT fk_organizations_creator FOREIGN KEY (created_by) REFERENCES users(id)
);

GO

-- Create indexes for organizations
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_org_slug' AND object_id = OBJECT_ID('organizations'))
    CREATE INDEX idx_org_slug ON organizations(slug);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_org_status' AND object_id = OBJECT_ID('organizations'))
    CREATE INDEX idx_org_status ON organizations(status);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_org_created_by' AND object_id = OBJECT_ID('organizations'))
    CREATE INDEX idx_org_created_by ON organizations(created_by);

GO

-- Organization members table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='organization_members' AND xtype='U')
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

    CONSTRAINT fk_org_members_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_org_members_user FOREIGN KEY (user_id) REFERENCES users(id),
    CONSTRAINT fk_org_members_inviter FOREIGN KEY (invited_by) REFERENCES users(id),
    CONSTRAINT uq_org_members_user UNIQUE (organization_id, user_id)
);

GO

-- Create indexes for organization_members
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_org_members_user' AND object_id = OBJECT_ID('organization_members'))
    CREATE INDEX idx_org_members_user ON organization_members(user_id);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_org_members_org' AND object_id = OBJECT_ID('organization_members'))
    CREATE INDEX idx_org_members_org ON organization_members(organization_id);

GO

-- Organization invitations table
IF NOT EXISTS (SELECT * FROM sysobjects WHERE name='organization_invitations' AND xtype='U')
CREATE TABLE organization_invitations (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    organization_id UNIQUEIDENTIFIER NOT NULL,

    email NVARCHAR(255) NOT NULL,
    role NVARCHAR(50) NOT NULL DEFAULT 'member' CHECK (role IN (
        'admin',
        'member'
    )),

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

    CONSTRAINT fk_org_invitations_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    CONSTRAINT fk_org_invitations_inviter FOREIGN KEY (invited_by) REFERENCES users(id)
);

GO

-- Create indexes for organization_invitations
IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_org_invitations_email' AND object_id = OBJECT_ID('organization_invitations'))
    CREATE INDEX idx_org_invitations_email ON organization_invitations(email);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_org_invitations_token' AND object_id = OBJECT_ID('organization_invitations'))
    CREATE INDEX idx_org_invitations_token ON organization_invitations(token);

IF NOT EXISTS (SELECT * FROM sys.indexes WHERE name = 'idx_org_invitations_org' AND object_id = OBJECT_ID('organization_invitations'))
    CREATE INDEX idx_org_invitations_org ON organization_invitations(organization_id);

GO

PRINT 'Organizations migration completed successfully!';
