/** D1-native authentication primitives. New passwords use PBKDF2-SHA256; legacy
 * bcrypt hashes are accepted only for a successful, single-user upgrade. */
import { compare as bcryptCompare } from "bcryptjs";
import { pbkdf2Async } from "@noble/hashes/pbkdf2.js";
import { sha256 } from "@noble/hashes/sha2.js";

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results?: T[] }>;
  run(): Promise<unknown>;
}
export interface D1Database {
  prepare(sql: string): D1Statement;
  batch<T = unknown>(statements: D1Statement[]): Promise<T[]>;
}
type Credential = {
  user_id: string;
  email: string;
  password_hash: string;
  email_verified_at: string | null;
  disabled_at: string | null;
};

const encoder = new TextEncoder();
const SESSION_SECONDS = 60 * 60 * 24 * 30;
const RESET_SECONDS = 60 * 60;
const VERIFY_SECONDS = 60 * 60 * 24;
const RATE_WINDOW_SECONDS = 15 * 60;
const RATE_ATTEMPTS = 8;

function bytesToHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}
function hexToBytes(hex: string): Uint8Array<ArrayBuffer> {
  return new Uint8Array(hex.match(/.{2}/g)?.map((x) => Number.parseInt(x, 16)) ?? []);
}
function randomToken(size = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(size));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
async function digest(value: string): Promise<string> {
  return bytesToHex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

export async function hashPassword(password: string, iterations = 310_000): Promise<string> {
  if (password.length < 10 || password.length > 256) throw new Error("PASSWORD_POLICY");
  return derivePasswordHash(password, iterations);
}

// Rehashing an already verified legacy password preserves its identity. Only
// registration/password changes enforce the new-password minimum length.
async function derivePasswordBytes(
  password: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<Uint8Array> {
  if (!Number.isInteger(iterations) || iterations < 100_000 || iterations > 1_000_000)
    throw new Error("PASSWORD_HASH_PARAMETERS");
  const input = encoder.encode(password);
  try {
    const key = await crypto.subtle.importKey("raw", input, "PBKDF2", false, ["deriveBits"]);
    try {
      return new Uint8Array(
        await crypto.subtle.deriveBits(
          { name: "PBKDF2", hash: "SHA-256", salt, iterations },
          key,
          256,
        ),
      );
    } catch (error) {
      // Cloudflare rejects native PBKDF2 above 100,000 iterations. Use the same
      // standard algorithm and work factor; other runtime failures remain fatal.
      if (!(error instanceof Error) || error.name !== "NotSupportedError") throw error;
      return await pbkdf2Async(sha256, input, salt, { c: iterations, dkLen: 32 });
    }
  } finally {
    input.fill(0);
  }
}

export async function derivePasswordHash(password: string, iterations = 310_000): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const result = await derivePasswordBytes(password, salt, iterations);
  return `pbkdf2-sha256$${iterations}$${bytesToHex(salt)}$${bytesToHex(result)}`;
}

export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  if (
    typeof password !== "string" ||
    password.length > 256 ||
    typeof encoded !== "string" ||
    encoded.length > 512
  )
    return false;
  if (/^\$2[aby]\$(0[4-9]|1[0-5])\$[./A-Za-z0-9]{53}$/.test(encoded)) {
    try {
      return await bcryptCompare(password, encoded);
    } catch {
      return false;
    }
  }
  const [algorithm, iterationText, saltHex, expectedHex, extra] = encoded.split("$");
  const iterations = Number(iterationText);
  if (
    algorithm !== "pbkdf2-sha256" ||
    extra !== undefined ||
    !Number.isInteger(iterations) ||
    iterations < 100_000 ||
    iterations > 1_000_000 ||
    !/^[0-9a-f]{32}$/.test(saltHex ?? "") ||
    !/^[0-9a-f]{64}$/.test(expectedHex ?? "")
  )
    return false;
  const result = await derivePasswordBytes(password, hexToBytes(saltHex), iterations);
  const expected = hexToBytes(expectedHex);
  if (result.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < result.length; index++) difference |= result[index] ^ expected[index];
  return difference === 0;
}

export function normalizeEmail(input: unknown): string {
  if (typeof input !== "string") throw new Error("INVALID_CREDENTIALS");
  const email = input.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("INVALID_CREDENTIALS");
  return email;
}
