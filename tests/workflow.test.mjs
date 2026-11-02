import assert from "node:assert/strict";
import test from "node:test";
import {
  canMarkReturned,
  canProcessClaim,
  canSubmitClaim,
  getClaimMessageError,
  getEmailError,
  getSupabaseErrorDiagnostics,
  getTextError,
  getUnreadNotificationCount,
  isAdminRole,
  isMissingOptionalResourceError,
  isMessagingAvailable,
  MAX_CLAIM_LENGTH,
  MAX_TEXT_LENGTH,
  validateImageFile,
} from "../lib/workflow.js";

test("validates authentication and report text inputs", () => {
  assert.equal(getEmailError(" user@example.com "), "");
  assert.notEqual(getEmailError("not-an-email"), "");
  assert.equal(getTextError("  wallet  ", "Item name"), "");
  assert.equal(getTextError(" ", "Description"), "Description is required.");
  assert.equal(
    getTextError("x".repeat(MAX_TEXT_LENGTH + 1), "Location"),
    "Location must be 500 characters or fewer."
  );
});

test("validates claim messages and image uploads", () => {
  assert.equal(getClaimMessageError("Found near the library"), "");
  assert.equal(getClaimMessageError(""), "Claim message is required.");
  assert.equal(
    getClaimMessageError("x".repeat(MAX_CLAIM_LENGTH + 1)),
    "Claim message must be 2000 characters or fewer."
  );
  assert.equal(validateImageFile({ type: "image/png", size: 10 }), "");
  assert.equal(
    validateImageFile({ type: "application/pdf", size: 10 }),
    "Please choose an image file."
  );
  assert.equal(
    validateImageFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 }),
    "Image must be 5 MB or smaller."
  );
});

test("guards claim and recovery transitions", () => {
  assert.equal(canSubmitClaim("available", false), true);
  assert.equal(canSubmitClaim("available", true), false);
  assert.equal(canSubmitClaim("claimed", false), false);
  assert.equal(canProcessClaim("pending"), true);
  assert.equal(canProcessClaim("approved"), false);
  assert.equal(canMarkReturned("claimed"), true);
  assert.equal(canMarkReturned("available"), false);
});

test("counts only unread notifications", () => {
  assert.equal(
    getUnreadNotificationCount([
      { read_at: null },
      { read_at: "2026-11-01T10:00:00Z" },
      { read_at: null },
    ]),
    2
  );
});

test("classifies missing optional notifications without exposing identity data", () => {
  assert.equal(
    isMissingOptionalResourceError({ code: "PGRST205" }),
    true
  );
  assert.equal(
    isMissingOptionalResourceError({ code: "42501" }),
    false
  );

  assert.deepEqual(
    getSupabaseErrorDiagnostics({
      message: "permission denied for user@example.com",
      code: "42501",
      details: "recipient user@example.com",
      hint: "Check notifications policy",
    }),
    {
      message: "permission denied for [redacted-email]",
      code: "42501",
      details: "recipient [redacted-email]",
      hint: "Check notifications policy",
    }
  );
});

test("keeps admin and messaging capability decisions explicit", () => {
  assert.equal(isAdminRole("admin"), true);
  assert.equal(isAdminRole("user"), false);
  assert.equal(isMessagingAvailable(), false);
});
