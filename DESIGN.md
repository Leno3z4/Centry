# Centry Design System

## Visual direction

Centry is a dark, premium financial product UI. The product surface should feel calm, precise, technical and trustworthy rather than futuristic or ornamental.

The visual system is built from a near-black canvas, a small ladder of neutral dark surfaces, hairline borders, restrained violet as the single brand accent, and green/red semantic states. Depth comes from contrast between surfaces and borders; it should not come from gradients, glassmorphism, glowing shadows or decorative chrome.

Centry should feel closer to a high-end product dashboard than a crypto casino.

## Core tokens

### Color

- Canvas: `#07080A`
- Surface 1: `#0D0F12`
- Surface 2: `#111317`
- Surface 3: `#15181C`
- Hairline: `#24272B`
- Hairline strong: `#34383F`
- Primary text: `#F4F5F7`
- Secondary text: `#A0A5AD`
- Tertiary text: `#747B84`
- Brand accent: `#B7A7FF`
- Brand accent strong: `#D2C8FF`
- Success: `#4EE39A`
- Danger: `#F07A8A`
- Warning: `#E2AA73`

Violet is an accent, not a background system. Do not turn whole sections purple.

## Typography

Use Inter for display, navigation, body copy and controls.

Use DM Mono only for:
- wallet addresses
- transaction hashes
- contract identifiers
- chain IDs
- other deliberately technical values

Prefer:
- Hero/display: 40–64px, weight 600, tight tracking
- Page headings: 32–48px, weight 600
- Section headings: 20–24px, weight 600
- Body: 14–16px
- Secondary text: 13–14px
- Captions: 12px minimum
- Avoid UI text below 11px except unavoidable technical metadata.

Numbers representing balances, rates and positions should use tabular numerals where possible.

## Spacing

Use a simple 4px base grid:

`4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 / 96`

Default product page gutters:
- Desktop: 32–42px
- Tablet: 24px
- Mobile: 16px

## Shape language

Default radii:
- Small controls: 8px
- Standard controls: 10–12px
- Cards: 12–16px
- Large feature surfaces: 20px max
- Pills: reserved for status badges, compact filters and state indicators

Do not make every control a pill.

## Surfaces and depth

Cards should normally use a flat surface:

`Canvas → Surface 1 → Surface 2 → Surface 3`

Use 1px borders to separate adjacent surfaces.

Avoid:
- multi-stop background gradients
- purple gradient buttons
- giant diffuse glows
- heavy card shadows
- decorative glassmorphism
- excessive backdrop blur

A small shadow may be used for a modal or floating menu where it communicates elevation.

## Buttons

Primary:
- Solid brand accent
- Dark text
- 44–48px minimum height
- 10–12px radius
- Strong contrast

Secondary:
- Neutral dark surface
- Neutral border
- Light text

Tertiary:
- Text/icon treatment with no large filled background

Primary actions should be visually singular. Do not put several competing high-emphasis buttons beside one another.

## Forms

Labels should be readable rather than microscopic.

Inputs:
- 44–52px minimum height
- 14–16px text
- clear border
- obvious focus ring
- strong contrast between field surface and page surface

Financial amount fields may use larger numerals, but the surrounding metadata should remain readable.

## Data presentation

Centry is a financial application, so information hierarchy matters more than decoration.

Use:
- strong large values for balances and positions
- 14px+ supporting labels
- aligned numeric columns
- clear positive/negative semantics
- stable row heights
- hairline separators

Do not compress a data table until text becomes difficult to read.

## Navigation

Desktop uses a fixed sidebar with a neutral dark surface.

The active route should use:
- a slightly elevated neutral surface
- a restrained accent indicator
- no large gradient block

Mobile uses a compact top bar plus an accessible menu.

Touch targets should be at least 44px.

## Product pages

### Overview

Lead with the user's financial state:
1. portfolio / supplied / borrowed / health
2. markets
3. position details
4. governance and rewards

Decorative artwork must never compete with primary values.

### Swap / Transfer / Gateway / Bridge

Use an obvious transaction workspace:
- asset or chain selector
- large amount field
- quote / route information
- one primary submit action
- transaction status and result

The transaction preview is more important than visual effects.

### Markets

Use dense but readable market rows with:
- asset identity
- status
- key market metric
- clear navigation

### Governance

Treat voting power and locked positions as financial data, not marketing content. Use readable cards, explicit durations and high-clarity confirmation flows.

### Agents

Agent UI should feel like a control console:
- status
- balance
- activity
- configuration
- permissions
- execution controls

Keep advanced settings behind explicit actions.

## Responsive rules

At less than 768px:
- one-column layouts
- 16px horizontal gutters
- 44–52px controls
- stacked page headers
- action groups collapse to one or two columns
- addresses wrap safely
- large data grids become vertically stacked cards
- no horizontal page overflow

At very narrow widths (< 430px):
- avoid two-column controls unless both values remain comfortably readable
- use full-width primary actions
- preserve 16px body text for transaction-critical content

## Interaction

Motion should clarify state:
- 120–180ms transitions
- subtle hover movement only on interactive cards
- focus rings must remain obvious
- loading states should not cause layout jumps

Do not animate decorative gradients or create continuous glow effects.

## Design guardrails

Do:
- use neutral dark surfaces
- use one restrained accent
- prioritize readable financial values
- keep visual hierarchy obvious
- make transaction-critical controls large and clear
- use consistent spacing and radii

Don't:
- use purple gradients as a default visual language
- use tiny uppercase labels everywhere
- use excessive rounded pills
- rely on shadows to separate every card
- hide important information behind ornamental UI
- make the app look like a gaming interface

## Reference philosophy

This system takes useful patterns from the DESIGN.md collection in `Leno3z4/awesome-design-md`: strong surface hierarchies, restrained accent usage, readable typography, deliberate spacing, explicit component states, and mobile-first collapsing rules. The resulting tokens above are Centry-specific rather than copies of another brand's visual identity.
