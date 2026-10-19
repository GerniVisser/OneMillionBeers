import type { FastifyInstance } from 'fastify'
import { type Logger } from 'pino'
import { config } from './config.js'
import {
  listSessions,
  sessionAction,
  getQrCodePng,
  requestPairingCode,
  type SessionAction,
} from './waha-client.js'

// No authentication here: the gateway's basic auth on /admin is the only gate.
// Never expose the collector any other way.
const ACTIONS: SessionAction[] = ['start', 'stop', 'restart', 'logout']

// The name goes into a WAHA URL path, so only configured names are allowed.
function knownSession(name: string): boolean {
  return config.WAHA_SESSIONS.includes(name)
}

export function registerAdminRoutes(server: FastifyInstance, logger: Logger): void {
  server.get('/admin', async (_req, reply) => reply.type('text/html').send(PAGE))

  server.get('/admin/api/overview', async (_req, reply) => {
    try {
      const all = await listSessions()
      const sessions = config.WAHA_SESSIONS.map(
        (name) =>
          all.find((s) => s.name === name) ?? {
            name,
            status: 'MISSING' as const,
            phone: null,
            pushName: null,
          },
      )
      const extra = all.filter((s) => !knownSession(s.name)).map((s) => s.name)
      return reply.send({ wahaReachable: true, sessions, unmanaged: extra })
    } catch (err) {
      logger.warn({ err }, 'Admin overview could not reach WAHA')
      return reply.send({ wahaReachable: false, sessions: [], unmanaged: [] })
    }
  })

  server.post('/admin/api/sessions/:name/:action', async (req, reply) => {
    const { name, action } = req.params as { name: string; action: string }
    if (!knownSession(name)) return reply.status(404).send({ error: 'Unknown session' })
    if (!ACTIONS.includes(action as SessionAction)) {
      return reply.status(400).send({ error: 'Unknown action' })
    }
    try {
      await sessionAction(name, action as SessionAction)
      logger.warn({ session: name, action }, 'Admin performed a WhatsApp session action')
      return reply.send({ ok: true })
    } catch (err) {
      logger.error({ err, session: name, action }, 'Admin session action failed')
      return reply.status(502).send({ error: (err as Error).message })
    }
  })

  server.get('/admin/api/sessions/:name/qr', async (req, reply) => {
    const { name } = req.params as { name: string }
    if (!knownSession(name)) return reply.status(404).send({ error: 'Unknown session' })
    try {
      return reply.type('image/png').send(await getQrCodePng(name))
    } catch (err) {
      return reply.status(502).send({ error: (err as Error).message })
    }
  })

  server.post('/admin/api/sessions/:name/pair', async (req, reply) => {
    const { name } = req.params as { name: string }
    if (!knownSession(name)) return reply.status(404).send({ error: 'Unknown session' })

    const phoneNumber = String(
      (req.body as { phoneNumber?: string } | undefined)?.phoneNumber ?? '',
    )
    // WhatsApp wants digits only, in full international form.
    if (!/^\d{8,15}$/.test(phoneNumber)) {
      return reply.status(400).send({ error: 'Phone number must be 8–15 digits, no + or spaces' })
    }

    const result = await requestPairingCode(name, phoneNumber)
    if (!result.ok) {
      logger.warn({ session: name, reason: result.message }, 'Pairing code request refused')
      return reply.status(502).send({ error: result.message })
    }
    // The code links a device, so it is never logged.
    logger.warn({ session: name }, 'Admin requested a WhatsApp pairing code')
    return reply.send({ code: result.code })
  })
}

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<title>OMB — WhatsApp numbers</title>
<style>
:root{color-scheme:light dark;--bg:#faf7f0;--fg:#1c1a17;--card:#fff;--line:#e4ddcd;--muted:#6b645a}
@media(prefers-color-scheme:dark){:root{--bg:#17150f;--fg:#f2ede1;--card:#211e17;--line:#38332a;--muted:#9b9387}}
*{box-sizing:border-box}
body{margin:0;padding:16px;font:16px/1.5 system-ui,sans-serif;background:var(--bg);color:var(--fg)}
main{max-width:640px;margin:0 auto}
h1{font-size:1.25rem;margin:0 0 4px}
.sub{color:var(--muted);font-size:.85rem;margin:0 0 20px}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:14px;margin-bottom:12px}
.row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.name{font-weight:600}
.badge{font-size:.72rem;font-weight:700;letter-spacing:.04em;padding:3px 8px;border-radius:999px;background:#ddd;color:#333}
.WORKING{background:#1f7a3f;color:#fff}
.SCAN_QR_CODE,.STARTING{background:#b4740a;color:#fff}
.FAILED,.MISSING{background:#a32626;color:#fff}
.STOPPED{background:#555;color:#fff}
.meta{color:var(--muted);font-size:.85rem;margin:6px 0 0}
.actions{margin-top:12px;display:flex;gap:8px;flex-wrap:wrap}
button{font:inherit;padding:8px 14px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);cursor:pointer;min-height:40px}
button:hover{border-color:var(--muted)}
button:disabled{opacity:.5;cursor:default}
.link{margin-top:12px;padding-top:12px;border-top:1px solid var(--line)}
.link img{display:block;width:220px;max-width:100%;margin:10px 0;background:#fff;padding:8px;border-radius:8px}
input{font:inherit;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--fg);width:11em;min-height:40px}
code{font-size:1.5rem;letter-spacing:.18em;font-weight:700}
.err{color:#c0392b;font-size:.85rem;margin-top:8px}
.warn{background:#a32626;color:#fff;padding:10px 14px;border-radius:8px;margin-bottom:12px}
</style>
</head>
<body>
<main>
  <h1>WhatsApp numbers</h1>
  <p class="sub">Every number listens to the same groups. One of them being down costs nothing as long as another is WORKING.</p>
  <div id="root">Loading…</div>
</main>
<script>
const $ = (h) => { const t = document.createElement('template'); t.innerHTML = h.trim(); return t.content }
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
let busy = false

async function api(path, options) {
  const res = await fetch(path, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || ('HTTP ' + res.status))
  return body
}

async function act(name, action) {
  if (busy) return
  if (action === 'logout' && !confirm('Unlink ' + name + '? It will need pairing again.')) return
  busy = true
  try {
    await api('/admin/api/sessions/' + encodeURIComponent(name) + '/' + action, { method: 'POST' })
  } catch (e) {
    alert(action + ' failed: ' + e.message)
  }
  busy = false
  refresh()
}

async function pair(name, input, out) {
  out.textContent = 'Requesting…'
  try {
    const { code } = await api('/admin/api/sessions/' + encodeURIComponent(name) + '/pair', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phoneNumber: input.value.replace(/\\D/g, '') }),
    })
    out.innerHTML = 'On that phone: Settings &rarr; Linked devices &rarr; Link with phone number, then enter <code>' + esc(code) + '</code>'
  } catch (e) {
    out.innerHTML = '<span class="err">' + esc(e.message) + '</span>'
  }
}

function card(s) {
  const linkable = s.status === 'SCAN_QR_CODE'
  const el = $(
    '<div class="card">' +
      '<div class="row"><span class="name">' + esc(s.name) + '</span>' +
      '<span class="badge ' + esc(s.status) + '">' + esc(s.status) + '</span></div>' +
      '<p class="meta">' + (s.phone ? '+' + esc(s.phone) + (s.pushName ? ' · ' + esc(s.pushName) : '') : 'not linked') + '</p>' +
      '<div class="actions"></div>' +
      (linkable ? '<div class="link"></div>' : '') +
    '</div>'
  ).firstElementChild

  const actions = el.querySelector('.actions')
  for (const a of ['restart', 'stop', 'start', 'logout']) {
    const b = document.createElement('button')
    b.textContent = a
    b.onclick = () => act(s.name, a)
    actions.append(b)
  }

  if (linkable) {
    const link = el.querySelector('.link')
    // A QR can't be scanned on the phone being linked; a pairing code can.
    link.append($('<img alt="QR code" src="/admin/api/sessions/' + encodeURIComponent(s.name) + '/qr?t=' + Date.now() + '">'))
    const row = $('<div class="row"><input inputmode="numeric" placeholder="27821234567"><button>Get code</button></div>').firstElementChild
    const out = document.createElement('p')
    out.className = 'meta'
    row.querySelector('button').onclick = () => pair(s.name, row.querySelector('input'), out)
    link.append(row, out)
  }
  return el
}

async function refresh() {
  if (busy) return
  let data
  try {
    data = await api('/admin/api/overview')
  } catch (e) {
    document.getElementById('root').innerHTML = '<div class="warn">Could not load: ' + esc(e.message) + '</div>'
    return
  }
  const root = document.createElement('div')
  if (!data.wahaReachable) {
    root.append($('<div class="warn">WAHA is not responding. Nothing is being ingested.</div>'))
  }
  data.sessions.forEach((s) => root.append(card(s)))
  if (data.unmanaged.length) {
    root.append($('<p class="sub">Also in WAHA, not in WAHA_SESSIONS: ' + esc(data.unmanaged.join(', ')) + '</p>'))
  }
  document.getElementById('root').replaceChildren(...root.childNodes)
}

refresh()
// 6 a minute, inside the gateway's 30r/m on /admin with room for actions.
setInterval(refresh, 10000)
</script>
</body>
</html>`
