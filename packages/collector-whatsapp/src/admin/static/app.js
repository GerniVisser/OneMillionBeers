// OMB WhatsApp admin page. Plain script (no build step) served from /admin/app.js.
// The page is a thin client over /admin/api; all authorisation happens server side.
;(() => {
  'use strict'

  const REFRESH_MS = 5000
  const $ = (id) => document.getElementById(id)

  const state = {
    overview: null,
    // Per session: { open, tab: 'code' | 'qr', phone, code, codeAt, error }
    relink: {},
    busy: new Set(),
    timer: null,
  }

  // ------------------------------------------------------------ helpers

  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
    )

  function ago(ms, now) {
    if (!ms) return '—'
    const s = Math.max(0, Math.round((now - ms) / 1000))
    if (s < 60) return s + 's ago'
    if (s < 3600) return Math.round(s / 60) + ' min ago'
    if (s < 86400) return (s / 3600).toFixed(1) + ' h ago'
    return (s / 86400).toFixed(1) + ' days ago'
  }

  function duration(ms) {
    const m = Math.round(ms / 60000)
    if (m < 60) return m + ' min'
    if (m < 1440) return (m / 60).toFixed(1) + ' h'
    return (m / 1440).toFixed(1) + ' days'
  }

  const time = (ms) => new Date(ms).toLocaleString()
  const phoneOf = (id) => (id ? String(id).split('@')[0] : '')

  async function api(path, options = {}) {
    const res = await fetch('/admin/api' + path, {
      credentials: 'same-origin',
      ...options,
      headers: options.body ? { 'content-type': 'application/json' } : undefined,
    })
    const data = await res.json().catch(() => ({}))
    // A 401 from the login itself is a wrong password, not an expired session.
    if (res.status === 401 && path !== '/login') {
      showLogin()
      throw new Error('Not logged in')
    }
    if (res.status === 429) {
      throw new Error(data.error || 'Too many attempts. Wait a few minutes and try again.')
    }
    if (!res.ok) throw new Error(data.error || 'Request failed (' + res.status + ')')
    return data
  }

  const post = (path, body = {}) => api(path, { method: 'POST', body: JSON.stringify(body) })

  function banner(text, bad) {
    const el = $('banner')
    el.textContent = text
    el.className = 'banner' + (bad ? ' bad' : '')
    el.hidden = !text
  }

  // ---------------------------------------------------------- login/out

  function showLogin() {
    clearInterval(state.timer)
    state.timer = null
    $('app-view').hidden = true
    $('user').hidden = true
    $('login-view').hidden = false
    $('login-username').focus()
  }

  function showApp(username) {
    $('login-view').hidden = true
    $('app-view').hidden = false
    $('user').hidden = false
    $('username').textContent = username
    refresh()
    if (!state.timer) state.timer = setInterval(refresh, REFRESH_MS)
  }

  $('login-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const button = event.target.querySelector('button')
    const error = $('login-error')
    button.disabled = true
    error.hidden = true
    try {
      const me = await post('/login', {
        username: $('login-username').value,
        password: $('login-password').value,
      })
      $('login-password').value = ''
      showApp(me.username)
    } catch (err) {
      error.textContent = err.message
      error.hidden = false
    } finally {
      button.disabled = false
    }
  })

  $('logout').addEventListener('click', async () => {
    await post('/logout').catch(() => {})
    state.overview = null
    showLogin()
  })

  // ------------------------------------------------------------ render

  function renderWaha(o) {
    const w = o.waha
    const status = w.reachable ? 'UP' : 'DOWN'
    $('waha').innerHTML =
      '<div class="card-head"><h3>WAHA <span class="pill s-' +
      status +
      '">' +
      (w.reachable ? 'reachable' : 'unreachable') +
      '</span></h3>' +
      '<div class="actions"><button type="button" class="danger" data-action="restart-waha"' +
      (state.busy.has('waha') ? ' disabled' : '') +
      '>Restart WAHA</button></div></div>' +
      (w.reachable
        ? '<dl class="facts">' +
          fact('Version', w.version + ' · ' + w.engine) +
          fact('Up for', duration(w.uptimeMs)) +
          fact('Started', time(w.startedAt)) +
          fact('Collector up since', time(o.collector.startedAt)) +
          '</dl>'
        : '<p class="error">' + esc(w.error) + '</p>') +
      (o.sessionsError ? '<p class="error">Sessions: ' + esc(o.sessionsError) + '</p>' : '')
  }

  const fact = (label, value) => '<div><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>'

  function relinkFor(name) {
    if (!state.relink[name]) state.relink[name] = { open: false, tab: 'code', phone: '' }
    return state.relink[name]
  }

  function renderSession(s, now) {
    const r = relinkFor(s.name)
    const a = s.activity
    if (!r.phone) r.phone = phoneOf(s.me?.id || a.lastKnownMe)
    const busy = state.busy.has(s.name)
    const dis = busy ? ' disabled' : ''
    const stoppable =
      s.status === 'WORKING' || s.status === 'STARTING' || s.status === 'SCAN_QR_CODE'
    const showRelink = r.open || s.status === 'SCAN_QR_CODE'

    const history = a.statusHistory
      .map(
        (h) =>
          '<tr><td>' +
          esc(time(h.at)) +
          '</td><td>' +
          pill(h.status) +
          '</td><td>' +
          esc(h.source) +
          '</td></tr>',
      )
      .join('')

    return (
      '<article class="card" data-session="' +
      esc(s.name) +
      '">' +
      '<div class="card-head"><h3>' +
      esc(s.name) +
      (s.ingests ? '<span class="badge">ingests beers</span>' : '') +
      '</h3>' +
      pill(s.status) +
      '</div>' +
      '<dl class="facts">' +
      fact(
        'Number',
        s.me
          ? '+' + phoneOf(s.me.id) + (s.me.pushName ? ' (' + s.me.pushName + ')' : '')
          : a.lastKnownMe
            ? 'was +' + phoneOf(a.lastKnownMe)
            : 'not linked',
      ) +
      fact(
        'Last webhook',
        a.lastWebhookAt ? ago(a.lastWebhookAt, now) + ' · ' + a.lastEvent : '—',
      ) +
      (s.ingests
        ? fact('Last beer', ago(a.lastBeerAt, now)) +
          fact('Beers since collector start', a.beersSinceStart)
        : '') +
      '</dl>' +
      '<div class="actions">' +
      '<button type="button" data-action="restart"' +
      dis +
      '>Restart</button>' +
      (stoppable
        ? '<button type="button" data-action="stop"' + dis + '>Stop</button>'
        : '<button type="button" data-action="start"' + dis + '>Start</button>') +
      '<button type="button" class="primary" data-action="relink"' +
      dis +
      '>Re-link</button>' +
      '</div>' +
      (showRelink ? renderRelink(s, r) : '') +
      (history
        ? '<details><summary>Status history</summary><table>' + history + '</table></details>'
        : '') +
      '</article>'
    )
  }

  const pill = (status) => '<span class="pill s-' + esc(status) + '">' + esc(status) + '</span>'

  function renderRelink(s, r) {
    let body
    if (s.status === 'WORKING') {
      body = '<p>Linked. You can close this panel.</p>'
    } else if (s.status === 'FAILED' || s.status === 'STOPPED') {
      body =
        '<p>The pairing window closed (an unused code or QR expires after about 2½ minutes).</p>' +
        '<button type="button" class="primary" data-action="relink">Start again</button>'
    } else if (s.status !== 'SCAN_QR_CODE') {
      body =
        '<p class="muted">Waiting for the session to be ready to pair… (' + esc(s.status) + ')</p>'
    } else if (r.tab === 'qr') {
      body =
        '<p class="small muted">Scan from WhatsApp on the phone: Settings → Linked devices → Link a device. Refreshes every few seconds.</p>' +
        '<img class="qr" alt="QR code for ' +
        esc(s.name) +
        '" src="/admin/api/sessions/' +
        encodeURIComponent(s.name) +
        '/qr?t=' +
        Date.now() +
        '" />'
    } else {
      body =
        '<div class="row"><label>Phone number with country code (27…, no leading 0)' +
        '<input data-phone inputmode="tel" autocomplete="off" value="' +
        esc(r.phone) +
        '" /></label>' +
        '<button type="button" class="primary" data-action="pairing-code">Get code</button></div>' +
        (r.error ? '<p class="error">' + esc(r.error) + '</p>' : '') +
        (r.code
          ? '<div class="code">' +
            esc(r.code) +
            '</div>' +
            '<ol class="steps small"><li>On the phone with that number, open WhatsApp → Settings → Linked devices.</li>' +
            '<li>Tap <b>Link a device</b>, then <b>Link with phone number instead</b>.</li>' +
            '<li>Enter the code above. This page turns green once linked.</li></ol>'
          : '<p class="small muted">WhatsApp shows a notification on that phone; the code is typed in under Linked devices.</p>')
    }
    return (
      '<div class="relink"><div class="card-head"><h3>Re-link ' +
      esc(s.name) +
      '</h3>' +
      '<button type="button" class="link" data-action="close-relink">Close</button></div>' +
      (s.status === 'SCAN_QR_CODE'
        ? '<div class="tabs"><button type="button" data-tab="code" aria-pressed="' +
          (r.tab === 'code') +
          '">Pairing code</button>' +
          '<button type="button" data-tab="qr" aria-pressed="' +
          (r.tab === 'qr') +
          '">QR code</button></div>'
        : '') +
      body +
      '</div>'
    )
  }

  function renderAudit(entries) {
    $('audit').innerHTML =
      '<tr><th>When</th><th>Who</th><th>Action</th><th>Target</th><th>Result</th><th>IP</th></tr>' +
      (entries.length
        ? entries
            .map(
              (e) =>
                '<tr><td>' +
                esc(time(e.at)) +
                '</td><td>' +
                esc(e.actor) +
                '</td><td>' +
                esc(e.action) +
                '</td><td>' +
                esc(e.target ?? '') +
                '</td><td>' +
                (e.ok ? 'ok' : '<span class="error">failed</span>') +
                (e.detail ? ' · ' + esc(e.detail) : '') +
                '</td><td>' +
                esc(e.ip ?? '') +
                '</td></tr>',
            )
            .join('')
        : '<tr><td colspan="6" class="muted">Nothing since the collector started.</td></tr>')
  }

  function render() {
    const o = state.overview
    if (!o) return
    // Keep focus and caret in the phone field across the periodic re-render.
    const active = document.activeElement
    const focusSession = active?.matches?.('[data-phone]')
      ? active.closest('[data-session]')?.dataset.session
      : null
    const caret = focusSession ? active.selectionStart : null

    renderWaha(o)
    $('sessions').innerHTML = o.sessions.map((s) => renderSession(s, o.now)).join('')
    renderAudit(o.audit)
    $('updated').textContent =
      'Updated ' + new Date(o.now).toLocaleTimeString() + ' · refreshes every 5 s'

    if (focusSession) {
      const input = document.querySelector(
        '[data-session="' + CSS.escape(focusSession) + '"] [data-phone]',
      )
      if (input) {
        input.focus()
        input.setSelectionRange(caret, caret)
      }
    }
  }

  async function refresh() {
    try {
      const o = await api('/overview')
      // Close a re-link panel, and forget its code, once the session is linked.
      for (const s of o.sessions) {
        const r = state.relink[s.name]
        if (r?.open && s.status === 'WORKING') {
          r.open = false
          r.code = null
          banner(s.name + ' is linked and working.')
        }
      }
      state.overview = o
      render()
    } catch (err) {
      if (err.message !== 'Not logged in') banner('Could not load status: ' + err.message, true)
    }
  }

  // ----------------------------------------------------------- actions

  async function run(key, fn) {
    state.busy.add(key)
    render()
    try {
      await fn()
    } catch (err) {
      banner(err.message, true)
    } finally {
      state.busy.delete(key)
      await refresh()
    }
  }

  const sessionStatus = (name) => state.overview?.sessions.find((s) => s.name === name)?.status

  $('sessions').addEventListener('input', (event) => {
    if (!event.target.matches('[data-phone]')) return
    relinkFor(event.target.closest('[data-session]').dataset.session).phone = event.target.value
  })

  $('sessions').addEventListener('click', (event) => {
    const button = event.target.closest('button')
    const card = event.target.closest('[data-session]')
    if (!button || !card) return
    const name = card.dataset.session
    const r = relinkFor(name)
    const path = '/sessions/' + encodeURIComponent(name)

    if (button.dataset.tab) {
      r.tab = button.dataset.tab
      return render()
    }

    switch (button.dataset.action) {
      case 'restart':
      case 'start':
        banner('')
        return run(name, () => post(path + '/' + button.dataset.action))
      case 'stop':
        if (!confirm('Stop ' + name + '? It receives nothing until started again.')) return
        return run(name, () => post(path + '/stop'))
      case 'relink': {
        const status = sessionStatus(name)
        if (status === 'SCAN_QR_CODE') {
          r.open = true
          return render()
        }
        if (
          status === 'WORKING' &&
          !confirm(
            'Unlink ' +
              name +
              ' from WhatsApp and link it again? It receives nothing until re-linked.',
          )
        )
          return
        // Logging out discards the old credentials; WAHA then restarts the
        // session ready to pair. A FAILED session with dead credentials needs
        // exactly this — a plain restart would fail the same way again.
        r.open = true
        r.code = null
        r.error = null
        banner('')
        return run(name, () => post(path + '/logout'))
      }
      case 'close-relink':
        r.open = false
        return render()
      case 'pairing-code':
        r.error = null
        return run(name, async () => {
          try {
            const { code } = await post(path + '/pairing-code', { phoneNumber: r.phone })
            r.code = code
            r.codeAt = Date.now()
          } catch (err) {
            r.error = err.message
          }
        })
    }
  })

  $('waha').addEventListener('click', (event) => {
    if (event.target.closest('button')?.dataset.action !== 'restart-waha') return
    if (!confirm('Restart WAHA? Every number disconnects for about 20 seconds.')) return
    banner('WAHA is restarting…')
    run('waha', () => post('/server/restart'))
  })

  // --------------------------------------------------------------- boot

  api('/me')
    .then((me) => (me.readOnly ? showLogin() : showApp(me.username)))
    .catch(() => showLogin())
})()
