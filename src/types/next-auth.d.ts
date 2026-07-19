import type { Role } from "@prisma/client";
import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: Role;
      companyId: string;
      customerId: string | null;
    } & DefaultSession["user"];
  }

  interface User {
    role?: Role;
    companyId?: string;
    customerId?: string | null;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    credentials?: boolean;
  }
}
