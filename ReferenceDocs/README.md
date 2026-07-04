# Handoff: FinanceOS — Manufacturing Profitability Workspace

## Overview
FinanceOS is a costing and margin-analysis SaaS for manufacturers. The prototype models
a brass-fittings maker ("Gupta Brass Fittings") and lets a finance/ops user maintain a
**price book** of input costs, build **BOM templates** (recipes), attach **products** to
those templates, watch **margins** across the catalog, and run **what-if simulations** on
input-cost or price changes before committing. The app spans an auth flow, a 4-step
onboarding, and a 6-screen authenticated workspace with modals, a slide-over detail panel,
confirm dialogs, and toasts.

## About the Design Files
The file in this bundle (`FinanceOS Dashboard.dc.html`) is a **design reference created in
HTML** — a working prototype that demonstrates the intended look, layout, and behavior. It is
**not production code to lift directly.** Your task is to **recreate these designs inside the
target codebase**, using its existing environment, patterns, component library, and state
management (React, Vue, Svelte, etc.). If the codebase has no established UI layer yet, pick
the framework best suited to the project and implement there.

The prototype is a single self-contained component with local (in-memory) state. In a real app
the domain data (costs, templates, products, categories) belongs in a proper store / backend;
treat the in-file `state` object as the **data model spec**, not as the persistence layer.

> Note on units in the source: styles use `oklch()` colors and unitless numbers are `px`.
> The prototype is built with a small template runtime, but you should ignore that machinery
> — only the markup, styles, data model, and interactions described below matter.

## Fidelity
**High-fidelity (hifi).** Colors, typography, spacing, radii, and interaction states are final.
Recreate the UI faithfully using the codebase's existing primitives, matching the tokens below.

---

## Global Layout & Shell

The authenticated app is a fixed **left sidebar + scrolling content** layout:

- **Sidebar** (~248px, fixed): logo + wordmark ("FinanceOS"), primary nav, and a user/company
  footer. Nav items: **Dashboard, Products, Templates, Master Costs, What-If Simulation,
  Settings**. Active item has a filled/tinted background; nav row style:
  `display:flex; align-items:center; gap:12px; padding:9px 12px; border-radius:10px; font-size:14px`.
- **Content area**: max-width container, `animation:fadeUp .4s ease` on screen switch. Each
  screen opens with a mono **eyebrow label** (e.g. `MARGIN OVERVIEW`, `SKU CATALOG`,
  `BOM / RECIPE BUILDER`, `PRICE BOOK`, `WHAT-IF ENGINE`, `COMPANY`) above an `<h1>` (~29px, weight 800).
- App background: `oklch(0.975 0.004 240)` (near-white cool gray). Cards: white,
  `border:1px solid oklch(0.92 0.004 250)`, `border-radius:16px`, shadow `0 1px 2px oklch(0.3 0.02 260/0.04)`.

Routing in the prototype is a single `screen` string in state; use real routes in production.

---

## Screens / Views

### 1. Auth (`route: signin` / `signup`)
Two-column full-height. **Left panel**: dark teal `oklch(0.275 0.03 178)`, white text, logo,
mono eyebrow "MANUFACTURING PROFITABILITY", a 34px headline, three checkmark feature bullets,
and a faint line-chart SVG watermark bottom-right. **Right panel**: 352px form column.
- **Sign in**: Email, Password (with "Forgot?" link), primary "Sign in" button, "Create account"
  link, and a mono "Explore the demo workspace →" link that skips straight into the app.
- **Sign up**: Your name, Company, Work email, "Create account". Toggling between the two
  animates with `fadeUp .4s`.
- Any submit / demo link advances to onboarding (or straight to dashboard for the demo link).

### 2. Onboarding (4 steps)
Centered 940px card, `grid-template-columns:260px 1fr`. **Left rail**: mono "GET STARTED" label,
a 4-item vertical stepper (each row: numbered circle + label; completed/active/upcoming states
via bg + border + weight), and a mint help card. **Header**: logo, "STEP N OF 4", "Skip setup".
The right pane walks through setup steps and ends by (optionally) creating a first product from a
template + weight + price, previewing its computed cost/margin live. "Skip setup" and finishing
both land on the Dashboard.

### 3. Dashboard (`screen: dashboard`)
Margin overview. Key blocks:
- **Average margin** bar with a **goal marker** (goal default 55%) and a delta chip
  (green if at/above goal `oklch(0.48 0.08 168)`, amber if below `oklch(0.58 0.1 55)`).
