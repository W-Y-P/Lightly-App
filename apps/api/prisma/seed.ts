import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Create a demo user for development
  const user = await prisma.user.upsert({
    where: { id: "demo-user" },
    update: {},
    create: {
      id: "demo-user",
      region: "CN",
      sex: "male",
    },
  });

  console.log(`Seeded demo user: ${user.id}`);

  // Create a demo plan
  const plan = await prisma.plan.upsert({
    where: { id: "demo-plan" },
    update: {},
    create: {
      id: "demo-plan",
      userId: user.id,
      currentWeightKg: 80,
      targetWeightKg: 70,
      heightCm: 175,
      age: 28,
      sex: "male",
      activityLevel: 1.4,
      bmrKcal: 1778,
      tdeeKcal: 2489,
      dailyDeficitTargetKcal: 550,
      recommendedIntakeKcal: 1939,
      proteinMinG: 96,
      proteinMaxG: 128,
      carbMinG: 170,
      carbMaxG: 267,
      fatMinG: 43,
      fatMaxG: 65,
    },
  });

  console.log(`Seeded demo plan: ${plan.id}`);
  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
