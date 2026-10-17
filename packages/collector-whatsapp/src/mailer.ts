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
  adminUrl: string,
): Promise<void> {
  if (!config.ENABLE_ALERTS) return

  const textBody = `WhatsApp number "${session}" is ${status} and requires re-authentication.

Re-link it at: ${adminUrl}

The page asks for the admin password. Scan the QR from another device, or ask
for a pairing code and enter it on the phone itself under
Settings -> Linked devices -> Link with phone number.

The other numbers keep ingesting while this one is down.`

  const htmlBody = `<p>WhatsApp number <strong>${session}</strong> is ${status} and requires re-authentication.</p>
<p>Re-link it at: <a href="${adminUrl}">${adminUrl}</a></p>
<p>The page asks for the admin password. Scan the QR from another device, or ask
for a pairing code and enter it on the phone itself under
Settings &rarr; Linked devices &rarr; Link with phone number.</p>
<p>The other numbers keep ingesting while this one is down.</p>`

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
