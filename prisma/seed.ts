import { PrismaClient } from '@prisma/client';
import { generateSchedule } from '../lib/schedule';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Check if a loan already exists (avoid duplicate seeds)
  const existing = await prisma.loan.findFirst();
  if (existing) {
    console.log('Seed data already exists, skipping.');
    return;
  }

  const principal = 20000000;    // ₹2,00,000 in paise
  const annualRate = 1800;       // 18% stored as rate * 100
  const tenureMonths = 24;
  const disbursementDate = new Date();

  // Generate EMI schedule
  const schedule = generateSchedule(principal, annualRate, tenureMonths, disbursementDate);

  // Create loan + instalments in a single transaction
  const loan = await prisma.$transaction(async (tx) => {
    const newLoan = await tx.loan.create({
      data: {
        principal,
        annualRate,
        tenureMonths,
        disbursementDate,
      },
    });

    await tx.instalment.createMany({
      data: schedule.map((inst) => ({
        loanId: newLoan.id,
        sequenceNumber: inst.sequenceNumber,
        dueDate: inst.dueDate,
        principalComponent: inst.principalComponent,
        interestComponent: inst.interestComponent,
        totalDue: inst.totalDue,
        amountPaid: 0,
      })),
    });

    return newLoan;
  });

  console.log(`Created loan ${loan.id}:`);
  console.log(`  Principal: ₹${(principal / 100).toLocaleString('en-IN')}`);
  console.log(`  Annual rate: ${annualRate / 100}%`);
  console.log(`  Tenure: ${tenureMonths} months`);
  console.log(`  Instalments: ${schedule.length}`);
  console.log('Seed complete.');
}

main()
  .catch((e) => {
    console.error('Seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
