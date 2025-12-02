import { EmailClient, EmailMessage } from '@azure/communication-email'

// Email configuration from environment
const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING
const senderAddress = process.env.EMAIL_SENDER_ADDRESS || 'noreply@verygoodauctions.com'
const replyToAddress = process.env.EMAIL_REPLY_TO_ADDRESS || 'support@verygoodauctions.com'
const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000'

let emailClient: EmailClient | null = null

function getEmailClient(): EmailClient | null {
  if (!connectionString) {
    console.warn('AZURE_COMMUNICATION_CONNECTION_STRING not configured - emails will be logged only')
    return null
  }

  if (!emailClient) {
    emailClient = new EmailClient(connectionString)
  }

  return emailClient
}

interface SendEmailParams {
  to: string
  subject: string
  htmlContent: string
  plainTextContent?: string
}

export interface SendEmailResult {
  success: boolean
  error?: string
  details?: unknown
}

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const result = await sendEmailWithDetails(params)
  return result.success
}

export async function sendEmailWithDetails(params: SendEmailParams): Promise<SendEmailResult> {
  const { to, subject, htmlContent, plainTextContent } = params

  const client = getEmailClient()

  if (!client) {
    // Log email for development/testing when no email service configured
    console.log('=== EMAIL (not sent - no connection string) ===')
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Content: ${plainTextContent || htmlContent}`)
    console.log('=================================================')
    return { success: true } // Return true so invitation flow continues
  }

  try {
    console.log(`[Email] Attempting to send to: ${to} from: ${senderAddress}`)

    const message: EmailMessage = {
      senderAddress,
      content: {
        subject,
        html: htmlContent,
        plainText: plainTextContent || htmlContent.replace(/<[^>]*>/g, ''),
      },
      recipients: {
        to: [{ address: to }],
      },
      replyTo: [{ address: replyToAddress }],
    }

    const poller = await client.beginSend(message)
    const result = await poller.pollUntilDone()

    if (result.status === 'Succeeded') {
      console.log(`[Email] Sent successfully to ${to}`)
      return { success: true }
    } else {
      console.error(`[Email] Failed to send: ${result.status}`, result.error)
      return {
        success: false,
        error: `Status: ${result.status}`,
        details: result.error
      }
    }
  } catch (error) {
    console.error('[Email] Error sending:', error)
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
      details: error
    }
  }
}

// Organization invitation email
export async function sendOrganizationInvitationEmail(params: {
  recipientEmail: string
  inviterName: string
  organizationName: string
  role: string
  invitationToken: string
}): Promise<boolean> {
  const { recipientEmail, inviterName, organizationName, role, invitationToken } = params

  const acceptUrl = `${frontendUrl}/invitations/${invitationToken}`

  const subject = `You've been invited to join ${organizationName} on Very Good Auctions`

  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Organization Invitation</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #5A7C6F; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Very Good Auctions</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
                You're Invited!
              </h2>

              <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                <strong>${inviterName}</strong> has invited you to join <strong>${organizationName}</strong> as ${role === 'admin' ? 'an' : 'a'} <strong>${role}</strong>.
              </p>

              <p style="margin: 0 0 30px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
                As a member, you'll be able to help manage auctions, review item submissions, and support fundraising efforts.
              </p>

              <!-- CTA Button -->
              <table role="presentation" style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="text-align: center; padding: 20px 0;">
                    <a href="${acceptUrl}"
                       style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
                This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.
              </p>

              <!-- Fallback link -->
              <p style="margin: 20px 0 0 0; color: #888888; font-size: 12px; line-height: 1.6;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${acceptUrl}" style="color: #5A7C6F; word-break: break-all;">${acceptUrl}</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px 40px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 10px 0; color: #888888; font-size: 12px;">
                &copy; ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
              </p>
              <p style="margin: 0 0 10px 0; color: #888888; font-size: 12px;">
                Questions? Contact us at <a href="mailto:${replyToAddress}" style="color: #5A7C6F;">${replyToAddress}</a>
              </p>
              <p style="margin: 0; color: #888888; font-size: 11px;">
                <a href="${frontendUrl}/profile" style="color: #888888;">Manage email preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`

  const plainTextContent = `
You're Invited to Join ${organizationName}!

${inviterName} has invited you to join ${organizationName} as ${role === 'admin' ? 'an' : 'a'} ${role} on Very Good Auctions.

As a member, you'll be able to help manage auctions, review item submissions, and support fundraising efforts.

Accept your invitation here: ${acceptUrl}

This invitation will expire in 7 days. If you didn't expect this invitation, you can safely ignore this email.

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent,
    plainTextContent,
  })
}

