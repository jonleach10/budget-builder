import { createHmac } from "node:crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const STEP_SECONDS = 30;
const CODE_RANGE = 1_000_000;

function fromBase32(text: string): Buffer {
  const characters = [...text.toUpperCase().replace(/=+$/, "")];
  const bits = characters
    .map((character) => {
      const value = BASE32_ALPHABET.indexOf(character);
      if (value === -1) throw new Error("The secret isn't base32.");
      return value.toString(2).padStart(5, "0");
    })
    .join("");

  const bytes = bits.match(/.{8}/g) ?? [];
  return Buffer.from(bytes.map((byte) => Number.parseInt(byte, 2)));
}

/** The code an authenticator app shows for a secret at a moment, per RFC 6238. */
export function totpCode(secret: string, seconds: number): string {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(seconds / STEP_SECONDS)));

  const digest = createHmac("sha1", fromBase32(secret)).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const value = digest.readUInt32BE(offset) & 0x7fffffff;

  return String(value % CODE_RANGE).padStart(6, "0");
}
