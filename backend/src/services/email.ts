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

// =============================================
// Organization Payout Emails
// =============================================

// Payout processing email - sent when payout is initiated
export async function sendPayoutProcessingEmail(params: {
  recipientEmail: string
  organizationName: string
  eventName: string
  grossAmount: number
  platformFee: number
  reserveAmount: number
  netPayout: number
}): Promise<boolean> {
  const { recipientEmail, organizationName, eventName, grossAmount, platformFee, reserveAmount, netPayout } = params

  const subject = `Payout initiated for ${eventName}`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Payout Processing
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Great news! The payout for <strong>${organizationName}</strong>'s event <strong>"${eventName}"</strong> is being processed.
    </p>

    <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">Payout Breakdown</h3>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #4a4a4a; font-size: 14px;">Gross Sales</td>
          <td style="padding: 8px 0; color: #4a4a4a; font-size: 14px; text-align: right;">$${grossAmount.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #4a4a4a; font-size: 14px;">Platform Fee (5%)</td>
          <td style="padding: 8px 0; color: #4a4a4a; font-size: 14px; text-align: right;">-$${platformFee.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #4a4a4a; font-size: 14px;">Reserve (10% held for 30 days)</td>
          <td style="padding: 8px 0; color: #4a4a4a; font-size: 14px; text-align: right;">-$${reserveAmount.toFixed(2)}</td>
        </tr>
        <tr style="border-top: 1px solid #ddd;">
          <td style="padding: 12px 0 0 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">Net Payout</td>
          <td style="padding: 12px 0 0 0; color: #2e7d32; font-size: 16px; font-weight: 600; text-align: right;">$${netPayout.toFixed(2)}</td>
        </tr>
      </table>
    </div>

    <p style="margin: 20px 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;">
      The funds will be transferred to your connected Stripe account within 2-3 business days.
      The 10% reserve will be released after 30 days, assuming no chargebacks.
    </p>
  `

  const plainTextContent = `
Payout Processing

Great news! The payout for your event "${eventName}" is being processed.

Payout Breakdown:
- Gross Sales: $${grossAmount.toFixed(2)}
- Platform Fee (5%): -$${platformFee.toFixed(2)}
- Reserve (10% held for 30 days): -$${reserveAmount.toFixed(2)}
- Net Payout: $${netPayout.toFixed(2)}

The funds will be transferred to your connected Stripe account within 2-3 business days.
The 10% reserve will be released after 30 days, assuming no chargebacks.

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Payout Processing', content),
    plainTextContent,
  })
}

// Payout completed email - sent when funds are transferred
export async function sendPayoutCompletedEmail(params: {
  recipientEmail: string
  organizationName: string
  eventName: string
  netPayout: number
}): Promise<boolean> {
  const { recipientEmail, organizationName, eventName, netPayout } = params

  const subject = `Payout completed: $${netPayout.toFixed(2)} for ${eventName}`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #2e7d32; font-size: 20px; font-weight: 600;">
      Payout Completed!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      The payout for <strong>${organizationName}</strong>'s event <strong>"${eventName}"</strong> has been successfully transferred to your Stripe account.
    </p>

    <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 5px 0; color: #4a4a4a; font-size: 14px;">Amount Transferred</p>
      <p style="margin: 0; color: #2e7d32; font-size: 32px; font-weight: 700;">$${netPayout.toFixed(2)}</p>
    </div>

    <p style="margin: 20px 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;">
      You can view the funds in your Stripe Express Dashboard. Remember, the 10% reserve will be released separately after 30 days.
    </p>

    <p style="margin: 20px 0 0 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;">
      Thank you for using Very Good Auctions!
    </p>
  `

  const plainTextContent = `
Payout Completed!

The payout for "${eventName}" has been successfully transferred to your Stripe account.

Amount Transferred: $${netPayout.toFixed(2)}

You can view the funds in your Stripe Express Dashboard. Remember, the 10% reserve will be released separately after 30 days.

Thank you for using Very Good Auctions!

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Payout Completed', content),
    plainTextContent,
  })
}

