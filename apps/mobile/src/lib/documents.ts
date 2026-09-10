import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import {
  BOOKLIST_DOCUMENT_MAX_BYTES,
  BOOKLIST_DOCUMENT_MIME_TYPES,
} from '@fazoo/config';
import { supabase } from './supabase';

export interface PickedDocument {
  uri: string;
  name: string;
  mimeType: string;
  fileSize: number | null;
}

const ACCEPTED: string[] = [...BOOKLIST_DOCUMENT_MIME_TYPES];

/**
 * Short-lived signed URL for a private document. Storage buckets stay private,
 * so this is the only way the BA opens a formatted Word file or a stamped copy.
 * The bucket is a plain string because documents report theirs from a text
 * column — the storage policies are the real guard, not the type.
 */
export async function signedDocumentUrl(
  bucket: string,
  path: string,
  seconds = 600,
): Promise<string> {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  if (error) {
    throw new Error('Could not open that document. Check your connection and try again.');
  }
  return data.signedUrl;
}

function extensionOf(name: string, mimeType: string): string {
  const fromName = /\.([a-z0-9]{2,5})$/i.exec(name.trim())?.[1]?.toLowerCase();
  if (fromName) return fromName;
  const fromMime = /\/([a-z0-9.+-]+)$/i.exec(mimeType)?.[1]?.toLowerCase();
  return fromMime === 'jpeg' ? 'jpg' : (fromMime ?? 'bin');
}

/**
 * Let the BA hand over whatever the school gave them — a PDF on their phone, a
 * Word file from email, or a scan. Photographs go through the camera instead.
 */
export async function pickBooklistFile(): Promise<PickedDocument | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: ACCEPTED,
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;

  // The picker already filters by ACCEPTED, but Android reports perfectly good
  // files as octet-stream. Only reject a type we can positively identify, so a
  // BA is never turned away at the gate by a false rejection.
  const mimeType = asset.mimeType ?? 'application/octet-stream';
  if (mimeType !== 'application/octet-stream' && !ACCEPTED.includes(mimeType)) {
    throw new Error('That file type is not supported. Use a photo, PDF, Word or image file.');
  }

  const size = asset.size ?? null;
  if (size !== null && size > BOOKLIST_DOCUMENT_MAX_BYTES) {
    throw new Error(
      `That file is ${(size / 1024 / 1024).toFixed(1)} MB — the limit is ${BOOKLIST_DOCUMENT_MAX_BYTES / 1024 / 1024} MB. Photograph the pages instead.`,
    );
  }

  return { uri: asset.uri, name: asset.name, mimeType, fileSize: size };
}

/** Deterministic private path: {org}/{user}/{request}-{slot}.{ext} */
export function documentPath(
  orgId: string,
  userId: string,
  requestId: string,
  slot: string,
  fileName: string,
  mimeType: string,
): string {
  return `${orgId}/${userId}/${requestId}-${slot}.${extensionOf(fileName, mimeType)}`;
}

/** Copy into app-private storage so a queued upload survives the picker's
 *  cache being cleared before the device comes back online. */
export async function persistDocument(
  document: PickedDocument,
  requestId: string,
  slot: string,
): Promise<string> {
  const directory = `${FileSystem.documentDirectory}pending-docs`;
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const destination = `${directory}/${requestId}-${slot}.${extensionOf(document.name, document.mimeType)}`;
  await FileSystem.copyAsync({ from: document.uri, to: destination });
  return destination;
}
