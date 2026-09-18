import { prisma } from '@/lib/prisma';
import { computePosition, LoanPosition } from '@/lib/allocation';

/**
 * Shared loan queries — used by both API route handlers and server components
 * so the Prisma query + position computation lives in one place.
 */

export interface InstalmentData {
  id: string;
  sequenceNumber: number;
  dueDate: Date;
  principalComponent: number;
  interestComponent: number;
  totalDue: number;
  amountPaid: number;
}

export interface LoanWithPosition {
  id: string;
  principal: number;
  annualRate: number;
  tenureMonths: number;
  disbursementDate: Date;
  createdAt: Date;
  instalments: InstalmentData[];
  position: LoanPosition;
}

export interface LoanSummary {
  id: string;
  principal: number;
  annualRate: number;
  tenureMonths: number;
  disbursementDate: Date;
  createdAt: Date;
}

/**
 * Fetch a single loan with its instalments and computed position.
 * Returns null if the loan doesn't exist.
 */
export async function getLoanWithPosition(id: string): Promise<LoanWithPosition | null> {
  const loan = await prisma.loan.findUnique({
    where: { id },
    include: {
      instalments: { orderBy: { sequenceNumber: 'asc' } },
    },
  });

  if (!loan) return null;

  const position = computePosition(loan.instalments);

  return {
    ...loan,
    position,
  };
}

/**
 * Fetch all loans (summary only, no instalments).
 */
export async function getLoans(): Promise<LoanSummary[]> {
  return prisma.loan.findMany({
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      principal: true,
      annualRate: true,
      tenureMonths: true,
      disbursementDate: true,
      createdAt: true,
    },
  });
}
