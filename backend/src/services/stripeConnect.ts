import Stripe from 'stripe'
import { query as dbQuery } from '../config/database.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2023-10-16',
})

export interface ConnectAccountStatus {
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
}

/**
 * Create a Stripe Connect Express account for an organization
 */
export async function createConnectAccount(
  organizationId: string,
  email: string,
  organizationName: string
): Promise<string> {
  // Check if organization already has a connected account
  const existingResult = await dbQuery(
    `SELECT stripe_account_id FROM organizations WHERE id = @organizationId`,
    { organizationId }
  )

  if (existingResult.recordset[0]?.stripe_account_id) {
    return existingResult.recordset[0].stripe_account_id
  }

  // Create Stripe Connect Express account
  const account = await stripe.accounts.create({
    type: 'express',
    email,
    business_type: 'non_profit', // Default to nonprofit, can be updated
    capabilities: {
      card_payments: { requested: true },
      transfers: { requested: true },
    },
    business_profile: {
      name: organizationName,
      product_description: 'Fundraising auctions and events',
    },
    metadata: {
      organization_id: organizationId,
    },
  })

  // Store the account ID in our database
  await dbQuery(
    `UPDATE organizations
     SET stripe_account_id = @accountId,
         updated_at = GETUTCDATE()
     WHERE id = @organizationId`,
    { organizationId, accountId: account.id }
  )

  return account.id
}

/**
 * Generate an account onboarding link for Stripe Connect
 */
export async function createOnboardingLink(
  organizationId: string,
  returnUrl: string,
  refreshUrl: string
): Promise<string> {
  // Get the organization's Stripe account ID
  const orgResult = await dbQuery(
    `SELECT stripe_account_id, contact_email, name FROM organizations WHERE id = @organizationId`,
    { organizationId }
  )

  if (orgResult.recordset.length === 0) {
    throw new Error('Organization not found')
  }

  const org = orgResult.recordset[0]
  let accountId = org.stripe_account_id

  // Create account if it doesn't exist
  if (!accountId) {
    accountId = await createConnectAccount(
      organizationId,
      org.contact_email,
      org.name
    )
  }

  // Create the account link for onboarding
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: refreshUrl,
    return_url: returnUrl,
    type: 'account_onboarding',
  })

  return accountLink.url
}

/**
 * Get the current status of a Connect account
 */
export async function getAccountStatus(
  organizationId: string
): Promise<ConnectAccountStatus> {
  // Get the organization's Stripe account ID
  const orgResult = await dbQuery(
    `SELECT stripe_account_id, stripe_onboarding_complete, stripe_charges_enabled, stripe_payouts_enabled
     FROM organizations WHERE id = @organizationId`,
    { organizationId }
  )

  if (orgResult.recordset.length === 0) {
    throw new Error('Organization not found')
  }

  const org = orgResult.recordset[0]

  if (!org.stripe_account_id) {
    return {
      accountId: null,
      onboardingComplete: false,
      chargesEnabled: false,
      payoutsEnabled: false,
      detailsSubmitted: false,
    }
  }

  // Retrieve current status from Stripe
  const account = await stripe.accounts.retrieve(org.stripe_account_id)

  // Update our local records if they're out of sync
  if (
    org.stripe_onboarding_complete !== account.details_submitted ||
    org.stripe_charges_enabled !== account.charges_enabled ||
    org.stripe_payouts_enabled !== account.payouts_enabled
  ) {
    await dbQuery(
      `UPDATE organizations
       SET stripe_onboarding_complete = @detailsSubmitted,
           stripe_charges_enabled = @chargesEnabled,
           stripe_payouts_enabled = @payoutsEnabled,
           status = CASE
             WHEN @chargesEnabled = 1 AND @payoutsEnabled = 1 THEN 'verified'
             WHEN @detailsSubmitted = 1 THEN 'unverified'
             ELSE status
           END,
           updated_at = GETUTCDATE()
       WHERE id = @organizationId`,
      {
        organizationId,
        detailsSubmitted: account.details_submitted,
        chargesEnabled: account.charges_enabled,
        payoutsEnabled: account.payouts_enabled,
      }
    )
  }

  return {
    accountId: org.stripe_account_id,
    onboardingComplete: account.details_submitted,
    chargesEnabled: account.charges_enabled,
    payoutsEnabled: account.payouts_enabled,
    detailsSubmitted: account.details_submitted,
    requirements: account.requirements
      ? {
          currentlyDue: account.requirements.currently_due || [],
          eventuallyDue: account.requirements.eventually_due || [],
          pastDue: account.requirements.past_due || [],
        }
      : undefined,
  }
}

/**
 * Create a login link for the Express Dashboard
 */
export async function createDashboardLink(
  organizationId: string
): Promise<string> {
  // Get the organization's Stripe account ID
  const orgResult = await dbQuery(
    `SELECT stripe_account_id FROM organizations WHERE id = @organizationId`,
    { organizationId }
  )

  if (orgResult.recordset.length === 0) {
    throw new Error('Organization not found')
  }

  const accountId = orgResult.recordset[0].stripe_account_id

  if (!accountId) {
    throw new Error('Organization has not connected their Stripe account')
  }

  const loginLink = await stripe.accounts.createLoginLink(accountId)
  return loginLink.url
}

