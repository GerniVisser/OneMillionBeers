import { describe, it, expect, beforeEach } from 'vitest'
import {
  getActivity,
  getAudit,
  recordAudit,
  recordBeer,
  recordMe,
  recordStatus,
  recordWebhook,
  resetActivity,
} from '../activity.js'

describe('activity', () => {
  beforeEach(() => resetActivity())

  it('tracks webhooks and beers per session', () => {
    recordWebhook('default', 'message')
    recordBeer('default')
    recordBeer('default')
    const a = getActivity('default')
    expect(a.lastEvent).toBe('message')
    expect(a.lastWebhookAt).not.toBeNull()
    expect(a.beersSinceStart).toBe(2)
    expect(getActivity('other').beersSinceStart).toBe(0)
  })

  it('records a status only when it changes, newest first', () => {
    recordStatus('default', 'WORKING', 'poll')
    recordStatus('default', 'WORKING', 'webhook')
    recordStatus('default', 'FAILED', 'webhook')
    expect(getActivity('default').statusHistory.map((h) => h.status)).toEqual(['FAILED', 'WORKING'])
  })

  it('caps the status history at 50 entries', () => {
    for (let i = 0; i < 60; i++) recordStatus('default', i % 2 ? 'WORKING' : 'FAILED', 'poll')
    expect(getActivity('default').statusHistory).toHaveLength(50)
  })

  it('keeps the last known number after the session loses it', () => {
    recordMe('default', '27733514583@c.us')
    recordMe('default', null)
    expect(getActivity('default').lastKnownMe).toBe('27733514583@c.us')
  })

  it('caps the audit trail at 200 entries, newest first', () => {
    for (let i = 0; i < 210; i++) {
      recordAudit({ actor: 'gerni', ip: null, action: `a${i}`, target: null, ok: true })
    }
    const audit = getAudit()
    expect(audit).toHaveLength(200)
    expect(audit[0].action).toBe('a209')
  })
})
