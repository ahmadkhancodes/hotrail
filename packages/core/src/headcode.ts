// Four character headcode, railway style: digit, letter, digit, digit (e.g. 2K47).
// Letters skip I, O, Q, S, Z to avoid confusion with digits.
const LETTERS = "ABCDEFGHJKLMNPRTUVWXY"; // 21 letters

export const HEADCODE_SPACE = 9 * LETTERS.length * 100; // first digit 1..9

/** Deterministic headcode for the nth bundle of an app (n starts at 0). Wraps after HEADCODE_SPACE. */
export function headcodeForIndex(n: number): string {
  if (!Number.isInteger(n) || n < 0) throw new Error("index must be a non negative integer");
  const i = n % HEADCODE_SPACE;
  const num = i % 100;
  const rest = Math.floor(i / 100);
  const letter = LETTERS[rest % LETTERS.length]!;
  const digit = 1 + Math.floor(rest / LETTERS.length);
  return `${digit}${letter}${String(num).padStart(2, "0")}`;
}

export function isHeadcode(s: string): boolean {
  return /^[1-9][A-HJ-NPR-UVWXY][0-9]{2}$/.test(s);
}
