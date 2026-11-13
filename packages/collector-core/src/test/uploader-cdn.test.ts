import { describe, it, expect, vi, beforeEach } from 'vitest'

const calls: string[] = []

vi.mock('@aws-sdk/client-s3', () => {
  const send = vi.fn(async () => {
    calls.push('s3')
    return {}
  })
  const S3Client = vi.fn(() => ({ send }))
  const PutObjectCommand = vi.fn((input: unknown) => input)
  const DeleteObjectCommand = vi.fn((input: unknown) => input)
  return { S3Client, PutObjectCommand, DeleteObjectCommand, _send: send }
})

vi.mock('@aws-sdk/client-cloudfront', () => {
  const send = vi.fn(async () => {
    calls.push('cloudfront')
    return {}
  })
  const CloudFrontClient = vi.fn(() => ({ send }))
  const CreateInvalidationCommand = vi.fn((input: unknown) => input)
  return { CloudFrontClient, CreateInvalidationCommand, _send: send }
})

vi.mock('../config.js', () => ({
  config: {
    STORAGE_ENDPOINT: 'http://localhost:9000',
    STORAGE_PUBLIC_URL: 'http://localhost:9000',
    STORAGE_BUCKET: 'omb-photos',
    STORAGE_KEY: 'minioadmin',
    STORAGE_SECRET: 'minioadmin',
    STORAGE_REGION: 'auto',
    STORAGE_CDN_URL: 'https://img.example.com/',
    STORAGE_CDN_DISTRIBUTION_ID: 'E123EXAMPLE',
    BACKEND_URL: 'http://localhost:3000',
    LOG_LEVEL: 'silent',
  },
}))

async function cloudFrontSend() {
  const { _send } = (await import('@aws-sdk/client-cloudfront')) as unknown as {
    _send: ReturnType<typeof vi.fn>
  }
  return _send
}

describe('uploader with a CDN configured', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    calls.length = 0
  })

  it('returns a photo URL on the CDN, without the bucket in the path', async () => {
    const { uploadPhoto } = await import('../uploader.js')

    const url = await uploadPhoto('photos/120363XXXX/ABC123.jpg', Buffer.from('x'))

    expect(url).toBe('https://img.example.com/photos/120363XXXX/ABC123.jpg')
  })

  it('returns a group avatar URL on the CDN', async () => {
    const { uploadGroupAvatar } = await import('../uploader.js')

    const url = await uploadGroupAvatar('wa:120363XXXX@g.us', Buffer.from('x'))

    expect(url).toBe('https://img.example.com/group-avatars/wa-120363xxxx-g-us.jpg')
  })

  it('does not invalidate on upload', async () => {
    const { uploadPhoto } = await import('../uploader.js')

    await uploadPhoto('photos/120363XXXX/ABC123.jpg', Buffer.from('x'))

    expect(await cloudFrontSend()).not.toHaveBeenCalled()
  })

  it('invalidates the deleted photo on the CDN, after the S3 delete', async () => {
    const { deletePhoto } = await import('../uploader.js')

    await deletePhoto('photos/120363XXXX/ABC123.jpg')

    expect(calls).toEqual(['s3', 'cloudfront'])
    const [command] = (await cloudFrontSend()).mock.calls[0] as [
      {
        DistributionId: string
        InvalidationBatch: { Paths: { Quantity: number; Items: string[] } }
      },
    ]
    expect(command.DistributionId).toBe('E123EXAMPLE')
    expect(command.InvalidationBatch.Paths).toEqual({
      Quantity: 1,
      Items: ['/photos/120363XXXX/ABC123.jpg'],
    })
  })

  it('rejects when the invalidation fails', async () => {
    ;(await cloudFrontSend()).mockRejectedValueOnce(new Error('CloudFront unavailable'))
    const { deletePhoto } = await import('../uploader.js')

    await expect(deletePhoto('photos/120363XXXX/ABC123.jpg')).rejects.toThrow(
      'CloudFront unavailable',
    )
  })
})
