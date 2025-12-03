-- Migration: Add compliance system tables
-- =====================================================
-- Tax information, agreement acceptances, audit logging

-- 1. Tax information collection (W-9/W-8BEN)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('tax_information') AND type = 'U')
BEGIN
    CREATE TABLE tax_information (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

        -- Who this belongs to (one of these should be set)
        user_id NVARCHAR(128) NULL,
        organization_id UNIQUEIDENTIFIER NULL,

        -- Tax classification
        tax_form_type NVARCHAR(20) NOT NULL,

        -- W-9 Fields
        legal_name NVARCHAR(255) NOT NULL,
        business_name NVARCHAR(255) NULL,
        tax_classification NVARCHAR(50) NULL,

        -- Tax ID (encrypted at rest using AES-256-GCM)
        tin_type NVARCHAR(10) NULL,
        tin_encrypted VARBINARY(MAX) NULL,
        tin_last_four NVARCHAR(4) NULL,

        -- Address
        address_line1 NVARCHAR(255) NULL,
        address_line2 NVARCHAR(255) NULL,
        city NVARCHAR(100) NULL,
        state NVARCHAR(50) NULL,
        postal_code NVARCHAR(20) NULL,
        country NVARCHAR(3) DEFAULT 'USA',

        -- Certification
        is_us_person BIT NULL,
        is_exempt_payee BIT DEFAULT 0,
        exempt_payee_code NVARCHAR(10) NULL,

        -- Signature
        signature_name NVARCHAR(255) NOT NULL,
        signature_date DATETIME2 NOT NULL,
        signature_ip NVARCHAR(45) NULL,

        -- Verification status
        status NVARCHAR(50) DEFAULT 'pending',
        verified_at DATETIME2 NULL,
        verified_by NVARCHAR(128) NULL,

        -- Metadata
        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE(),
        expires_at DATETIME2 NULL,

        CONSTRAINT FK_tax_info_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT FK_tax_info_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
        CONSTRAINT CK_tax_form_type CHECK (tax_form_type IN ('w9', 'w8ben', 'w8bene')),
        CONSTRAINT CK_tin_type CHECK (tin_type IS NULL OR tin_type IN ('ssn', 'ein')),
        CONSTRAINT CK_tax_classification CHECK (tax_classification IS NULL OR tax_classification IN (
            'individual', 'sole_proprietor', 'c_corp', 's_corp', 'partnership',
            'trust_estate', 'llc_c', 'llc_s', 'llc_p', 'nonprofit', 'other'
        )),
        CONSTRAINT CK_tax_status CHECK (status IN ('pending', 'verified', 'invalid', 'expired'))
    );

    CREATE INDEX idx_tax_info_user ON tax_information(user_id);
    CREATE INDEX idx_tax_info_org ON tax_information(organization_id);
    CREATE INDEX idx_tax_info_status ON tax_information(status);
END

GO

-- 2. Agreement versions table (store actual agreement text)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('agreement_versions') AND type = 'U')
BEGIN
    CREATE TABLE agreement_versions (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

        agreement_type NVARCHAR(50) NOT NULL,
        version NVARCHAR(20) NOT NULL,

        title NVARCHAR(255) NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        content_hash NVARCHAR(64) NOT NULL,

        effective_date DATETIME2 NOT NULL,
        is_current BIT DEFAULT 0,

        created_at DATETIME2 DEFAULT GETUTCDATE(),
        created_by NVARCHAR(128) NULL,

        CONSTRAINT UQ_agreement_version UNIQUE (agreement_type, version),
        CONSTRAINT CK_agreement_type CHECK (agreement_type IN (
            'terms_of_service', 'privacy_policy', 'seller_agreement',
            'organization_agreement', 'bidder_agreement'
        ))
    );

    CREATE INDEX idx_agreement_type_current ON agreement_versions(agreement_type, is_current);
END

GO

-- 3. Agreement acceptances table (audit trail)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('agreement_acceptances') AND type = 'U')
BEGIN
    CREATE TABLE agreement_acceptances (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        user_id NVARCHAR(128) NOT NULL,

        agreement_type NVARCHAR(50) NOT NULL,
        agreement_version NVARCHAR(20) NOT NULL,
        agreement_hash NVARCHAR(64) NULL,

        accepted_at DATETIME2 DEFAULT GETUTCDATE(),
        accepted_ip NVARCHAR(45) NULL,
        accepted_user_agent NVARCHAR(500) NULL,

        organization_id UNIQUEIDENTIFIER NULL,

        CONSTRAINT FK_agreements_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT FK_agreements_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
        CONSTRAINT CK_acceptance_agreement_type CHECK (agreement_type IN (
            'terms_of_service', 'privacy_policy', 'seller_agreement',
            'organization_agreement', 'bidder_agreement'
        ))
    );

    CREATE INDEX idx_agreements_user ON agreement_acceptances(user_id);
    CREATE INDEX idx_agreements_type ON agreement_acceptances(agreement_type, agreement_version);
    CREATE INDEX idx_agreements_org ON agreement_acceptances(organization_id);
