import "server-only";
import { randomUUID } from "node:crypto";
import { putObject, storageConfigured } from "../media/storage";
import type { ImageType } from "../media/sniff";

export type StoredBannerImage = { imageType: ImageType; imageData: Uint8Array<ArrayBuffer> | null; imageKey: string | null };

/**
 * Where a banner picture goes: the private object storage when it is configured, otherwise the database (as before).
 * "unavailable" means storage is configured but could not be written to, so nothing was saved.
 */
export async function storeBannerImage(image: { type: ImageType; bytes: Uint8Array }): Promise<StoredBannerImage | "unavailable"> {
  if (!storageConfigured()) return { imageType: image.type, imageData: new Uint8Array(image.bytes), imageKey: null };
  const imageKey = `banners/${randomUUID()}`;
  try {
    await putObject(imageKey, image.bytes, image.type);
  } catch {
    return "unavailable";
  }
  return { imageType: image.type, imageData: null, imageKey };
}
