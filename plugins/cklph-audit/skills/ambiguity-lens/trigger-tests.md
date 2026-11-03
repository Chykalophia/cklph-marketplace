# ambiguity-lens: trigger tests

Run with the cklph-os authoring runner (`run-trigger-tests.sh <plugin-dir> cklph-audit:ambiguity-lens <this file>`). Near-misses belong to sibling cklph-audit lenses.

- fire: Review the scope section of our SECURITY.md, could a reporter read the out-of-scope list two ways and skip reporting a privilege-escalation bug?
- fire: Our skills and checklists have tables that prescribe default severities and confidence values for findings, check that every documented value is one the review schema actually accepts.
- fire: The reviewer agent says it MUST run the detector but the skill it loads says running it is optional, audit our agent instructions for contradictions like that.
- miss: Do the paths and scripts mentioned in AGENTS.md still exist?
- miss: Is this hook safe, or does it curl and run a remote script?
- miss: Find SQL injection in the API routes.
