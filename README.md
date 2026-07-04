# FinanceOS

Manufacturing profitability & costing platform. See true cost, true margin, and the
impact of price changes — instantly.

**Stack:** Next.js 15 (App Router) · Prisma 6 · Neon (Postgres) · Auth.js (NextAuth v5) · Tailwind CSS

The domain is a 3-layer hierarchy:

```
Master Costs (price book)  →  Templates (BOM/recipe)  →  Products (SKUs)
```

A single pure costing function powers product recompute **and** what-if simulation,
so the two can never drift apart.

---

## Getting started

### 1. Create a Neon database

Grab two connection strings from the [Neon](https://neon.tech) dashboard:

- **Pooled** (`...-pooler...`) → app runtime
- **Direct** (no `-pooler`) → Prisma migrations

### 2. Configure environment

```bash
cp .env.example .env
```

Fill in `DATABASE_URL` (pooled), `DIRECT_URL` (direct), and a fresh `AUTH_SECRET`:

```bash
npx auth secret        # writes AUTH_SECRET, or: openssl rand -base64 32
```

### 3. Install, migrate, seed

```bash
npm install
npm run db:migrate      # prisma migrate deploy — applies prisma/migrations
npm run db:seed         # optional: loads the Gupta Brass demo tenant
```

> During active schema development use `npm run db:migrate:dev` instead, which
> creates new migration files as you change `schema.prisma`.

### 4. Run

```bash
npm run dev             # http://localhost:3000
```

**Demo login** (after `db:seed`): `demo@guptabrass.com` / `demo1234`

Or register a fresh workspace at `/register` and click **Load demo data** on the
Getting Started page.

---

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build & serve |
| `npm run db:migrate` | Apply migrations (`prisma migrate deploy`) |
| `npm run db:migrate:dev` | Create + apply a dev migration |
| `npm run db:seed` | Seed the Gupta Brass demo tenant |
| `npm run db:studio` | Prisma Studio |

---

## Modules implemented (MVP)

| # | Module | Notes |
|---|---|---|
| 1 | **Master Costs** | CRUD, transactional price history, inline diffs, staleness flag, CSV import with per-line validation |
| 2 | **Templates** | Weight + fixed lines, live cost preview, clone, JSONB version snapshots |
| 3 | **Products** | Create-from-template, cached cost/margin, line-by-line breakdown, cost-as-created vs today, health flags, clone |
| 4 | **Dashboard** | Company overview, margin-at-risk, top/bottom N, category rollups, chart |
| 5 | **What-If Simulation** | Single-input, indexed fan-out, in-memory recompute, before/after, strictly non-destructive |
| 7 | **Auth & Multi-tenancy** | Auth.js credentials, **database sessions** (instant revocation), Admin/Cost Manager/Viewer roles, tenant-scoping Prisma extension |
| 9 | **Onboarding / Setup** | Guided progress, one-click demo data, CSV templates |
| 10 | **Search & Navigation** | Global search across all 3 layers, breadcrumbs |

---

## Architecture notes

- **Tenant isolation** (`src/lib/tenant.ts`): a Prisma Client Extension auto-filters
  every `MasterCost` / `Template` / `Product` query by `companyId`. Reads/updates are
  filtered; writes set the tenant explicitly. This is the sanctioned path to tenant
  data — use `tenantDb(companyId)` via `requireSession()`, never the raw client.
- **Costing engine** (`src/lib/costing.ts`): pure, DB-free `computeProductCost()`.
  Reused by real recompute (`src/server/costing-service.ts`) and the simulator, so
  there is exactly one costing code path.
- **Reproducible history**: templates snapshot into `TemplateVersion.snapshot` (JSONB).
  Products pin a version, so editing a template never silently changes existing product
  costs. Product detail reconstructs both "cost as created" and "cost today".
- **Database sessions, not JWT**: required so a role change or deactivation takes effect
  on the user's next request. Credentials + database sessions use the documented Auth.js
  `jwt.encode` override (`src/auth.ts`).
- **Cached margins**: `Product.totalCost/grossMargin*` are computed at write time and
  refreshed by the incremental recompute when an upstream price changes, keeping the
  dashboard a simple read.

### Deploying

Set `DATABASE_URL`, `DIRECT_URL`, and `AUTH_SECRET` in your host (e.g. Vercel). The
build runs `prisma generate`; run `prisma migrate deploy` as a release step.