END

GO

-- 4. Nonprofit verifications table
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('nonprofit_verifications') AND type = 'U')
BEGIN
    CREATE TABLE nonprofit_verifications (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        organization_id UNIQUEIDENTIFIER NOT NULL,

        ein NVARCHAR(20) NULL,
        irs_determination_letter_url NVARCHAR(500) NULL,

        -- IRS database check
        irs_verified BIT DEFAULT 0,
        irs_verified_at DATETIME2 NULL,
        irs_organization_name NVARCHAR(255) NULL,
        irs_city NVARCHAR(100) NULL,
        irs_state NVARCHAR(50) NULL,
        irs_deductibility_status NVARCHAR(100) NULL,

        -- Manual verification
        manually_verified BIT DEFAULT 0,
        manually_verified_at DATETIME2 NULL,
        manually_verified_by NVARCHAR(128) NULL,
        verification_notes NVARCHAR(MAX) NULL,

        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE(),

        CONSTRAINT FK_nonprofit_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
    );

    CREATE INDEX idx_nonprofit_org ON nonprofit_verifications(organization_id);
    CREATE INDEX idx_nonprofit_verified ON nonprofit_verifications(irs_verified, manually_verified);
END

GO

-- 5. Tax reporting records (1099 tracking)
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('tax_reporting') AND type = 'U')
BEGIN
    CREATE TABLE tax_reporting (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

        -- Who we're reporting on (one should be set)
        user_id NVARCHAR(128) NULL,
        organization_id UNIQUEIDENTIFIER NULL,

        tax_year INT NOT NULL,

        -- Amounts
        gross_payments DECIMAL(12,2) NOT NULL DEFAULT 0,
        refunds DECIMAL(12,2) DEFAULT 0,
        adjustments DECIMAL(12,2) DEFAULT 0,
        reportable_amount DECIMAL(12,2) NOT NULL DEFAULT 0,

        -- 1099 status
        form_type NVARCHAR(20) NULL,

        threshold_met BIT DEFAULT 0,

        -- If we need to file (PayPal payouts)
        filed BIT DEFAULT 0,
        filed_at DATETIME2 NULL,
        confirmation_number NVARCHAR(100) NULL,

        -- Stripe handles this for Connect
        stripe_handled BIT DEFAULT 0,

        created_at DATETIME2 DEFAULT GETUTCDATE(),
        updated_at DATETIME2 DEFAULT GETUTCDATE(),

        CONSTRAINT FK_tax_reporting_user FOREIGN KEY (user_id) REFERENCES users(id),
        CONSTRAINT FK_tax_reporting_org FOREIGN KEY (organization_id) REFERENCES organizations(id),
        CONSTRAINT CK_tax_form_type_reporting CHECK (form_type IS NULL OR form_type IN ('1099-K', '1099-NEC', '1099-MISC'))
    );

    CREATE UNIQUE INDEX idx_tax_reporting_user_year ON tax_reporting(user_id, tax_year) WHERE user_id IS NOT NULL;
    CREATE UNIQUE INDEX idx_tax_reporting_org_year ON tax_reporting(organization_id, tax_year) WHERE organization_id IS NOT NULL;
    CREATE INDEX idx_tax_reporting_year ON tax_reporting(tax_year, threshold_met);
END

GO

-- 6. Compliance audit log
IF NOT EXISTS (SELECT * FROM sys.objects WHERE object_id = OBJECT_ID('compliance_audit_log') AND type = 'U')
BEGIN
    CREATE TABLE compliance_audit_log (
        id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),

        event_type NVARCHAR(100) NOT NULL,

        user_id NVARCHAR(128) NULL,
        organization_id UNIQUEIDENTIFIER NULL,

        details NVARCHAR(MAX) NULL,
        ip_address NVARCHAR(45) NULL,
        user_agent NVARCHAR(500) NULL,

        created_at DATETIME2 DEFAULT GETUTCDATE()
    );

    CREATE INDEX idx_audit_user ON compliance_audit_log(user_id, created_at);
    CREATE INDEX idx_audit_org ON compliance_audit_log(organization_id, created_at);
    CREATE INDEX idx_audit_type ON compliance_audit_log(event_type, created_at);
