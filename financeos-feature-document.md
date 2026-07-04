# FinanceOS — Feature Specification Document

**Product:** Manufacturing profitability & costing platform
**Stack:** Next.js (App Router) · Prisma · Neon (Postgres) · Auth.js (NextAuth v5)
**Demo tenant:** Gupta Brass Fittings Pvt. Ltd. (brass sanitary fittings — faucets, mixers, pillar cocks, angle valves)

This document breaks the product into 10 modules. Each module lists purpose, user stories, MVP features, V2+ features, and technical/acceptance notes. Data models and schema live in a separate architecture document. Use this as the working spec for sprint planning.

---

## Module 1 — Master Costs (Price Book)

### Purpose
The single source of truth for input pricing. Every downstream cost calculation (templates, products, dashboards, simulations) reads from this table. Accuracy and freshness here determines the trustworthiness of the entire app.

### User Stories
- As a Cost Manager, I want to record the current price of every raw material, component, and service so the system always calculates true cost.
- As a Cost Manager, I want to see price history so I can spot trends and justify selling-price changes.
- As an Admin, I want to bulk-import my existing price list on day one instead of typing it in one row at a time.

### MVP Features
| Feature | Description |
|---|---|
| Cost item CRUD | Create/edit/archive items with type (`raw_material`, `component`, `service`), unit, current cost |
| Type-aware fields | Raw material → ₹/kg (or configurable unit); component/service → ₹/piece |
| Auto price history | Every cost update writes a row to `cost_history` (old value, new value, changed_by, timestamp) — never overwrite silently |
| Previous vs current diff | Show % and ₹ change inline on the list view |
| Search / filter / sort | By category, name, last-updated date |
| CSV bulk import | Upload a price list to seed `master_costs` in one pass, with validation + error report |
| Staleness indicator | Flag items not updated in >N days (configurable per company) |

### V2+ Features
- Scheduled/future-dated price changes ("brass rate changes to ₹750 effective 1 Aug")
- Supplier linkage (multiple suppliers per item, rate comparison)
- Price-change approval workflow (proposer → approver)
- Multi-currency support for imported raw materials

### Technical Notes
- Every write to `MasterCost.currentCost` triggers a `CostHistory` insert inside the same Prisma transaction — never a separate uncommitted step.
- Because templates and products both cascade from this table, updates here are the trigger point for the incremental-recompute job described in Module 5.
- Index on `(companyId, type)` for fast filtered list views.

### Acceptance Criteria
- Updating a cost item always produces exactly one new `CostHistory` row.
- CSV import rejects rows with invalid type/unit combinations and reports line numbers, not just a generic failure.

---

## Module 2 — Templates (BOM / Recipe Builder)

### Purpose
The reusable "recipe" layer — defines how a product family is built, decoupled from any single SKU's price or exact material quantity.

### User Stories
- As a Cost Manager, I want to define a Basin Mixer template once (brass by weight + fittings + plating + labour) so every Basin Mixer SKU inherits the same recipe structure.
- As a Cost Manager, I want a live cost preview while I build a template so I know immediately if it's commercially viable.
- As an Admin, I want template edits versioned so past product costs don't silently change when I tweak a recipe today.

### MVP Features
| Feature | Description |
|---|---|
| Template CRUD | Named product families, e.g. "Basin Mixer", "Wall Mixer", "Pillar Cock" |
| Weight-based line | One raw material applied by weight (`type: weight`) — quantity supplied later at the product level |
| Fixed-quantity lines | N components/services at fixed quantity (`type: fixed`), e.g. 2× Flange, 1× Chrome Plating |
| Live cost preview | Sums current `master_costs` as components are added/removed |
| Clone template | Duplicate an existing template as a starting point for a variant |
| Version history | Snapshot template state on every save; products reference a specific version, not a live pointer |

### V2+ Features
- Template categories/tags
- "Where used" view — list of products referencing a template
- Nested templates (sub-assembly BOMs)
- Side-by-side template comparison

