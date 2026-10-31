# Midnight Glass tokens and recipes

## Contents

1. Source corrections
2. Setup
3. Semantic tokens
4. Theme additions
5. Component recipes
6. Background atmosphere

## 1. Source corrections

The style reference is reconstructed from a website, so these values and conflicts were resolved here:

| Source | Used here | Why |
| --- | --- | --- |
| Steel Plate surface `#2f343` | `#2f343e` | The surface value is a malformed hex. The color table has the full value. |
| Gradient `0deg` | `180deg` | `0deg` puts the bright color at the bottom, but the source describes a top-to-bottom fade from bright to soft blue. |
| Violet CTA radius 6px, and also 9999px | Pill | The rules say every button is a pill. |
| Violet only on auth forms | One main action per view | An app needs a primary action on every screen. |
| Extra hues only as demo swatches | Status colors, plus charts | Budgets need over and under states. |
| Unnamed `--leading-*` and `--tracking-*` | `--text-*--line-height` and `--text-*--letter-spacing` | This is how Tailwind v4 binds them to a `text-*` utility. |

## 2. Setup

1. Load the fonts with `next/font/google` in `app/layout.tsx`, using the CSS variables `--font-inter`, `--font-space-grotesk` and `--font-jetbrains-mono`. Add all three to `<html>`.
2. In `app/globals.css`, replace the `:root` values with section 3, delete the `.dark` block, and add section 4. Remove the `html { @apply bg-gray-900 text-gray-100; }` rule, which overrides the tokens.
3. In `lib/utils.ts`, use `extendTailwindMerge` to add these to the `font-size` group: `caption`, `body-sm`, `body`, `subheading`, `heading-sm`, `heading`, `heading-lg`, `display`. Otherwise `cn()` can treat them as text colors and drop one of the two classes.
4. Update `components/ui/`: `button.tsx` to `rounded-full`, and `card.tsx` to `rounded-2xl`, no `border`, and `shadow-glass`.

## 3. Semantic tokens

```css
:root {
  --radius: 0.5rem; /* rounded-md becomes 6px */

  --background: #05060f;
  --foreground: #d1e4fa;
  --card: rgba(186, 214, 247, 0.03);
  --card-foreground: #d1e4fa;
  --popover: rgba(5, 6, 15, 0.97);
  --popover-foreground: #d1e4fa;
  --primary: #663af3;
  --primary-foreground: #ffffff;
  --secondary: #2f343e;
  --secondary-foreground: #ffffff;
  --muted: rgba(199, 211, 234, 0.06);
  --muted-foreground: #9da7ba;
  --accent: rgba(186, 214, 247, 0.12);
  --accent-foreground: #ffffff;
  --destructive: #e46d4c;
  --border: rgba(186, 215, 247, 0.12);
  --input: rgba(186, 215, 247, 0.12);
  --ring: #b6d9fc;

  --chart-1: #b6d9fc;
  --chart-2: #027dea;
  --chart-3: #269684;
  --chart-4: #e46d4c;
  --chart-5: #9da7ba;

  --sidebar: #05060f;
  --sidebar-foreground: #d1e4fa;
  --sidebar-primary: #663af3;
  --sidebar-primary-foreground: #ffffff;
  --sidebar-accent: rgba(186, 214, 247, 0.12);
  --sidebar-accent-foreground: #ffffff;
  --sidebar-border: rgba(186, 215, 247, 0.12);
  --sidebar-ring: #b6d9fc;
}
```

## 4. Theme additions

Add the first block inside the existing `@theme inline` block and the rest as a new `@theme` block. These names don't collide with Tailwind or shadcn defaults.