// Payout held email - sent when payout requires review
export async function sendPayoutHeldEmail(params: {
  recipientEmail: string
  organizationName: string
  eventName: string
  netPayout: number
  reason: string
}): Promise<boolean> {
  const { recipientEmail, organizationName, eventName, netPayout, reason } = params

  const subject = `Payout on hold for ${eventName}`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #f57c00; font-size: 20px; font-weight: 600;">
      Payout Under Review
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      The payout for <strong>${organizationName}</strong>'s event <strong>"${eventName}"</strong> is currently under review.
    </p>

    <div style="background-color: #fff3e0; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Amount:</strong> $${netPayout.toFixed(2)}
      </p>
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        <strong>Reason:</strong> ${reason}
      </p>
    </div>

    <p style="margin: 20px 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;">
      Our team will review your payout shortly. This is a standard security measure and typically resolves within 1-2 business days.
      If we need additional information, we'll reach out to you directly.
    </p>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      If you have questions, please contact our support team.
    </p>
  `

  const plainTextContent = `
Payout Under Review

The payout for your event "${eventName}" is currently under review.

Amount: $${netPayout.toFixed(2)}
Reason: ${reason}

Our team will review your payout shortly. This is a standard security measure and typically resolves within 1-2 business days.
If we need additional information, we'll reach out to you directly.

If you have questions, please contact our support team.

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Payout Under Review', content),
    plainTextContent,
  })
}

// =============================================
// Self-Managed Payment Emails
// =============================================

// Auction won email for self-managed payments - includes payment instructions
export async function sendSelfManagedAuctionWonEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  winningBid: number
  eventName: string
  organizationName: string
  eventSlug: string
  paymentInstructions?: string
  paymentLink?: string
  paymentDueDays?: number
  fulfillmentType?: 'shipping' | 'pickup' | 'both' | 'digital'
  pickupLocation?: string
  pickupInstructions?: string
}): Promise<boolean> {
  const {
    recipientEmail,
    recipientName,
    itemTitle,
    winningBid,
    eventName,
    organizationName,
    // eventSlug is available but not currently used
    paymentInstructions,
    paymentLink,
    paymentDueDays,
    fulfillmentType,
    pickupLocation,
    pickupInstructions,
  } = params

  const myWinsUrl = `${frontendUrl}/my-wins`

  const subject = `Congratulations! You won "${itemTitle}" at ${eventName}`

  // Build payment section
  let paymentSection = ''
  if (paymentInstructions || paymentLink) {
    paymentSection = `
      <div style="background-color: #fff8e6; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #f59e0b;">
        <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">Payment Instructions</h3>
        ${paymentInstructions ? `<p style="margin: 0 0 15px 0; color: #4a4a4a; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${paymentInstructions}</p>` : ''}
        ${paymentLink ? `
          <a href="${paymentLink}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600;">
            Pay Now
          </a>
        ` : ''}
        ${paymentDueDays ? `<p style="margin: 15px 0 0 0; color: #888888; font-size: 12px;">Payment is due within ${paymentDueDays} days.</p>` : ''}
      </div>
    `
  }

  // Build fulfillment section
  let fulfillmentSection = ''
  if (fulfillmentType === 'pickup' || fulfillmentType === 'both') {
    fulfillmentSection = `
      <div style="background-color: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #2196f3;">
        <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">Pickup Information</h3>
        ${pickupLocation ? `<p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;"><strong>Location:</strong> ${pickupLocation}</p>` : ''}
        ${pickupInstructions ? `<p style="margin: 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;"><strong>Instructions:</strong> ${pickupInstructions}</p>` : ''}
      </div>
    `
  }

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

    ${paymentSection}
    ${fulfillmentSection}

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${myWinsUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            View My Wins
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

${paymentInstructions ? `PAYMENT INSTRUCTIONS:\n${paymentInstructions}\n` : ''}
${paymentLink ? `Pay online: ${paymentLink}\n` : ''}
${paymentDueDays ? `Payment is due within ${paymentDueDays} days.\n` : ''}

${pickupLocation ? `PICKUP LOCATION: ${pickupLocation}\n` : ''}
${pickupInstructions ? `PICKUP INSTRUCTIONS: ${pickupInstructions}\n` : ''}

View your wins: ${myWinsUrl}

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

// Payment confirmation email for self-managed payments - sent by org when they confirm payment
export async function sendSelfManagedPaymentConfirmedEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  amount: number
  eventName: string
  organizationName: string
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, amount, eventName, organizationName } = params

  const myWinsUrl = `${frontendUrl}/my-wins`

  const subject = `Payment confirmed for "${itemTitle}"`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #2e7d32; font-size: 20px; font-weight: 600;">
      Payment Confirmed!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      <strong>${organizationName}</strong> has confirmed your payment for <strong>"${itemTitle}"</strong> from the ${eventName} auction.
    </p>

    <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 5px 0; color: #4a4a4a; font-size: 14px;">Payment Confirmed</p>
      <p style="margin: 0; color: #2e7d32; font-size: 24px; font-weight: 700;">$${amount.toFixed(2)}</p>
    </div>

    <p style="margin: 0 0 30px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      The organization will contact you regarding pickup/delivery of your item.
    </p>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${myWinsUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            View My Wins
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Thank you for supporting ${organizationName}!
    </p>
  `

  const plainTextContent = `
Payment Confirmed!

Hi ${recipientName},

${organizationName} has confirmed your payment for "${itemTitle}" from the ${eventName} auction.

Payment Confirmed: $${amount.toFixed(2)}

The organization will contact you regarding pickup/delivery of your item.

View your wins: ${myWinsUrl}

Thank you for supporting ${organizationName}!

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Payment Confirmed', content),
    plainTextContent,
  })
}

// Ready for pickup email - sent when item is ready to be picked up
export async function sendReadyForPickupEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  eventName: string
  organizationName: string
  pickupLocation?: string
  pickupInstructions?: string
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, eventName, organizationName, pickupLocation, pickupInstructions } = params

  const myWinsUrl = `${frontendUrl}/my-wins`

  const subject = `Your item "${itemTitle}" is ready for pickup!`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Ready for Pickup!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Your item <strong>"${itemTitle}"</strong> from the ${eventName} auction is now ready for pickup!
    </p>

    <div style="background-color: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #2196f3;">
      <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">Pickup Details</h3>
      ${pickupLocation ? `<p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;"><strong>Location:</strong> ${pickupLocation}</p>` : ''}
      ${pickupInstructions ? `<p style="margin: 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;"><strong>Instructions:</strong> ${pickupInstructions}</p>` : ''}
      ${!pickupLocation && !pickupInstructions ? `<p style="margin: 0; color: #4a4a4a; font-size: 14px;">Please contact ${organizationName} for pickup details.</p>` : ''}
    </div>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${myWinsUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            View My Wins
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Thank you for supporting ${organizationName}!
    </p>
  `

  const plainTextContent = `
Ready for Pickup!

Hi ${recipientName},

Your item "${itemTitle}" from the ${eventName} auction is now ready for pickup!

PICKUP DETAILS:
${pickupLocation ? `Location: ${pickupLocation}\n` : ''}
${pickupInstructions ? `Instructions: ${pickupInstructions}\n` : ''}
${!pickupLocation && !pickupInstructions ? `Please contact ${organizationName} for pickup details.\n` : ''}

View your wins: ${myWinsUrl}

Thank you for supporting ${organizationName}!

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Ready for Pickup', content),
    plainTextContent,
  })
}

