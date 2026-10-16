const ITERATIONS = 210_000;

export function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

export function b64ToBytes(value: string): Uint8Array {
  const bin = atob(value);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function deriveAes(secret: string, salt: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: asBuffer(salt), iterations: ITERATIONS, hash: "SHA-256" },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    usages,
  );
}

export async function createDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function encryptJson(key: CryptoKey, value: unknown): Promise<{ iv: string; ct: string }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBuffer(iv) }, key, encoded);
  return { iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

export async function decryptJson<T>(key: CryptoKey, iv: string, ct: string): Promise<T | null> {
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asBuffer(b64ToBytes(iv)) },
      key,
      asBuffer(b64ToBytes(ct)),
    );
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

export async function wrapDataKey(pin: string, dataKey: CryptoKey): Promise<{ salt: string; iv: string; ct: string }> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const kek = await deriveAes(pin, salt, ["encrypt"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dataKey));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBuffer(iv) }, kek, asBuffer(raw));
  return { salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
}

export async function unwrapDataKey(pin: string, salt: string, iv: string, ct: string): Promise<CryptoKey | null> {
  try {
    const kek = await deriveAes(pin, b64ToBytes(salt), ["decrypt"]);
    const raw = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asBuffer(b64ToBytes(iv)) },
      kek,
      asBuffer(b64ToBytes(ct)),
    );
    return crypto.subtle.importKey("raw", raw, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  } catch {
    return null;
  }
}

export type BackupEnvelope = {
  magic: "MASROOF";
  schema: number;
  kdf: "PBKDF2-SHA256";
  iterations: number;
  salt: string;
  iv: string;
  ct: string;
};

export const BACKUP_SCHEMA = 1;

export async function encryptBackup(payload: unknown, passphrase: string): Promise<BackupEnvelope> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await deriveAes(passphrase, salt, ["encrypt"]);
  const body = await encryptJson(key, { schema: BACKUP_SCHEMA, payload });
  return {
    magic: "MASROOF",
    schema: BACKUP_SCHEMA,
    kdf: "PBKDF2-SHA256",
    iterations: ITERATIONS,
    salt: bytesToB64(salt),
    iv: body.iv,
    ct: body.ct,
  };
}

export type BackupResult =
  | { ok: true; schema: number; payload: unknown }
  | { ok: false; reason: "corrupt" | "passphrase" | "newer" };

export async function decryptBackup(text: string, passphrase: string): Promise<BackupResult> {
  let envelope: BackupEnvelope;
  try {
    envelope = JSON.parse(text) as BackupEnvelope;
  } catch {
    return { ok: false, reason: "corrupt" };
  }
  if (!envelope || envelope.magic !== "MASROOF" || typeof envelope.ct !== "string" || envelope.ct.length < 16) {
    return { ok: false, reason: "corrupt" };
  }
  if (typeof envelope.schema !== "number" || !envelope.salt || !envelope.iv) return { ok: false, reason: "corrupt" };
  if (envelope.schema > BACKUP_SCHEMA) return { ok: false, reason: "newer" };
  try {
    const key = await deriveAes(passphrase, b64ToBytes(envelope.salt), ["decrypt"]);
    const decoded = await decryptJson<{ schema: number; payload: unknown }>(key, envelope.iv, envelope.ct);
    if (!decoded || typeof decoded !== "object") return { ok: false, reason: "passphrase" };
    return { ok: true, schema: envelope.schema, payload: decoded.payload };
  } catch {
    return { ok: false, reason: "passphrase" };
  }
}

export async function randomId(): Promise<string> {
  return crypto.randomUUID();
}
