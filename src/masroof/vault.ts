import { decryptJson, encryptJson, unwrapDataKey, wrapDataKey, createDataKey, bytesToB64, b64ToBytes } from "@/masroof/crypto";
import { withDefaults } from "@/masroof/seed";
import type { AppData } from "@/masroof/types";
import { lockoutDelayMs } from "@/masroof/money";

const KEY = "masroof.vault";
const PREFS = "masroof.prefs";

type Lockout = { attempts: number; until: number | null };

type PlainVault = { v: 1; enc: false; data: AppData };

type EncVault = {
  v: 1;
  enc: true;
  pinSalt: string;
  pinIv: string;
  pinCt: string;
  dataIv: string;
  dataCt: string;
  bio: null | { credId: string; iv: string; ct: string };
  lockout: Lockout;
};

export type VaultLoad =
  | { kind: "empty" }
  | { kind: "plain"; data: AppData }
  | { kind: "locked"; hasBio: boolean; lockout: Lockout }
  | { kind: "corrupt" }
  | { kind: "newer" };

let dataKey: CryptoKey | null = null;
let mode: "none" | "plain" | "enc" = "none";

function storage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readRaw(): PlainVault | EncVault | null {
  const store = storage();
  if (!store) return null;
  const text = store.getItem(KEY);
  if (!text) return null;
  try {
    return JSON.parse(text) as PlainVault | EncVault;
  } catch {
    return null;
  }
}

function writeRaw(value: unknown): "ok" | "quota" {
  const store = storage();
  if (!store) return "ok";
  try {
    store.setItem(KEY, JSON.stringify(value));
    return "ok";
  } catch {
    return "quota";
  }
}

export function mirrorPrefs(settings: { locale: string; theme: string; easternDigits: boolean }) {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(
      PREFS,
      JSON.stringify({ locale: settings.locale, theme: settings.theme, eastern: settings.easternDigits }),
    );
  } catch {
    /* ignore quota on prefs */
  }
}

export function loadVault(): VaultLoad {
  const raw = readRaw();
  if (!raw) {
    mode = "none";
    return { kind: "empty" };
  }
  if (raw.v !== 1) return { kind: "newer" };
  if (raw.enc === false) {
    if (!raw.data || typeof raw.data !== "object") return { kind: "corrupt" };
    if ((raw.data as AppData).schema > 1) return { kind: "newer" };
    mode = "plain";
    dataKey = null;
    return { kind: "plain", data: withDefaults(raw.data) };
  }
  if (raw.enc !== true || !raw.dataCt || !raw.pinSalt) return { kind: "corrupt" };
  mode = "enc";
  return {
    kind: "locked",
    hasBio: Boolean(raw.bio?.credId),
    lockout: raw.lockout ?? { attempts: 0, until: null },
  };
}

function patchEnc(patch: (vault: EncVault) => void): "ok" | "quota" | "missing" {
  const raw = readRaw();
  if (!raw || raw.enc !== true) return "missing";
  patch(raw);
  return writeRaw(raw);
}

export async function unlockWithPin(pin: string): Promise<
  { ok: true; data: AppData } | { ok: false; reason: "bad" | "cooldown"; waitMs: number; lockout: Lockout }
> {
  const raw = readRaw();
  if (!raw || raw.enc !== true) return { ok: false, reason: "bad", waitMs: 0, lockout: { attempts: 0, until: null } };
  const now = Date.now();
  if (raw.lockout?.until && raw.lockout.until > now) {
    return { ok: false, reason: "cooldown", waitMs: raw.lockout.until - now, lockout: raw.lockout };
  }
  const key = await unwrapDataKey(pin, raw.pinSalt, raw.pinIv, raw.pinCt);
  if (!key) {
    const attempts = (raw.lockout?.attempts ?? 0) + 1;
    const delay = lockoutDelayMs(attempts);
    const lockout = { attempts, until: delay ? now + delay : null };
    patchEnc((vault) => {
      vault.lockout = lockout;
    });
    return { ok: false, reason: "bad", waitMs: delay, lockout };
  }
  const data = await decryptJson<AppData>(key, raw.dataIv, raw.dataCt);
  if (!data) {
    return { ok: false, reason: "bad", waitMs: 0, lockout: raw.lockout ?? { attempts: 0, until: null } };
  }
  patchEnc((vault) => {
    vault.lockout = { attempts: 0, until: null };
  });
  dataKey = key;
  mode = "enc";
  return { ok: true, data: withDefaults({ ...data, settings: { ...data.settings, hasPin: true } }) };
}

export async function persistData(data: AppData): Promise<"ok" | "quota" | "locked"> {
  mirrorPrefs(data.settings);
  if (mode === "enc") {
    if (!dataKey) return "locked";
    const body = await encryptJson(dataKey, data);
    const wrote = patchEnc((vault) => {
      vault.dataIv = body.iv;
      vault.dataCt = body.ct;
    });
    return wrote === "missing" ? "locked" : wrote;
  }
  mode = "plain";
  const plain: PlainVault = { v: 1, enc: false, data };
  return writeRaw(plain);
}

