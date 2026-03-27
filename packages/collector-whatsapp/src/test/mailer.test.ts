import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSend = vi.fn()
const mockSESClient = vi.fn(() => ({ send: mockSend }))
const mockSendEmailCommand = vi.fn((input: unknown) => input)

vi.mock('@aws-sdk/client-ses', () => ({
  SESClient: mockSESClient,
  SendEmailCommand: mockSendEmailCommand,
}))

// Mutable config — mutate per test
const testConfig = {
  ENABLE_ALERTS: false,
  AWS_REGION: 'us-east-1',
  ALERT_EMAIL: 'to@example.com',
  SES_FROM_EMAIL: 'from@example.com',
}

vi.mock('../config.js', () => ({
  get config() {
    return testConfig
  },
}))

describe('mailer', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSend.mockReset()
    mockSESClient.mockClear()
    mockSendEmailCommand.mockClear()
    testConfig.ENABLE_ALERTS = false
  })

  it('returns immediately when ENABLE_ALERTS=false', async () => {
    testConfig.ENABLE_ALERTS = false
    const { sendReauthAlert } = await import('../mailer.js')
    await sendReauthAlert('https://example.com/status?token=abc')
    expect(mockSend).not.toHaveBeenCalled()
  })

  it('sends email via SES when ENABLE_ALERTS=true', async () => {
    testConfig.ENABLE_ALERTS = true
    mockSend.mockResolvedValue({})
    const { sendReauthAlert } = await import('../mailer.js')
    await sendReauthAlert('https://example.com/status?token=abc')

    expect(mockSend).toHaveBeenCalledOnce()
    const cmdInput = mockSendEmailCommand.mock.calls[0]![0] as {
      Destination: { ToAddresses: string[] }
      Source: string
      Message: {
        Subject: { Data: string }
        Body: { Text: { Data: string }; Html: { Data: string } }
      }
    }
    expect(cmdInput.Destination.ToAddresses).toContain('to@example.com')
    expect(cmdInput.Source).toBe('from@example.com')
    expect(cmdInput.Message.Subject.Data).toBe('[OMB] WhatsApp re-authentication required')
    expect(cmdInput.Message.Body.Text.Data).toContain('https://example.com/status?token=abc')
    expect(cmdInput.Message.Body.Html.Data).toContain(
      '<a href="https://example.com/status?token=abc"',
    )
  })

  it('rethrows when SES send throws', async () => {
    testConfig.ENABLE_ALERTS = true
    mockSend.mockRejectedValue(new Error('SES error'))
    const { sendReauthAlert } = await import('../mailer.js')
    await expect(sendReauthAlert('https://example.com/status?token=abc')).rejects.toThrow(
      'SES error',
    )
  })
})
