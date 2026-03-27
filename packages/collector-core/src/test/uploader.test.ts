import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@aws-sdk/client-s3', () => {
  const send = vi.fn().mockResolvedValue({})
  const S3Client = vi.fn(() => ({ send }))
  const PutObjectCommand = vi.fn((input: unknown) => input)
  return { S3Client, PutObjectCommand, _send: send }
})

vi.mock('../config.js', () => ({
  config: {
    STORAGE_ENDPOINT: 'http://localhost:9000',
    STORAGE_PUBLIC_URL: 'http://localhost:9000',
    STORAGE_BUCKET: 'omb-photos',
    STORAGE_KEY: 'minioadmin',
    STORAGE_SECRET: 'minioadmin',
    STORAGE_REGION: 'auto',
    BACKEND_URL: 'http://localhost:3000',
    LOG_LEVEL: 'silent',
  },
}))

describe('uploadPhoto', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls PutObjectCommand with correct bucket, key, body and content-type', async () => {
    const { uploadPhoto } = await import('../uploader.js')
    const { PutObjectCommand } = await import('@aws-sdk/client-s3')

    const buffer = Buffer.from('fake-image-data')
    const key = 'photos/-1001234567890/ABC123.jpg'

    await uploadPhoto(key, buffer)

    expect(PutObjectCommand).toHaveBeenCalledWith({
      Bucket: 'omb-photos',
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
    })
  })

  it('passes an AbortSignal to client.send for timeout enforcement', async () => {
    const { uploadPhoto } = await import('../uploader.js')
    // _send is the shared send mock exposed by the @aws-sdk/client-s3 mock factory
    const { _send } = (await import('@aws-sdk/client-s3')) as unknown as {
      _send: ReturnType<typeof vi.fn>
    }

    await uploadPhoto('photos/-1001234567890/ABC123.jpg', Buffer.from('x'))

    const [, options] = _send.mock.calls[0] as [unknown, { abortSignal: AbortSignal }]
    expect(options.abortSignal).toBeInstanceOf(AbortSignal)
  })

  it('returns a correctly constructed public URL', async () => {
    const { uploadPhoto } = await import('../uploader.js')
    const key = 'photos/-1001234567890/ABC123.jpg'

    const url = await uploadPhoto(key, Buffer.from('x'))

    expect(url).toBe('http://localhost:9000/omb-photos/photos/-1001234567890/ABC123.jpg')
  })

  it('strips trailing slash from endpoint before building URL', async () => {
    vi.resetModules()
    vi.mock('../config.js', () => ({
      config: {
        STORAGE_ENDPOINT: 'http://localhost:9000/',
        STORAGE_PUBLIC_URL: 'http://localhost:9000/',
        STORAGE_BUCKET: 'omb-photos',
        STORAGE_KEY: 'key',
        STORAGE_SECRET: 'secret',
        STORAGE_REGION: 'auto',
        BACKEND_URL: 'http://localhost:3000',
        LOG_LEVEL: 'silent',
      },
    }))

    const { uploadPhoto } = await import('../uploader.js')
    const url = await uploadPhoto('photos/group/file.jpg', Buffer.from('x'))

    expect(url).toBe('http://localhost:9000/omb-photos/photos/group/file.jpg')
  })

  it('propagates S3 errors to the caller', async () => {
    const { S3Client } = await import('@aws-sdk/client-s3')
    vi.mocked(S3Client).mockImplementationOnce(
      () => ({ send: vi.fn().mockRejectedValue(new Error('S3 unavailable')) }) as never,
    )

    vi.resetModules()
    vi.mock('../config.js', () => ({
      config: {
        STORAGE_ENDPOINT: 'http://localhost:9000',
        STORAGE_PUBLIC_URL: 'http://localhost:9000',
        STORAGE_BUCKET: 'omb-photos',
        STORAGE_KEY: 'key',
        STORAGE_SECRET: 'secret',
        STORAGE_REGION: 'auto',
        BACKEND_URL: 'http://localhost:3000',
        LOG_LEVEL: 'silent',
      },
    }))

    const { uploadPhoto } = await import('../uploader.js')
    await expect(uploadPhoto('photos/x/y.jpg', Buffer.from('x'))).rejects.toThrow('S3 unavailable')
  })
})
