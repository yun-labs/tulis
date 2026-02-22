# Tulis Color Theming

This document defines the app color system and how it maps to the CSS tokens in `/src/app/globals.css`.

The current direction is a calm, premium dark UI with a muted indigo accent. The system is also mirrored in light mode with the same token names.

## Principles

- Muted indigo accent, not neon
- Layered depth in dark mode (sidebar, header, canvas, surfaces are distinct)
- Borders/dividers do most of the visual separation work
- No glow effects
- No neon shadows
- No gradient buttons
- Accent usage is intentionally limited

## Accent (Muted Indigo)

- `--accent`: `#5C6AC4`
- `--accentHover`: `#505BB5`
- `--accentActive`: `#464FA1`
- `--accentTintLight`: `rgba(92, 106, 196, 0.14)`
- `--accentTintDark`: `rgba(92, 106, 196, 0.14)`
- `--focusRing`: `rgba(92, 106, 196, 0.35)`

## Dark Theme Tokens (Premium Layered)

These are defined in `:root[data-theme='dark']` in `/src/app/globals.css`.

- `--bg` (app background): `#0B1020`
- `--sidebar` (notes drawer): `#121831`
- `--header` (top nav/header): `#171F3C`
- `--canvas` (editor canvas area): `#0C1228`
- `--surface` (surface level 1): `#141C39`
- `--surface2` (menus/cards/popovers): `#19224A`
- `--surface3` (elevated surface): `#19224A`

### Dark Borders / Dividers

- `--border`: `rgba(255,255,255,0.06)`
- `--border2`: `rgba(255,255,255,0.09)`
- `--divider`: `rgba(255,255,255,0.05)`

### Dark Text

- `--text` (primary): `#E7EAF6`
- `--text2` (secondary): `rgba(231,234,246,0.72)`
- `--text3` (muted): `rgba(231,234,246,0.50)`
- `--textDisabled`: `rgba(231,234,246,0.35)`

### Dark Icons / Inputs / Depth

- `--iconPrimary`: `rgba(231,234,246,0.80)`
- `--iconMuted`: `rgba(231,234,246,0.55)`
- `--inputBg`: `rgba(255,255,255,0.03)`
- `--inputBorder`: `rgba(255,255,255,0.08)`
- `--placeholder`: `rgba(231,234,246,0.38)`
- `--shadow1`: `0 8px 24px rgba(0,0,0,0.35)`
- `--shadow2`: `0 12px 40px rgba(0,0,0,0.45)`

## Light Theme Tokens

These are defined in `:root[data-theme='light']` (and default `:root`) in `/src/app/globals.css`.

- `--bg`: `#F5F7FB`
- `--sidebar`: `#FFFFFF`
- `--header`: `#FFFFFF`
- `--canvas`: `#F5F7FB`
- `--surface`: `#FFFFFF`
- `--surface2`: `#EEF2FA`
- `--surface3`: `#FFFFFF`
- `--border`: `#E5E8F3`
- `--border2`: `#EDF0F7`
- `--divider`: `#E5E8F3`
- `--text`: `#1F2435`
- `--text2`: `#5E667F`
- `--text3`: `#8891A9`
- `--textDisabled`: `rgba(31,36,53,0.35)`
- `--iconPrimary`: `rgba(31,36,53,0.80)`
- `--iconMuted`: `rgba(31,36,53,0.55)`
- `--inputBg`: `#FFFFFF`
- `--inputBorder`: `#E5E8F3`
- `--placeholder`: `rgba(31,36,53,0.38)`

## App Semantic Aliases

`/src/app/globals.css` also exposes semantic aliases used across components:

- `--tulis-bg`
- `--tulis-surface`
- `--tulis-sidebar`
- `--tulis-header`
- `--tulis-canvas`
- `--tulis-text`
- `--tulis-muted`
- `--tulis-border`

Prefer semantic aliases in components when possible; update raw palette tokens centrally in `globals.css`.

## Layer Mapping Rules (Important)

Use these layers consistently to avoid a flat or noisy dark UI:

- Sidebar: `--sidebar`
- Header / top nav: `--header`
- Editor canvas / page content area: `--canvas`
- Popovers / menus / note row hovers / cards: `--surface` / `--surface2`
- Elevated overlays/modals: `--surface3` (or `--surface2` if no extra elevation is needed)

Separators:

- Sidebar-to-canvas divider: `1px var(--border)` or `var(--border2)` if more contrast is needed
- Header bottom divider: `1px var(--divider)`

## Accent Usage Rules

Keep accent usage limited to:

- Primary CTA (for example, `New Note`)
- Selected note left indicator bar
- Active tabs / selected segmented controls
- Checked checkbox state
- Focus rings

Avoid using accent for generic icon hover states, secondary buttons, or passive status dots unless there is a clear semantic reason.

## Current Notes UI Conventions

- Active note in sidebar: indicated by left accent bar only (no persistent active row background)
- Active note row still gets normal hover background like other rows
- Sync status text/dot stays neutral for `loading` / `syncing` / `synced`, and red for error
- Note metadata is called **Labels** in the note/sidebar UI (distinct from editor slash commands like `/tag`, `/taggreen`, etc.)

## Editing Guidance

When adjusting theme colors:

1. Change tokens in `/src/app/globals.css` first.
2. Only patch component classes if a component is bypassing tokens or overusing accent.
3. Check the notes screen in both light and dark themes.
4. Verify contrast on:
   - title input / search inputs
   - popover menus
   - sync indicator + disabled buttons
   - note row hover states

## Quick “Flat Dark UI” Fixes

If dark mode starts looking flat:

- Make `--header` slightly brighter than `--sidebar`
- Keep `--canvas` darker than `--header`
- Increase sidebar/canvas divider contrast using `--border2`
- Increase `--text2` opacity slightly (for readability) before reaching for more accent
