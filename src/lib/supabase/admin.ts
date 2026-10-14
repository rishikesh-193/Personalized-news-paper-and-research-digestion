import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client for server-only writes.
 *
 * IMPORTANT — server only. This module starts with `import "server-only"`, so
 * Next.js fails the BUILD if a Client Component ever imports it (directly or
 * transitively). That is a compile-time guard, not a convention: the
 * service-role key must never reach a browser bundle.
 *
 * research_papers / research_searches have RLS with SELECT-only policies, so
 * the browser can never write them; the discover route handlers persist
 * through this client (which bypasses RLS). Returns null when the secret key
 * is missing, so callers fail with a clear message instead of crashing at
 * import time. The key is read from env only and is never logged.
 */
export function createAdminClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return null;

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
