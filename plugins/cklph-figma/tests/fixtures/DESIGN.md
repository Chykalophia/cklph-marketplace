---
version: alpha
name: Contrast fixture
description: Test input for contrast.mjs. Not a real client.
colors:
  # brand points at another color, so references must resolve through a chain.
  navy: "#09182f"
  brand: "{colors.navy}"
  muted-on-dark: "#77787c"
  white: '#ffffff'
  link: "#0066cc"
  clear: "#00000000"
typography:
  hero-strike:
    fontFamily: Public Sans
    fontSize: 1.5rem
    fontWeight: 400
  body-sm:
    fontFamily: Public Sans
    fontSize: 14px
omitted:
  - section: spacing
    reason: "Uses the framework default scale."
components:
  hero-strikethrough:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.muted-on-dark}"
    typography: "{typography.hero-strike}"
  footer-link:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.muted-on-dark}"
    typography: "{typography.body-sm}"
  text-link:
    backgroundColor: "{colors.clear}"
    textColor: "{colors.link}"
  button-hover:
    backgroundColor: "{colors.navy}"
---

# Contrast fixture

## Overview

Three checked pairs and one component without a text color.
