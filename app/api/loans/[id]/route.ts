import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { computePosition } from '@/lib/allocation';
import { verifyAuth } from '@/lib/auth';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const [authResult, loan] = await Promise.all([
    verifyAuth(request),
    prisma.loan.findUnique({
      where: { id: params.id },
      include: {
        instalments: { orderBy: { sequenceNumber: 'asc' } },
      },
    })
  ]);

  if (!authResult.authenticated) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token' } },
      { status: 401 }
    );
  }

  if (!loan) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Loan ${params.id} not found` } },
      { status: 404 }
    );
  }

  const position = computePosition(loan.instalments);

  return NextResponse.json({
    ...loan,
    position,
  });
}
