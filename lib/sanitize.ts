/**
 * Input limits and live filters for typed fields. The numbers match
 * app/Support/InputRules.php on the server, which has the final say; these only
 * stop the rider from typing something the server would refuse.
 */
export const LIMITS = {
  name: 50,
  username: 30,
  email: 100,
  phone: 16, // "+63 917 123 4567"
  relationship: 30,
  street: 150,
  password: 64,
  login: 100,
  search: 100,
} as const;

/**
 * "Any letter" patterns. Built at runtime so an engine without Unicode
 * property support falls back to Latin letters with accents (ñ, é, …)
 * instead of failing to load the screen.
 */
function letterPattern(unicode: string, fallback: string): RegExp {
  try {
    return new RegExp(unicode, 'gu');
  } catch {
    return new RegExp(fallback, 'g');
  }
}

const LATIN = 'A-Za-z\\u00C0-\\u024F';
const NOT_NAME_CHAR         = letterPattern("[^\\p{L}\\s.'-]", `[^${LATIN}\\s.'-]`);
const NOT_CONTACT_NAME_CHAR = letterPattern("[^\\p{L}\\p{N}\\s.'()-]", `[^${LATIN}0-9\\s.'()-]`);
const NOT_RELATIONSHIP_CHAR = letterPattern("[^\\p{L}\\s'-]", `[^${LATIN}\\s'-]`);

export function sanitizeText(input: string): string {
    if (!input) return '';
    return input.trim().replace(/<[^>]*>?/gm, '');
}

/** Letters, numbers and underscores (usernames). */
export function sanitizeAlphanumeric(input: string): string {
    if (!input) return '';
    return input.trimStart().replace(/[^a-zA-Z0-9_]/g, '');
}

/** A person's name while typing: letters (any language), spaces, period, apostrophe, hyphen. */
export function sanitizeName(input: string): string {
  if (!input) return '';
  return input.replace(NOT_NAME_CHAR, '').replace(/\s{2,}/g, ' ').trimStart().slice(0, LIMITS.name);
}

/** An emergency contact's name: like a person's name, plus numbers and brackets ("Kuya Ben (Work)"). */
export function sanitizeContactName(input: string): string {
  if (!input) return '';
  return input.replace(NOT_CONTACT_NAME_CHAR, '').replace(/\s{2,}/g, ' ').trimStart().slice(0, LIMITS.name);
}

/** A relationship ("Mother", "Brother-in-law"): letters, spaces, apostrophe, hyphen. */
export function sanitizeRelationship(input: string): string {
  if (!input) return '';
  return input.replace(NOT_RELATIONSHIP_CHAR, '').replace(/\s{2,}/g, ' ').trimStart().slice(0, LIMITS.relationship);
}

/**
 * A Philippine mobile number while typing: digits, a leading +, spaces and
 * hyphens. The server turns 0917…, 917… and +63917… into +639171234567.
 */
export function sanitizePhone(input: string): string {
  if (!input) return '';
  const kept = input.replace(/[^\d+\s-]/g, '');
  const plus = kept.trimStart().startsWith('+') ? '+' : '';
  return (plus + kept.replace(/\+/g, '')).trimStart().slice(0, LIMITS.phone);
}

/** The new-password checklist shown under the field (same rules as the server). */
export function passwordChecks(password: string): { label: string; met: boolean }[] {
  return [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'At least one uppercase letter', met: /[A-Z]/.test(password) },
    { label: 'At least one lowercase letter', met: /[a-z]/.test(password) },
  ];
}

/** True when every item on the checklist is met. */
export function isStrongPassword(password: string): boolean {
  return password.length <= LIMITS.password && passwordChecks(password).every((c) => c.met);
}
