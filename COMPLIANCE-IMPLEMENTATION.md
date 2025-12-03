# Very Good Auctions - Compliance Implementation

> ⚠️ **IMPORTANT DISCLAIMER**: This document provides implementation guidance and template language. 
> All legal documents (Terms of Service, Privacy Policy, etc.) MUST be reviewed by a qualified attorney 
> before use. Tax guidance should be reviewed by a CPA. This is not legal or financial advice.

---

## Table of Contents

1. [Overview](#overview)
2. [Database Schema](#database-schema)
3. [Tax Compliance](#tax-compliance)
4. [W-9 Collection](#w-9-collection)
5. [Terms of Service](#terms-of-service)
6. [Privacy Policy](#privacy-policy)
7. [Seller Agreement](#seller-agreement)
8. [Organization Agreement](#organization-agreement)
9. [API Endpoints](#api-endpoints)
10. [Admin Dashboard](#admin-dashboard)
11. [Implementation Checklist](#implementation-checklist)

---

## Overview

### Compliance Strategy

| Area | Approach |
|------|----------|
| **Money Transmission** | Stripe is the payment processor; we never hold funds |
| **Tax Collection** | Stripe Tax for calculation; sellers responsible for remittance |
| **1099-K Reporting** | Stripe handles for Connect accounts |
| **1099 for Individuals** | Collect W-9; report via PayPal or manually |
| **KYC/AML** | Stripe Connect handles identity verification |
| **Terms of Service** | Platform is facilitator, not party to transactions |
| **Nonprofit Verification** | Optional IRS database check; disclaimers displayed |

### Key Legal Positions

1. **We are a platform, not a seller** - We facilitate transactions between buyers and sellers
2. **Sellers are responsible for tax compliance** - We provide tools, they handle remittance
3. **Organizations verify their own status** - We don't guarantee nonprofit status
4. **Stripe is the payment processor** - We never hold or transmit money ourselves

---

## Database Schema

### Compliance Tables

```sql
-- Tax information collection (W-9/W-8BEN)
CREATE TABLE tax_information (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    
    -- Who this belongs to
    user_id NVARCHAR(128),
    organization_id UNIQUEIDENTIFIER,
    
    -- Tax classification
    tax_form_type NVARCHAR(20) NOT NULL CHECK (tax_form_type IN (
        'w9',           -- US persons
        'w8ben',        -- Foreign individuals
        'w8bene'        -- Foreign entities
    )),
    
    -- W-9 Fields
    legal_name NVARCHAR(255) NOT NULL,
    business_name NVARCHAR(255),
    tax_classification NVARCHAR(50) CHECK (tax_classification IN (
        'individual',
        'sole_proprietor',
        'c_corp',
        's_corp',
        'partnership',
        'trust_estate',
        'llc_c',
        'llc_s',
        'llc_p',
        'nonprofit',
        'other'
    )),
    
    -- Tax ID (encrypted at rest)
    tin_type NVARCHAR(10) CHECK (tin_type IN ('ssn', 'ein')),
    tin_encrypted VARBINARY(MAX),  -- Encrypted SSN/EIN
    tin_last_four NVARCHAR(4),     -- Last 4 digits for display
    
    -- Address
    address_line1 NVARCHAR(255),
    address_line2 NVARCHAR(255),
    city NVARCHAR(100),
    state NVARCHAR(50),
    postal_code NVARCHAR(20),
    country NVARCHAR(3) DEFAULT 'USA',
    
    -- Certification
    is_us_person BIT,
    is_exempt_payee BIT DEFAULT 0,
    exempt_payee_code NVARCHAR(10),
    
    -- Signature
    signature_name NVARCHAR(255) NOT NULL,
    signature_date DATETIME2 NOT NULL,
    signature_ip NVARCHAR(45),
    
    -- Verification status
    status NVARCHAR(50) DEFAULT 'pending' CHECK (status IN (
        'pending',
        'verified',
        'invalid',
        'expired'
    )),
    verified_at DATETIME2,
    verified_by NVARCHAR(128),
    
    -- Metadata
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    expires_at DATETIME2,  -- W-9s don't expire but W-8s do (3 years)
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX idx_tax_info_user ON tax_information(user_id);
CREATE INDEX idx_tax_info_org ON tax_information(organization_id);

-- Agreement acceptances (audit trail)
CREATE TABLE agreement_acceptances (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    user_id NVARCHAR(128) NOT NULL,
    
    agreement_type NVARCHAR(50) NOT NULL CHECK (agreement_type IN (
        'terms_of_service',
        'privacy_policy',
        'seller_agreement',
        'organization_agreement',
        'bidder_agreement'
    )),
    
    agreement_version NVARCHAR(20) NOT NULL,  -- e.g., '1.0', '2.0'
    agreement_hash NVARCHAR(64),              -- SHA-256 of agreement text
    
    accepted_at DATETIME2 DEFAULT GETUTCDATE(),
    accepted_ip NVARCHAR(45),
    accepted_user_agent NVARCHAR(500),
    
    -- For org agreements, link to org
    organization_id UNIQUEIDENTIFIER,
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

CREATE INDEX idx_agreements_user ON agreement_acceptances(user_id);
CREATE INDEX idx_agreements_type ON agreement_acceptances(agreement_type, agreement_version);

-- Agreement versions (store actual text)
CREATE TABLE agreement_versions (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    
    agreement_type NVARCHAR(50) NOT NULL,
    version NVARCHAR(20) NOT NULL,
    
    title NVARCHAR(255) NOT NULL,
    content NVARCHAR(MAX) NOT NULL,        -- Full agreement text (Markdown)
    content_hash NVARCHAR(64) NOT NULL,    -- SHA-256 for verification
    
    effective_date DATETIME2 NOT NULL,
    is_current BIT DEFAULT 0,
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    created_by NVARCHAR(128),
    
    UNIQUE (agreement_type, version)
);

-- Nonprofit verification (optional)
CREATE TABLE nonprofit_verifications (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    organization_id UNIQUEIDENTIFIER NOT NULL,
    
    ein NVARCHAR(20),
    irs_determination_letter_url NVARCHAR(500),
    
    -- IRS database check
    irs_verified BIT DEFAULT 0,
    irs_verified_at DATETIME2,
    irs_organization_name NVARCHAR(255),
    irs_city NVARCHAR(100),
    irs_state NVARCHAR(50),
    irs_deductibility_status NVARCHAR(100),
    
    -- Manual verification
    manually_verified BIT DEFAULT 0,
    manually_verified_at DATETIME2,
    manually_verified_by NVARCHAR(128),
    verification_notes NVARCHAR(MAX),
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (organization_id) REFERENCES organizations(id)
);

-- Tax reporting records (1099 tracking)
CREATE TABLE tax_reporting (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    
    -- Who we're reporting on
    user_id NVARCHAR(128),
    organization_id UNIQUEIDENTIFIER,
    
    tax_year INT NOT NULL,
    
    -- Amounts
    gross_payments DECIMAL(12,2) NOT NULL,
    refunds DECIMAL(12,2) DEFAULT 0,
    adjustments DECIMAL(12,2) DEFAULT 0,
    reportable_amount DECIMAL(12,2) NOT NULL,
    
    -- 1099 status
    form_type NVARCHAR(20) CHECK (form_type IN (
        '1099-K',       -- Stripe handles for Connect
        '1099-NEC',     -- We handle for PayPal payouts
        '1099-MISC'     -- If applicable
    )),
    
    threshold_met BIT DEFAULT 0,  -- Over $600
    
    -- If we need to file (PayPal payouts)
    filed BIT DEFAULT 0,
    filed_at DATETIME2,
    confirmation_number NVARCHAR(100),
    
    -- Stripe handles this for Connect
    stripe_handled BIT DEFAULT 0,
    
    created_at DATETIME2 DEFAULT GETUTCDATE(),
    updated_at DATETIME2 DEFAULT GETUTCDATE(),
    
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (organization_id) REFERENCES organizations(id),
    UNIQUE (user_id, tax_year),
    UNIQUE (organization_id, tax_year)
);

-- Compliance audit log
CREATE TABLE compliance_audit_log (
    id UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    
    event_type NVARCHAR(100) NOT NULL,
    -- e.g., 'tax_info_submitted', 'agreement_accepted', 'payout_processed',
    --       'w9_verified', 'nonprofit_verified', '1099_generated'
    
    user_id NVARCHAR(128),
    organization_id UNIQUEIDENTIFIER,
    
    details NVARCHAR(MAX),  -- JSON with event-specific data
    ip_address NVARCHAR(45),
    user_agent NVARCHAR(500),
    
    created_at DATETIME2 DEFAULT GETUTCDATE()
);

CREATE INDEX idx_audit_user ON compliance_audit_log(user_id, created_at);
CREATE INDEX idx_audit_type ON compliance_audit_log(event_type, created_at);
```

### Update Users Table

```sql
ALTER TABLE users ADD
    -- Tax compliance
    tax_info_status NVARCHAR(50) DEFAULT 'not_submitted' CHECK (tax_info_status IN (
        'not_submitted',
        'pending',
        'verified',
        'expired'
    )),
    tax_info_submitted_at DATETIME2,
    
    -- Agreement tracking
    tos_accepted_version NVARCHAR(20),
    tos_accepted_at DATETIME2,
    privacy_accepted_version NVARCHAR(20),
    privacy_accepted_at DATETIME2,
    seller_agreement_version NVARCHAR(20),
    seller_agreement_accepted_at DATETIME2;
```

### Update Organizations Table

```sql
ALTER TABLE organizations ADD
    -- Tax compliance
    tax_info_status NVARCHAR(50) DEFAULT 'not_submitted',
    tax_info_submitted_at DATETIME2,
    
    -- Agreement tracking
    org_agreement_version NVARCHAR(20),
    org_agreement_accepted_at DATETIME2,
    org_agreement_accepted_by NVARCHAR(128),
    
    -- Nonprofit status
    is_nonprofit BIT DEFAULT 0,
    nonprofit_verified BIT DEFAULT 0,
    nonprofit_disclaimer_shown BIT DEFAULT 1;
```

---

## Tax Compliance

### Stripe Tax Integration

```javascript
// services/stripeTax.ts

import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

/**
 * Calculate tax for a transaction
 * Returns tax amount and breakdown by jurisdiction
 */
export async function calculateTax(params: {
  amount: number;
  currency: string;
  customerAddress: {
    line1?: string;
    city?: string;
    state?: string;
    postal_code: string;
    country: string;
  };
  productType: 'auction_item' | 'platform_fee' | 'event_ticket';
}) {
  // Determine tax code based on product type
  const taxCode = getTaxCode(params.productType);
  
  const calculation = await stripe.tax.calculations.create({
    currency: params.currency,
    line_items: [{
      amount: Math.round(params.amount * 100),
      reference: params.productType,
      tax_code: taxCode,
    }],
    customer_details: {
      address: {
        line1: params.customerAddress.line1,
        city: params.customerAddress.city,
        state: params.customerAddress.state,
        postal_code: params.customerAddress.postal_code,
        country: params.customerAddress.country,
      },
      address_source: 'shipping', // or 'billing'
    },
  });
  
  return {
    taxAmount: calculation.tax_amount_exclusive / 100,
    totalAmount: (calculation.amount_total) / 100,
    breakdown: calculation.tax_breakdown,
    calculationId: calculation.id,
  };
}

/**
 * Get Stripe tax code for product type
 * See: https://stripe.com/docs/tax/tax-codes
 */
function getTaxCode(productType: string): string {
  switch (productType) {
    case 'auction_item':
      return 'txcd_99999999'; // General tangible goods
    case 'platform_fee':
      return 'txcd_10000000'; // General services
    case 'event_ticket':
      return 'txcd_90000000'; // General admission
    default:
      return 'txcd_99999999';
  }
}

/**
 * Create a transaction with tax for reporting
 * Call this after successful payment
 */
export async function createTaxTransaction(params: {
  calculationId: string;
  paymentIntentId: string;
  orderId: string;
}) {
  const transaction = await stripe.tax.transactions.createFromCalculation({
    calculation: params.calculationId,
    reference: params.orderId,
    metadata: {
      payment_intent: params.paymentIntentId,
    },
  });
  
  return transaction;
}
```

### Tax Settings Configuration

```javascript
// config/tax.ts

export const TAX_CONFIG = {
  // Enable/disable tax calculation
  enabled: process.env.ENABLE_TAX_CALCULATION === 'true',
  
  // Stripe Tax pricing: $0.50 per transaction where tax is calculated
  // Only charge when tax is actually calculated
  
  // States where we definitely need to collect (marketplace facilitator)
  // This list changes - consult CPA
  marketplaceFacilitatorStates: [
    'AL', 'AR', 'AZ', 'CA', 'CO', 'CT', 'DC', 'FL', 'GA', 'HI',
    'IA', 'ID', 'IL', 'IN', 'KS', 'KY', 'LA', 'MA', 'MD', 'ME',
    'MI', 'MN', 'MS', 'NC', 'ND', 'NE', 'NJ', 'NM', 'NV', 'NY',
    'OH', 'OK', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VA',
    'VT', 'WA', 'WI', 'WV', 'WY'
  ],
  
  // Exempt categories (varies by state)
  exemptCategories: [
    'nonprofit_fundraiser', // Many states exempt
  ],
  
  // Display settings
  showTaxAtCheckout: true,
  showTaxBreakdown: true,
};

/**
 * Check if we need to collect tax for this transaction
 */
export function shouldCollectTax(params: {
  buyerState: string;
  sellerType: 'individual' | 'organization';
  isNonprofit: boolean;
  itemCategory?: string;
}): boolean {
  if (!TAX_CONFIG.enabled) return false;
  
  // Check if state requires marketplace facilitator collection
  if (!TAX_CONFIG.marketplaceFacilitatorStates.includes(params.buyerState)) {
    return false;
  }
  
  // Some states exempt nonprofit fundraisers - this varies widely
  // Consult CPA for your specific situation
  
  return true;
}
```

---

## W-9 Collection

### W-9 Collection Flow

```javascript
// services/taxForms.ts

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.TAX_ENCRYPTION_KEY; // 32-byte key

/**
 * Encrypt sensitive tax ID (SSN/EIN)
 */
function encryptTIN(tin: string): Buffer {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  
  let encrypted = cipher.update(tin.replace(/\D/g, ''), 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + authTag + encrypted data
  return Buffer.concat([iv, authTag, Buffer.from(encrypted, 'hex')]);
}

/**
 * Decrypt tax ID (only for authorized 1099 generation)
 */
function decryptTIN(encrypted: Buffer): string {
  const iv = encrypted.slice(0, 16);
  const authTag = encrypted.slice(16, 32);
  const data = encrypted.slice(32);
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(data, undefined, 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Submit W-9 form
 */
export async function submitW9(params: {
  userId: string;
  legalName: string;
  businessName?: string;
  taxClassification: string;
  tinType: 'ssn' | 'ein';
  tin: string;
  address: {
    line1: string;
    line2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  isUsResident: boolean;
  signatureName: string;
  signatureIp: string;
}) {
  // Validate TIN format
  const cleanTIN = params.tin.replace(/\D/g, '');
  if (params.tinType === 'ssn' && cleanTIN.length !== 9) {
    throw new Error('Invalid SSN format');
  }
  if (params.tinType === 'ein' && cleanTIN.length !== 9) {
    throw new Error('Invalid EIN format');
  }
  
  // Encrypt TIN
  const encryptedTIN = encryptTIN(cleanTIN);
  const lastFour = cleanTIN.slice(-4);
  
  // Store in database
  const taxInfo = await db.query(`
    INSERT INTO tax_information (
      user_id,
      tax_form_type,
      legal_name,
      business_name,
      tax_classification,
      tin_type,
      tin_encrypted,
      tin_last_four,
      address_line1,
      address_line2,
      city,
      state,
      postal_code,
      country,
      is_us_person,
      signature_name,
      signature_date,
      signature_ip,
      status
    ) VALUES (
      @userId,
      'w9',
      @legalName,
      @businessName,
      @taxClassification,
      @tinType,
      @tinEncrypted,
      @lastFour,
      @addressLine1,
      @addressLine2,
      @city,
      @state,
      @postalCode,
      @country,
      @isUsResident,
      @signatureName,
      GETUTCDATE(),
      @signatureIp,
      'pending'
    )
  `, {
    userId: params.userId,
    legalName: params.legalName,
    businessName: params.businessName,
    taxClassification: params.taxClassification,
    tinType: params.tinType,
    tinEncrypted: encryptedTIN,
    lastFour,
    addressLine1: params.address.line1,
    addressLine2: params.address.line2,
    city: params.address.city,
    state: params.address.state,
    postalCode: params.address.postalCode,
    country: params.address.country,
    isUsResident: params.isUsResident,
    signatureName: params.signatureName,
    signatureIp: params.signatureIp,
  });
  
  // Update user status
  await db.query(`
    UPDATE users
    SET tax_info_status = 'pending',
        tax_info_submitted_at = GETUTCDATE()
    WHERE id = @userId
  `, { userId: params.userId });
  
  // Log for audit
  await logComplianceEvent({
    eventType: 'tax_info_submitted',
    userId: params.userId,
    details: {
      formType: 'w9',
      tinType: params.tinType,
      tinLastFour: lastFour,
    },
    ipAddress: params.signatureIp,
  });
  
  return { success: true, lastFour };
}

/**
 * Check if user needs to submit W-9 before payout
 */
export async function requiresW9(userId: string): Promise<boolean> {
  // Check current year's earnings
  const earnings = await db.query(`
    SELECT SUM(payout_amount) as total
    FROM individual_payouts
    WHERE user_id = @userId
      AND status = 'completed'
      AND YEAR(completed_at) = YEAR(GETUTCDATE())
  `, { userId });
  
  const totalEarnings = earnings[0]?.total || 0;
  
  // IRS threshold is $600
  if (totalEarnings >= 600) {
    // Check if W-9 is on file
    const taxInfo = await db.query(`
      SELECT status FROM tax_information
      WHERE user_id = @userId
        AND tax_form_type = 'w9'
        AND status = 'verified'
    `, { userId });
    
    return taxInfo.length === 0;
  }
  
  return false;
}

/**
 * Block payout if W-9 required but not submitted
 */
export async function validatePayoutCompliance(userId: string): Promise<{
  canPayout: boolean;
  reason?: string;
}> {
  const needsW9 = await requiresW9(userId);
  
  if (needsW9) {
    return {
      canPayout: false,
      reason: 'W-9 required for payouts over $600/year. Please submit tax information.',
    };
  }
  
  return { canPayout: true };
}
```

### W-9 Form Component

```typescript
// frontend/src/components/W9Form.tsx

import React, { useState } from 'react';

interface W9FormData {
  legalName: string;
  businessName: string;
  taxClassification: string;
  tinType: 'ssn' | 'ein';
  tin: string;
  address: {
    line1: string;
    line2: string;
    city: string;
    state: string;
    postalCode: string;
  };
  certify: boolean;
  signatureName: string;
}

const TAX_CLASSIFICATIONS = [
  { value: 'individual', label: 'Individual/Sole Proprietor' },
  { value: 'c_corp', label: 'C Corporation' },
  { value: 's_corp', label: 'S Corporation' },
  { value: 'partnership', label: 'Partnership' },
  { value: 'trust_estate', label: 'Trust/Estate' },
  { value: 'llc_c', label: 'LLC (taxed as C Corp)' },
  { value: 'llc_s', label: 'LLC (taxed as S Corp)' },
  { value: 'llc_p', label: 'LLC (taxed as Partnership)' },
  { value: 'nonprofit', label: 'Nonprofit Organization' },
];

export function W9Form({ onSubmit, onCancel }) {
  const [formData, setFormData] = useState<W9FormData>({
    legalName: '',
    businessName: '',
    taxClassification: 'individual',
    tinType: 'ssn',
    tin: '',
    address: { line1: '', line2: '', city: '', state: '', postalCode: '' },
    certify: false,
    signatureName: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  const formatTIN = (value: string, type: 'ssn' | 'ein') => {
    const digits = value.replace(/\D/g, '');
    if (type === 'ssn') {
      if (digits.length <= 3) return digits;
      if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
      return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5, 9)}`;
    } else {
      if (digits.length <= 2) return digits;
      return `${digits.slice(0, 2)}-${digits.slice(2, 9)}`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate
    const newErrors: Record<string, string> = {};
    if (!formData.legalName) newErrors.legalName = 'Legal name is required';
    if (!formData.tin) newErrors.tin = 'Tax ID is required';
    if (formData.tin.replace(/\D/g, '').length !== 9) {
      newErrors.tin = 'Tax ID must be 9 digits';
    }
    if (!formData.address.line1) newErrors.address = 'Address is required';
    if (!formData.address.city) newErrors.city = 'City is required';
    if (!formData.address.state) newErrors.state = 'State is required';
    if (!formData.address.postalCode) newErrors.postalCode = 'ZIP code is required';
    if (!formData.certify) newErrors.certify = 'You must certify the information';
    if (!formData.signatureName) newErrors.signature = 'Signature is required';
    
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    
    setSubmitting(true);
    try {
      await onSubmit(formData);
    } catch (error) {
      setErrors({ submit: error.message });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <h3 className="font-semibold text-yellow-800">IRS Form W-9 Substitute</h3>
        <p className="text-sm text-yellow-700 mt-1">
          This information is required by the IRS for tax reporting purposes. 
          Your tax ID is encrypted and stored securely.
        </p>
      </div>

      {/* Name */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Legal Name (as shown on your tax return) *
        </label>
        <input
          type="text"
          value={formData.legalName}
          onChange={(e) => setFormData({ ...formData, legalName: e.target.value })}
          className="w-full border rounded-lg px-3 py-2"
        />
        {errors.legalName && <p className="text-red-600 text-sm mt-1">{errors.legalName}</p>}
      </div>

      {/* Business Name */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Business Name (if different from above)
        </label>
        <input
          type="text"
          value={formData.businessName}
          onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
          className="w-full border rounded-lg px-3 py-2"
        />
      </div>

      {/* Tax Classification */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Federal Tax Classification *
        </label>
        <select
          value={formData.taxClassification}
          onChange={(e) => setFormData({ ...formData, taxClassification: e.target.value })}
          className="w-full border rounded-lg px-3 py-2"
        >
          {TAX_CLASSIFICATIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      </div>

      {/* TIN Type and Number */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">Tax ID Type *</label>
          <select
            value={formData.tinType}
            onChange={(e) => setFormData({ 
              ...formData, 
              tinType: e.target.value as 'ssn' | 'ein',
              tin: '' 
            })}
            className="w-full border rounded-lg px-3 py-2"
          >
            <option value="ssn">Social Security Number (SSN)</option>
            <option value="ein">Employer Identification Number (EIN)</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">
            {formData.tinType === 'ssn' ? 'SSN' : 'EIN'} *
          </label>
          <input
            type="text"
            value={formData.tin}
            onChange={(e) => setFormData({ 
              ...formData, 
              tin: formatTIN(e.target.value, formData.tinType) 
            })}
            placeholder={formData.tinType === 'ssn' ? '___-__-____' : '__-_______'}
            maxLength={formData.tinType === 'ssn' ? 11 : 10}
            className="w-full border rounded-lg px-3 py-2 font-mono"
          />
          {errors.tin && <p className="text-red-600 text-sm mt-1">{errors.tin}</p>}
        </div>
      </div>

      {/* Address */}
      <div className="space-y-3">
        <label className="block text-sm font-medium">Address *</label>
        <input
          type="text"
          placeholder="Street address"
          value={formData.address.line1}
          onChange={(e) => setFormData({ 
            ...formData, 
            address: { ...formData.address, line1: e.target.value } 
          })}
          className="w-full border rounded-lg px-3 py-2"
        />
        <input
          type="text"
          placeholder="Apt, suite, etc. (optional)"
          value={formData.address.line2}
          onChange={(e) => setFormData({ 
            ...formData, 
            address: { ...formData.address, line2: e.target.value } 
          })}
          className="w-full border rounded-lg px-3 py-2"
        />
        <div className="grid grid-cols-3 gap-3">
          <input
            type="text"
            placeholder="City"
            value={formData.address.city}
            onChange={(e) => setFormData({ 
              ...formData, 
              address: { ...formData.address, city: e.target.value } 
            })}
            className="w-full border rounded-lg px-3 py-2"
          />
          <input
            type="text"
            placeholder="State"
            value={formData.address.state}
            onChange={(e) => setFormData({ 
              ...formData, 
              address: { ...formData.address, state: e.target.value } 
            })}
            className="w-full border rounded-lg px-3 py-2"
          />
          <input
            type="text"
            placeholder="ZIP Code"
            value={formData.address.postalCode}
            onChange={(e) => setFormData({ 
              ...formData, 
              address: { ...formData.address, postalCode: e.target.value } 
            })}
            className="w-full border rounded-lg px-3 py-2"
          />
        </div>
      </div>

      {/* Certification */}
      <div className="bg-gray-50 border rounded-lg p-4">
        <h4 className="font-medium mb-2">Certification</h4>
        <p className="text-sm text-gray-600 mb-3">
          Under penalties of perjury, I certify that:
        </p>
        <ol className="text-sm text-gray-600 list-decimal list-inside space-y-1 mb-4">
          <li>The number shown on this form is my correct taxpayer identification number</li>
          <li>I am not subject to backup withholding</li>
          <li>I am a U.S. citizen or other U.S. person</li>
          <li>The FATCA code(s) entered (if any) are correct</li>
        </ol>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            checked={formData.certify}
            onChange={(e) => setFormData({ ...formData, certify: e.target.checked })}
            className="mt-1"
          />
          <span className="text-sm">
            I certify the above statements are true and correct *
          </span>
        </label>
        {errors.certify && <p className="text-red-600 text-sm mt-1">{errors.certify}</p>}
      </div>

      {/* Signature */}
      <div>
        <label className="block text-sm font-medium mb-1">
          Electronic Signature (type your full legal name) *
        </label>
        <input
          type="text"
          value={formData.signatureName}
          onChange={(e) => setFormData({ ...formData, signatureName: e.target.value })}
          className="w-full border rounded-lg px-3 py-2 font-serif italic"
          placeholder="Type your full legal name"
        />
        {errors.signature && <p className="text-red-600 text-sm mt-1">{errors.signature}</p>}
        <p className="text-xs text-gray-500 mt-1">
          By typing your name, you are electronically signing this form. 
          Date: {new Date().toLocaleDateString()}
        </p>
      </div>

      {errors.submit && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-3">
          {errors.submit}
        </div>
      )}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 border rounded-lg py-2 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-blue-600 text-white rounded-lg py-2 hover:bg-blue-700 disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit W-9'}
        </button>
      </div>
    </form>
  );
}
```

---

## Terms of Service

### Terms of Service Template

> ⚠️ **MUST BE REVIEWED BY AN ATTORNEY BEFORE USE**

```markdown
# Very Good Auctions - Terms of Service

**Effective Date: [DATE]**
**Version: 1.0**

## 1. Introduction

Welcome to Very Good Auctions ("Platform," "we," "us," or "our"). These Terms of Service 
("Terms") govern your access to and use of our website, mobile applications, and services 
(collectively, the "Services").

By accessing or using our Services, you agree to be bound by these Terms. If you do not 
agree to these Terms, you may not access or use our Services.

## 2. Platform Role and Relationship

### 2.1 We Are a Platform, Not a Party to Transactions

Very Good Auctions operates as a technology platform that facilitates transactions between 
buyers ("Bidders") and sellers ("Sellers," including both individual sellers and organizations 
conducting fundraising events). 

**IMPORTANT: We are not a party to any transaction between Bidders and Sellers.** We do not:
- Own, sell, or purchase any items listed on the Platform
- Set prices for items (except Platform fees)
- Guarantee the quality, safety, legality, or availability of items
- Guarantee Seller performance or Bidder payment
- Act as an agent for any Buyer or Seller

### 2.2 Payment Processing

Payments are processed by our third-party payment processor, Stripe, Inc. ("Stripe"). 
Stripe is the payment facilitator for all transactions. We do not hold, transmit, or 
control funds at any point in the transaction process.

By using our Services, you also agree to Stripe's Services Agreement 
(https://stripe.com/legal).

## 3. User Accounts

### 3.1 Account Registration

To use certain features of the Platform, you must register for an account. You agree to:
- Provide accurate, current, and complete information
- Maintain the security of your account credentials
- Promptly update any changes to your information
- Accept responsibility for all activities under your account

### 3.2 Account Eligibility

You must be at least 18 years old and legally capable of entering into binding contracts 
to use our Services. Organizations must be validly formed under applicable law.

## 4. Seller Terms

### 4.1 Listing Requirements

Sellers are solely responsible for:
- The accuracy of all item descriptions, images, and information
- Setting appropriate starting prices and reserve prices
- Ensuring items are legal to sell and not prohibited
- Fulfilling orders and delivering items to winning Bidders
- Complying with all applicable laws and regulations

### 4.2 Prohibited Items

Sellers may not list items that are:
- Illegal to sell or possess
- Counterfeit, stolen, or fraudulent
- Weapons, ammunition, or explosives
- Controlled substances or drug paraphernalia
- Adult content or services
- Items that infringe intellectual property rights
- Any other items we prohibit at our discretion

### 4.3 Fees and Payment

Sellers agree to pay Platform fees as described in our Fee Schedule. Fees are non-refundable 
except as expressly stated in our Refund Policy. Platform fees are paid by Sellers; Bidders 
pay only the winning bid amount plus any applicable taxes.

### 4.4 Tax Responsibilities

**Sellers are solely responsible for determining and fulfilling their tax obligations**, 
including but not limited to:
- Sales tax, use tax, VAT, or other transaction taxes
- Income tax on proceeds from sales
- Providing accurate tax information (W-9 or W-8BEN) when required
- Filing all required tax returns and reports

We may provide tools to assist with tax calculation, but we do not provide tax advice and 
make no guarantees regarding tax compliance. Consult a qualified tax professional.

### 4.5 Payouts

Payouts to Sellers are subject to:
- Successful completion of identity verification via Stripe Connect
- A hold period of seven (7) days following auction completion
- Submission of required tax documentation (W-9/W-8BEN) for individual sellers earning 
  $600 or more annually
- No pending disputes, chargebacks, or compliance reviews

We reserve the right to withhold payouts pending investigation of suspected fraud or 
Terms violations.

## 5. Bidder Terms

### 5.1 Binding Bids

All bids placed on the Platform are binding offers to purchase. By placing a bid, you agree 
to purchase the item at your bid price if you are the winning Bidder.

### 5.2 Payment Obligation

Winning Bidders must complete payment within 48 hours of auction close unless otherwise 
specified. Failure to pay may result in account suspension and negative feedback.

### 5.3 Taxes

Bidders are responsible for any applicable sales tax, use tax, or other taxes on their 
purchases. Tax may be calculated and collected at checkout where required by law.

## 6. Organization Terms

### 6.1 Organization Registration

Organizations registering on the Platform must:
- Provide accurate information about the organization
- Complete identity verification via Stripe Connect
- Designate authorized representatives
- Accept the Organization Agreement

### 6.2 Nonprofit Status

Organizations claiming nonprofit status represent that they are validly organized as a 
tax-exempt entity under applicable law. 

**DISCLAIMER: We do not verify or guarantee the tax-exempt status of any organization.** 
Bidders should independently verify an organization's status before claiming any tax 
deduction. We are not responsible for any tax consequences of contributions.

### 6.3 Event Management

Organizations are responsible for:
- All items listed in their events
- Communications with event participants
- Compliance with applicable charitable solicitation laws
- State registration requirements for charitable fundraising

## 7. Fees

### 7.1 Fee Schedule

| Seller Type | Fee |
|-------------|-----|
| Individual (per listing) | $1.00 |
| Individual (monthly pass) | $5.00/month |
| Organization - Small Event (up to 25 items) | $15.00 |
| Organization - Medium Event (up to 100 items) | $35.00 |
| Organization - Large Event (up to 500 items) | $75.00 |
| Organization - Unlimited Event | $150.00 |

### 7.2 Payment Processing Fees

Payment processing fees (currently 2.9% + $0.30 per transaction) are charged by Stripe 
and are deducted from Seller proceeds. Bidders are not charged additional fees.

### 7.3 Fee Changes

We may change our fees at any time with 30 days' notice. Continued use of the Platform 
after fee changes constitutes acceptance of the new fees.

## 8. Intellectual Property

### 8.1 Platform Content

All Platform content, including but not limited to logos, text, graphics, and software, 
is owned by Very Good Auctions or its licensors and protected by intellectual property laws.

### 8.2 User Content

You retain ownership of content you submit to the Platform ("User Content"). By submitting 
User Content, you grant us a non-exclusive, worldwide, royalty-free license to use, 
reproduce, and display such content in connection with the Services.

## 9. Disclaimers

### 9.1 AS-IS Service

THE SERVICES ARE PROVIDED "AS IS" AND "AS AVAILABLE" WITHOUT WARRANTIES OF ANY KIND, 
EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, 
FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.

### 9.2 No Guarantees

We do not guarantee:
- The accuracy of any listing information
- The quality, safety, or legality of listed items
- The ability of Sellers to complete transactions
- The ability of Bidders to pay for items
- Uninterrupted or error-free operation of the Services

## 10. Limitation of Liability

### 10.1 Exclusion of Damages

TO THE MAXIMUM EXTENT PERMITTED BY LAW, VERY GOOD AUCTIONS SHALL NOT BE LIABLE FOR ANY 
INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING BUT NOT 
LIMITED TO LOSS OF PROFITS, DATA, USE, OR GOODWILL.

### 10.2 Cap on Liability

OUR TOTAL LIABILITY FOR ANY CLAIMS ARISING FROM OR RELATED TO THESE TERMS OR THE SERVICES 
SHALL NOT EXCEED THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE TWELVE (12) MONTHS 
PRECEDING THE CLAIM, OR (B) ONE HUNDRED DOLLARS ($100).

## 11. Indemnification

You agree to indemnify, defend, and hold harmless Very Good Auctions and its officers, 
directors, employees, and agents from any claims, damages, losses, or expenses (including 
reasonable attorneys' fees) arising from:
- Your use of the Services
- Your violation of these Terms
- Your violation of any third-party rights
- Items you list or purchase through the Platform

## 12. Dispute Resolution

### 12.1 Disputes Between Users

Disputes between Bidders and Sellers are to be resolved directly between the parties. 
We may, but are not obligated to, assist in dispute resolution.

### 12.2 Disputes with Very Good Auctions

Any dispute arising from these Terms or the Services shall be resolved by binding 
arbitration in accordance with the rules of the American Arbitration Association. 
The arbitration shall take place in [STATE], and the arbitrator's decision shall be 
final and binding.

### 12.3 Class Action Waiver

YOU AGREE THAT ANY DISPUTE RESOLUTION PROCEEDINGS WILL BE CONDUCTED ONLY ON AN 
INDIVIDUAL BASIS AND NOT IN A CLASS, CONSOLIDATED, OR REPRESENTATIVE ACTION.

## 13. Termination

### 13.1 By You

You may terminate your account at any time by contacting us. Termination does not 
relieve you of obligations for pending transactions.

### 13.2 By Us

We may suspend or terminate your account at any time for any reason, including 
violation of these Terms. We will provide notice when practicable.

## 14. Changes to Terms

We may modify these Terms at any time. We will provide notice of material changes 
via email or Platform notification. Continued use after changes constitutes acceptance.

## 15. General Provisions

### 15.1 Governing Law

These Terms are governed by the laws of the State of [STATE], without regard to 
conflict of law principles.

### 15.2 Severability

If any provision of these Terms is found unenforceable, the remaining provisions 
shall continue in effect.

### 15.3 Entire Agreement

These Terms, together with the Privacy Policy, Seller Agreement, and Organization 
Agreement (as applicable), constitute the entire agreement between you and Very Good 
Auctions.

## 16. Contact

Questions about these Terms may be directed to:

Very Good Auctions
[ADDRESS]
[EMAIL]
[PHONE]

---

*Last Updated: [DATE]*
```

---

## Privacy Policy

### Privacy Policy Template

> ⚠️ **MUST BE REVIEWED BY AN ATTORNEY BEFORE USE**

```markdown
# Very Good Auctions - Privacy Policy

**Effective Date: [DATE]**
**Version: 1.0**

## 1. Introduction

Very Good Auctions ("we," "us," or "our") respects your privacy and is committed to 
protecting your personal information. This Privacy Policy explains how we collect, use, 
disclose, and safeguard your information when you use our Services.

## 2. Information We Collect

### 2.1 Information You Provide

- **Account Information**: Name, email address, phone number, password
- **Profile Information**: Display name, profile picture, location
- **Payment Information**: Processed by Stripe; we do not store full card numbers
- **Tax Information**: W-9/W-8BEN data for sellers (SSN/EIN encrypted at rest)
- **Identity Verification**: Collected by Stripe Connect for sellers
- **Communications**: Messages, support tickets, feedback

### 2.2 Information Collected Automatically

- **Device Information**: IP address, browser type, operating system
- **Usage Information**: Pages viewed, features used, time spent
- **Transaction Information**: Bids placed, items purchased, amounts
- **Cookies and Tracking**: See Section 6

### 2.3 Information from Third Parties

- **Stripe**: Payment and identity verification status
- **Authentication Providers**: If you sign in via Microsoft/Google
- **Public Sources**: IRS nonprofit database for organization verification

## 3. How We Use Your Information

We use your information to:
- Provide, maintain, and improve our Services
- Process transactions and send related information
- Verify your identity and prevent fraud
- Comply with legal and tax reporting obligations
- Send administrative notifications
- Respond to your comments and questions
- Send marketing communications (with your consent)
- Analyze usage and improve user experience

## 4. How We Share Your Information

### 4.1 With Other Users

- Bidders see Seller display names and item information
- Sellers see Bidder display names and shipping addresses (for won items)
- Organizations see member names and roles

### 4.2 With Service Providers

- **Stripe**: Payment processing and identity verification
- **Cloud Providers**: Data hosting (Microsoft Azure)
- **Email Services**: Transactional and marketing emails
- **Analytics**: Usage analysis and improvement

### 4.3 For Legal and Compliance Reasons

- To comply with legal obligations
- To respond to lawful requests from public authorities
- To protect our rights, privacy, safety, or property
- To enforce our Terms of Service

### 4.4 Business Transfers

In the event of a merger, acquisition, or sale of assets, your information may be 
transferred to the acquiring entity.

## 5. Data Security

We implement appropriate technical and organizational measures to protect your 
information, including:
- Encryption of sensitive data at rest and in transit
- Regular security assessments
- Access controls and authentication
- Employee training on data protection

However, no method of transmission or storage is 100% secure. We cannot guarantee 
absolute security.

## 6. Cookies and Tracking

We use cookies and similar technologies to:
- Maintain your session and preferences
- Analyze usage patterns
- Prevent fraud

You can control cookies through your browser settings. Disabling cookies may affect 
functionality.

## 7. Your Rights and Choices

### 7.1 Access and Correction

You can access and update your account information at any time through your account 
settings.

### 7.2 Deletion

You may request deletion of your account and personal information by contacting us. 
Note that we may retain certain information as required by law or for legitimate 
business purposes.

### 7.3 Marketing Opt-Out

You can opt out of marketing communications by clicking "unsubscribe" in any email 
or updating your notification preferences.

### 7.4 California Residents

California residents have additional rights under the CCPA, including the right to:
- Know what personal information we collect
- Request deletion of personal information
- Opt out of sale of personal information (we do not sell personal information)
- Non-discrimination for exercising rights

To exercise these rights, contact us at [EMAIL].

### 7.5 European Residents

If you are in the European Economic Area, you have rights under GDPR including:
- Access to your personal data
- Rectification of inaccurate data
- Erasure ("right to be forgotten")
- Restriction of processing
- Data portability
- Objection to processing

To exercise these rights, contact us at [EMAIL].

## 8. Data Retention

We retain your information for as long as your account is active or as needed to 
provide Services. We also retain information as necessary to:
- Comply with legal obligations (e.g., tax records for 7 years)
- Resolve disputes
- Enforce our agreements

## 9. Children's Privacy

Our Services are not intended for children under 18. We do not knowingly collect 
information from children under 18. If we learn we have collected such information, 
we will delete it.

## 10. International Transfers

Your information may be transferred to and processed in countries other than your 
own. We ensure appropriate safeguards are in place for such transfers.

## 11. Changes to This Policy

We may update this Privacy Policy from time to time. We will notify you of material 
changes via email or Platform notification. Your continued use after changes 
constitutes acceptance.

## 12. Contact Us

For questions about this Privacy Policy or to exercise your rights:

Very Good Auctions
[ADDRESS]
Email: privacy@verygoodauctions.com
[PHONE]

---

*Last Updated: [DATE]*
```

---

## API Endpoints

### Compliance API Routes

```
# Agreement Management
GET    /api/agreements/current/:type         - Get current agreement version
POST   /api/agreements/accept                - Accept an agreement
GET    /api/my/agreements                    - List user's accepted agreements

# Tax Information
POST   /api/tax/w9                           - Submit W-9 form
GET    /api/tax/status                       - Get user's tax status
GET    /api/tax/requirements                 - Check if W-9 required for payout

# Nonprofit Verification (Organizations)
POST   /api/organizations/:id/verify-nonprofit  - Submit nonprofit verification
GET    /api/organizations/:id/nonprofit-status  - Get verification status

# Admin Routes
GET    /api/admin/compliance/w9-pending      - List pending W-9 reviews
POST   /api/admin/compliance/w9/:id/verify   - Verify W-9
GET    /api/admin/compliance/1099-report     - Generate 1099 report
GET    /api/admin/compliance/audit-log       - View compliance audit log
```

---

## Admin Dashboard

### Compliance Admin Features

```
/admin/compliance                    - Compliance dashboard overview
/admin/compliance/w9                 - W-9 submissions and verification
/admin/compliance/agreements         - Agreement versions and acceptance stats
/admin/compliance/1099               - Annual 1099 reporting
/admin/compliance/nonprofit          - Nonprofit verification queue
/admin/compliance/audit              - Compliance audit log
```

---

## Implementation Checklist

### Phase 1: Database & Core Setup
- [ ] Create compliance database tables
- [ ] Set up encryption for sensitive data (TIN)
- [ ] Create agreement version table and seed initial versions

### Phase 2: Agreements
- [ ] Build agreement acceptance flow
- [ ] Require ToS acceptance on signup
- [ ] Require Seller Agreement before listing
- [ ] Require Organization Agreement for orgs
- [ ] Store acceptance audit trail

### Phase 3: Tax Information
- [ ] Build W-9 form component
- [ ] Implement secure TIN storage (encryption)
- [ ] Create W-9 submission API
- [ ] Block payouts when W-9 required but missing
- [ ] Admin W-9 verification interface

### Phase 4: Tax Calculation (Optional)
- [ ] Integrate Stripe Tax
- [ ] Configure tax codes
- [ ] Display tax at checkout
- [ ] Create tax transactions for reporting

### Phase 5: Nonprofit Verification (Optional)
- [ ] Build EIN verification via IRS database
- [ ] Display verification badges
- [ ] Add nonprofit disclaimers

### Phase 6: 1099 Reporting
- [ ] Track annual earnings per seller
- [ ] Generate 1099 data for PayPal sellers
- [ ] Confirm Stripe handles Connect 1099s
- [ ] Build admin reporting interface

### Phase 7: Legal Review
- [ ] Attorney review of Terms of Service
- [ ] Attorney review of Privacy Policy
- [ ] Attorney review of Seller Agreement
- [ ] Attorney review of Organization Agreement
- [ ] CPA review of tax compliance approach

---

## Environment Variables

```env
# Existing
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_CONNECT_WEBHOOK_SECRET=

# Tax Compliance
TAX_ENCRYPTION_KEY=           # 32-byte hex key for TIN encryption
ENABLE_TAX_CALCULATION=false  # Enable Stripe Tax
STRIPE_TAX_ENABLED=false

# IRS Verification (Optional)
IRS_API_KEY=                  # If using IRS verification service

# Legal
CURRENT_TOS_VERSION=1.0
CURRENT_PRIVACY_VERSION=1.0
CURRENT_SELLER_AGREEMENT_VERSION=1.0
CURRENT_ORG_AGREEMENT_VERSION=1.0
```

---

## Next Steps

1. **Immediate**: Have attorney review all agreement templates
2. **Immediate**: Have CPA review tax compliance approach  
3. **Sprint 12**: Implement database schema and core compliance
4. **Sprint 13**: Build agreement acceptance flow
5. **Sprint 14**: Build W-9 collection system
6. **Future**: Consider Stripe Tax integration based on volume

---

*This document provides implementation guidance. All legal documents must be reviewed 
by qualified professionals before use.*
