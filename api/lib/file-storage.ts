/**
 * Local File Storage Service
 *
 * Lightweight secure file management for:
 * - Payment proofs
 * - Expense receipts
 * - Deposit receipts
 * - Passport uploads
 * - Invoice attachments
 *
 * Features:
 * - Tenant-isolated directories
 * - UUID-based filenames (no original filename exposure)
 * - MIME type whitelist validation
 * - File size limits
 * - Audit tracking via documents table
 */

import { randomUUID } from "crypto";
import { mkdir, writeFile, readFile, access, unlink } from "fs/promises";
import { join } from "path";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

/** Whitelisted MIME types for uploads */
export const ALLOWED_MIME_TYPES = [
  // Images
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  // Documents
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
  // Archives (lightweight)
  "application/zip",
];

/** Max file size: 10 MB */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

export interface StoredFile {
  id: string;
  originalName: string;
  storedName: string;
  mimeType: string;
  size: number;
  relativePath: string;
  absolutePath: string;
  url: string;
}

/**
 * Ensures the upload directory exists.
 */
export async function ensureUploadDir(): Promise<void> {
  await mkdir(UPLOAD_DIR, { recursive: true });
}

/**
 * Validates a file before storage.
 */
export function validateFile(file: { type: string; size: number }): { valid: boolean; error?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return { valid: false, error: `File too large. Max size is ${MAX_FILE_SIZE / 1024 / 1024}MB.` };
  }
  if (!ALLOWED_MIME_TYPES.includes(file.type)) {
    return { valid: false, error: `File type "${file.type}" not allowed.` };
  }
  return { valid: true };
}

/**
 * Stores a file on disk with tenant isolation.
 */
export async function storeFile(
  buffer: Buffer,
  opts: {
    tenantId: number;
    entityType: string;
    originalName: string;
    mimeType: string;
  }
): Promise<StoredFile> {
  await ensureUploadDir();

  const id = randomUUID();
  const ext = opts.originalName.split(".").pop()?.toLowerCase() || "bin";
  const storedName = `${id}.${ext}`;
  const relativePath = join(String(opts.tenantId), opts.entityType, storedName);
  const absolutePath = join(UPLOAD_DIR, relativePath);

  // Ensure tenant/entity subdirectory exists
  await mkdir(join(UPLOAD_DIR, String(opts.tenantId), opts.entityType), { recursive: true });

  await writeFile(absolutePath, buffer);

  return {
    id,
    originalName: opts.originalName,
    storedName,
    mimeType: opts.mimeType,
    size: buffer.length,
    relativePath,
    absolutePath,
    url: `/api/files/${opts.tenantId}/${id}/${storedName}`,
  };
}

/**
 * Reads a stored file from disk.
 */
export async function readStoredFile(path: string): Promise<Buffer> {
  const absolutePath = join(UPLOAD_DIR, path);
  return readFile(absolutePath);
}

/**
 * Checks if a stored file exists.
 */
export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(join(UPLOAD_DIR, path));
    return true;
  } catch {
    return false;
  }
}

/**
 * Deletes a stored file from disk.
 */
export async function deleteStoredFile(path: string): Promise<void> {
  try {
    await unlink(join(UPLOAD_DIR, path));
  } catch {
    // File may not exist — ignore
  }
}
