---
name: backtoyou-supabase
description: Work safely with BackToYou's Supabase database, Auth, Storage, RLS, claims, profiles, and matching workflow.
---

# BackToYou Supabase

Use this skill for Supabase queries, authentication, storage, database migrations, policies, profiles, reports, claims, and contact access.

## Required investigation

Before changing anything:

- Inspect all existing Supabase usage and queries.
- Inspect the authentication and session flow.
- Inspect image storage usage, bucket assumptions, and upload/access policies.
- Read the relevant SQL migrations and understand the RLS assumptions.
- Trace the affected UI workflow before changing a query or payload.

Protect the existing `profiles`, `lost_items`, `found_items`, and `claims` data model, contact preferences, approved claim contacts, image storage, and matching workflow.

## Safety rules

- Never casually bypass RLS.
- Never expose sensitive user information beyond the existing authorized workflow.
- Never put service-role keys or other privileged credentials in client code.
- Never replace secure server/database enforcement with an insecure client-side shortcut.
- Do not modify database schema or RLS unless the task explicitly requests it.
- Do not modify authentication, profiles, claims, matching, or Storage configuration unless explicitly requested.
- Prefer consuming existing Supabase functionality for frontend work instead of changing backend logic.
- Keep authorization enforced by Supabase policies/functions; client checks are only UX, not security.
- Surface query, upload, and auth errors explicitly using the repository's established feedback patterns.

When a backend change is explicitly requested, make it additive and minimal, document its relationship to existing policies, and validate both authorized and unauthorized paths.
