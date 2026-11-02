---
name: backtoyou-nextjs
description: Safely develop BackToYou's Next.js App Router, React 19, and TypeScript application without breaking existing behavior.
---

# BackToYou Next.js / React

Use this skill for Next.js, React, TypeScript, component, form, and client/server work.

## Architecture

- Inspect the current App Router structure before editing. The existing feature surface is concentrated in the client-side `app/page.tsx`; do not split or rewrite large working sections without a concrete need.
- Keep server and client boundaries explicit. Add `"use client"` only where browser interactivity, hooks, or browser-only APIs require it.
- Prefer small, focused, reusable components and typed helpers when extraction improves clarity. Avoid abstraction for one-off markup.
- Reuse existing types and behavior. Avoid duplicated queries, status mappings, validation rules, and UI patterns.
- Avoid unnecessary dependencies and architectural migrations.

## React and state

- Keep state local to the feature that owns it unless shared state is genuinely required.
- Keep effects focused, cleanup-safe, and explicit about dependencies.
- Do not use effects as a substitute for event handlers or derive values that can be computed during render.
- Preserve existing session, loading, error, and optimistic-update behavior when refactoring.
- Make asynchronous actions race-safe and give users explicit feedback for failure.

## TypeScript

- Use accurate domain types for profiles, lost items, found items, claims, statuses, contacts, and upload results.
- Narrow nullable and union values with guards rather than broad casts.
- Avoid `any`, unsafe assertions, and silent fallback values that hide errors.
- Keep form and API payload shapes explicit, and validate untrusted input at the boundary.

## Forms, accessibility, and responsive UI

- Use labeled controls, semantic HTML, keyboard support, visible focus states, and accessible error messaging.
- Preserve entered values and explain validation failures without losing user work.
- Provide loading, disabled, empty, success, and error states for every asynchronous form action.
- Build responsive components for touch and small screens rather than adding desktop-only constraints.

When modifying an existing component, inspect it first, understand its dependencies, preserve its behavior, and do not rewrite large working sections unnecessarily. Validate significant changes with `npx tsc --noEmit` and `git diff --check`.
