import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront'
import { config } from './config.js'

const client = new S3Client({
  endpoint: config.STORAGE_ENDPOINT,
  region: config.STORAGE_REGION,
  // Omit credentials when STORAGE_KEY/SECRET are absent so the AWS SDK
  // falls back to the EC2 IAM instance profile via the credential chain.
  ...(config.STORAGE_KEY && config.STORAGE_SECRET
    ? { credentials: { accessKeyId: config.STORAGE_KEY, secretAccessKey: config.STORAGE_SECRET } }
    : {}),
  forcePathStyle: true, // required for MinIO and most S3-compatible stores
})

// CloudFront is a global service signed for us-east-1, whatever STORAGE_REGION is.
// No explicit credentials: STORAGE_KEY/SECRET belong to the object store.
const cdnClient = config.STORAGE_CDN_DISTRIBUTION_ID
  ? new CloudFrontClient({ region: 'us-east-1' })
  : null

function publicUrlFor(key: string): string {
  if (config.STORAGE_CDN_URL) {
    return `${config.STORAGE_CDN_URL.replace(/\/$/, '')}/${key}`
  }
  const publicUrl = config.STORAGE_PUBLIC_URL.replace(/\/$/, '')
  return `${publicUrl}/${config.STORAGE_BUCKET}/${key}`
}

export async function uploadGroupAvatar(sourceGroupId: string, buffer: Buffer): Promise<string> {
  const safeId = sourceGroupId
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase()
  const key = `group-avatars/${safeId}.jpg`
  await client.send(
    new PutObjectCommand({
      Bucket: config.STORAGE_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
    }),
    { abortSignal: AbortSignal.timeout(10_000) },
  )
  return publicUrlFor(key)
}

export async function uploadPhoto(key: string, buffer: Buffer): Promise<string> {
  await client.send(
    new PutObjectCommand({
      Bucket: config.STORAGE_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: 'image/jpeg',
    }),
    { abortSignal: AbortSignal.timeout(10_000) },
  )

  return publicUrlFor(key)
}

export async function deletePhoto(key: string): Promise<void> {
  await client.send(new DeleteObjectCommand({ Bucket: config.STORAGE_BUCKET, Key: key }), {
    abortSignal: AbortSignal.timeout(10_000),
  })

  // After the S3 delete: an edge that refetches in between would cache the photo again.
  if (cdnClient) {
    await cdnClient.send(
      new CreateInvalidationCommand({
        DistributionId: config.STORAGE_CDN_DISTRIBUTION_ID,
        InvalidationBatch: {
          CallerReference: `${key}-${Date.now()}`,
          Paths: { Quantity: 1, Items: [`/${key}`] },
        },
      }),
      { abortSignal: AbortSignal.timeout(10_000) },
    )
  }
}