```css
@theme inline {
  --font-sans: var(--font-inter);
  --font-display: var(--font-space-grotesk);
  --font-eyebrow: var(--font-jetbrains-mono);
}

@theme {
  --color-ice-highlight: #d8ecf8;
  --color-frost-glow: #d1e4fa;
  --color-moon-mist: #c7d3ea;
  --color-fog-veil: #9da7ba;
  --color-blueprint-blue: #b6d9fc;
  --color-ember-glow: #e46d4c;
  --color-deep-teal: #269684;
  --color-signal-blue: #027dea;
  --color-glass-edge: rgba(186, 215, 247, 0.12);
  --color-frost-wash: rgba(186, 214, 247, 0.06);

  --text-caption: 12px;
  --text-caption--line-height: 1.33;
  --text-body-sm: 14px;
  --text-body-sm--line-height: 1.43;
  --text-body: 16px;
  --text-body--line-height: 1.5;
  --text-body--letter-spacing: -0.16px;
  --text-subheading: 18px;
  --text-subheading--line-height: 1.33;
  --text-heading-sm: 24px;
  --text-heading-sm--line-height: 1.17;
  --text-heading-sm--letter-spacing: -0.24px;
  --text-heading: 28px;
  --text-heading--line-height: 1.14;
  --text-heading-lg: 44px;
  --text-heading-lg--line-height: 1.16;
  --text-display: 48px;
  --text-display--line-height: 1.17;

  --shadow-hairline: inset 0 0 0 1px rgba(186, 215, 247, 0.12);
  --shadow-hairline-focus: inset 0 0 0 1px rgba(186, 214, 247, 0.24);
  --shadow-glass:
    inset 0 1px 1px rgba(199, 211, 234, 0.12),
    inset 0 24px 48px rgba(199, 211, 234, 0.05),
    0 24px 32px rgba(6, 6, 14, 0.7);
  --shadow-modal:
    inset 0 1px 1px rgba(216, 236, 248, 0.2),
    inset 0 24px 48px rgba(168, 216, 245, 0.06),
    0 16px 32px rgba(0, 0, 0, 0.3);
  --shadow-glow:
    0 0 6px rgba(186, 207, 247, 0.32),
    0 0 12px rgba(238, 186, 247, 0.24);
}

@utility text-ice-gradient {
  background-image: linear-gradient(180deg, #d8ecf8 0%, #98c0ef 100%);
  background-clip: text;
  color: transparent;
}
```

## 5. Component recipes

**Primary button (violet):** default shadcn variant. `rounded-full`, white text, weight 500, 14px. At most one per view.

**Ghost pill:** `rounded-full bg-frost-wash px-4 py-2 text-body-sm font-medium text-white shadow-hairline hover:bg-accent`.

**Outlined pill:** `rounded-full px-4 py-2 text-body-sm font-medium text-foreground shadow-hairline`.

**Glass card:** `rounded-2xl bg-card p-6 shadow-glass`.

**Dialog or sheet:** `rounded-2xl bg-popover p-6 shadow-modal`.

**Input:** `rounded-md bg-muted px-2.5 text-white shadow-hairline placeholder:text-moon-mist/60 focus-visible:shadow-hairline-focus focus-visible:ring-2 focus-visible:ring-ring`.

**Badge:** `rounded-md bg-accent px-2 py-1 text-caption font-medium text-foreground`.

**Status badge:** a badge with a sign or icon, plus `text-deep-teal` or `text-ember-glow`.

**Icon tile:** a 56px circle, `rounded-full bg-frost-wash shadow-hairline`, with a line icon at 1.5px stroke in `text-foreground`. Use lucide, which the repo already has.

**Eyebrow label:** `font-eyebrow text-[15px] uppercase tracking-[0.1em] text-moon-mist`, centered, between lines that fade from transparent to `rgba(186, 215, 247, 0.12)`. Use on landing and demo sections only.

**Data table:**
- Wrap it in a glass card with `p-0` so the rows sit on the canvas.
- Header: `text-caption font-medium text-muted-foreground`.
- Rows: `text-body-sm border-b border-border last:border-b-0`.
- Amount cells: `text-right tabular-nums`.

## 6. Background atmosphere

Use on the login page, demo intro and empty states only.

**Grid:** 1px lines at `rgba(186, 215, 247, 0.06)`, 80px cells, full-bleed, masked to fade at the edges.

**Spotlight:** at the top center of the section.

```css
background: conic-gradient(
  at 50% -5%,
  transparent 45%,
  rgba(124, 145, 182, 0.3) 49%,
  rgba(124, 145, 182, 0.5) 50%,
  rgba(124, 145, 182, 0.3) 51%,
  transparent 55%
);
```

Keep gradients cool-tinted. Warm gradients break the mood.
