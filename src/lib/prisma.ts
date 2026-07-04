import { PrismaClient } from "@prisma/client";

// Single shared base client. Application code that touches tenant data should
// prefer `tenantDb(companyId)` (see tenant.ts) rather than this raw client.
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