END

GO

-- 7. Add compliance fields to users table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('users') AND name = 'tax_info_status')
BEGIN
    ALTER TABLE users ADD
        tax_info_status NVARCHAR(50) DEFAULT 'not_submitted',
        tax_info_submitted_at DATETIME2 NULL,
        tos_accepted_version NVARCHAR(20) NULL,
        tos_accepted_at DATETIME2 NULL,
        privacy_accepted_version NVARCHAR(20) NULL,
        privacy_accepted_at DATETIME2 NULL,
        seller_agreement_version NVARCHAR(20) NULL,
        seller_agreement_accepted_at DATETIME2 NULL;
END

GO

-- Add check constraint for user tax_info_status
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_user_tax_info_status')
BEGIN
    ALTER TABLE users ADD CONSTRAINT CK_user_tax_info_status CHECK (
        tax_info_status IS NULL OR tax_info_status IN ('not_submitted', 'pending', 'verified', 'expired')
    );
END

GO

-- 8. Add compliance fields to organizations table
IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('organizations') AND name = 'tax_info_status')
BEGIN
    ALTER TABLE organizations ADD
        tax_info_status NVARCHAR(50) DEFAULT 'not_submitted',
        tax_info_submitted_at DATETIME2 NULL,
        org_agreement_version NVARCHAR(20) NULL,
        org_agreement_accepted_at DATETIME2 NULL,
        org_agreement_accepted_by NVARCHAR(128) NULL,
        is_nonprofit BIT DEFAULT 0,
        nonprofit_verified BIT DEFAULT 0,
        nonprofit_disclaimer_shown BIT DEFAULT 1;
END

GO

-- Add check constraint for org tax_info_status if not exists
IF NOT EXISTS (SELECT * FROM sys.check_constraints WHERE name = 'CK_org_tax_info_status')
BEGIN
    ALTER TABLE organizations ADD CONSTRAINT CK_org_tax_info_status CHECK (
        tax_info_status IS NULL OR tax_info_status IN ('not_submitted', 'pending', 'verified', 'expired')
    );
END

GO

-- 9. Seed initial agreement versions (placeholder - to be updated with attorney-reviewed content)
-- Note: These are placeholder versions. Real content should be added after legal review.

IF NOT EXISTS (SELECT * FROM agreement_versions WHERE agreement_type = 'terms_of_service' AND version = '1.0')
BEGIN
    INSERT INTO agreement_versions (id, agreement_type, version, title, content, content_hash, effective_date, is_current, created_at)
    VALUES (
        NEWID(),
        'terms_of_service',
        '1.0',
        'Terms of Service',
        'PLACEHOLDER - Terms of Service content to be added after legal review.',
        'placeholder_hash_tos_1_0',
        GETUTCDATE(),
        1,
        GETUTCDATE()
    );
END

IF NOT EXISTS (SELECT * FROM agreement_versions WHERE agreement_type = 'privacy_policy' AND version = '1.0')
BEGIN
    INSERT INTO agreement_versions (id, agreement_type, version, title, content, content_hash, effective_date, is_current, created_at)
    VALUES (
        NEWID(),
        'privacy_policy',
        '1.0',
        'Privacy Policy',
        'PLACEHOLDER - Privacy Policy content to be added after legal review.',
        'placeholder_hash_privacy_1_0',
        GETUTCDATE(),
        1,
        GETUTCDATE()
    );
END

IF NOT EXISTS (SELECT * FROM agreement_versions WHERE agreement_type = 'seller_agreement' AND version = '1.0')
BEGIN
    INSERT INTO agreement_versions (id, agreement_type, version, title, content, content_hash, effective_date, is_current, created_at)
    VALUES (
        NEWID(),
        'seller_agreement',
        '1.0',
        'Seller Agreement',
        'PLACEHOLDER - Seller Agreement content to be added after legal review.',
        'placeholder_hash_seller_1_0',
        GETUTCDATE(),
        1,
        GETUTCDATE()
    );
END

IF NOT EXISTS (SELECT * FROM agreement_versions WHERE agreement_type = 'organization_agreement' AND version = '1.0')
BEGIN
    INSERT INTO agreement_versions (id, agreement_type, version, title, content, content_hash, effective_date, is_current, created_at)
    VALUES (
        NEWID(),
        'organization_agreement',
        '1.0',
        'Organization Agreement',
        'PLACEHOLDER - Organization Agreement content to be added after legal review.',
        'placeholder_hash_org_1_0',
        GETUTCDATE(),
        1,
        GETUTCDATE()
    );
END

GO
