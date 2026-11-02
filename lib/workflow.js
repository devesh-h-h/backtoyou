export const MAX_TEXT_LENGTH = 500;
export const MAX_CLAIM_LENGTH = 2000;
export const MAX_IMAGE_SIZE = 5 * 1024 * 1024;

export function getEmailError(value) {
  const email = value.trim();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    ? ""
    : "Enter a valid email address.";
}

export function getTextError(value, label, maxLength = MAX_TEXT_LENGTH) {
  const trimmed = value.trim();
  if (!trimmed) {
    return `${label} is required.`;
  }
  if (trimmed.length > maxLength) {
    return `${label} must be ${maxLength} characters or fewer.`;
  }
  return "";
}

export function getClaimMessageError(value) {
  return getTextError(value, "Claim message", MAX_CLAIM_LENGTH);
}

export function validateImageFile(file) {
  if (!file.type.startsWith("image/")) {
    return "Please choose an image file.";
  }
  if (file.size > MAX_IMAGE_SIZE) {
    return "Image must be 5 MB or smaller.";
  }
  return "";
}

export function isAdminRole(role) {
  return role === "admin";
}

export function canSubmitClaim(itemStatus, hasPendingClaim) {
  return itemStatus === "available" && !hasPendingClaim;
}

export function canProcessClaim(status) {
  return status === "pending";
}

export function canMarkReturned(itemStatus) {
  return itemStatus === "claimed";
}

export function getUnreadNotificationCount(notifications) {
  return notifications.filter((notification) => !notification.read_at).length;
}

function sanitizeDiagnosticValue(value) {
  return String(value)
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[redacted-email]")
    .slice(0, 500);
}

export function getSupabaseErrorDiagnostics(error) {
  const source = error && typeof error === "object" ? error : {};

  return {
    message: sanitizeDiagnosticValue(source.message || "Unknown Supabase error"),
    code: sanitizeDiagnosticValue(source.code || "unknown"),
    details: sanitizeDiagnosticValue(source.details || ""),
    hint: sanitizeDiagnosticValue(source.hint || ""),
  };
}

export function isMissingOptionalResourceError(error) {
  return error?.code === "42P01" || error?.code === "PGRST205";
}

export function isMessagingAvailable() {
  return false;
}
