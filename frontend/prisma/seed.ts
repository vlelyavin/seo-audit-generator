import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.plan.upsert({
    where: { id: "free" },
    update: {
      name: "Free",
      auditsPerMonth: 3,
      maxPages: 20,
      whiteLabel: false,
      price: 0,
    },
    create: {
      id: "free",
      name: "Free",
      auditsPerMonth: 3,
      maxPages: 20,
      whiteLabel: false,
      price: 0,
    },
  });

  await prisma.plan.upsert({
    where: { id: "pro" },
    update: {
      name: "Pro",
      auditsPerMonth: 999999,
      maxPages: 200,
      whiteLabel: false,
      price: 9,
    },
    create: {
      id: "pro",
      name: "Pro",
      auditsPerMonth: 999999,
      maxPages: 200,
      whiteLabel: false,
      price: 9,
    },
  });

  await prisma.plan.upsert({
    where: { id: "agency" },
    update: {
      name: "Agency",
      auditsPerMonth: 999999,
      maxPages: 1000,
      whiteLabel: true,
      price: 29,
    },
    create: {
      id: "agency",
      name: "Agency",
      auditsPerMonth: 999999,
      maxPages: 1000,
      whiteLabel: true,
      price: 29,
    },
  });

  console.log("Seeded 3 plans: free, pro, agency");
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
