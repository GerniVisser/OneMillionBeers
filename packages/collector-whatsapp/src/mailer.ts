import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { config } from './config.js'

// Lazy-initialized — only instantiated when ENABLE_ALERTS=true to avoid
// constructing a SESClient with an undefined region in dev.
let ses: SESClient | null = null
function getSes(): SESClient {
  if (!ses) ses = new SESClient({ region: config.AWS_REGION! })
  return ses
}

export async function sendReauthAlert(adminUrl: string): Promise<void> {
  if (!config.ENABLE_ALERTS) return

  const textBody = `The WhatsApp session has dropped and needs attention.

Open the admin page: ${adminUrl}

Log in, then restart the session or re-link it with a pairing code (works from
the phone itself) or a QR code (scan from a second screen).`

  const htmlBody = `<p>The WhatsApp session has dropped and needs attention.</p>
<p>Open the admin page: <a href="${adminUrl}">${adminUrl}</a></p>
<p>Log in, then restart the session or re-link it with a pairing code (works from
the phone itself) or a QR code (scan from a second screen).</p>`

  await getSes().send(
    new SendEmailCommand({
      Destination: { ToAddresses: [config.ALERT_EMAIL!] },
      Source: config.SES_FROM_EMAIL!,
      Message: {
        Subject: { Data: '[OMB] WhatsApp re-authentication required' },
        Body: {
          Text: { Data: textBody },
          Html: { Data: htmlBody },
        },
      },
    }),
  )
}
