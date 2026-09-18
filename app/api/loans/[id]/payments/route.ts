import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { allocatePayment, computeIdempotencyKey, computePosition } from '@/lib/allocation';
import { createPaymentSchema } from '@/lib/validation';
import { verifyAuth } from '@/lib/auth';

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const authResult = await verifyAuth(request);
  if (!authResult.authenticated) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token' } },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();
    const parsed = createPaymentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: { code: 'VALIDATION_ERROR', message: parsed.error.errors[0].message } },
        { status: 400 }
      );
    }

    const { amount, paymentDate } = parsed.data;
    const payDate = new Date(paymentDate);

    // Check loan exists
    const loan = await prisma.loan.findUnique({
      where: { id: params.id },
      include: { instalments: { orderBy: { sequenceNumber: 'asc' } } },
    });

    if (!loan) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: `Loan ${params.id} not found` } },
        { status: 404 }
      );
    }

    // Compute idempotency key
    const idempotencyKey = computeIdempotencyKey(params.id, amount, payDate);

    // Check for duplicate submission
    const existingPayment = await prisma.payment.findUnique({
      where: { idempotencyKey },
    });

    if (existingPayment) {
      // Return existing result — do not re-run allocation
      const currentLoan = await prisma.loan.findUnique({
        where: { id: params.id },
        include: {
          instalments: { orderBy: { sequenceNumber: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });
      const position = computePosition(currentLoan!.instalments);
      return NextResponse.json({
        ...currentLoan,
        position,
        payment: existingPayment,
        duplicate: true,
      });
    }

    // Run allocation inside a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Create payment record
      const payment = await tx.payment.create({
        data: {
          loanId: params.id,
          amount,
          paymentDate: payDate,
          idempotencyKey,
        },
      });

      // Run allocation
      const allocation = allocatePayment(loan.instalments, amount);

      // Update each affected instalment
      for (const update of allocation.updates) {
        await tx.instalment.update({
          where: { id: update.instalmentId },
          data: { amountPaid: update.newAmountPaid },
        });
      }

      // Fetch updated loan with instalments
      const updatedLoan = await tx.loan.findUnique({
        where: { id: params.id },
        include: {
          instalments: { orderBy: { sequenceNumber: 'asc' } },
          payments: { orderBy: { createdAt: 'desc' } },
        },
      });

      return {
        loan: updatedLoan,
        payment,
        allocation: {
          allocatedAmount: allocation.allocatedAmount,
          unallocatedAmount: allocation.unallocatedAmount,
        },
      };
    }, { timeout: 30000, maxWait: 10000 });

    const position = computePosition(result.loan!.instalments);

    return NextResponse.json({
      ...result.loan,
      position,
      payment: result.payment,
      allocation: result.allocation,
    });
  } catch (err) {
    console.error('Error recording payment:', err);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Failed to record payment' } },
      { status: 500 }
    );
  }
}
