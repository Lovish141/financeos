import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { seedCompanyDemo } from "../src/server/demo-data";

const prisma = new PrismaClient();

// Standalone demo tenant for evaluators. Isolated Company row so sandboxes
// never collide (Module 9 technical note).
const DEMO_EMAIL = "demo@guptabrass.com";
const DEMO_PASSWORD = "demo1234";

async function main() {
  const existing = await prisma.user.findUnique({ where: { email: DEMO_EMAIL } });

  let companyId: string;
  if (existing) {
    companyId = existing.companyId;
    console.log("Demo user already exists — reusing company.");
  } else {
    const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
    const company = await prisma.company.create({
      data: {
        name: "Gupta Brass Fittings Pvt. Ltd.",
        isDemo: true,
        users: {
          create: { name: "Demo Admin", email: DEMO_EMAIL, passwordHash, role: "ADMIN" },
        },
      },
    });
    companyId = company.id;
    console.log("Created demo company + admin user.");
  }

  await seedCompanyDemo(prisma, companyId);
  console.log("Seed complete.");
  console.log(`\n  Login:  ${DEMO_EMAIL}\n  Password: ${DEMO_PASSWORD}\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
