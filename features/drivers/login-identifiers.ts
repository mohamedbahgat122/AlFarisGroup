import "server-only";

export function normalizeIqamaLoginIdentifier(value: string | null | undefined) {
  const trimmed = value?.trim();

  if (!trimmed) {
    return null;
  }

  let normalized = "";

  for (const char of trimmed) {
    const digit = toAsciiDigit(char);

    if (digit !== null) {
      normalized += digit;
      continue;
    }

    if (/[\s._-]/u.test(char)) {
      continue;
    }

    return null;
  }

  return /^[0-9]{10}$/.test(normalized) ? normalized : null;
}

export function maskLoginIdentifier(value: string | null | undefined) {
  const normalized = normalizeIqamaLoginIdentifier(value);

  return normalized ? `******${normalized.slice(-4)}` : null;
}

function toAsciiDigit(char: string) {
  const codePoint = char.codePointAt(0);

  if (codePoint === undefined) {
    return null;
  }

  if (codePoint >= 0x30 && codePoint <= 0x39) {
    return String(codePoint - 0x30);
  }

  if (codePoint >= 0x660 && codePoint <= 0x669) {
    return String(codePoint - 0x660);
  }

  if (codePoint >= 0x6f0 && codePoint <= 0x6f9) {
    return String(codePoint - 0x6f0);
  }

  if (codePoint >= 0x9e6 && codePoint <= 0x9ef) {
    return String(codePoint - 0x9e6);
  }

  return null;
}