// Helper function for email template wrapper
function emailWrapper(title: string, content: string): string {
  const unsubscribeUrl = `${frontendUrl}/profile`
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f5f5f5;">
  <table role="presentation" style="width: 100%; border-collapse: collapse;">
    <tr>
      <td style="padding: 40px 20px;">
        <table role="presentation" style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="background-color: #5A7C6F; padding: 30px 40px; text-align: center;">
              <h1 style="margin: 0; color: #ffffff; font-size: 24px; font-weight: 600;">Very Good Auctions</h1>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px;">
              ${content}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f9f9f9; padding: 20px 40px; text-align: center; border-top: 1px solid #eeeeee;">
              <p style="margin: 0 0 10px 0; color: #888888; font-size: 12px;">
                &copy; ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
              </p>
              <p style="margin: 0 0 10px 0; color: #888888; font-size: 12px;">
                Questions? Contact us at <a href="mailto:${replyToAddress}" style="color: #5A7C6F;">${replyToAddress}</a>
              </p>
              <p style="margin: 0; color: #888888; font-size: 11px;">
                <a href="${unsubscribeUrl}" style="color: #888888;">Manage email preferences</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`
}

// Auction won email - sent to winning bidder
export async function sendAuctionWonEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  winningBid: number
  eventName: string
  organizationName: string
  eventSlug: string
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, winningBid, eventName, organizationName, eventSlug } = params

  const eventUrl = `${frontendUrl}/events/${eventSlug}`

  const subject = `Congratulations! You won "${itemTitle}" at ${eventName}`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Congratulations, ${recipientName}!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Great news! You've won the auction for <strong>${itemTitle}</strong> with your winning bid of <strong>$${winningBid.toFixed(2)}</strong>.
    </p>

    <div style="background-color: #f0f7f4; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Event:</strong> ${eventName}
      </p>
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Organization:</strong> ${organizationName}
      </p>
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        <strong>Your Winning Bid:</strong> $${winningBid.toFixed(2)}
      </p>
    </div>

    <p style="margin: 0 0 30px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      The organization will contact you shortly with payment and pickup/delivery details.
    </p>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${eventUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            View Auction Details
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Thank you for supporting ${organizationName}!
    </p>
  `

  const plainTextContent = `
Congratulations, ${recipientName}!

Great news! You've won the auction for "${itemTitle}" with your winning bid of $${winningBid.toFixed(2)}.

Event: ${eventName}
Organization: ${organizationName}
Your Winning Bid: $${winningBid.toFixed(2)}

The organization will contact you shortly with payment and pickup/delivery details.

View auction details: ${eventUrl}

Thank you for supporting ${organizationName}!

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Auction Won', content),
    plainTextContent,
  })
}

// Outbid notification email
export async function sendOutbidEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  newHighBid: number
  yourBid: number
  eventName: string
  eventSlug: string
  itemId: string
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, newHighBid, yourBid, eventName, eventSlug, itemId } = params

  const itemUrl = `${frontendUrl}/events/${eventSlug}/items/${itemId}`

  const subject = `You've been outbid on "${itemTitle}"`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      You've Been Outbid
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName}, someone has placed a higher bid on <strong>${itemTitle}</strong> at the ${eventName} auction.
    </p>

    <div style="background-color: #fff8e6; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #f59e0b;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Your bid:</strong> $${yourBid.toFixed(2)}
      </p>
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        <strong>Current high bid:</strong> $${newHighBid.toFixed(2)}
      </p>
    </div>

    <p style="margin: 0 0 30px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Don't miss out! Place a new bid to stay in the running.
    </p>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${itemUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            Place a New Bid
          </a>
        </td>
      </tr>
    </table>
  `

  const plainTextContent = `
You've Been Outbid

Hi ${recipientName}, someone has placed a higher bid on "${itemTitle}" at the ${eventName} auction.

Your bid: $${yourBid.toFixed(2)}
Current high bid: $${newHighBid.toFixed(2)}

Don't miss out! Place a new bid to stay in the running.

Place a new bid: ${itemUrl}

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Outbid Notification', content),
    plainTextContent,
  })
}

