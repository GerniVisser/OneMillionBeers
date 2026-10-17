import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses'
import { config } from './config.js'

// Lazy-initialized — only instantiated when ENABLE_ALERTS=true to avoid
// constructing a SESClient with an undefined region in dev.
let ses: SESClient | null = null
function getSes(): SESClient {
  if (!ses) ses = new SESClient({ region: config.AWS_REGION! })
  return ses
}

export async function sendReauthAlert(
  session: string,
  status: string,
  statusPageUrl: string,
): Promise<void> {
  if (!config.ENABLE_ALERTS) return

  // With more than one number, an alert that does not say which one is useless.
  const textBody = `WhatsApp number "${session}" is ${status} and requires re-authentication.

Scan the QR code at: ${statusPageUrl}

The page refreshes automatically every 15 seconds to keep the QR code current.
Open the link on your computer and scan with your phone.`

  const htmlBody = `<p>WhatsApp number <strong>${session}</strong> is ${status} and requires re-authentication.</p>
<p>Scan the QR code at: <a href="${statusPageUrl}">${statusPageUrl}</a></p>
<p>The page refreshes automatically every 15 seconds to keep the QR code current.
Open the link on your computer and scan with your phone.</p>`

  await getSes().send(
    new SendEmailCommand({
      Destination: { ToAddresses: [config.ALERT_EMAIL!] },
      Source: config.SES_FROM_EMAIL!,
      Message: {
        Subject: { Data: `[OMB] WhatsApp re-authentication required: ${session}` },
        Body: {
          Text: { Data: textBody },
          Html: { Data: htmlBody },
        },
      },
    }),
  )
}