// Item shipped email - sent when item has been shipped
export async function sendItemShippedEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  eventName: string
  organizationName: string
  trackingNumber?: string
  trackingCarrier?: string
  trackingUrl?: string
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, eventName, organizationName, trackingNumber, trackingCarrier, trackingUrl } = params

  const myWinsUrl = `${frontendUrl}/my-wins`

  const subject = `Your item "${itemTitle}" has shipped!`

  let trackingSection = ''
  if (trackingNumber) {
    trackingSection = `
      <div style="background-color: #e8f4fd; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #2196f3;">
        <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">Tracking Information</h3>
        ${trackingCarrier ? `<p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;"><strong>Carrier:</strong> ${trackingCarrier}</p>` : ''}
        <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
          <strong>Tracking Number:</strong> ${trackingUrl ? `<a href="${trackingUrl}" style="color: #5A7C6F;">${trackingNumber}</a>` : trackingNumber}
        </p>
        ${trackingUrl ? `
          <a href="${trackingUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; margin-top: 10px;">
            Track Package
          </a>
        ` : ''}
      </div>
    `
  }

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Your Item Has Shipped!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Great news! Your item <strong>"${itemTitle}"</strong> from the ${eventName} auction has been shipped by ${organizationName}.
    </p>

    ${trackingSection}

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${myWinsUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            View My Wins
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Thank you for supporting ${organizationName}!
    </p>
  `

  const plainTextContent = `
Your Item Has Shipped!

Hi ${recipientName},

Great news! Your item "${itemTitle}" from the ${eventName} auction has been shipped by ${organizationName}.

${trackingNumber ? `TRACKING INFORMATION:\n` : ''}
${trackingCarrier ? `Carrier: ${trackingCarrier}\n` : ''}
${trackingNumber ? `Tracking Number: ${trackingNumber}\n` : ''}
${trackingUrl ? `Track your package: ${trackingUrl}\n` : ''}

View your wins: ${myWinsUrl}

Thank you for supporting ${organizationName}!

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Item Shipped', content),
    plainTextContent,
  })
}

// Payment reminder email - sent when payment is overdue for self-managed
export async function sendPaymentReminderEmail(params: {
  recipientEmail: string
  recipientName: string
  itemTitle: string
  amount: number
  eventName: string
  organizationName: string
  paymentInstructions?: string
  paymentLink?: string
  daysOverdue: number
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemTitle, amount, eventName, organizationName, paymentInstructions, paymentLink, daysOverdue } = params

  const myWinsUrl = `${frontendUrl}/my-wins`

  const subject = `Payment reminder for "${itemTitle}"`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #f57c00; font-size: 20px; font-weight: 600;">
      Payment Reminder
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      This is a friendly reminder that payment is still pending for <strong>"${itemTitle}"</strong> that you won at the ${eventName} auction.
    </p>

    <div style="background-color: #fff3e0; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #f57c00;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Amount Due:</strong> $${amount.toFixed(2)}
      </p>
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        <strong>Days Overdue:</strong> ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}
      </p>
    </div>

    ${paymentInstructions ? `
    <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <h3 style="margin: 0 0 15px 0; color: #1a1a1a; font-size: 16px; font-weight: 600;">Payment Instructions</h3>
      <p style="margin: 0; color: #4a4a4a; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${paymentInstructions}</p>
    </div>
    ` : ''}

    ${paymentLink ? `
    <!-- Pay Now Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${paymentLink}"
             style="display: inline-block; background-color: #f57c00; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            Pay Now
          </a>
        </td>
      </tr>
    </table>
    ` : ''}

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Please complete your payment as soon as possible. If you have any questions, please contact ${organizationName} directly.
    </p>
  `

  const plainTextContent = `
Payment Reminder

Hi ${recipientName},

This is a friendly reminder that payment is still pending for "${itemTitle}" that you won at the ${eventName} auction.

Amount Due: $${amount.toFixed(2)}
Days Overdue: ${daysOverdue} day${daysOverdue !== 1 ? 's' : ''}

${paymentInstructions ? `PAYMENT INSTRUCTIONS:\n${paymentInstructions}\n` : ''}
${paymentLink ? `Pay online: ${paymentLink}\n` : ''}

Please complete your payment as soon as possible. If you have any questions, please contact ${organizationName} directly.

View your wins: ${myWinsUrl}

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Payment Reminder', content),
    plainTextContent,
  })
}

// Reserve released email - sent when the 10% reserve is released
export async function sendReserveReleasedEmail(params: {
  recipientEmail: string
  organizationName: string
  eventName: string
  reserveAmount: number
}): Promise<boolean> {
  const { recipientEmail, organizationName, eventName, reserveAmount } = params

  const subject = `Reserve released: $${reserveAmount.toFixed(2)} for ${eventName}`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #2e7d32; font-size: 20px; font-weight: 600;">
      Reserve Released!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      The 10% reserve from <strong>${organizationName}</strong>'s event <strong>"${eventName}"</strong> has been released to your Stripe account.
    </p>

    <div style="background-color: #e8f5e9; border-radius: 8px; padding: 20px; margin: 20px 0; text-align: center;">
      <p style="margin: 0 0 5px 0; color: #4a4a4a; font-size: 14px;">Reserve Amount Released</p>
      <p style="margin: 0; color: #2e7d32; font-size: 32px; font-weight: 700;">$${reserveAmount.toFixed(2)}</p>
    </div>

    <p style="margin: 20px 0 0 0; color: #4a4a4a; font-size: 14px; line-height: 1.6;">
      You've now received the full payout for this event. Thank you for using Very Good Auctions!
    </p>
  `

  const plainTextContent = `
Reserve Released!

The 10% reserve from your event "${eventName}" has been released to your Stripe account.

Reserve Amount Released: $${reserveAmount.toFixed(2)}

You've now received the full payout for this event. Thank you for using Very Good Auctions!

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Reserve Released', content),
    plainTextContent,
  })
}

// =============================================
// Item Submission Emails
// =============================================

// Donor thank you email - sent when a donor submits an item
export async function sendDonorThankYouEmail(params: {
  recipientEmail: string
  recipientName: string
  itemName: string
  eventName: string
  organizationName: string
  estimatedValue?: number | null
}): Promise<boolean> {
  const { recipientEmail, recipientName, itemName, eventName, organizationName, estimatedValue } = params

  const subject = `Thank you for your donation to ${eventName}!`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #2e7d32; font-size: 20px; font-weight: 600;">
      Thank You for Your Donation!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Hi ${recipientName},
    </p>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Thank you for submitting <strong>"${itemName}"</strong> for the <strong>${eventName}</strong> auction!
    </p>

    <div style="background-color: #f0f7f4; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #10b981;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Item:</strong> ${itemName}
      </p>
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Event:</strong> ${eventName}
      </p>
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Organization:</strong> ${organizationName}
      </p>
      ${estimatedValue ? `
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        <strong>Estimated Value:</strong> $${estimatedValue.toFixed(2)}
      </p>
      ` : ''}
    </div>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      The event organizers will review your submission and let you know once it's approved. You'll receive another email when the auction goes live.
    </p>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Your generosity helps support ${organizationName} and makes a real difference!
    </p>
  `

  const plainTextContent = `
Thank You for Your Donation!

Hi ${recipientName},

Thank you for submitting "${itemName}" for the ${eventName} auction!

Item: ${itemName}
Event: ${eventName}
Organization: ${organizationName}
${estimatedValue ? `Estimated Value: $${estimatedValue.toFixed(2)}` : ''}

The event organizers will review your submission and let you know once it's approved. You'll receive another email when the auction goes live.

Your generosity helps support ${organizationName} and makes a real difference!

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Donation Received', content),
    plainTextContent,
  })
}

// New submission notification email - sent to organization when a new item is submitted
export async function sendNewSubmissionNotificationEmail(params: {
  recipientEmail: string
  eventName: string
  itemName: string
  donorName: string
  donorEmail: string | null
  estimatedValue: number | null
}): Promise<boolean> {
  const { recipientEmail, eventName, itemName, donorName, donorEmail, estimatedValue } = params

  const dashboardUrl = `${frontendUrl}/dashboard`

  const subject = `New item submitted for ${eventName}: "${itemName}"`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      New Item Submission
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      A new item has been submitted for review for your auction <strong>${eventName}</strong>.
    </p>

    <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Item:</strong> ${itemName}
      </p>
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Submitted by:</strong> ${donorName}
      </p>
      ${donorEmail ? `
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Email:</strong> <a href="mailto:${donorEmail}" style="color: #5A7C6F;">${donorEmail}</a>
      </p>
      ` : ''}
      ${estimatedValue ? `
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        <strong>Estimated Value:</strong> $${estimatedValue.toFixed(2)}
      </p>
      ` : ''}
    </div>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${dashboardUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            Review Submission
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Log in to your dashboard to review, approve, or reject this submission.
    </p>
  `

  const plainTextContent = `
New Item Submission

A new item has been submitted for review for your auction "${eventName}".

Item: ${itemName}
Submitted by: ${donorName}
${donorEmail ? `Email: ${donorEmail}` : ''}
${estimatedValue ? `Estimated Value: $${estimatedValue.toFixed(2)}` : ''}

Review submission: ${dashboardUrl}

Log in to your dashboard to review, approve, or reject this submission.

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('New Submission', content),
    plainTextContent,
  })
}

// =============================================
// UAT (User Acceptance Testing) Emails
// =============================================

// Donation link sharing email - sent to potential donors
export async function sendDonationLinkEmail(params: {
  recipientEmail: string
  eventName: string
  organizationName: string
  donationUrl: string
  accessCode?: string
  senderName?: string
  customMessage?: string
}): Promise<boolean> {
  const { recipientEmail, eventName, organizationName, donationUrl, accessCode, senderName, customMessage } = params

  const subject = senderName
    ? `${senderName} invites you to donate to ${eventName}`
    : `You're invited to donate to ${eventName}`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      Help Support ${organizationName}!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      ${senderName ? `<strong>${senderName}</strong> has invited you to donate an item to` : "You've been invited to donate an item to"} the <strong>${eventName}</strong> auction.
    </p>

    ${customMessage ? `
    <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #5A7C6F;">
      <p style="margin: 0; color: #4a4a4a; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${customMessage}</p>
    </div>
    ` : ''}

    <div style="background-color: #f0f7f4; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Event:</strong> ${eventName}
      </p>
      <p style="margin: 0 0 10px 0; color: #4a4a4a; font-size: 14px;">
        <strong>Organization:</strong> ${organizationName}
      </p>
      ${accessCode ? `
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        <strong>Access Code:</strong> <span style="font-family: monospace; background: #e0e0e0; padding: 2px 8px; border-radius: 4px;">${accessCode}</span>
      </p>
      ` : ''}
    </div>

    <p style="margin: 0 0 30px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      Your donation helps ${organizationName} raise funds for their cause. Click below to submit an item for the auction.
    </p>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${donationUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            Donate an Item
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 20px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      Thank you for considering a donation to support ${organizationName}!
    </p>

    <!-- Fallback link -->
    <p style="margin: 20px 0 0 0; color: #888888; font-size: 12px; line-height: 1.6;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${donationUrl}" style="color: #5A7C6F; word-break: break-all;">${donationUrl}</a>
    </p>
  `

  const plainTextContent = `
Help Support ${organizationName}!

${senderName ? `${senderName} has invited you to donate an item to` : "You've been invited to donate an item to"} the "${eventName}" auction.

${customMessage ? `Message:\n${customMessage}\n` : ''}

Event: ${eventName}
Organization: ${organizationName}
${accessCode ? `Access Code: ${accessCode}` : ''}

Your donation helps ${organizationName} raise funds for their cause.

Donate an item here: ${donationUrl}

Thank you for considering a donation to support ${organizationName}!

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to: recipientEmail,
    subject,
    htmlContent: emailWrapper('Donation Invitation', content),
    plainTextContent,
  })
}