// Event cancelled email - sent to bidders
export async function sendEventCancelledEmail(params: {
  recipientEmail: string
  recipientName: string
  eventName: string
  organizationName: string
  itemTitles: string[]
}): Promise<boolean> {
  const { recipientEmail, recipientName, eventName, organizationName, itemTitles } = params

  const subject = `Auction Cancelled: ${eventName}`

  const itemsList = itemTitles.length > 0
    ? `<ul style="margin: 10px 0; padding-left: 20px; color: #4a4a4a;">${itemTitles.map(t => `<li style="margin: 5px 0;">${t}</li>`).join('')}</ul>`
    : ''

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Auction Cancelled
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      We're writing to let you know that the <strong>${eventName}</strong> auction hosted by ${organizationName} has been cancelled.
    </p>

    ${itemTitles.length > 0 ? `
    <div style="background-color: #fef2f2; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #ef4444;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px; font-weight: 600;">
        Your bids on the following items have been cancelled:
      </p>
      ${itemsList}
    </div>
    ` : ''}

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      No charges have been made to your account. We apologize for any inconvenience.
    </p>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      If you have any questions, please contact the organization directly.
    </p>
  `

  const plainTextContent = `
Auction Cancelled

Hi ${recipientName},

We're writing to let you know that the "${eventName}" auction hosted by ${organizationName} has been cancelled.

${itemTitles.length > 0 ? `Your bids on the following items have been cancelled:\n${itemTitles.map(t => `- ${t}`).join('\n')}\n` : ''}

No charges have been made to your account. We apologize for any inconvenience.

If you have any questions, please contact the organization directly.

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Auction Cancelled', content),
    plainTextContent,
  })
}

// Event live email - sent to item submitters
export async function sendEventLiveEmail(params: {
  recipientEmail: string
  recipientName: string
  eventName: string
  organizationName: string
  itemTitles: string[]
  eventSlug: string
  endTime: Date
}): Promise<boolean> {
  const { recipientEmail, recipientName, eventName, organizationName, itemTitles, eventSlug, endTime } = params

  const eventUrl = `${frontendUrl}/events/${eventSlug}`
  const formattedEndTime = endTime.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const subject = `Your items are now live at ${eventName}!`

  const itemsList = itemTitles.length > 0
    ? `<ul style="margin: 10px 0; padding-left: 20px; color: #4a4a4a;">${itemTitles.map(t => `<li style="margin: 5px 0;">${t}</li>`).join('')}</ul>`
    : ''

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Your Items Are Live!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Great news! The <strong>${eventName}</strong> auction hosted by ${organizationName} is now live, and your donated items are ready for bidding!
    </p>

    <div style="background-color: #f0f7f4; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px; font-weight: 600;">
        Your items in this auction:
      </p>
      ${itemsList}
    </div>

    <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
      <strong>Auction ends:</strong> ${formattedEndTime}
    </p>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${eventUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            View the Auction
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Thank you for your generous donation to ${organizationName}!
    </p>
  `

  const plainTextContent = `
Your Items Are Live!

Hi ${recipientName},

Great news! The "${eventName}" auction hosted by ${organizationName} is now live, and your donated items are ready for bidding!

Your items in this auction:
${itemTitles.map(t => `- ${t}`).join('\n')}

Auction ends: ${formattedEndTime}

View the auction: ${eventUrl}

Thank you for your generous donation to ${organizationName}!

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Auction Live', content),
    plainTextContent,
  })
}

// Item approved email
export async function sendItemApprovedEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  eventName: string
  eventSlug: string
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, eventName, eventSlug } = params

  const eventUrl = `${frontendUrl}/events/${eventSlug}`

  const subject = `Your item "${itemTitle}" has been approved!`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Item Approved!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Great news! Your item submission <strong>"${itemTitle}"</strong> has been approved for the <strong>${eventName}</strong> auction.
    </p>

    <div style="background-color: #f0f7f4; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #10b981;">
      <p style="margin: 0; color: #065f46; font-size: 14px; font-weight: 600;">
        Your item will be included in the auction when it goes live.
      </p>
    </div>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${eventUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            View Event
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Thank you for your donation!
    </p>
  `

  const plainTextContent = `
Item Approved!

Hi ${recipientName},

Great news! Your item submission "${itemTitle}" has been approved for the "${eventName}" auction.

Your item will be included in the auction when it goes live.

View event: ${eventUrl}

Thank you for your donation!

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Item Approved', content),
    plainTextContent,
  })
}

// Item rejected email
export async function sendItemRejectedEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  eventName: string
  rejectionReason?: string
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, eventName, rejectionReason } = params

  const subject = `Update on your item "${itemTitle}"`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Item Not Approved
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Unfortunately, your item submission <strong>"${itemTitle}"</strong> was not approved for the <strong>${eventName}</strong> auction.
    </p>

    ${rejectionReason ? `
    <div style="background-color: #fef2f2; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #ef4444;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px; font-weight: 600;">
        Reason:
      </p>
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        ${rejectionReason}
      </p>
    </div>
    ` : ''}

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      If you have questions about this decision, please contact the event organizers.
    </p>
  `

  const plainTextContent = `
