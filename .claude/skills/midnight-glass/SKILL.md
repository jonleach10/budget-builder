---
name: midnight-glass
description: Budget Builder's visual design system, a dark frosted-glass style on near-black with luminous blue-white text and one violet action color. Use this skill for any UI work in this repo, including building or restyling pages, components, tables, forms, empty states, charts and the demo or login screens, and whenever styling, colors, spacing, typography, Tailwind classes or shadcn/ui components come up, even if the request doesn't mention design.
---

# Midnight Glass

The look is a glass plate lit from behind: a near-black canvas, translucent surfaces, hairline edges in cool blue-white, and text that seems to glow. It comes from a style reference for a marketing site, but Budget Builder is a working finance app. People scan numbers here, so when atmosphere and legibility conflict, choose legibility.

For token values, setup and component recipes, read `references/tokens.md`. Pair this skill with `voice` for interface text and `dataviz` for charts.

## Stack rules

- Build on shadcn/ui and Tailwind v4. Use semantic classes such as `bg-card`, `text-muted-foreground`, `border-border` and `bg-primary`.
- Don't use raw palette classes such as `bg-gray-800` or `text-blue-400`, or hex values in class names. They bypass the tokens, which is how the Quick Start page drifted from the rest of the app.
- Don't paste a style reference's `@theme` block into `globals.css`. Its `--spacing-*`, `--radius-*` and `--shadow-sm/md` names would silently change Tailwind and shadcn utilities. For example, `p-4` would become 4px. `references/tokens.md` has the safe mapping.
- Use Tailwind's normal spacing scale: `gap-4` is 16px, `p-6` is 24px.
- Dark theme only for now. Keep `className="dark"` on `<html>`.

## Surfaces and depth

| Layer | Use | Class |
| --- | --- | --- |
| Canvas | Page background | `bg-background` |
| Glass | Cards and panels | `bg-card shadow-glass` |
| Deep glass | Dialogs, sheets, popovers | `bg-popover shadow-modal` |
| Solid plate | Long tables | `bg-background` inside a glass card |

- Show depth with inset highlights and soft glows, not ordinary drop shadows.
- Edges are hairlines at low opacity. Solid colored borders break the glass effect.
- Don't put the grid background or spotlight behind data. They belong on the login page, the demo intro and empty states, because faint lines behind numbers make them harder to read.
- Avoid `backdrop-blur` on tables and long lists. It slows scrolling and adds nothing to them.

## Shape

| Element | Radius |
| --- | --- |
| Buttons, toggles | Pill, `rounded-full` |
| Cards, dialogs | 16px, `rounded-2xl` |
| Inputs, badges | 6px, `rounded-md` |
| Icon tiles | Circle, `rounded-full` |

Keep each element type on one radius. Consistency is much of what makes the system feel intentional.

## Color

- **Text** steps down in brightness: heading `text-ice-highlight`, body `text-foreground`, secondary `text-moon-mist`, helper `text-muted-foreground`. White is for button and input text.
- **Violet** (`bg-primary`) is the single main action on a screen, such as Import or Save budget. Show at most one per view. Use it as a fill only, because violet text is too dark on the canvas. Other buttons use the ghost or outlined pill.
- **Status colors** carry meaning and nothing else:
  - Teal means under budget or healthy.
  - Ember means over budget, destructive or an error.
  - Signal blue means information.
- Every status color needs a second cue, such as a sign, label or icon, so the meaning survives for color-blind users.
- Don't add new hues. Chart categories use the `--chart-*` tokens.

## Typography

- Inter for all UI text, Space Grotesk for display headings, JetBrains Mono for eyebrow labels and for values compared with bank text, such as a rule's ID or match text. These are the free substitutes for the reference's licensed fonts, so don't add the originals without a license.
- Display headings use weight 500 at most. Their presence comes from size.
- The ice gradient (`text-ice-gradient`) is for the largest landing and demo headings only, never for body text, buttons or numbers.

## Finance screens

The reference is roomy and centered. App screens need more density, so use these values instead:

| Context | Page heading | Section gap | Text |
| --- | --- | --- | --- |
| Landing, demo intro, login | `text-heading-lg` or `text-display` | 120px, `gap-30` | `text-body` |
| App pages | `text-heading` | 32 to 48px, `gap-8` to `gap-12` | `text-body-sm` |

- Page content sits in a centered container, at most 1200px wide, with 24px card padding.
- Tables: left-align text, right-align amounts, keep the header row visible, and use subtle row dividers rather than zebra stripes.
- Amounts use `tabular-nums` so digits line up. Always show the currency when it differs from the base currency.
- For foreign transactions, show the base-currency amount first and the original amount under it in `text-muted-foreground`.
- Don't use the brightest text for every number. Reserve it for totals, so the eye finds them first.

## Accessibility

- Every interactive element needs a visible focus state. Use the `ring` token, because the reference's hairline focus change is too faint for keyboard users.
- Don't place white text on a tint brighter than 12% opacity.
- Respect `prefers-reduced-motion` for glows and transitions.

## Identity

This style is adapted from WorkOS AuthKit's marketing site. Copy the visual language only. Never use WorkOS or AuthKit names, logos, wordmarks, copy or illustrations in the product.
