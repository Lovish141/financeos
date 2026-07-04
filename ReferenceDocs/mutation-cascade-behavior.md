# Mutation Cascade Behavior — MasterCost / Template / Product

_Last updated: 2026-07-04_

Reference for **what changes downstream when you mutate a MasterCost, Template, or
Product**. The hierarchy is `MasterCost (price book) → Template (BOM) → Product (SKU)`.
Use this when reasoning about edits, deletes, and archiving so you don't accidentally
introduce a silent re-cost (or a silent stale value).

---

## The three underlying mechanics

Every behavior below follows from these three:

1. **Live-join vs. frozen-snapshot.**
   - `TemplateComponent` stores only `masterCostId + lineType + quantity`. Name, unit,
     and price are **joined live** from `MasterCost` at read time
     (`template-actions.ts` `getTemplateDetail` / `searchTemplates`).
   - Products **freeze** `name`, `unit`, and `unitCostAtSnapshot` into either their
     `comps` JSON (comps-based products) or a pinned `TemplateVersion.snapshot`
     (legacy products). See `TemplateSnapshot` / `SnapshotLine` in `lib/costing.ts`.
   - ⇒ Templates always reflect current labels; products reflect labels **as of their
     last save**.

2. **Cost resolution order** (`lib/costing.ts` `computeProductCost`):
   `overrides → liveCosts → unitCostAtSnapshot`.
   - Product *price* is **live** (falls back to the frozen snapshot value only if the
     id no longer resolves).
   - Product *labels* (name/unit) are **frozen**.

3. **Recompute fan-out fires ONLY on a price edit.**
   `recomputeForMasterCost` (`server/costing-service.ts`) is the only code path that
   rewrites products' cached `totalCost` / `grossMarginAmount` / `grossMarginPct`.
   Nothing else recomputes cached product values.

   **Audit invariant:** a cost change is only legitimate if it writes a `CostHistory`
   row. `updateMasterCost` writes history + recomputes **in the same transaction** when
   `currentCost` changed. Any flow that does *not* write history (archive, rename, unit
   change) must **not** move product cost — and today none of them do.

---

## MasterCost flows

| Action | What changes | → Templates | → Products |
|---|---|---|---|
| **Edit `currentCost` (price)** | Writes a `CostHistory` row in-txn, then `recomputeForMasterCost` | Live (views join current price; old `TemplateVersion` snapshots stay frozen by design) | **Cached cost/margin recomputed & persisted** for every affected SKU |
| **Edit `name` / `category`** | Row only; `priceChanged=false` → **no history, no recompute** | Live everywhere (join on `masterCost.name`) | **Stale in preview/breakdown** (frozen `comps` name), **live in edit draft** (`getProductDraft` re-resolves) → inconsistency, see Gap #1 |
| **Edit `unit`** | Row updated (validated against `type` via `validTypeUnit`) | Live (join) | Frozen label; cost math ignores the unit string → no cost effect |
| **Edit `type`** | Row updated | **Does not restructure** existing recipe lines (their `lineType` is stored); only *new* additions use the new WEIGHT/FIXED default | Same — existing frozen lines keep their `lineType` |
| **Archive / Restore** | Flips `archived` only | Removed from the picker (`where: { archived: false }`); existing components intact | **No cost change** — live price still flows |
| **Import CSV** | Bulk create + seed history | none (new items) | none |

Notes:
- There is **no hard-delete** for a MasterCost — only archive. The
  `TemplateComponent.masterCost` FK is `onDelete: Restrict`, but nothing exercises it.
- Archive is a **catalog-only soft-hide**. It affects only visibility: product/template
  pickers, the simulator scope, and the dashboard "active cost items" count — all filter
  `archived: false`.

---

## Template flows

| Action | What changes | → Products |
|---|---|---|
| **Create / Edit** (`saveTemplateForm`) | Validates (≤1 WEIGHT line; FIXED lines need qty>0); **replaces all `TemplateComponent` rows**; creates a **new immutable `TemplateVersion`** (fresh snapshot of current master-cost labels + prices) | **Forward-only — existing products untouched.** Legacy products stay pinned to their old version; comps-products already diverged. A product only picks up template changes when it is **re-saved** (which re-pins it to the latest version). No recompute. |
| **Clone** (`cloneTemplate`) | New template + copied components + version 1 snapshot | none |
| **Delete** (`deleteTemplate`) | **Destructive cascade** in one txn: deletes **every product with this `templateId`** first (FK `Product → Template` is `onDelete: Restrict`), then the template; its components + versions cascade via `onDelete: Cascade` | All SKUs on this template are **deleted**. Products on an "Empty Template" (`templateId = null`) survive. The confirm dialog warns up-front. |

---

## Product flows

| Action | What changes | Notes |
|---|---|---|
| **Create** (`createProduct`) | Builds `comps` (freezes current name/unit/`unitCostAtSnapshot`), computes cached fields, pins latest `templateVersionId`, generates a unique SKU | Errors if a referenced cost no longer exists |
| **Edit** (`updateProduct`) | **Rebuilds `comps` from scratch** → refreshes frozen labels + prices to *now*; recomputes cached fields; **re-pins to the latest template version** | **`sku` is not editable** (set only at create). This re-save is the mechanism that "catches a product up" to current costs/labels and the current template version. |
| **Delete** (`deleteProduct`) | `deleteMany` + revalidate + redirect w/ flash | Nothing depends on a product → no cascade |

---

## Known gaps / inconsistencies

1. **Rename shows two different names for a product.** After renaming a master cost, the
   product **preview/breakdown drawer** shows the *old* frozen `comps` name (via
   `computeProductCost`), while the **edit form** shows the *new* live name
   (`getProductDraft` re-resolves from `MasterCost`). Same product, two names, depending
   on which drawer is open. _(Cheap fix: re-resolve the breakdown line names live.)_

2. **`used in N templates` ignores product-direct usage.** The count (list + detail, now
   consistent — both use distinct `templateId`) only counts `TemplateComponent` usage. A
   cost picked directly into an Empty-Template product shows "Not used in any template"
   even though a SKU depends on it, so the archive warning under-reports real dependents.

3. **Legacy-product recompute can miss a price change.** `affectedProducts`
   (`server/costing-service.ts`) decides fan-out membership from the *live* template
   components (`template: { components: { some: { masterCostId } } }`), but costs a legacy
   product against its *pinned* snapshot. If a cost was in v1 (pinned by a product) but
   removed in the current version, a later price change to that cost **won't** recompute
   that product's cached margin — it stays stale until the product is re-saved.
   Comps-based products are scanned directly (`comps` JSON) and are always caught.

4. **Template edits never recompute existing product caches** — intentional given the pin
   model, but it means `avgMargin` on the template card can reflect recipes that no longer
   match the current lines.

---

## The mental model in one line

> **Cost moves only on a price edit** (which writes history and recomputes affected SKUs).
> **Templates are always live; products are frozen at their last save.** Everything else —
> rename, unit/type change, archive, template edit — changes structure or labels or
> visibility, **never a product's cost**, until that product is re-saved.
