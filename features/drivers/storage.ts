import "server-only";

import { randomUUID } from "crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  DriverDocumentType,
  DriverDocumentUploadMetadata,
} from "@/features/drivers/types";

const bucketName = "driver-documents";
const maxFileSize = 10 * 1024 * 1024;
const allowedImageMimeTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

type UploadResult =
  | {
      success: true;
      metadata: DriverDocumentUploadMetadata;
    }
  | {
      success: false;
      code: "document_invalid" | "upload_failed" | "configuration_error";
      uploadedPath?: string;
      message?: string;
      details?: string;
      hint?: string;
    };

type DriverAssetCategory = "profile-photo" | "operating-card";

type AssetUploadResult =
  | {
      success: true;
      path: string;
    }
  | {
      success: false;
      code: "document_invalid" | "upload_failed" | "configuration_error";
      uploadedPath?: string;
      message?: string;
      details?: string;
      hint?: string;
    };

export async function uploadDriverDocument({
  file,
  organizationId,
  driverId,
  documentType,
}: {
  file: File;
  organizationId: string;
  driverId: string;
  documentType: DriverDocumentType;
}): Promise<UploadResult> {
  if (!isValidDriverFile(file)) {
    return { success: false, code: "document_invalid" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { success: false, code: "configuration_error" };
  }

  const path = buildStoragePath({
    organizationId,
    driverId,
    documentType,
    file,
  });
  const { error } = await admin.storage
    .from(bucketName)
    .upload(path, file, {
      contentType: file.type,
      upsert: false,
    });

  if (error) {
    return {
      success: false,
      code: "upload_failed",
      uploadedPath: path,
      message: error.message,
    };
  }

  return {
    success: true,
    metadata: {
      document_type: documentType,
      storage_path: path,
      original_filename: file.name,
      mime_type: file.type,
      size_bytes: file.size,
    },
  };
}

export async function uploadDriverAsset({
  file,
  organizationId,
  driverId,
  category,
}: {
  file: File;
  organizationId: string;
  driverId: string;
  category: DriverAssetCategory;
}): Promise<AssetUploadResult> {
  const valid =
    category === "profile-photo"
      ? isValidDriverImageFile(file)
      : isValidDriverFile(file);

  if (!valid) {
    return { success: false, code: "document_invalid" };
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return { success: false, code: "configuration_error" };
  }

  const path = buildAssetStoragePath({
    organizationId,
    driverId,
    category,
    file,
  });
  const { error } = await admin.storage.from(bucketName).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });

  if (error) {
    return {
      success: false,
      code: "upload_failed",
      uploadedPath: path,
      message: error.message,
    };
  }

  return { success: true, path };
}

export async function deleteDriverDocuments(paths: string[]) {
  if (paths.length === 0) {
    return;
  }

  try {
    const admin = createAdminClient();
    await admin.storage.from(bucketName).remove(paths);
  } catch {
    // Best-effort cleanup only; never expose storage internals to the UI.
  }
}

export async function createDriverDocumentSignedUrl(path: string) {
  try {
    const admin = createAdminClient();
    const { data, error } = await admin.storage
      .from(bucketName)
      .createSignedUrl(path, 300);

    if (error) {
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}

export async function createDriverDocumentDownloadSignedUrl(
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

    if (error) {
      return null;
    }

    return data.signedUrl;
  } catch {
    return null;
  }
}

export function isValidDriverFile(file: File) {
  return (
    file.size > 0 &&
    file.size <= maxFileSize &&
    allowedMimeTypes.has(file.type)
  );
}

export function isValidDriverImageFile(file: File) {
  return (
    file.size > 0 &&
    file.size <= maxFileSize &&
    allowedImageMimeTypes.has(file.type)
  );
}

function buildStoragePath({
  organizationId,
  driverId,
  documentType,
  file,
}: {
  organizationId: string;
  driverId: string;
  documentType: DriverDocumentType;
  file: File;
}) {
  const directory =
    documentType === "driver_card"
      ? "driver-card"
      : documentType === "driving_license"
        ? "driving-license"
        : "iqama";
  const extension = getSafeExtension(file);

  return `${organizationId}/${driverId}/${directory}/${randomUUID()}${extension}`;
}

function buildAssetStoragePath({
  organizationId,
  driverId,
  category,
  file,
}: {
  organizationId: string;
  driverId: string;
  category: DriverAssetCategory;
  file: File;
}) {
  const extension = getSafeExtension(file);

  return `${organizationId}/${driverId}/${category}/${randomUUID()}${extension}`;
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

  if (!trimmed) {
    return "driver-file";
  }

  return trimmed.replace(/[\\/:*?"<>|]+/g, "-");
}