// UAT invitation email - sent to invite testers
export async function sendUatInvitationEmail(params: {
  to: string
  inviteUrl: string
  expiresAt: Date
  customMessage?: string
  sessionName?: string | null
}): Promise<boolean> {
  const { to, inviteUrl, expiresAt, customMessage, sessionName } = params

  const formattedExpires = expiresAt.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  })

  const subject = sessionName
    ? `You're invited to test Very Good Auctions - ${sessionName}`
    : `You're invited to test Very Good Auctions`

  const content = `
    <h2 style="margin: 0 0 20px 0; color: #1a1a1a; font-size: 20px; font-weight: 600;">
      You're Invited to Test!
    </h2>

    <p style="margin: 0 0 20px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      You've been invited to participate in User Acceptance Testing (UAT) for Very Good Auctions.
    </p>

    ${sessionName ? `
    <div style="background-color: #f0f7f4; border-radius: 8px; padding: 20px; margin: 20px 0;">
      <p style="margin: 0; color: #4a4a4a; font-size: 14px;">
        <strong>Testing Session:</strong> ${sessionName}
      </p>
    </div>
    ` : ''}

    ${customMessage ? `
    <div style="background-color: #f5f5f5; border-radius: 8px; padding: 20px; margin: 20px 0; border-left: 4px solid #5A7C6F;">
      <p style="margin: 0; color: #4a4a4a; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${customMessage}</p>
    </div>
    ` : ''}

    <p style="margin: 0 0 30px 0; color: #4a4a4a; font-size: 16px; line-height: 1.6;">
      As a tester, you'll help us identify bugs, provide feedback, and ensure the best experience for our users.
    </p>

    <!-- CTA Button -->
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
      <tr>
        <td style="text-align: center; padding: 20px 0;">
          <a href="${inviteUrl}"
             style="display: inline-block; background-color: #5A7C6F; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
            Accept Invitation
          </a>
        </td>
      </tr>
    </table>

    <p style="margin: 30px 0 0 0; color: #888888; font-size: 14px; line-height: 1.6;">
      This invitation expires on ${formattedExpires}. If you didn't expect this invitation, you can safely ignore this email.
    </p>

    <!-- Fallback link -->
    <p style="margin: 20px 0 0 0; color: #888888; font-size: 12px; line-height: 1.6;">
      If the button doesn't work, copy and paste this link into your browser:<br>
      <a href="${inviteUrl}" style="color: #5A7C6F; word-break: break-all;">${inviteUrl}</a>
    </p>
  `

  const plainTextContent = `
You're Invited to Test Very Good Auctions!

You've been invited to participate in User Acceptance Testing (UAT) for Very Good Auctions.

${sessionName ? `Testing Session: ${sessionName}\n` : ''}
${customMessage ? `Message from the team:\n${customMessage}\n` : ''}

As a tester, you'll help us identify bugs, provide feedback, and ensure the best experience for our users.

Accept your invitation here: ${inviteUrl}

This invitation expires on ${formattedExpires}. If you didn't expect this invitation, you can safely ignore this email.

© ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
`

  return sendEmail({
    to,
    subject,
    htmlContent: emailWrapper('UAT Invitation', content),
    plainTextContent,
  })
}
