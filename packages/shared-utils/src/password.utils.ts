/**
 * password.utils.ts
 *
 * Temporary-password generation for the admin-driven password-reset workflow.
 *
 * ARCH-DECISION: Lives in shared-utils (not a single service) because BOTH
 * user-service (reset orchestration) and any future CLI/seed tooling need an
 * identical, policy-compliant generator. Uses node:crypto for CSPRNG randomness
 * — never Math.random, which is not cryptographically secure.
 */
import { randomInt } from 'node:crypto';

// Unambiguous character sets — 'l', 'I', 'O', '0', '1' are intentionally omitted
// so a human copying a temporary password off a screen cannot confuse characters.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWER = 'abcdefghijkmnpqrstuvwxyz';
const DIGIT = '23456789';
const SYMBOL = '!@#$%&*?';
const ALL = UPPER + LOWER + DIGIT + SYMBOL;

function pick(set: string): string {
  return set[randomInt(set.length)];
}

/**
 * Generate a cryptographically-random temporary password that satisfies a
 * standard complexity policy: >= `length` chars, and at least one upper, one
 * lower, one digit and one symbol. Default length 12.
 *
 * The result is shown to the admin ONCE (and/or emailed) and never stored in
 * plaintext — only its bcrypt hash is persisted, exactly like a normal password.
 */
export function generateTempPassword(length = 12): string {
  const min = Math.max(length, 10);
  // Guarantee one of each required class, then fill the rest from the full set.
  const required = [pick(UPPER), pick(LOWER), pick(DIGIT), pick(SYMBOL)];
  const rest: string[] = [];
  for (let i = required.length; i < min; i++) rest.push(pick(ALL));

  // Fisher–Yates shuffle so the guaranteed chars are not always in positions 0-3.
  const chars = [...required, ...rest];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}