Item Not Approved

Hi ${recipientName},

Unfortunately, your item submission "${itemTitle}" was not approved for the "${eventName}" auction.

${rejectionReason ? `Reason: ${rejectionReason}\n` : ''}

If you have questions about this decision, please contact the event organizers.

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Item Update', content),
    plainTextContent,
  })
}

// Resubmit requested email
export async function sendResubmitRequestedEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  eventName: string
  eventSlug: string
  reason: string
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, eventName, eventSlug, reason } = params

  const submitUrl = `${frontendUrl}/events/${eventSlug}/submit`

  const subject = `Changes requested for "${itemTitle}"`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Changes Requested
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      The organizers of <strong>${eventName}</strong> have requested some changes to your item submission <strong>"${itemTitle}"</strong>.
    </p>

    <div style="background-color: #fff8e6; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #f59e0b;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px; font-weight: 600;">
        Requested changes:
      </p>
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        ${reason}
      </p>
    </div>

    <p style="margin: 0 0 30px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Please update your submission so it can be reviewed again.
    </p>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${submitUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            Update Submission
          </a>
        </td>
      </tr>
    </table>
  `

  const plainTextContent = `
Changes Requested

Hi ${recipientName},

The organizers of "${eventName}" have requested some changes to your item submission "${itemTitle}".

Requested changes:
${reason}

Please update your submission so it can be reviewed again.

Update submission: ${submitUrl}

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Changes Requested', content),
    plainTextContent,
  })
}

// Bid confirmation email - sent when user places a bid
export async function sendBidConfirmationEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  bidAmount: number
  eventName: string
  eventSlug: string
  itemId: string
  auctionType: 'standard' | 'silent'
  auctionEndTime: Date
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, bidAmount, eventName, eventSlug, itemId, auctionType, auctionEndTime } = params

  const itemUrl = `${frontendUrl}/events/${eventSlug}/items/${itemId}`
  const formattedEndTime = auctionEndTime.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const subject = `Bid Confirmed: $${bidAmount.toFixed(2)} on "${itemTitle}"`

  const auctionTypeNote = auctionType === 'silent'
    ? `<p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Note:</strong> This is a silent auction. Your bid amount is private until the auction ends.
       </p>`
    : `<p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Note:</strong> You'll receive a notification if someone outbids you.
       </p>`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Bid Confirmed!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName}, your bid has been successfully placed!
    </p>

    <div style="background-color: #f0f7f4; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #10b981;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Item:</strong> ${itemTitle}
      </p>
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Your Bid:</strong> $${bidAmount.toFixed(2)}
      </p>
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Event:</strong> ${eventName}
      </p>
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        <strong>Auction Ends:</strong> ${formattedEndTime}
      </p>
    </div>

    ${auctionTypeNote}

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${itemUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            View Item
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Good luck! We'll notify you when the auction ends.
    </p>
  `

  const plainTextContent = `
Bid Confirmed!

Hi ${recipientName}, your bid has been successfully placed!

Item: ${itemTitle}
Your Bid: $${bidAmount.toFixed(2)}
Event: ${eventName}
Auction Ends: ${formattedEndTime}

${auctionType === 'silent' ? 'Note: This is a silent auction. Your bid amount is private until the auction ends.' : "Note: You'll receive a notification if someone outbids you."}

View item: ${itemUrl}

Good luck! We'll notify you when the auction ends.

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Bid Confirmed', content),
    plainTextContent,
  })
}

// Auction lost email - sent when user is outbid at end of auction
export async function sendAuctionLostEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  yourBid: number
  winningBid: number
  eventName: string
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, yourBid, winningBid, eventName } = params

  const subject = `Auction ended: ${itemTitle}`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Auction Ended
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      The auction for <strong>"${itemTitle}"</strong> at ${eventName} has ended. Unfortunately, you were outbid.
    </p>

    <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Your highest bid:</strong> $${yourBid.toFixed(2)}
      </p>
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        <strong>Winning bid:</strong> $${winningBid.toFixed(2)}
      </p>
    </div>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Thank you for participating! We hope to see you at future auctions.
    </p>
  `

  const plainTextContent = `
Auction Ended

Hi ${recipientName},

The auction for "${itemTitle}" at ${eventName} has ended. Unfortunately, you were outbid.

Your highest bid: $${yourBid.toFixed(2)}
Winning bid: $${winningBid.toFixed(2)}

Thank you for participating! We hope to see you at future auctions.

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Auction Ended', content),
    plainTextContent,
  })
}
