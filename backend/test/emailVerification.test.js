import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmailVerificationToken,
  hashEmailVerificationToken,
  isValidEmailVerificationToken,
} from "../src/emailVerification.js";
import {
  createVerificationEmailSender,
} from "../src/email.js";

test("creates a random URL-safe verification token and hash", () => {
  const first = createEmailVerificationToken();
  const second = createEmailVerificationToken();

  assert.equal(first.token.length, 43);
  assert.match(first.token, /^[A-Za-z0-9_-]+$/);
  assert.equal(
    isValidEmailVerificationToken(first.token),
    true
  );
  assert.equal(
    first.tokenHash,
    hashEmailVerificationToken(first.token)
  );
  assert.notEqual(first.token, second.token);
  assert.ok(Date.parse(first.expiresAt) > Date.now());
});

test("rejects malformed verification tokens", () => {
  assert.equal(isValidEmailVerificationToken(""), false);
  assert.equal(isValidEmailVerificationToken("not-a-token"), false);
  assert.equal(isValidEmailVerificationToken(null), false);
});

test("mock delivery returns a local preview link without sending mail", async () => {
  let sendCount = 0;
  const send = createVerificationEmailSender({
    env: {
      APP_BASE_URL: "http://localhost:5173",
      EMAIL_DELIVERY_MODE: "mock",
      NODE_ENV: "test",
    },
    transport: {
      async sendMail() {
        sendCount += 1;
      },
    },
  });

  const result = await send({
    email: "buyer@example.test",
    name: "Test Buyer",
    token: "a".repeat(43),
  });

  assert.equal(result.delivered, false);
  assert.equal(
    result.previewUrl,
    `http://localhost:5173/verify-email?token=${"a".repeat(43)}`
  );
  assert.equal(sendCount, 0);
});

test("SMTP delivery sends a verification link without exposing credentials", async () => {
  let message;
  const send = createVerificationEmailSender({
    env: {
      APP_BASE_URL: "http://localhost:5173",
      BREVO_FROM_EMAIL: "verified@example.test",
      BREVO_FROM_NAME: "Selbuy",
      BREVO_SMTP_HOST: "smtp-relay.brevo.com",
      BREVO_SMTP_PORT: "587",
      BREVO_SMTP_USER: "smtp-user",
      BREVO_SMTP_KEY: "not-logged-secret",
    },
    transport: {
      async sendMail(options) {
        message = options;
      },
    },
  });

  const result = await send({
    email: "buyer@example.test",
    name: "<Test Buyer>",
    token: "b".repeat(43),
  });

  assert.equal(result.delivered, true);
  assert.equal(message.to, "buyer@example.test");
  assert.equal(message.from.address, "verified@example.test");
  assert.match(message.text, /\/verify-email\?token=/);
  assert.match(message.html, /&lt;Test Buyer&gt;/);
  assert.doesNotMatch(JSON.stringify(message), /not-logged-secret/);
});

test("mock delivery cannot be enabled in production", async () => {
  const send = createVerificationEmailSender({
    env: {
      APP_BASE_URL: "https://selbuy.example",
      EMAIL_DELIVERY_MODE: "mock",
      NODE_ENV: "production",
    },
  });

  await assert.rejects(
    send({
      email: "buyer@example.test",
      name: "Test Buyer",
      token: "c".repeat(43),
    }),
    /restricted to localhost outside production/
  );
});

test("mock delivery cannot expose preview links for a non-local app URL", async () => {
  const send = createVerificationEmailSender({
    env: {
      APP_BASE_URL: "https://selbuy.example",
      EMAIL_DELIVERY_MODE: "mock",
      NODE_ENV: "development",
    },
  });

  await assert.rejects(
    send({
      email: "buyer@example.test",
      name: "Test Buyer",
      token: "d".repeat(43),
    }),
    /restricted to localhost outside production/
  );
});
