/**
 * File Upload & Serving Handler
 *
 * Hono routes for multipart file uploads and secure file serving.
 * Integrated with the existing auth session cookie system.
 */

import type { Hono, Context } from "hono";
import { getDb } from "./queries/connection";
import { authenticateRequest } from "./kimi/auth";
import { documents } from "@db/schema";
import { eq, and } from "drizzle-orm";
import {
  storeFile,
  readStoredFile,
  validateFile,
  fileExists,
  deleteStoredFile,
} from "./lib/file-storage";

export function registerUploadRoutes(app: Hono<any>) {
  // ─── MULTIPART FILE UPLOAD ────────────────────────────────────────────────
  app.post("/api/upload", async (c) => {
    try {
      // Authenticate
      const user = await authenticateRequest(c.req.raw.headers);
      if (!user?.tenantId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const tenantId = user.tenantId;

      // Parse multipart body
      const body = await c.req.parseBody({ all: false });
      const file = body.file;

      if (!file || !(file instanceof File)) {
        return c.json({ error: "No file provided" }, 400);
      }

      // Validate
      const validation = validateFile({ type: file.type, size: file.size });
      if (!validation.valid) {
        return c.json({ error: validation.error }, 400);
      }

      // Extract metadata fields
      const entityType = String(body.entityType || "other");
      const entityId = Number(body.entityId || 0);
      const documentType = String(body.documentType || "attachment");
      const description = String(body.description || "");

      // Store file
      const buffer = Buffer.from(await file.arrayBuffer());
      const stored = await storeFile(buffer, {
        tenantId,
        entityType,
        originalName: file.name,
        mimeType: file.type,
      });

      // Record in documents table
      const db = getDb();
      const docResult = await db.insert(documents).values({
        tenantId,
        entityType: entityType as any,
        entityId,
        documentType: documentType as any,
        fileName: file.name,
        fileUrl: stored.relativePath,
        fileSize: stored.size,
        mimeType: file.type,
        status: "generated",
        generatedBy: user.id,
        generatedAt: new Date(),
        metadata: description ? { description } : null,
      });

      const documentId = Number(docResult[0].insertId);

      return c.json({
        success: true,
        documentId,
        fileName: file.name,
        url: `/api/files/${documentId}`,
        size: stored.size,
        mimeType: file.type,
      });
    } catch (err: any) {
      console.error("[upload] error:", err);
      return c.json({ error: err.message || "Upload failed" }, 500);
    }
  });

  // ─── SECURE FILE SERVING ──────────────────────────────────────────────────
  app.get("/api/files/:documentId", async (c) => {
    try {
      // Authenticate
      const user = await authenticateRequest(c.req.raw.headers);
      if (!user?.tenantId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const documentId = Number(c.req.param("documentId"));
      if (isNaN(documentId)) {
        return c.json({ error: "Invalid document ID" }, 400);
      }

      // Lookup document metadata
      const db = getDb();
      const doc = await db
        .select({
          fileUrl: documents.fileUrl,
          mimeType: documents.mimeType,
          fileName: documents.fileName,
          tenantId: documents.tenantId,
        })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!doc[0]) {
        return c.json({ error: "Not found" }, 404);
      }

      // Tenant isolation
      if (doc[0].tenantId !== user.tenantId) {
        return c.json({ error: "Forbidden" }, 403);
      }

      const filePath = doc[0].fileUrl;
      if (!filePath) {
        return c.json({ error: "File path missing" }, 404);
      }

      const exists = await fileExists(filePath);
      if (!exists) {
        return c.json({ error: "File not found on disk" }, 404);
      }

      const buffer = await readStoredFile(filePath);
      return c.body(new Uint8Array(buffer), 200, {
        "Content-Type": doc[0].mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${doc[0].fileName || "file"}"`,
        "Cache-Control": "private, max-age=3600",
      });
    } catch (err: any) {
      console.error("[files] error:", err);
      return c.json({ error: err.message || "Failed to serve file" }, 500);
    }
  });

  // ─── DELETE UPLOADED FILE ─────────────────────────────────────────────────
  app.delete("/api/files/:documentId", async (c) => {
    try {
      const user = await authenticateRequest(c.req.raw.headers);
      if (!user?.tenantId) {
        return c.json({ error: "Unauthorized" }, 401);
      }

      const documentId = Number(c.req.param("documentId"));
      if (isNaN(documentId)) {
        return c.json({ error: "Invalid document ID" }, 400);
      }

      const db = getDb();
      const doc = await db
        .select({ id: documents.id, fileUrl: documents.fileUrl, tenantId: documents.tenantId })
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);

      if (!doc[0]) {
        return c.json({ error: "Not found" }, 404);
      }

      if (doc[0].tenantId !== user.tenantId) {
        return c.json({ error: "Forbidden" }, 403);
      }

      if (doc[0].fileUrl) {
        await deleteStoredFile(doc[0].fileUrl);
      }
      await db.delete(documents).where(eq(documents.id, doc[0].id));

      return c.json({ success: true });
    } catch (err: any) {
      console.error("[files-delete] error:", err);
      return c.json({ error: err.message || "Delete failed" }, 500);
    }
  });
}
