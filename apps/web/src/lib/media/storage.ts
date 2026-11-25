import "server-only";
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

/**
 * Private S3-compatible object storage (the `storage` container in docker-compose). Images are written here when it is
 * configured; rows created before that keep their bytes in Postgres and are still served (see the media routes).
 * Nothing here is public: the browser only ever sees /api/media/[id] and /api/banner-image/[id].
 */
type Config = { endpoint: string; bucket: string; accessKey: string; secretKey: string; region: string };

function readConfig(): Config | null {
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const bucket = process.env.S3_BUCKET?.trim();
  const accessKey = process.env.S3_ACCESS_KEY?.trim();
  const secretKey = process.env.S3_SECRET_KEY?.trim();
  if (!endpoint || !bucket || !accessKey || !secretKey) return null;
  return { endpoint, bucket, accessKey, secretKey, region: process.env.S3_REGION?.trim() || "us-east-1" };
}

export const storageConfigured = () => readConfig() !== null;

let cached: { client: S3Client; bucket: string; ready: Promise<void> } | null = null;

function handle() {
  const cfg = readConfig();
  if (!cfg) return null;
  if (!cached) {
    const client = new S3Client({
      endpoint: cfg.endpoint,
      region: cfg.region,
      forcePathStyle: true,
      credentials: { accessKeyId: cfg.accessKey, secretAccessKey: cfg.secretKey },
    });
    // Create the bucket once if it is missing, so a fresh storage container works without manual steps.
    const ready = client
      .send(new HeadBucketCommand({ Bucket: cfg.bucket }))
      .then(() => undefined)
      .catch(() => client.send(new CreateBucketCommand({ Bucket: cfg.bucket })).then(() => undefined))
      .catch((e) => {
        cached = null; // retry on the next call
        throw e;
      });
    cached = { client, bucket: cfg.bucket, ready };
  }
  return cached;
}

/** Stores bytes under `key`. Throws when storage is not configured or unreachable. */
export async function putObject(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const h = handle();
  if (!h) throw new Error("Object storage is not configured.");
  await h.ready;
  await h.client.send(new PutObjectCommand({ Bucket: h.bucket, Key: key, Body: bytes, ContentType: contentType, ContentLength: bytes.length }));
}

/** Reads an object, or null when it does not exist or storage is unavailable. */
export async function getObject(key: string): Promise<Uint8Array | null> {
  const h = handle();
  if (!h) return null;
  try {
    await h.ready;
    const out = await h.client.send(new GetObjectCommand({ Bucket: h.bucket, Key: key }));
    return out.Body ? await out.Body.transformToByteArray() : null;
  } catch {
    return null;
  }
}

/** Best-effort delete; a missing object or an unreachable server is not an error for the caller. */
export async function deleteObject(key: string | null | undefined): Promise<void> {
  const h = key ? handle() : null;
  if (!h || !key) return;
  try {
    await h.ready;
    await h.client.send(new DeleteObjectCommand({ Bucket: h.bucket, Key: key }));
  } catch {
    /* orphaned objects are harmless; they are never served without a database row pointing at them */
  }
}
