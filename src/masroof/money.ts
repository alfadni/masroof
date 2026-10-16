import { exponent } from "@/masroof/catalog";
import { toEasternDigits } from "@/masroof/dates";
import type { NumberFormat } from "@/masroof/types";

export const RATE_SCALE = 100_000_000n;
export const MAX_SAFE = 9_007_199_254_740_991n;

export type FormatPrefs = {
  numberFormat: NumberFormat;
  easternDigits: boolean;
};

export type AmountIssue = "empty" | "zero" | "negative" | "digits" | "bad";

export function divRound(n: bigint, d: bigint): bigint {
  if (d === 0n) throw new Error("divide by zero");
  const neg = (n < 0n) !== (d < 0n);
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = an / ad;
  const r = an % ad;
  const rounded = r * 2n >= ad ? q + 1n : q;
  return neg ? -rounded : rounded;
}

const DEC_SCALE = 8;
const DEC = 100_000_000n;

export function parseDecimalToken(token: string): bigint | null {
  const normalized = token.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  const [whole, frac = ""] = normalized.split(".");
  const digits = `${whole}${frac}`.replace(/^0+(?=\d)/, "");
  if (digits.length > 15) return null;
  const fracFixed = `${frac}00000000`.slice(0, DEC_SCALE);
  try {
    return BigInt(whole || "0") * DEC + BigInt(fracFixed || "0");
  } catch {
    return null;
  }
}

export function decimalToE8(input: string): string | null {
  const value = parseDecimalToken(input.trim());
  if (value == null || value <= 0n) return null;
  return value.toString();
}

export function e8ToDecimal(e8: string): string {
  const n = BigInt(e8);
  const neg = n < 0n;
  const abs = neg ? -n : n;
  const whole = abs / DEC;
  let frac = (abs % DEC).toString().padStart(DEC_SCALE, "0").replace(/0+$/, "");
  const body = frac ? `${whole}.${frac}` : `${whole}`;
  return neg ? `-${body}` : body;
}

export function majorStringToMinor(input: string, currency: string): number | null {
  const dec = parseDecimalToken(input.trim());
  if (dec == null) return null;
  return decToMinor(dec, exponent(currency));
}

export function decToMinor(dec: bigint, exp: number): number | null {
  const minor = divRound(dec * 10n ** BigInt(exp), DEC);
  if (minor > MAX_SAFE || minor < -MAX_SAFE) return null;
  return Number(minor);
}

export function minorToDec(minor: number, exp: number): bigint {
  return divRound(BigInt(minor) * DEC, 10n ** BigInt(exp));
}

type Tok = { k: "n"; v: bigint } | { k: "op"; v: "+" | "-" | "*" | "/" };

function tokenize(expr: string): Tok[] | null {
  const src = expr.replace(/×/g, "*").replace(/÷/g, "/").replace(/\s+/g, "");
  if (!src) return null;
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i] ?? "";
    if (ch === "+" || ch === "-" || ch === "*" || ch === "/") {
      out.push({ k: "op", v: ch });
      i += 1;
      continue;
    }
    const m = /^(\d+(?:[.,]\d+)?)/.exec(src.slice(i));
    if (!m) return null;
    const n = parseDecimalToken(m[1] ?? "");
    if (n == null) return null;
    out.push({ k: "n", v: n });
    i += m[1]?.length ?? 0;
  }
  return out;
}

export function evaluateExpression(expr: string): { ok: true; dec: bigint } | { ok: false } {
  const tokens = tokenize(expr);
  if (!tokens || tokens.length === 0) return { ok: false };
  if (tokens[0]?.k !== "n") return { ok: false };
  if (tokens[tokens.length - 1]?.k !== "n") return { ok: false };
  for (let i = 1; i < tokens.length; i += 1) {
    if (tokens[i]?.k === tokens[i - 1]?.k) return { ok: false };
  }
  const factors: { v: bigint; op: "+" | "-" }[] = [];
  let current = 0n;
  let pending: "+" | "-" = "+";
  let mulOp: "*" | "/" | null = null;
  for (const tok of tokens) {
    if (tok.k === "op") {
      if (tok.v === "+" || tok.v === "-") {
        factors.push({ v: current, op: pending });
        pending = tok.v;
        current = 0n;
        mulOp = null;
      } else {
        mulOp = tok.v;
      }
      continue;
    }
    if (mulOp === "*") current = divRound(current * tok.v, DEC);
    else if (mulOp === "/") {
      if (tok.v === 0n) return { ok: false };
      current = divRound(current * DEC, tok.v);
    } else current = tok.v;
    mulOp = null;
  }
  factors.push({ v: current, op: pending });
  let total = 0n;
  for (const part of factors) total += part.op === "-" ? -part.v : part.v;
  return { ok: true, dec: total };
}