- **Stat tiles**: SKU count, template count, master-cost count, category count.
- **At-risk panel**: lists products whose margin % is below the risk threshold (default 42%);
  card tints red `oklch(0.96 0.03 40)` / accent `oklch(0.55 0.14 40)` when any exist, else mint.
- **Best / worst margin** product cards with mini progress bars (scaled to a 70% max).
- **Per-category** margin bars with the risk threshold drawn as a line.

### 4. Products (`screen: products`)
SKU catalog. Header with "New product" primary button. **Category filter tabs** (All + each
category). **Table**: columns `product · template · weight · price · margin · actions`
(grid `2.1fr 1.1fr 0.9fr 0.9fr 1.2fr 74px`, mono header row). Each row shows computed cost &
margin, a health badge (At risk / Watch / Healthy), edit + delete icon buttons. Search box,
pagination (PAGE size per `pager`). Clicking a row opens the **product slide-over** (right,
660px, `slideIn .34s`) with cost breakdown by component. Empty state when no products.

### 5. Templates (`screen: templates`)
BOM / recipe builder. Header "New template". Cards/rows per template showing name, category
badge (colored via category palette), and its line items (inputs from the price book). Edit /
delete. Search. "Manage categories" opens the categories modal.

### 6. Master Costs (`screen: costs`)
Price book. Header "New cost item". **Type filter tabs**: All / Raw material / Component /
Service. **Table** columns `name · type · unit · cost · Δ vs prev · trend · actions`
(grid `1.9fr 0.9fr 0.8fr 0.8fr 0.9fr 0.7fr 74px`). Each row shows current cost, previous cost,
a change indicator, and a small sparkline/trend derived from history. Type is shown with a
colored dot (raw_material amber, component blue, service violet). Edit / delete, search, paging.

### 7. What-If Simulation (`screen: simulate`)
Two-column top grid (`1.15fr 1fr`). **Global adjustment**: a range slider (−N%…+N%) plus preset
chips (−10%, 0, +10%, +25%) applying a blanket % change to all input costs; live label recolors
(amber up / mint down). **Per-item adjustments**: a list of master-cost rows, each individually
adjustable. Results show **average margin: base vs simulated** with a delta, and a **"newly at
risk" counter** — its card turns red when >0 new SKUs drop below threshold. "Reset" clears all
sim adjustments. Full simulated product table.

### 8. Settings (`screen: settings`)
Max-width 640px. "COMPANY" eyebrow. Company profile card, and margin-policy controls
(risk threshold, margin goal, currency symbol) that override the defaults.

### Overlays (shared)
- **Modals**: New/Edit **cost item** (440px, centered, `pop .26s`), New/Edit **product** and
  New/Edit **template** (660px right slide-over, `slideIn .34s`), **Manage categories** (460px).
  Overlay: `oklch(0.2 0.02 260/0.35)` + `backdrop-filter:blur(3px)`, `z-index:30`.
- **Confirm dialog**: delete confirmation with entity name and a dependency note
  (e.g. "N products built on it will also be deleted").
- **Toast**: bottom-center, `toastIn` animation, auto-dismiss.

---

## Interactions & Behavior
- **Nav**: clicking a sidebar item switches `screen`; content re-enters with `fadeUp .4s`.
- **CRUD**: create/edit via modals with a `draft` object; validation blocks save on empty name
  or non-positive numeric fields. Save shows a toast ("Product created", "Cost item updated", …).
- **Delete**: opens confirm; confirming removes the entity. Deleting a template cascades to its
  products; deleting a cost warns how many templates use it.
