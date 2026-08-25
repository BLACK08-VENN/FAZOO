import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import type { BUCKET_DAILY_LOG_PHOTOS, BUCKET_PROFILE_PHOTOS } from '@fazoo/config';
import { supabase } from './supabase';

export interface CapturedPhoto {
  uri: string;
  mimeType: string;
  /** Approximate size in bytes when the platform reports it. */
  fileSize: number | null;
}

export async function capturePhoto(frontFacing = false): Promise<CapturedPhoto | null> {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Camera permission is required for photos.');
  }

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: ['images'],
    quality: 0.7, // compress while keeping useful detail
    exif: false,
    cameraType: frontFacing ? ImagePicker.CameraType.front : ImagePicker.CameraType.back,
  });

  if (result.canceled || result.assets.length === 0) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    mimeType: asset.mimeType ?? 'image/jpeg',
    fileSize: asset.fileSize ?? null,
  };
}

/** Deterministic, private storage path: {org}/{user}/{request}-{slot}.jpg */
export function photoPath(
  orgId: string,
  userId: string,
  requestId: string,
  slot: string,
): string {
  return `${orgId}/${userId}/${requestId}-${slot}.jpg`;
}

/**
 * Upload with retry. Overwrites are idempotent, so a retried sync of an
 * offline operation can safely re-upload the same deterministic path.
 */
export async function uploadPhotoWithRetry(
  bucket: typeof BUCKET_PROFILE_PHOTOS | typeof BUCKET_DAILY_LOG_PHOTOS,
  path: string,
  photo: CapturedPhoto,
  attempts = 3,
): Promise<void> {
  return uploadUriWithRetry(bucket, path, photo.uri, photo.mimeType, attempts);
}

export async function uploadUriWithRetry(
  bucket: typeof BUCKET_PROFILE_PHOTOS | typeof BUCKET_DAILY_LOG_PHOTOS,
  path: string,
  uri: string,
  mimeType: string,
  attempts = 3,
): Promise<void> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const response = await fetch(uri);
      const blob = await response.blob();
      const { error } = await supabase.storage.from(bucket).upload(path, blob, {
        contentType: mimeType,
        upsert: true,
      });
      if (error) throw error;
      return;
    } catch (err) {
      lastError = err;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Photo upload failed');
}

export async function persistPhoto(
  photo: CapturedPhoto,
  requestId: string,
  slot: string,
): Promise<string> {
  const directory = `${FileSystem.documentDirectory}pending-photos`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}/${requestId}-${slot}.jpg`;
  await FileSystem.copyAsync({ from: photo.uri, to: destination });
  return destination;
}
