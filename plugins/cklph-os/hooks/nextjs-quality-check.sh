#!/bin/bash
# Next.js Code Quality Enforcer
# Called by Claude Code PostToolUse hook (cklph-os plugin)
# Exit 2 = surface findings to Claude. Exit 0 = clean.
# NOTE: -e intentionally omitted; grep/arithmetic are expected to return non-zero.

set -uo pipefail

# Read JSON input from stdin
INPUT=$(cat 2>/dev/null || true)

# Parse input using jq
FILE_PATH=$(printf '%s' "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
SUCCESS=$(printf '%s' "$INPUT" | jq -r '.tool_response.success // false' 2>/dev/null)

# Skip if not successful or not a JS/TS file
if [[ "$SUCCESS" != "true" ]]; then
    exit 0
fi

if [[ ! "$FILE_PATH" =~ \.(js|jsx|ts|tsx)$ ]]; then
    exit 0
fi

if [[ "$FILE_PATH" =~ node_modules ]]; then
    exit 0
fi

if [[ ! -f "$FILE_PATH" ]]; then
    exit 0
fi

ISSUES=0

echo "Next.js Quality Check: $FILE_PATH"

# Check if it's an App Router file
if [[ "$FILE_PATH" =~ app/.* ]]; then

    # Page component checks
    if [[ "$FILE_PATH" =~ page\.(js|jsx|ts|tsx)$ ]]; then
        if ! grep -q 'export default function\|export default async function' "$FILE_PATH" 2>/dev/null; then
            echo "Error: Page must export default function" >&2
            ISSUES=$((ISSUES + 1))
        fi

        # SEO metadata suggestion
        if ! grep -q 'Metadata\|metadata' "$FILE_PATH" 2>/dev/null; then
            echo "Suggestion: Consider adding metadata for SEO"
        fi
    fi

    # Layout component checks
    if [[ "$FILE_PATH" =~ layout\.(js|jsx|ts|tsx)$ ]]; then
        if ! grep -q 'children' "$FILE_PATH" 2>/dev/null; then
            echo "Error: Layout must accept children prop" >&2
            ISSUES=$((ISSUES + 1))
        fi
    fi

    # Client vs Server component checks
    if grep -q "'use client'\|\"use client\"" "$FILE_PATH" 2>/dev/null; then
        echo "Info: Client Component"
    else
        echo "Info: Server Component"
        # Check for client-side features in server component
        if grep -E 'useState|useEffect|onClick|onChange|onSubmit' "$FILE_PATH" 2>/dev/null; then
            echo "Error: Interactive features require 'use client' directive" >&2
            ISSUES=$((ISSUES + 1))
        fi
    fi
fi

# Image optimization check
if grep -q '<img ' "$FILE_PATH" 2>/dev/null; then
    if ! grep -q 'next/image' "$FILE_PATH" 2>/dev/null; then
        echo "Suggestion: Use next/image for optimized images"
    fi
fi

# Link optimization check
if grep -q '<a href=' "$FILE_PATH" 2>/dev/null; then
    if ! grep -q 'next/link' "$FILE_PATH" 2>/dev/null; then
        # Only suggest for internal links (not http)
        if ! grep -E '<a href=["'"'"']https?://' "$FILE_PATH" 2>/dev/null; then
            echo "Suggestion: Use next/link for internal navigation"
        fi
    fi
fi

# Pages Router deprecation check
if grep -q 'getServerSideProps\|getStaticProps\|getInitialProps' "$FILE_PATH" 2>/dev/null; then
    echo "Warning: Legacy Pages Router patterns detected"
fi

# Final result
if [[ $ISSUES -eq 0 ]]; then
    echo "Passed: No issues found"
    exit 0
else
    echo "Failed: Found $ISSUES issue(s)" >&2
    exit 2
fi
