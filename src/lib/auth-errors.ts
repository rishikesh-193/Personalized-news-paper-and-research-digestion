/**
 * Maps Supabase Auth errors to friendly, actionable copy for the auth forms.
 * Codes: https://supabase.com/docs/reference/auth/error-codes
 */
export function friendlyAuthError(error: unknown): string {
  const e = error as { code?: string; message?: string } | null;

  switch (e?.code) {
    case "invalid_credentials":
    case "user_not_found":
      return "Wrong email or password.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Try signing in instead.";
    case "weak_password":
      return "Password must be at least 8 characters.";
    case "email_not_confirmed":
      return "Confirm your email address first, then sign in.";
    case "over_email_send_rate_limit":
      return "Too many emails sent too quickly. Wait a minute and try again.";
    case "same_password":
      return "Choose a password different from your current one.";
    case "session_not_found":
    case "flow_state_not_found":
    case "validation_failed":
      return "This link has expired or was already used. Request a new one.";
    case "signup_disabled":
      return "Sign-ups are currently disabled.";
    default:
      break;
  }

  const message = e?.message ?? "";
  if (/rate limit/i.test(message)) {
    return "Too many attempts. Wait a minute and try again.";
  }
  return message || "Something went wrong. Please try again.";
}

/** Determines if an auth error is caused by rate limiting. */
export function isRateLimitError(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (e?.code === "over_email_send_rate_limit") return true;
  const message = e?.message ?? "";
  return /rate limit/i.test(message) || /too many emails/i.test(message);
}
