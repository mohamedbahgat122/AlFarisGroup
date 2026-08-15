import { housingStatuses, type HousingRoomInput, type HousingStatus, type HousingUnitInput } from "@/features/housing/types";

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isHousingStatus(value: string): value is HousingStatus {
  return (housingStatuses as readonly string[]).includes(value);
}

export function isUuid(value: string) {
  return uuidPattern.test(value);
}

export function normalizeHousingInput(input: {
  name: string;
  code: string;
  address: string;
  city: string;
  locationNotes: string;
  latitude: string;
  longitude: string;
  capacity: string;
  status: string;
  notes: string;
}):
  | { valid: true; input: HousingUnitInput }
  | { valid: false; fields: string[] } {
  const fields: string[] = [];
  const name = input.name.trim();
  const code = normalizeOptionalText(input.code, 60);
  const capacity = Number(input.capacity);
  const status = isHousingStatus(input.status) ? input.status : null;
  const latitude = parseCoordinate(input.latitude, -90, 90);
  const longitude = parseCoordinate(input.longitude, -180, 180);

  if (!name || name.length > 160) fields.push("name");
  if (code && !/^[A-Za-z0-9_-]{1,60}$/.test(code)) fields.push("code");
  if (!Number.isInteger(capacity) || capacity <= 0) fields.push("capacity");
  if (!status) fields.push("status");
  if (!latitude.valid) fields.push("latitude");
  if (!longitude.valid) fields.push("longitude");
  if ((latitude.value === null) !== (longitude.value === null)) {
    fields.push(latitude.value === null ? "latitude" : "longitude");
  }

  if (fields.length > 0 || !status) {
    return { valid: false, fields };
  }

  return {
    valid: true,
    input: {
      name,
      code,
      address: normalizeOptionalText(input.address, 300),
      city: normalizeOptionalText(input.city, 120),
      locationNotes: normalizeOptionalText(input.locationNotes, 500),
      latitude: latitude.value,
      longitude: longitude.value,
      capacity,
      status,
      notes: normalizeOptionalText(input.notes, 1000),
    },
  };
}

export function normalizeHousingRoomInput(input: {
  name: string;
  code: string;
  capacity: string;
  status: string;
  notes: string;
}):
  | { valid: true; input: HousingRoomInput }
  | { valid: false; fields: string[] } {
  const fields: string[] = [];
  const name = input.name.trim();
  const code = normalizeOptionalText(input.code, 60);
  const capacity = Number(input.capacity);
  const status = isHousingStatus(input.status) ? input.status : null;

  if (!name || name.length > 120) fields.push("name");
  if (code && !/^[A-Za-z0-9_-]{1,60}$/.test(code)) fields.push("code");
  if (!Number.isInteger(capacity) || capacity <= 0) fields.push("capacity");
  if (!status) fields.push("status");

  if (fields.length > 0 || !status) {
    return { valid: false, fields };
  }

  return {
    valid: true,
    input: {
      name,
      code,
      capacity,
      status,
      notes: normalizeOptionalText(input.notes, 1000),
    },
  };
}

export function normalizeOptionalText(value: string, maxLength: number) {
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : null;
}

function parseCoordinate(value: string, min: number, max: number):
  | { valid: true; value: number | null }
  | { valid: false; value: null } {
  const trimmed = value.trim();
  if (!trimmed) return { valid: true, value: null };

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    return { valid: false, value: null };
  }

  return { valid: true, value: parsed };
}
