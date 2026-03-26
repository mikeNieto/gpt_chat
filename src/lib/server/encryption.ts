import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import type { EncryptedSecret } from "@/lib/types";

const ALGORITHM = "aes-256-gcm";

function decodeKey(raw: string): Buffer {
  const trimmed = raw.trim();

  if (/^[a-f0-9]{64}$/i.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  const base64 = Buffer.from(trimmed, "base64");
  if (base64.length === 32) {
    return base64;
  }

  throw new Error(
    "MASTER_ENCRYPTION_KEY must be 32 bytes encoded as base64 or 64 hex characters."
  );
}

export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.MASTER_ENCRYPTION_KEY);
}

function getEncryptionKey(): Buffer {
  const raw = process.env.MASTER_ENCRYPTION_KEY;

  if (!raw) {
    throw new Error(
      "MASTER_ENCRYPTION_KEY is required to store GitHub Copilot credentials securely."
    );
  }

  return decodeKey(raw);
}

export function encryptSecret(plaintext: string): EncryptedSecret {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);

  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);

  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    updatedAt: new Date().toISOString(),
  };
}

export function decryptSecret(secret: EncryptedSecret): string {
  const decipher = createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(secret.iv, "base64")
  );

  decipher.setAuthTag(Buffer.from(secret.tag, "base64"));

  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(secret.ciphertext, "base64")),
    decipher.final(),
  ]);

  return plaintext.toString("utf8");
}
