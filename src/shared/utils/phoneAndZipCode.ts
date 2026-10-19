/**
 * Canonical formatting and sanitization utilities for Phone and CEP (PH-056).
 * Ensures display has standard Brazilian formatting while database storage
 * strictly retains pure numeric digits for WhatsApp (wa.me) compatibility.
 */

export function cleanDigits(value: string | null | undefined): string {
  return (value || '').replace(/\D/g, '');
}

export function cleanPhoneDigits(value: string | null | undefined): string {
  return cleanDigits(value);
}

export function cleanCepDigits(value: string | null | undefined): string {
  return cleanDigits(value).slice(0, 8);
}

/**
 * Applies progressive masking to telephone inputs while typing or displays formatted numbers.
 * Supports:
 * - 8-digit fixed lines: (15) 3221-4411
 * - 9-digit mobile phones: (15) 99742-4411
 * - International numbers starting with 55: +55 (15) 99742-4411
 * - Legacy numbers without DDD (8 or 9 digits): 3221-4411 / 99742-4411
 */
export function formatPhone(value: string | null | undefined): string {
  if (!value) return '';
  const str = String(value);
  const d = cleanDigits(str);
  if (!d) return '';

  // International format (+55)
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) {
    if (d.length === 12) {
      return `+55 (${d.slice(2, 4)}) ${d.slice(4, 8)}-${d.slice(8)}`;
    }
    return `+55 (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9, 13)}`;
  }

  // Legacy numbers without area code (DDD): 8 digits (fixed line) or 9 digits (mobile)
  // Only apply when the string does not have an area code prefix '('
  if (!str.includes('(') && (d.length === 8 || d.length === 9)) {
    if (d.length === 8) {
      return `${d.slice(0, 4)}-${d.slice(4, 8)}`;
    }
    return `${d.slice(0, 5)}-${d.slice(5, 9)}`;
  }

  // Standard progressive masking with area code (DDD)
  if (d.length <= 2) {
    return `(${d}`;
  }
  if (d.length <= 6) {
    return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  }
  if (d.length <= 10) {
    return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  }
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7, 11)}`;
}

/**
 * Applies progressive masking to CEP inputs while typing or formats legacy CEP strings.
 * Formats: 00000-000
 */
export function formatCep(value: string | null | undefined): string {
  if (!value) return '';
  const d = cleanCepDigits(value);
  if (!d) return '';
  if (d.length <= 5) {
    return d;
  }
  return `${d.slice(0, 5)}-${d.slice(5, 8)}`;
}
