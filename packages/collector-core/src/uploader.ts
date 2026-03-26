import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
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

  // Construct public URL from public URL + bucket + key
  const publicUrl = config.STORAGE_PUBLIC_URL.replace(/\/$/, '')
  return `${publicUrl}/${config.STORAGE_BUCKET}/${key}`
}
