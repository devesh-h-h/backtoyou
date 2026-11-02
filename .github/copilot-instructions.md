# BackToYou project instructions

## Project context

BackToYou is a modern lost-and-found web application. The repository currently uses:

- **Framework:** Next.js 16 App Router.
- **Language:** TypeScript with React 19.
- **Database and backend services:** Supabase (Postgres, Supabase Auth, and Supabase Storage). The SQL migrations in `supabase/migrations/` define the currently versioned database and RLS changes.
- **Authentication:** Supabase Auth, consumed from the client application with email/password sign-up, sign-in, session checks, and sign-out.
- **Storage:** Supabase Storage is consumed by the existing image-upload workflow through the shared Supabase client. Inspect the existing bucket and policies before changing image handling.
- **Deployment:** The README describes Vercel as the intended deployment platform. No additional provider-specific deployment configuration is currently present in the repository.
- **Application architecture:** `app/layout.tsx` provides the root metadata, fonts, and document shell. `app/page.tsx` is currently a large client component (`"use client"`) containing authentication, profiles, lost and found reports, browsing/search/filtering, image uploads, possible-match scoring, claims, approved claim contacts, and admin operations. `lib/supabase.ts` exports the shared browser Supabase client. `app/globals.css` contains the current global and feature-specific styling. The `supabase/migrations/` directory contains additive SQL migrations for claims, found-item status, claim contacts, profile contact preferences, and profile update RLS.

Treat the repository and its existing implementation as the source of truth. Do not infer a feature merely from a requested future design or from a generic lost-and-found pattern.

## Non-negotiable project rules

- Preserve existing working functionality.
- Do not make unnecessary architectural changes.
- Do not invent functionality.
- Do not invent statistics or data.
- Do not claim features are AI-powered unless they actually are.
- Do not automatically commit or push.
- Do not modify database schema unless explicitly requested.
- Do not modify RLS policies unless explicitly requested.
- Do not modify authentication logic unless explicitly requested.
- Do not modify matching logic unless explicitly requested.
- Do not modify claims logic unless explicitly requested.
- Do not modify profile creation logic unless explicitly requested.
- Do not modify Supabase Storage configuration unless explicitly requested.

Before changing an existing feature:

1. Inspect the current implementation.
2. Understand its dependencies.
3. Preserve existing behavior.
4. Make the smallest safe change.
5. Validate the result.

For significant changes, run:

```bash
npx tsc --noEmit
git diff --check
```

Also use the most focused relevant checks available for the changed area. Never report a check as passing unless it was actually run.

## Working conventions

- Prefer existing components, helpers, types, Supabase queries, and styles over parallel implementations.
- Keep client/server boundaries explicit and never expose privileged credentials in browser code.
- Treat Supabase RLS and existing database functions as security boundaries, not obstacles to work around.
- Keep user contact information and claim data limited to the access already granted by the existing policies and workflow.
- Avoid broad rewrites of the current page while the behavior is still working.
- Review the specialized skills in `.github/skills/` when a task concerns UI/UX, Next.js/React, Supabase, testing, or security.
