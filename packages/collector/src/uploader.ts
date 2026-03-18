import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { config } from './config.js'

const client = new S3Client({
  endpoint: config.STORAGE_ENDPOINT,
  region: config.STORAGE_REGION,
  credentials: {
    accessKeyId: config.STORAGE_KEY,
    secretAccessKey: config.STORAGE_SECRET,
  },
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

  // Construct public URL from endpoint + bucket + key
  const endpoint = config.STORAGE_ENDPOINT.replace(/\/$/, '')
  return `${endpoint}/${config.STORAGE_BUCKET}/${key}`
}
