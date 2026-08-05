import "server-only";

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";

const bucketName = "driver-documents";
const maxFileSize = 10 * 1024 * 1024;
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export type FleetFileUploadResult =
  | {
      success: true;
      path: string;
      fileName: string;
      mimeType: string;
    }
  | {
      success: false;
      code: "document_invalid" | "upload_failed" | "configuration_error";
    };

export async function uploadFleetOperatingCard({
  file,
  organizationId,
  vehicleId,
}: {
  file: File;
  organizationId: string;
  vehicleId: string;
}): Promise<FleetFileUploadResult> {
  if (!isValidFleetFile(file)) {
    return { success: false, code: "document_invalid" };
  }

  try {
    const admin = createAdminClient();
    const path = buildFleetOperatingCardPath({ organizationId, vehicleId, file });
    const { error } = await admin.storage.from(bucketName).upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

    if (error) {
      return { success: false, code: "upload_failed" };
    }

    return {
      success: true,
      path,
      fileName: getSafeDownloadName(file.name),
      mimeType: file.type,
    };
  } catch {
    return { success: false, code: "configuration_error" };
  }
}

export async function deleteFleetFiles(paths: string[]) {
  if (paths.length === 0) return;

  try {
    const admin = createAdminClient();
    await admin.storage.from(bucketName).remove(paths);
  } catch {
    // Best effort only.
  }
}

export async function createFleetFileDownloadSignedUrl(
  path: string,
  fileName: string,
) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(bucketName)
      .createSignedUrl(path, 300, {
        download: getSafeDownloadName(fileName),
      });

    if (error) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}

export function isValidFleetFile(file: File) {
  return file.size > 0 && file.size <= maxFileSize && allowedMimeTypes.has(file.type);
}

function buildFleetOperatingCardPath({
  organizationId,
  vehicleId,
  file,
}: {
  organizationId: string;
  vehicleId: string;
  file: File;
}) {
  return `fleet/${organizationId}/${vehicleId}/operating-card/${randomUUID()}${getSafeExtension(file)}`;
}

function getSafeExtension(file: File) {
  switch (file.type) {
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/webp":
      return ".webp";
    case "application/pdf":
      return ".pdf";
    default:
      return "";
  }
}

function getSafeDownloadName(fileName: string) {
  const trimmed = fileName.trim();
  return (trimmed || "fleet-file").replace(/[\\/:*?"<>|]+/g, "-");
}
