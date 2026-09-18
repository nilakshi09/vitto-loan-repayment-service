import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateSchedule } from '@/lib/schedule';
import { createLoanSchema } from '@/lib/validation';
import { verifyAuth } from '@/lib/auth';

export async function GET(request: NextRequest) {
  const [authResult, loans] = await Promise.all([
    verifyAuth(request),
    prisma.loan.findMany({
      orderBy: { createdAt: 'desc' },
      select: { id: true, principal: true, annualRate: true, tenureMonths: true, disbursementDate: true, createdAt: true },
    })
  ]);

  if (!authResult.authenticated) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token' } },
      { status: 401 }
    );
  }

  return NextResponse.json(loans);
}

export async function POST(request: NextRequest) {
  // Verify Firebase auth token
  const authResult = await verifyAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token' } },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createLoanSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { principal, annualRate, tenureMonths, disbursementDate } = parsed.data;
    const disbDate = new Date(disbursementDate);

    // Generate EMI schedule
    const schedule = generateSchedule(principal, annualRate, tenureMonths, disbDate);

    // Persist Loan + all Instalments in one transaction
    const loan = await prisma.$transaction(async (tx) => {
      const newLoan = await tx.loan.create({
        data: {
          principal,
          annualRate,
          tenureMonths,
          disbursementDate: disbDate,
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

      return tx.loan.findUnique({
        where: { id: newLoan.id },
        include: { instalments: { orderBy: { sequenceNumber: 'asc' } } },
      });
    }, { timeout: 30000, maxWait: 10000 });

    return NextResponse.json(loan, { status: 201 });
  } catch (err) {
    console.error('Error creating loan:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to create loan' } },
      { status: 500 }
    );
  }
}
