import { createHash, randomBytes } from "node:crypto";

export function createEmailVerificationToken() {
  const token = randomBytes(32).toString("base64url");

  return {
    token,
    tokenHash: hashEmailVerificationToken(token),
    expiresAt: new Date(
      Date.now() + 24 * 60 * 60 * 1000
    ).toISOString(),
  };
}

export function hashEmailVerificationToken(token) {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}

export function isValidEmailVerificationToken(token) {
  return (
    typeof token === "string" &&
    /^[A-Za-z0-9_-]{43}$/.test(token)
  );
}