### Technical Notes
- `quantity` is null/unused for `weight`-type lines — the actual weight is supplied per-product (Module 3). This is the key modeling decision that lets one template serve many SKUs with different sizes.
- Version snapshots are stored as JSONB so historical product costs can be recalculated exactly as they were, even after the live template changes.

### Acceptance Criteria
- Editing a template does not change the computed cost of a product created against a prior version, unless the user explicitly re-links the product to the new version.
- Cost preview updates within the same interaction — no page reload.

---

## Module 3 — Products (SKUs)

### Purpose
The concrete, sellable item. Where recipe (template) meets reality (actual weight, actual selling price) to produce the number that matters: margin.

### User Stories
- As a Cost Manager, I want to create a SKU from a template by just entering the brass weight and selling price, and have total cost and margin calculated automatically.
- As a Sales/Product user, I want to scan a product list and immediately see which SKUs are healthy vs at-risk on margin.
- As a Cost Manager, I want a full line-by-line cost breakdown per product so I can explain the number to anyone.

### MVP Features
| Feature | Description |
|---|---|
| Product creation from template | Select template, enter `brassWeight` and `sellingPrice`, rest is inherited |
| Auto-computed cost fields | Total cost, gross margin ₹, gross margin % — recalculated on any dependency change |
| Product list/grid | Sortable/filterable by cost, price, margin %, template, status |
| Product detail breakdown | Every cost line (material + each component + each service) shown individually with unit cost × quantity |
| Margin health flags | Red/yellow/green based on company-configurable margin thresholds |
| Clone product | Duplicate an existing SKU as a starting point for a new variant |

### V2+ Features
- Bulk selling-price update tool
- Product images/attachments
- Product status lifecycle (draft/active/discontinued)
- Custom fields per product

### Technical Notes
- `totalCost`/margin fields are **cached, not purely virtual** — computed once at write time and refreshed by the incremental recompute job (Module 5) when an upstream `MasterCost` changes. Pure on-the-fly calculation doesn't scale once dashboards aggregate hundreds of SKUs.
- Cost breakdown view reconstructs from `TemplateVersion.snapshot` + `Product.brassWeight`, so it's reproducible even if master costs have since changed (compare "cost as of creation" vs "cost today").

### Acceptance Criteria
- Changing a product's `brassWeight` recalculates total cost and margin immediately, visible without a manual refresh.
- Margin health flag thresholds are configurable per company, not hardcoded.

---

## Module 4 — Margin & Profitability Dashboards

### Purpose
The at-a-glance view of business health — turns hundreds of individual product costings into decisions.

### User Stories
- As an Admin, I want a company-wide margin snapshot the moment I log in.
- As a Cost Manager, I want to see which products have fallen below my margin threshold without hunting through the full product list.
- As an Admin, I want to compare margin performance across product families (mixers vs valves).

### MVP Features
| Feature | Description |
|---|---|
| Company overview | Avg margin %, total SKU count, highest/lowest margin products |
| Margin trend per product | Line chart of a single product's margin over time as costs shifted |
| Margin-at-risk list | Products below the configured threshold, sorted by severity |
| Top/bottom N | Best and worst performing SKUs by margin ₹ or % |
| Category rollups | Aggregate margin by template/category (all mixers vs all valves) |

### V2+ Features
- Custom/drag-and-drop dashboard builder
- Cost-driver breakdown (% of total cost from material vs components vs services, catalog-wide)
- Contribution margin vs overhead-loaded margin toggle
- Scheduled PDF/Excel report exports

### Technical Notes
- Use a Postgres materialized view (`product_margin_summary`) refreshed on the same trigger as the incremental recompute, so dashboard queries are simple `SELECT`s against a pre-aggregated view rather than joining/summing live.
- Category rollups group by `Template.category`.

### Acceptance Criteria
- Dashboard loads in under ~1s for a catalog of a few hundred SKUs (materialized view, not live joins, is what makes this achievable).
- Margin-at-risk threshold is company-configurable and changes reflect immediately on next load.

---

## Module 5 — What-If / Price Simulation Engine

### Purpose
The core differentiator: answer "what happens to my margins if this input price changes?" before it happens, not after.