- **Live computation**: product cost = sum of its component costs × qty (components come from the
  attached template's line items, or an explicit per-product override list). Margin ₹ =
  price − cost; margin % = margin ₹ / price. All values recompute on every state change.
- **Health thresholds**: `<threshold` → "At risk" (red); `<threshold+12` → "Watch" (amber);
  else "Healthy" (mint).
- **Number formatting**: Indian grouping (lakh/crore, e.g. `₹1,23,456`), rupee prefix, `−` for
  negatives. Percentages to 1 decimal.
- **Simulation**: global % and per-item % adjust each input cost; product margins recompute
  against adjusted costs without mutating the stored price book.
- **Animations**: `fadeUp`(.4s), `slideIn`(.34s cubic-bezier(.2,.85,.25,1)), `pop`(.26s same
  easing), `fade`(.18s), `toastIn`, plus `barRise` for chart bars and `pulseDot` for live dots.

## State Management
Model these domains (prototype keeps them all in one `state`; split into stores/queries as fits):
- **Session/routing**: `route` (signin|signup|onboarding|app), `screen` (dashboard|products|
  templates|costs|simulate|settings), `auth` (name, company, email, password).
- **Onboarding**: `onboardStep` (0–3), `onboardChoice`, `obDraft` (name, template, weight, price).
- **Price book** (`master`): keyed map of cost items `{ name, type: raw_material|component|service,
  unit, cost, prev, history[] }`, plus `masterOrder` for display order.
- **Templates**: keyed map `{ name, cat, lines: [key | {key, qty}] }`, plus `tplOrder`.
- **Products**: array `{ id, name, t: templateKey, w: weight, price, comps?: [{key, qty}] }`.
- **Categories**: string array; each maps to a color via a fixed palette (index % palette length).
- **Policy overrides**: `thrOverride` (risk threshold %), `goalOverride` (margin goal %), `currencySym`.
- **UI**: filters (`costFilter`, `productCat`), searches, pagination pages, `hoverCost`,
  `openProduct` (slide-over), `modal`, `confirm`, `toast`, `simGlobal`, `simItem` (per-item %), `seq`.

**Configurable defaults** (were exposed as component props): `riskThreshold` = 42 (range 25–55),
`marginGoal` = 55 (range 40–70), `companyName` = "Gupta Brass Fittings". Effective value =
override ?? prop ?? hardcoded default.

## Design Tokens

**Fonts** (Google Fonts): **Manrope** (400/500/600/700/800) — UI & headings; **IBM Plex Mono**
(400/500/600) — eyebrows, labels, table headers, meta.

**Type scale**: h1 ~29px/800; auth headline 34px/800; body 13.5–14.5px; mono labels 10.5–11px
with `letter-spacing:0.08–0.16em`; table header 11px mono.

**Colors** (oklch):
- App bg `oklch(0.975 0.004 240)`; card bg `#fff`; card border `oklch(0.92 0.004 250)`.
- Text: primary `oklch(0.25 0.01 260)`; secondary `oklch(0.5 0.01 260)`; muted `oklch(0.55–0.6 0.01 260)`.
- Dark/primary button & auth panel: `oklch(0.28 0.02 260)` / auth `oklch(0.275 0.03 178)`.
- Brand mint/teal accents: logo tile `oklch(0.5 0.09 168)`, mint tints `oklch(0.965 0.015 168)`.
- Semantic — **risk/red** `oklch(0.55 0.14 40)` on `oklch(0.96 0.03 40)`; **watch/amber**
  `oklch(0.58 0.1 65)`; **healthy/mint** `oklch(0.48–0.5 0.08–0.09 168)`.
- Type dots: raw_material `oklch(0.58 0.12 45)`, component `oklch(0.5 0.1 250)`, service `oklch(0.52 0.09 300)`.
- Category palette (6, cycled): blue 250, violet 300, orange 45, teal 162, red 20, olive 100
  (each as `{color, bg, dot}` at matching hue).

**Radii**: buttons/inputs 10px; small controls 8–9px; cards 16px; modals 18px; big cards/onboarding 20px.

**Shadows**: card `0 1px 2px oklch(0.3 0.02 260/0.04)`; primary btn `0 1px 2px oklch(0.3 0.02 260/0.2)`;
modal `0 24px 70px oklch(0.2 0.02 260/0.28)`; slide-over `-12px 0 40px oklch(0.2 0.02 260/0.16)`.

**Reusable control styles** (exact source values):
- `label`: block, IBM Plex Mono, 10.5px, `letter-spacing:0.08em`, `oklch(0.5 0.01 260)`, weight 500.
- `input`: full width, `padding:11px 13px`, `border:1px solid oklch(0.89 0.005 250)`, radius 10px,
  14px text; focus `border-color:oklch(0.55 0.07 172); box-shadow:0 0 0 3px oklch(0.55 0.09 172/0.14)`.
- `primary` btn: dark `oklch(0.28 0.02 260)`, white, radius 10px, weight 700; hover `oklch(0.22 0.02 260)`.
- `ghost` btn: white, `border:1px solid oklch(0.91 0.004 250)`, weight 600; `ghostSm` is a smaller variant.
- `iconBtn`: 30×30, radius 8px, bordered white square.

## Assets
No raster assets. All iconography is **inline stroke SVG** (Lucide-style, `stroke-width` ~2,
round caps/joins) and the auth-panel line-chart watermark is inline SVG. Use the codebase's
existing icon set (e.g. lucide-react) to match. Fonts load from Google Fonts.

## Files
- `FinanceOS Dashboard.dc.html` — the complete prototype (all screens, logic, and data).
  Open it in a browser to interact with the live reference while implementing.
