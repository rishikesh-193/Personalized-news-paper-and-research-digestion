import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseConfig } from "./config";

export function createClient() {
  const { supabaseUrl, supabaseKey } = getSupabaseConfig();
  return createBrowserClient(supabaseUrl, supabaseKey);
}

/** Signs out of Supabase Auth and clears the session cookies. */
export async function signOutUser() {
  const { error } = await createClient().auth.signOut();
  return error;
}
