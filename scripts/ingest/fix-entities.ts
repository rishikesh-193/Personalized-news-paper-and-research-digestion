/**
 * One-off repair: decode HTML entities in article titles that were stored
 * verbatim by the RSS adapter before decodeHtmlEntities() existed.
 *
 *   npx tsx scripts/ingest/fix-entities.ts            # report only (dry run)
 *   npx tsx scripts/ingest/fix-entities.ts --apply    # write the fixed titles
 *
 * Idempotent and non-destructive: it only rewrites a title when decoding
 * actually changes it, never deletes rows, and touches no other column.
 * Needs SUPABASE_SECRET_KEY (or the legacy SUPABASE_SERVICE_ROLE_KEY) —
 * articles have no user write policy.
 */
import dotenv from "dotenv";
dotenv.config({ path: ".env.local", quiet: true });
dotenv.config({ path: ".env", quiet: true });
import { createClient } from "@supabase/supabase-js";
import { decodeHtmlEntities } from "./util";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY =
  process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");

  if (!SUPABASE_URL || !SERVICE_KEY) {
    console.error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) in the environment.",
    );
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // Only candidate rows are fetched; a title without "&" can never change.
  const { data, error } = await supabase
    .from("articles")
    .select("id, title")
    .like("title", "%&%;%");

  if (error) {
    console.error(`Could not read articles: ${error.message}`);
    process.exit(1);
  }

  const fixes = (data ?? [])
    .map((row) => ({ id: String(row.id), from: String(row.title) }))
    .map((row) => ({ ...row, to: decodeHtmlEntities(row.from) }))
    .filter((row) => row.to !== row.from);

  console.log(`candidate rows: ${data?.length ?? 0}, titles needing repair: ${fixes.length}`);

  if (!apply) {
    for (const fix of fixes.slice(0, 5)) {
      console.log(`  would fix: ${fix.from}  ->  ${fix.to}`);
    }
    if (fixes.length > 5) console.log(`  … and ${fixes.length - 5} more`);
    console.log("dry run — re-run with --apply to write these titles");
    return;
  }

  let updated = 0;
  for (const fix of fixes) {
    const { error: updateError } = await supabase
      .from("articles")
      .update({ title: fix.to })
      .eq("id", fix.id);
    if (updateError) {
      console.error(`  update failed for ${fix.id}: ${updateError.message}`);
      continue;
    }
    updated += 1;
  }
  console.log(`updated ${updated} of ${fixes.length} titles`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
