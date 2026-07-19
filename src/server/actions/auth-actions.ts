"use server";

import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { createUserSession, destroyUserSession } from "@/lib/auth-session";

export type FormState = { error?: string } | undefined;

export async function signOutAction() {
  await destroyUserSession();
  redirect("/login");
}

const registerSchema = z.object({
  companyName: z.string().min(2, "Company name is required"),
  name: z.string().min(1, "Your name is required"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

/**
 * Register a brand-new company + its first Admin user. First user of a company
 * is always an Admin (Module 7).
 */
export async function registerAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = registerSchema.safeParse({
    companyName: formData.get("companyName"),
    name: formData.get("name"),
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) {
    return { error: parsed.error.errors[0]?.message ?? "Invalid input" };
  }

  const email = parsed.data.email.toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return { error: "An account with that email already exists." };

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const company = await prisma.company.create({
    data: {
      name: parsed.data.companyName,
      users: {
        create: { name: parsed.data.name, email, passwordHash, role: "ADMIN" },
      },
    },
    include: { users: true },
  });

  await createUserSession(company.users[0].id);
  redirect("/onboarding");
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function loginAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsed.success) return { error: "Enter a valid email and password." };

  const user = await prisma.user.findUnique({
    where: { email: parsed.data.email.toLowerCase() },
  });
  if (!user?.passwordHash) return { error: "Invalid email or password." };

  const valid = await bcrypt.compare(parsed.data.password, user.passwordHash);
  if (!valid) return { error: "Invalid email or password." };

  await createUserSession(user.id);
  // Buyers land in their portal; staff land in the ops app.
  redirect(user.role === "BUYER" ? "/portal" : "/dashboard");
}