### User Stories
- As a Cost Manager, I want to type "brass goes to ₹750/kg" and instantly see every affected product's new cost and margin.
- As an Admin, I want to know which products would go margin-negative under a proposed price change, before I approve it.
- As a Cost Manager, I want to save a simulation so I can revisit or share it later.

### MVP Features
| Feature | Description |
|---|---|
| Single-input simulation | Change one master cost hypothetically; system finds every template/product that references it |
| Impact list | Affected SKUs only, ranked by ₹ or % margin impact |
| Before/after comparison | Side-by-side cost + margin table |
| Non-destructive | Simulation never writes to real `MasterCost`/`Product` data — pure read/compute |

### V2+ Features
- Multi-input simulation (change several inputs simultaneously)
- Break-even price calculator (what selling price restores target margin)
- Saved scenarios with names, for later comparison
- Shareable scenario snapshots (read-only link)

### Technical Notes — this is the module most sensitive to the "instant" requirement
1. **Find affected templates**: query `TemplateComponent` where `masterCostId = X` → set of `templateId`s.
2. **Find affected products**: query `Product` where `templateId IN (...)`.
3. **Recompute in memory**: for each affected product, recalculate cost using the hypothetical price instead of the stored one — do this in the application layer (Node), not by writing to the DB and reading back.
4. This is exactly the same traversal path used for the real incremental-recompute-on-price-change job — **build it once as a pure function** `computeProductCost(product, template, costOverrides?)` and reuse it for both (a) real recompute on actual price changes and (b) simulation. Avoids maintaining two costing logic paths that can drift out of sync.
5. Index `TemplateComponent.masterCostId` — this is the fan-out query that makes simulation fast at scale.

### Acceptance Criteria
- A simulation on a company with 500 SKUs returns results in well under a second (in-memory recompute over an indexed, narrow affected-set query — not a full catalog scan).
- Running a simulation produces zero writes to `MasterCost`, `Product`, or `CostHistory`.

---

## Module 6 — Alerts & Notifications *(V2)*

### Purpose
Push relevant changes to the right people instead of requiring them to check dashboards manually.

### User Stories
- As a Cost Manager, I want to be notified the moment a product's margin drops below threshold.
- As an Admin, I want a weekly digest of margin health instead of logging in daily.

### Features (all V2+)
| Feature | Description |
|---|---|
| Threshold alerts | Notify when a product's margin crosses below configured %/₹ |
| Price-change alerts | Notify relevant roles when a master cost is updated |
| Digest emails | Weekly margin-health summary |
| In-app notification center | Persistent, dismissible notification list |

### Technical Notes
- Trigger point is identical to Module 5's fan-out query: when a `MasterCost` changes and recompute runs, check each newly-computed margin against threshold and emit an `Alert` if it crosses.
- Background job via `pg-boss` (Postgres-backed queue — stays within the portable stack, no external queue service needed).

---

## Module 7 — Multi-Tenancy, Auth & Permissions

### Purpose
Keep every company's cost and pricing data completely isolated, with appropriate roles inside each company.

### User Stories
- As a company Admin, I want confidence that no other tenant can ever see my cost structure.
- As an Admin, I want to control who on my team can edit master costs vs just view dashboards.
- As an Admin, I want to instantly revoke a departed employee's access.

### MVP Features
| Feature | Description |
|---|---|
| Auth.js (NextAuth v5) with Prisma adapter | Email/password to start; SSO-ready structure |
| Database sessions | Not JWT — enables instant revocation, required for role changes to take effect immediately |
| Roles | Admin, Cost Manager, Viewer (minimum viable role set) |
| Company/org settings | Name, base currency, units, default margin thresholds |
| Application-layer tenant scoping | Every query auto-filtered by `companyId` via a Prisma extension/middleware wrapper |

### V2+ Features
- Postgres RLS as a second enforcement layer (session-variable-based `company_id` policies) — defense-in-depth before onboarding real paying customers
- Granular permissions beyond the 3 base roles
- Full audit log of user actions (not just cost changes)
- Multi-user "who's editing this" presence indicators