export async function enablePin(pin: string, data: AppData): Promise<"ok" | "quota"> {
  const key = dataKey ?? (await createDataKey());
  const wrapped = await wrapDataKey(pin, key);
  const next = { ...data, settings: { ...data.settings, hasPin: true } };
  const body = await encryptJson(key, next);
  const existing = readRaw();
  const bio = existing && existing.enc === true ? existing.bio : null;
  const vault: EncVault = {
    v: 1,
    enc: true,
    pinSalt: wrapped.salt,
    pinIv: wrapped.iv,
    pinCt: wrapped.ct,
    dataIv: body.iv,
    dataCt: body.ct,
    bio,
    lockout: { attempts: 0, until: null },
  };
  const wrote = writeRaw(vault);
  if (wrote === "ok") {
    dataKey = key;
    mode = "enc";
  }
  return wrote;
}

export async function changePin(oldPin: string, newPin: string): Promise<boolean> {
  const raw = readRaw();
  if (!raw || raw.enc !== true) return false;
  const key = await unwrapDataKey(oldPin, raw.pinSalt, raw.pinIv, raw.pinCt);
  if (!key) return false;
  const wrapped = await wrapDataKey(newPin, key);
  dataKey = key;
  const wrote = patchEnc((vault) => {
    vault.pinSalt = wrapped.salt;
    vault.pinIv = wrapped.iv;
    vault.pinCt = wrapped.ct;
    vault.lockout = { attempts: 0, until: null };
  });
  return wrote === "ok";
}

export async function disablePin(pin: string, data: AppData): Promise<boolean> {
  const raw = readRaw();
  if (!raw || raw.enc !== true) return false;
  const key = await unwrapDataKey(pin, raw.pinSalt, raw.pinIv, raw.pinCt);
  if (!key) return false;
  const next = { ...data, settings: { ...data.settings, hasPin: false, biometricsEnabled: false } };
  const wrote = writeRaw({ v: 1, enc: false, data: next } satisfies PlainVault);
  if (wrote !== "ok") return false;
  dataKey = null;
  mode = "plain";
  return true;
}

export function lockSession() {
  if (mode === "enc") dataKey = null;
}

export async function wipeVault(): Promise<void> {
  dataKey = null;
  mode = "none";
  storage()?.removeItem(KEY);
}

function asBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function prfKey(raw: ArrayBuffer): Promise<CryptoKey> {
  const digest = raw.byteLength === 32 ? raw : await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

type PrfExt = { prf?: { results?: { first?: ArrayBuffer } } };

export async function enableBiometrics(): Promise<boolean> {
  if (!dataKey || typeof navigator === "undefined" || !navigator.credentials?.create) return false;
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const userId = crypto.getRandomValues(new Uint8Array(16));
    const cred = (await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: "Masroof" },
        user: { id: userId, name: "masroof", displayName: "Masroof" },
        pubKeyCredParams: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required" },
        timeout: 60_000,
        extensions: { prf: { eval: { first: new TextEncoder().encode("masroof-vault-v1") } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return false;
    const first = (cred.getClientExtensionResults() as PrfExt).prf?.results?.first;
    if (!first) return false;
    const kek = await prfKey(first);
    const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", dataKey));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv: asBuffer(iv) }, kek, asBuffer(rawKey));
    const bio = { credId: bytesToB64(new Uint8Array(cred.rawId)), iv: bytesToB64(iv), ct: bytesToB64(new Uint8Array(ct)) };
    const wrote = patchEnc((vault) => {
      vault.bio = bio;
    });
    return wrote === "ok";
  } catch {
    return false;
  }
}

export async function unlockWithBiometrics(): Promise<{ ok: true; data: AppData } | { ok: false }> {
  const raw = readRaw();
  if (!raw || raw.enc !== true || !raw.bio) return { ok: false };
  if (typeof navigator === "undefined" || !navigator.credentials?.get) return { ok: false };
  try {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const cred = (await navigator.credentials.get({
      publicKey: {
        challenge,
        userVerification: "required",
        allowCredentials: [{ id: asBuffer(b64ToBytes(raw.bio.credId)), type: "public-key" }],
        timeout: 60_000,
        extensions: { prf: { eval: { first: new TextEncoder().encode("masroof-vault-v1") } } } as AuthenticationExtensionsClientInputs,
      },
    })) as PublicKeyCredential | null;
    if (!cred) return { ok: false };
    const first = (cred.getClientExtensionResults() as PrfExt).prf?.results?.first;
    if (!first) return { ok: false };
    const kek = await prfKey(first);
    const unwrapped = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: asBuffer(b64ToBytes(raw.bio.iv)) },
      kek,
      asBuffer(b64ToBytes(raw.bio.ct)),
    );
    const key = await crypto.subtle.importKey("raw", unwrapped, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
    const data = await decryptJson<AppData>(key, raw.dataIv, raw.dataCt);
    if (!data) return { ok: false };
    dataKey = key;
    mode = "enc";
    patchEnc((vault) => {
      vault.lockout = { attempts: 0, until: null };
    });
    return { ok: true, data: withDefaults(data) };
  } catch {
    return { ok: false };
  }
}

export async function disableBiometrics(): Promise<void> {
  patchEnc((vault) => {
    vault.bio = null;
  });
}
