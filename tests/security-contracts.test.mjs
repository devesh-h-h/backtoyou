import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

// These are static source-contract tests, not PostgreSQL or Supabase RLS tests.
async function readProjectFile(path) {
  return readFile(new URL(path, root), "utf8");
}

test("profile protection rejects role and identity changes", async () => {
  const sql = await readProjectFile(
    "supabase/migrations/202611010001_prevent_profile_authorization_field_changes.sql"
  );

  assert.match(sql, /new\.role is distinct from old\.role/);
  assert.match(sql, /new\.email is distinct from old\.email/);
  assert.match(sql, /before update of role, email on public\.profiles/);
  assert.match(sql, /revoke all on function public\.prevent_profile_authorization_field_changes/);
  assert.match(sql, /auth\.jwt\(\) ->> 'role', ''\) = 'service_role'/);
  assert.match(sql, /role = 'user'/);
});

test("report ownership migration removes permissive writes and protects fields", async () => {
  const sql = await readProjectFile(
    "supabase/migrations/202611010002_enforce_report_ownership.sql"
  );

  assert.match(sql, /cmd in \('ALL', 'INSERT', 'UPDATE', 'DELETE', 'SELECT'\)/);
  assert.match(sql, /to_regclass\('public\.lost_items'\)/);
  assert.match(sql, /to_regclass\('public\.found_items'\)/);
  assert.match(sql, /user_email = auth\.jwt\(\) ->> 'email'/);
  assert.match(sql, /Report ownership cannot be changed/);
  assert.match(sql, /Found item status cannot be changed/);
  assert.match(sql, /revoke all on table public\.lost_items, public\.found_items from anon/);
  assert.match(sql, /create or replace function public\.is_admin\(\)/);
  assert.match(sql, /security definer/);
});

test("claim hardening keeps approval atomic and restricts claim mutation", async () => {
  const sql = await readProjectFile(
    "supabase/migrations/202611010003_harden_claim_authorization.sql"
  );

  assert.match(sql, /Only pending claims can be processed/);
  assert.match(sql, /Claim details cannot be changed/);
  assert.match(sql, /sync_approved_claim_found_item_status/);
  assert.match(sql, /get_approved_claim_contacts/);
  assert.match(sql, /to_regprocedure\(/);
  assert.match(sql, /Cannot harden claims: claims columns and prerequisite functions are required/);
  assert.match(sql, /cmd in \('ALL', 'INSERT', 'UPDATE', 'DELETE', 'SELECT'\)/);
  assert.match(sql, /execute 'revoke all on function public\.sync_approved_claim_found_item_status/);
});

test("profile migration fails safely on an unreconciled FOR ALL policy", async () => {
  const sql = await readProjectFile(
    "supabase/migrations/202611010001_prevent_profile_authorization_field_changes.sql"
  );

  assert.match(sql, /cmd = 'ALL'/);
  assert.match(
    sql,
    /reconcile existing FOR ALL policy before applying profile protection/
  );
  assert.match(sql, /cmd in \('INSERT', 'ALL'\)/);
});

test("storage policy remains review-only until deployed storage facts are verified", async () => {
  const sql = await readProjectFile(
    "supabase/review/storage_ownership_proposal.sql"
  );

  assert.match(sql, /REVIEW-ONLY/);
  assert.match(sql, /does not contain the deployed bucket definition/);
  assert.match(sql, /owner_id = auth\.uid\(\)::text/);
});

test("notification proposal has recipient-scoped access and trusted creation", async () => {
  const sql = await readProjectFile(
    "supabase/review/notifications_proposal.sql"
  );

  assert.match(sql, /alter table public\.notifications enable row level security/);
  assert.match(sql, /recipient_email = auth\.jwt\(\) ->> 'email'/);
  assert.match(sql, /There is deliberately no authenticated insert policy/);
  assert.match(sql, /security definer/);
  assert.match(sql, /on conflict do nothing/);
  assert.match(sql, /Notification event data cannot be changed/);
});

test("report ownership remains explicitly blocked pending baseline verification", async () => {
  const sql = await readProjectFile(
    "supabase/review/report_ownership_rls_proposal.sql"
  );

  assert.match(sql, /REVIEW-ONLY PROPOSAL/);
  assert.match(sql, /does not contain the original definitions/);
  assert.match(sql, /PostgreSQL combines permissive policies with OR semantics/);
  assert.match(sql, /This proposal intentionally contains no executable statements/);
});

test("messaging is not enabled and the proposal blocks arbitrary conversation creation", async () => {
  const workflow = await readProjectFile("lib/workflow.js");
  const sql = await readProjectFile("supabase/review/messaging_proposal.sql");
  const app = await readProjectFile("components/BackToYouApp.tsx");

  assert.match(workflow, /export function isMessagingAvailable\(\) \{\s+return false;/);
  assert.match(sql, /claim_id bigint not null unique references public\.claims\(id\)/);
  assert.match(sql, /cl\.status = 'approved'/);
  assert.match(sql, /sender_email = auth\.jwt\(\) ->> 'email'/);
  assert.match(sql, /Messages cannot be changed or deleted/);
  assert.doesNotMatch(app, /from\(["']messages["']\)/);
  assert.doesNotMatch(app, /from\(["']conversations["']\)/);
});

test("report upload code only cleans up the object created by the current operation", async () => {
  const app = await readProjectFile("components/BackToYouApp.tsx");

  assert.match(app, /let uploadedFilePath: string \| null = null/);
  assert.match(app, /if \(uploadedFilePath\)/);
  assert.match(app, /\.remove\(\[uploadedFilePath\]\)/);
});

test("notifications and chat are not exposed in the user-facing app", async () => {
  const app = await readProjectFile("components/BackToYouApp.tsx");
  assert.doesNotMatch(app, /Notifications are unavailable/);
  assert.doesNotMatch(app, /notification-toggle/);
  assert.doesNotMatch(app, /\.from\(["']notifications["']\)/);
  assert.doesNotMatch(app, /In-app Chat \(coming soon\)/);
  assert.doesNotMatch(app, /\.from\(["']messages["']\)/);
  assert.doesNotMatch(app, /\.from\(["']conversations["']\)/);
});

test("report ownership refresh and browse claims stay session-scoped", async () => {
  const app = await readProjectFile("components/BackToYouApp.tsx");

  assert.match(app, /async function loadMyReports\(knownEmail\?\: string\)/);
  assert.match(app, /const currentEmail = profile\?\.email \|\| knownEmail/);
  assert.match(app, /\.eq\("user_email", currentEmail\)/);
  assert.match(app, /user_email: reportEmail/);
  assert.match(app, /onClick=\{\(\) => openBrowseClaimForm\(item\)\}/);
  assert.match(app, /initialView === "matches" \|\| initialView === "profile"/);
  assert.doesNotMatch(app, /href="\/matches"/);
  assert.doesNotMatch(app, /href="\/claims"/);
});
