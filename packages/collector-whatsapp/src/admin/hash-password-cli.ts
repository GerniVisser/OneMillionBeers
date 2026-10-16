// Generates the admin page's SSM values. Run from the repo root:
//
//   pnpm --filter @omb/collector-whatsapp admin:hash-password
//
// Prompts for the password twice (not echoed) and prints ADMIN_PASSWORD_HASH,
// plus fresh random values for ADMIN_SESSION_SECRET and ADMIN_API_TOKEN.
import { randomBytes } from 'node:crypto'
import { createInterface } from 'node:readline'
import { Writable } from 'node:stream'
import { hashPassword } from './password.js'

const MIN_LENGTH = 16

function askHidden(prompt: string): Promise<string> {
  let muted = false
  const output = new Writable({
    write(chunk, _encoding, done) {
      if (!muted) process.stderr.write(chunk)
      done()
    },
  })
  const rl = createInterface({ input: process.stdin, output, terminal: true })
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close()
      process.stderr.write('\n')
      resolve(answer)
    })
    muted = true
  })
}

async function main(): Promise<void> {
  const password = await askHidden('Admin password: ')
  if (password.length < MIN_LENGTH) {
    console.error(`Use at least ${MIN_LENGTH} characters (a password-manager generated one).`)
    process.exit(1)
  }
  if ((await askHidden('Repeat password: ')) !== password) {
    console.error('Passwords do not match.')
    process.exit(1)
  }

  const hash = await hashPassword(password)
  const secret = randomBytes(32).toString('base64url')
  const apiToken = randomBytes(32).toString('base64url')

  console.log(`
ADMIN_PASSWORD_HASH=${hash}
ADMIN_SESSION_SECRET=${secret}
ADMIN_API_TOKEN=${apiToken}

Store them in SSM (SecureString), then redeploy the collector:

  aws ssm put-parameter --region us-east-1 --type SecureString --overwrite --name /omb/ADMIN_USERNAME --value '<username>'
  aws ssm put-parameter --region us-east-1 --type SecureString --overwrite --name /omb/ADMIN_PASSWORD_HASH --value '${hash}'
  aws ssm put-parameter --region us-east-1 --type SecureString --overwrite --name /omb/ADMIN_SESSION_SECRET --value '${secret}'
  aws ssm put-parameter --region us-east-1 --type SecureString --overwrite --name /omb/ADMIN_API_TOKEN --value '${apiToken}'

ADMIN_API_TOKEN is optional (read-only diagnostics). Changing the password or the
session secret logs out every device.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
