# testing — trigger tests

Run: `bash plugins/cklph-os/skills/authoring/run-trigger-tests.sh plugins/cklph-nextjs cklph-nextjs:testing plugins/cklph-nextjs/skills/testing/trigger-tests.md`

- fire: Add vitest tests for the profile route handler in our Next.js app so we know it returns 401 without a session.
- fire: I just fixed the bug where notification_settings came back undefined from /api/profile. Make sure it can't come back.
- fire: Claude wrote this optimistic delete and then reviewed it and said it was fine, but I don't trust that. How do we lock it down?
- miss: The profile page throws a hydration mismatch error in the browser console, can you find the cause?
- miss: Review this PR for security issues before I merge it.
