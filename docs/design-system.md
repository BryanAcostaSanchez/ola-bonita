# Ola Bonita — Coastal Beauty Glass

This document defines the visual system for the application. It is deliberately
separate from application behaviour: visual work must not change routes, data,
permissions, booking flows, payment flows, or business rules.

## Foundations

The product is a luminous, coastal spa experience: primarily Pearl White and
Sea Mist, with Ola Turquoise for action and Bonita Pink as a restrained accent.
The intended balance is 70% neutral surfaces, 20% aqua, 7% pink and 3% premium
or neutral accents.

| Semantic token | Value | Purpose |
| --- | --- | --- |
| `--background` | `#F8FCFC` | Application canvas / Pearl White |
| `--background-secondary` | `#EFF9F9` | Soft differentiated areas / Sea Mist |
| `--surface` | `#FFFFFF` | Opaque controls when needed |
| `--surface-glass` | `rgba(255,255,255,.72)` | Glass cards and panels |
| `--primary` / `--primary-hover` | `#16B8C4` / `#0B8F9B` | Main action / hover |
| `--primary-soft` | `#DDF6F7` | Selected and soft interactive states |
| `--accent` / `--accent-hover` | `#F46BC1` / `#D94FA6` | Intentional feminine highlight |
| `--accent-soft` | `#FDE7F5` | Soft accent backgrounds |
| `--text-heading` / `--text-primary` | `#102D30` / `#183A3D` | Hierarchy and body text |
| `--text-secondary` | `#6F8587` | Metadata and descriptions |
| `--border` | `#D8EBEC` | Default low-contrast boundary |
| `--premium` | `#E8D8C5` | Rare premium neutral detail |

Status states use `--success`, `--warning`, `--danger`, `--info` and their
corresponding `*-soft` tokens. New UI must never introduce a component-level
hex color, shadow, radius, or transition; it must consume these tokens.

## Surfaces and depth

Cards use `--surface-glass`, `backdrop-filter: blur(var(--blur-md)) saturate(130%)`,
a translucent light border, and `--shadow-sm` or `--shadow-glass`. The canvas
uses a very subtle Pearl White to Sea Mist gradient. Dark or fully saturated
large surfaces are avoided.

## Type and spacing

The UI uses Jost as its interface typeface. Headings are 600–700, body is
400–500, labels are 500–600. Logo/script type is never used inside product UI.

Spacing is based on `--spacing-1` through `--spacing-7`; controls are at least
44px high on touch contexts. Corners use `--radius-sm`, `--radius-md`,
`--radius-lg`, `--radius-xl`, or `--radius-pill` only.

## Components

- Primary actions: `--primary`, white text; hover `--primary-hover` with a
  small upward translation.
- Secondary actions: Sea Mist surface, primary text and Mist Border.
- Ghost actions: transparent surface, Deep Aqua text; Aqua Mist hover.
- Accent actions: reserved for meaningful pink highlights only.
- Inputs: translucent white, Mist Border, 44px minimum height and an Aqua
  focus ring. Native focus must remain visible.
- Navigation: translucent white sidebars; active items receive Aqua Mist,
  Deep Aqua text and a small turquoise indicator.
- Tables: generous vertical spacing, soft separators and Aqua Mist row hover.
- Modal, menu and popover: glass surface, `--shadow-glass`, clear focus and
  no heavy black overlay.

## Motion and accessibility

Interactive transitions use `--transition-fast` or `--transition-normal`.
There are no bouncing or decorative motion effects. `:focus-visible` has a
highly visible Deep Aqua outline. Text on pastel surfaces always uses the dark
text tokens; decorative color is never the only way to communicate a state.

## Migration rules

1. Keep DOM behaviour and component APIs unchanged.
2. Migrate reusable primitives and layout shells before feature-specific UI.
3. Replace legacy visual literals with semantic tokens as each component is
   touched; do not add new literals outside the token declarations.
4. Validate keyboard focus, disabled, error, success and mobile states after
   every visual migration.
