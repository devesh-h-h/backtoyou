---
name: backtoyou-testing
description: Systematically validate BackToYou authentication, reports, matching, claims, profiles, admin workflows, states, and responsive behavior.
---

# BackToYou testing

Use this skill to test behavior rather than merely checking that a page renders. Do not invent test results; distinguish executed checks from recommended checks.

## Workflow coverage

Test authentication: signup, login, logout, and invalid credentials.

Test lost reports: creation, validation, image upload, and display.

Test found reports: creation, validation, image upload, and display.

Test browsing: search, filtering, item display, and claimed/returned behavior.

Test matching: possible matches, matching score display, and exclusion of returned items.

Test claims: submission, pending state, approval, rejection, duplicate-claim prevention, and approved contacts.

Test profiles: profile creation, profile updates, and contact preferences.

Test admin behavior: authorization, user management, reports, claims, approval, and rejection.

Also test empty states, loading states, errors, responsive layouts, and mobile behavior.

For data access workflows, test both the expected authorized path and unauthorized access boundaries without weakening RLS or exposing real private data.

## Required checks

For significant changes, run:

```bash
npx tsc --noEmit
git diff --check
```

Use the smallest relevant test or lint command for the changed area, then expand coverage when the result warrants it. Record failures accurately and never claim a workflow was tested when it was not.
