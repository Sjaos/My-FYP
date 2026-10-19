import assert from "node:assert/strict";
import test from "node:test";
import {
  isValidEmailAddress,
} from "../src/authValidation.js";

test("validates normalized email addresses", () => {
  assert.equal(
    isValidEmailAddress("buyer@example.com"),
    true
  );
  assert.equal(
    isValidEmailAddress("buyer.name+test@example.co.uk"),
    true
  );
});

test("rejects incomplete or malformed email addresses", () => {
  for (const email of [
    "",
    "buyer",
    "buyer@example",
    "buyer@@example.com",
    "buyer @example.com",
    "buyer@example..com",
    "buyer@-example.com",
    "buyer@example-.com",
  ]) {
    assert.equal(
      isValidEmailAddress(email),
      false,
      `Expected invalid address: ${email}`
    );
  }
});

test("rejects email addresses exceeding length limits", () => {
  const localTooLong = `${"a".repeat(65)}@example.com`;
  const wholeTooLong = `${"a".repeat(246)}@example.com`;

  assert.equal(
    isValidEmailAddress(localTooLong),
    false
  );
  assert.equal(
    isValidEmailAddress(wholeTooLong),
    false
  );
});