export function expressionToMinor(expr: string, currency: string): { ok: true; minor: number } | { ok: false; issue: AmountIssue } {
  const trimmed = expr.trim();
  if (!trimmed) return { ok: false, issue: "empty" };
  const evaluated = evaluateExpression(trimmed);
  if (!evaluated.ok) return { ok: false, issue: "bad" };
  if (evaluated.dec < 0n) return { ok: false, issue: "negative" };
  if (evaluated.dec === 0n) return { ok: false, issue: "zero" };
  const minor = decToMinor(evaluated.dec, exponent(currency));
  if (minor == null) return { ok: false, issue: "digits" };
  if (minor <= 0) return { ok: false, issue: minor < 0 ? "negative" : "zero" };
  return { ok: true, minor };
}

export function convertMinor(amountMinor: number, fromExp: number, toExp: number, rateE8: bigint): number | null {
  if (rateE8 <= 0n) return null;
  const num = BigInt(amountMinor) * rateE8 * 10n ** BigInt(toExp);
  const den = 10n ** BigInt(fromExp) * RATE_SCALE;
  const minor = divRound(num, den);
  if (minor > MAX_SAFE || minor < -MAX_SAFE) return null;
  return Number(minor);
}

export function deriveRateE8(fromMinor: number, fromExp: number, toMinor: number, toExp: number): string | null {
  if (fromMinor === 0) return null;
  const num = BigInt(toMinor) * RATE_SCALE * 10n ** BigInt(fromExp);
  const den = BigInt(fromMinor) * 10n ** BigInt(toExp);
  const rate = divRound(num, den);
  if (rate <= 0n) return null;
  return rate.toString();
}

function separators(format: NumberFormat): { group: string; decimal: string } {
  if (format === "dot") return { group: ".", decimal: "," };
  if (format === "space") return { group: " ", decimal: "." };
  return { group: ",", decimal: "." };
}

export function formatMinor(minor: number, currency: string, prefs: FormatPrefs, withCode = true): string {
  const exp = exponent(currency);
  const neg = minor < 0;
  const abs = Math.abs(minor);
  const scale = 10 ** exp;
  const whole = Math.floor(abs / scale);
  const frac = exp === 0 ? "" : String(abs % scale).padStart(exp, "0");
  const { group, decimal } = separators(prefs.numberFormat);
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, group);
  let body = exp === 0 ? grouped : `${grouped}${decimal}${frac}`;
  if (neg) body = `−${body}`;
  if (prefs.easternDigits) body = toEasternDigits(body);
  return withCode ? `${body} ${currency}` : body;
}

export function minorToInput(minor: number, currency: string, format: NumberFormat): string {
  const exp = exponent(currency);
  const scale = 10 ** exp;
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / scale);
  if (exp === 0) return String(whole);
  const frac = String(abs % scale).padStart(exp, "0").replace(/0+$/, "");
  const decimal = format === "dot" ? "," : ".";
  return frac ? `${whole}${decimal}${frac}` : String(whole);
}

export function signedLabel(kind: "income" | "expense" | "transfer" | "plain", formatted: string): string {
  if (kind === "income") return `+ ${formatted}`;
  if (kind === "expense") return `− ${formatted}`;
  if (kind === "transfer") return `↔ ${formatted}`;
  return formatted;
}

export function formatLockout(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  if (m <= 0) return `${s}s`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function lockoutDelayMs(attempts: number): number {
  if (attempts < 5) return 0;
  const table = [30, 60, 300, 900, 1800, 3600, 7200, 14400];
  const idx = Math.min(table.length - 1, attempts - 5);
  return (table[idx] ?? 30) * 1000;
}
