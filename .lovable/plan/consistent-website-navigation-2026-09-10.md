# Consistent website navigation

## Goal
Use one shared WallRaven page frame across the entire website so navigation never disappears between pages.

## Changes
- Move the current WallRaven logo, Home/Presets/What’s new sidebar, version label, mobile navigation, and sign-in/account button into a shared website shell.
- Render every website page inside that shell, including presets, changelog, account, sign-in, linking, password reset, and error pages.
- Remove the homepage-only copy of the navigation to avoid duplication.
- Keep the desktop sidebar fixed while pages scroll; use a compact top navigation on smaller screens.
- Highlight the current page consistently and preserve the existing signed-in “Account” state.
- Adjust each page’s outer spacing only where needed so its content aligns cleanly inside the shared frame.

## Verification
- Check Home, Presets, What’s new, Sign in, and Account at desktop and mobile widths.
- Confirm one navigation frame appears on each page, active states are correct, no content is covered, and there is no horizontal overflow.
- Confirm the website still builds cleanly.

## Technical details
- Add a reusable React shell component and mount it around the root route outlet.
- Keep route-specific content and metadata unchanged.
- Reuse the project’s existing visual tokens, icon asset, navigation labels, and breakpoint behavior.
