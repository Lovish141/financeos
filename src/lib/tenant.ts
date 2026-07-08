import { Prisma } from "@prisma/client";
import { prisma } from "./prisma";

// Models that carry a direct `companyId` column. Every query against these is
// auto-filtered to the current tenant so application code can never leak rows
// across companies (Module 7). Child tables (TemplateComponent,
// TemplateVersion, CostHistory) are reached through these scoped parents.
const SCOPED_MODELS = new Set(["MasterCost", "Template", "Product"]);

const READ_WRITE_WITH_WHERE = new Set([
  "findFirst",
  "findFirstOrThrow",
  "findMany",
  "count",
  "aggregate",
  "groupBy",
  "updateMany",
  "deleteMany",
  "update",
  "delete",
]);

/**
 * Returns a Prisma client that transparently scopes all tenant-model queries to
 * `companyId`. This is the ONLY sanctioned way app code should read/write
 * MasterCost, Template, and Product. Use `findFirst` (not `findUnique`) for
 * single-row lookups so the tenant filter can be applied.
 */
export function tenantDb(companyId: string) {
  return prisma.$extends({
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          if (!model || !SCOPED_MODELS.has(model)) return query(args);

          const a = (args ?? {}) as Record<string, unknown>;

          if (operation === "create") {
            a.data = { ...(a.data as object), companyId };
          } else if (operation === "createMany") {
            const data = a.data as Record<string, unknown> | Record<string, unknown>[];
            a.data = Array.isArray(data)
              ? data.map((d) => ({ ...d, companyId }))
              : { ...data, companyId };
          } else if (operation === "upsert") {
            a.where = { ...(a.where as object), companyId };
            a.create = { ...(a.create as object), companyId };
          } else if (READ_WRITE_WITH_WHERE.has(operation)) {
            a.where = { ...(a.where as object), companyId };
          } else if (operation === "findUnique" || operation === "findUniqueOrThrow") {
            // findUnique can't take non-unique filters; enforce via a guard.
            throw new Error(
              `Use findFirst instead of ${operation} on tenant model ${model} so tenant scoping applies.`,
            );
          }

          return query(a);
        },
      },
    },
  });
}

export type TenantDb = ReturnType<typeof tenantDb>;

// The client shape available inside an interactive `$transaction` callback — the
// scoped client minus the methods Prisma disallows mid-transaction. A full
// `TenantDb` is assignable to it, so helpers typed against `TenantTx` accept
// both the top-level scoped client and a transaction client.
export type TenantTx = Omit<
  TenantDb,
  "$connect" | "$disconnect" | "$on" | "$use" | "$transaction" | "$extends"
>;

// Re-export Prisma namespace for convenience in server actions.
export { Prisma };