/**
 * Transfer funds to an organization's connected account
 */
export async function transferToOrganization(
  organizationId: string,
  amount: number, // Amount in dollars
  eventId: string,
  payoutId: string
): Promise<Stripe.Transfer> {
  // Get the organization's Stripe account ID
  const orgResult = await dbQuery(
    `SELECT stripe_account_id, stripe_payouts_enabled FROM organizations WHERE id = @organizationId`,
    { organizationId }
  )

  if (orgResult.recordset.length === 0) {
    throw new Error('Organization not found')
  }

  const org = orgResult.recordset[0]

  if (!org.stripe_account_id) {
    throw new Error('Organization has not connected their Stripe account')
  }

  if (!org.stripe_payouts_enabled) {
    throw new Error('Organization\'s Stripe account is not enabled for payouts')
  }

  // Create the transfer
  const transfer = await stripe.transfers.create({
    amount: Math.round(amount * 100), // Convert to cents
    currency: 'usd',
    destination: org.stripe_account_id,
    metadata: {
      organization_id: organizationId,
      event_id: eventId,
      payout_id: payoutId,
    },
    description: `Payout for event ${eventId}`,
  })

  return transfer
}

/**
 * Get the balance for an organization's connected account
 */
export async function getAccountBalance(
  organizationId: string
): Promise<{
  available: { amount: number; currency: string }[]
  pending: { amount: number; currency: string }[]
}> {
  // Get the organization's Stripe account ID
  const orgResult = await dbQuery(
    `SELECT stripe_account_id FROM organizations WHERE id = @organizationId`,
    { organizationId }
  )

  if (orgResult.recordset.length === 0) {
    throw new Error('Organization not found')
  }

  const accountId = orgResult.recordset[0].stripe_account_id

  if (!accountId) {
    throw new Error('Organization has not connected their Stripe account')
  }

  const balance = await stripe.balance.retrieve({
    stripeAccount: accountId,
  })

  return {
    available: balance.available.map((b) => ({
      amount: b.amount / 100,
      currency: b.currency,
    })),
    pending: balance.pending.map((b) => ({
      amount: b.amount / 100,
      currency: b.currency,
    })),
  }
}

/**
 * Handle Stripe Connect webhook events
 */
export async function handleConnectWebhook(
  event: Stripe.Event
): Promise<void> {
  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object as Stripe.Account
      const orgId = account.metadata?.organization_id

      if (orgId) {
        await dbQuery(
          `UPDATE organizations
           SET stripe_onboarding_complete = @detailsSubmitted,
               stripe_charges_enabled = @chargesEnabled,
               stripe_payouts_enabled = @payoutsEnabled,
               status = CASE
                 WHEN @chargesEnabled = 1 AND @payoutsEnabled = 1 THEN 'verified'
                 WHEN @detailsSubmitted = 1 THEN 'unverified'
                 ELSE status
               END,
               updated_at = GETUTCDATE()
           WHERE id = @orgId`,
          {
            orgId,
            detailsSubmitted: account.details_submitted,
            chargesEnabled: account.charges_enabled,
            payoutsEnabled: account.payouts_enabled,
          }
        )

        console.log(`Updated Stripe status for organization ${orgId}`)
      }
      break
    }

    case 'account.application.deauthorized': {
      // The data object for deauthorized is an Application, but we need to find
      // the organization by the account ID from the event
      const application = event.data.object as { id: string; account?: string }
      const accountId = event.account || application.account

      if (accountId) {
        // Find org by stripe_account_id and clear their connection
        await dbQuery(
          `UPDATE organizations
           SET stripe_account_id = NULL,
               stripe_onboarding_complete = 0,
               stripe_charges_enabled = 0,
               stripe_payouts_enabled = 0,
               status = 'pending',
               updated_at = GETUTCDATE()
           WHERE stripe_account_id = @accountId`,
          { accountId }
        )

        console.log(`Stripe Connect disconnected for account ${accountId}`)
      }
      break
    }

    case 'transfer.created': {
      const transfer = event.data.object as Stripe.Transfer
      const payoutId = transfer.metadata?.payout_id

      if (payoutId) {
        await dbQuery(
          `UPDATE organization_payouts
           SET status = 'processing',
               stripe_transfer_id = @transferId,
               processed_at = CASE WHEN processed_at IS NULL THEN GETUTCDATE() ELSE processed_at END
           WHERE id = @payoutId`,
          {
            payoutId,
            transferId: transfer.id,
          }
        )

        console.log(`Payout ${payoutId} status updated to processing`)
      }
      break
    }
  }
}

/**
 * Handle transfer status updates (called from webhook for transfer.paid/failed events)
 */
export async function handleTransferUpdate(
  transferId: string,
  status: 'completed' | 'failed'
): Promise<void> {
  if (status === 'completed') {
    await dbQuery(
      `UPDATE organization_payouts
       SET status = 'completed',
           completed_at = GETUTCDATE()
       WHERE stripe_transfer_id = @transferId`,
      { transferId }
    )
  } else {
    await dbQuery(
      `UPDATE organization_payouts
       SET status = 'failed'
       WHERE stripe_transfer_id = @transferId`,
      { transferId }
    )
  }
  console.log(`Transfer ${transferId} marked as ${status}`)
}

export { stripe }
