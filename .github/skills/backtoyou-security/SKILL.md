---
name: backtoyou-security
description: Review and implement BackToYou security practices across Supabase RLS, Auth, authorization, Storage, privacy, and client/server boundaries.
---

# BackToYou security

Use this skill for security reviews and security-sensitive changes. Treat Supabase policies, database functions, Auth sessions, Storage access, and server/client boundaries as part of one security model.

## Review focus

- Supabase RLS and policy coverage.
- Authentication, session handling, and authorization.
- Admin access and role checks.
- User-owned lost and found data.
- Claim ownership, status transitions, duplicate claims, and approved claim contacts.
- Contact-information privacy and contact preferences.
- Storage bucket access, upload validation, and image URL exposure.
- Input validation, output encoding, and XSS risks.
- Secrets, environment variables, and accidental credential exposure.
- Client/server boundaries and privileged operations.

## Non-negotiable rules

- Never expose service-role keys, secrets, private credentials, or unauthorized user contact information.
- Do not weaken RLS to make a feature work.
- Do not move sensitive operations into insecure client-side logic.
- Do not change security policies unless explicitly requested.
- Keep authorization enforced by the database/backend, not only by hidden buttons or client state.
- Validate untrusted text, files, identifiers, and status values at the appropriate boundary.
- Preserve least privilege and fail explicitly rather than falling back to broad access.
- Inspect existing implementation and policies before proposing a fix; make the smallest safe change.

For any security-sensitive change, verify both permitted and denied paths and report what was actually checked. Do not disclose secrets or include sensitive values in logs, tests, or documentation.
