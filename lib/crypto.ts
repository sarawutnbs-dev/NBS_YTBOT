import { createDecipheriv, createCipheriv, randomBytes, createHash } from "crypto";
import { getEnv } from "./config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

function deriveKey() {
  const { TOKEN_ENCRYPTION_KEY } = getEnv();
  return createHash("sha256").update(TOKEN_ENCRYPTION_KEY).digest();
}

export function encryptSecret(plaintext: string) {
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey();
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

export function decryptSecret(payload: string) {
  const buffer = Buffer.from(payload, "base64");
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + 16);
  const ciphertext = buffer.subarray(IV_LENGTH + 16);
  const key = deriveKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString("utf8");
}
