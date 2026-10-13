export interface AppUser {
  name: string;
  email: string;
  initials: string;
  avatarUrl?: string;
  /** Verified sign-in method ("email", "google", …) when claims carry one. */
  provider?: string;
}

function initialsFor(name: string) {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const initials = parts.map((part) => part.charAt(0).toUpperCase()).join("");
  return initials || "U";
}

/**
 * Maps verified claims from supabase.auth.getClaims() to the shape the UI
 * renders. Returns null when there is no authenticated user.
 */
export function userFromClaims(claims: unknown): AppUser | null {
  if (!claims || typeof claims !== "object") return null;

  const { email, user_metadata, app_metadata } = claims as {
    email?: unknown;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };
  const resolvedEmail = typeof email === "string" ? email : "";
  const metadata = user_metadata ?? {};
  const provider =
    typeof app_metadata?.provider === "string" ? app_metadata.provider : undefined;
  const fullName =
    (typeof metadata.full_name === "string" && metadata.full_name) ||
    (typeof metadata.name === "string" && metadata.name) ||
    (resolvedEmail ? resolvedEmail.split("@")[0] : "") ||
    "Reader";

  return {
    name: fullName,
    email: resolvedEmail,
    initials: initialsFor(fullName),
    avatarUrl:
      typeof metadata.avatar_url === "string" ? metadata.avatar_url : undefined,
    provider,
  };
}
