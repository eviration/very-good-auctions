import { EmailClient, EmailMessage } from '@azure/communication-email'

// Email configuration from environment
const connectionString = process.env.AZURE_COMMUNICATION_CONNECTION_STRING
const senderAddress = process.env.EMAIL_SENDER_ADDRESS || 'noreply@verygoodnuctions.com'
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

export async function sendEmail(params: SendEmailParams): Promise<boolean> {
  const { to, subject, htmlContent, plainTextContent } = params

  const client = getEmailClient()

  if (!client) {
    // Log email for development/testing when no email service configured
    console.log('=== EMAIL (not sent - no connection string) ===')
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`Content: ${plainTextContent || htmlContent}`)
    console.log('=================================================')
    return true // Return true so invitation flow continues
  }

  try {
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
    }

    const poller = await client.beginSend(message)
    const result = await poller.pollUntilDone()

    if (result.status === 'Succeeded') {
      console.log(`Email sent successfully to ${to}`)
      return true
    } else {
      console.error(`Email failed to send: ${result.status}`)
      return false
    }
  } catch (error) {
    console.error('Error sending email:', error)
    return false
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
              <p style="margin: 0; color: #888888; font-size: 12px;">
                &copy; ${new Date().getFullYear()} Very Good Auctions. All rights reserved.
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
