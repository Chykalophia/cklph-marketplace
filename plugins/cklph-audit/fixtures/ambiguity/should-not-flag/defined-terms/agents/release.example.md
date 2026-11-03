<!-- -->
# Release agent

After CI finishes, merge the PR if the checks are green (every check in `checks.required` passed).

Delete the branch only when it is stale.

## Definitions

- stale = no commits in 30 days