### Technical Notes
- `session` callback in Auth.js surfaces `role` and `companyId` directly on the session object so every server component/API route has them without an extra query.
- Tenant-scoping wrapper (e.g. a Prisma Client Extension) should be the **only** way application code queries `MasterCost`, `Template`, `Product` — no raw `prisma.product.findMany()` calls without the scoping layer, enforced via code review / lint rule if possible.
- RLS (V2) uses `SET LOCAL app.current_company_id` inside the same transaction as each request's queries.

### Acceptance Criteria
- A user from Company A can never retrieve a row belonging to Company B via any API route, including edge cases like search and CSV export.
- Revoking a user's session (role change, deactivation) takes effect on their very next request — not after their JWT expires (this is why database sessions, not JWT, are required).

---

## Module 8 — Reporting & Export

### Purpose
Get data out of FinanceOS and into the formats people actually use in meetings — Excel, PDF, email.

### User Stories
- As a Cost Manager, I want to export a product's full cost breakdown to Excel to share with a supplier or auditor.
- As an Admin, I want a PDF snapshot of the margin dashboard for a leadership review.

### MVP Features
| Feature | Description |
|---|---|
| CSV/Excel export | Product cost breakdown, master cost list, template list |
| PDF export | Margin dashboard snapshot |

### V2+ Features
- Scheduled report emails
- Custom report builder (choose fields/filters, save as a report definition)
- API access for pulling cost/margin data into external BI tools

### Technical Notes
- Server-side generation (not client-side-only) so exports respect the same tenant-scoping and RLS rules as everything else — never let export bypass the scoping wrapper.
- Reuse the Module 4 materialized view as the export data source for dashboard PDFs, so exported numbers always match what's on screen.

---

## Module 9 — Data Import / Setup Tools

### Purpose
Get a new company from zero to a working costing model fast — this is the first-week experience that determines activation.

### User Stories
- As a new Admin, I want a guided path: import my prices → build my first template → create my first product.
- As an evaluator, I want to explore a realistic demo (Gupta Brass Fittings) before committing my own data.

### MVP Features
| Feature | Description |
|---|---|
| Guided onboarding flow | Step-by-step: master costs → template → product, with progress indicator |
| CSV import templates | Downloadable templates for master costs, and validation on upload |
| Demo/seed data toggle | One-click load of the Gupta Brass Fittings dataset for evaluation/sandboxing |

### V2+ Features
- Bulk import for templates and products (not just master costs)
- Import from common competitor/spreadsheet formats with column-mapping UI

### Technical Notes
- Seed data lives as a versioned SQL/Prisma seed script (`prisma/seed.ts`) scoped to a demo `Company` row — toggling it on creates an isolated demo tenant, not a shared one, so evaluators can't corrupt each other's sandboxes.

---

## Module 10 — Search & Navigation

### Purpose
Make the 3-layer hierarchy (Master Costs → Templates → Products) fast to move through, especially as the catalog grows past what fits on one screen.

### MVP Features
| Feature | Description |
|---|---|
| Global search | Across master costs, templates, and products by name/SKU |
| Breadcrumb navigation | Reflects the layer hierarchy — always clear whether you're looking at a cost item, a template, or a product |
| Recently viewed | Quick-access list of last-touched items |

### Technical Notes
- Postgres full-text search (`tsvector`/`tsquery`) on `name`/`sku` columns is sufficient at this scale — no need for an external search service (keeps the stack portable, per earlier discussion).

---

## MVP Scope Summary

For a first shippable version, the recommended cut line is:

✅ **In scope:** Modules 1, 2, 3 (full CRUD across all three cost layers), Module 4 (basic dashboard), Module 5 (single-input simulation), Module 7 (auth/tenancy — non-negotiable from day one), Module 9 (guided onboarding + demo data), Module 10 (basic search/nav)

🕒 **Deferred to V2:** Module 6 (Alerts), advanced features across all modules (approval workflows, multi-input simulation, custom dashboards, scheduled reports, RLS as a second layer)

This scope proves the core value proposition — "see true cost, true margin, and the impact of price changes, instantly" — with the minimum surface area needed to be genuinely useful to a real manufacturing team.
