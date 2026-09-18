import { notFound } from 'next/navigation';
import { getLoanWithPosition } from '@/lib/queries';
import LoanPage from './LoanPage';

/**
 * Server Component — fetches loan data via Prisma at request time so the
 * page arrives fully populated (no client-side "Loading…" flash).
 *
 * The serialised loan data is passed as props to the client-side
 * LoanPage wrapper which handles Firebase auth and interactivity.
 */
export default async function LoanDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const loanData = await getLoanWithPosition(params.id);

  if (!loanData) {
    notFound();
  }

  // Serialise Date objects to ISO strings for the client component boundary.
  // Prisma returns Date objects; React Server Components can pass them across
  // the wire but the client component expects ISO strings (matching the API
  // response shape the existing code already handles).
  const serialised = {
    id: loanData.id,
    principal: loanData.principal,
    annualRate: loanData.annualRate,
    tenureMonths: loanData.tenureMonths,
    disbursementDate: loanData.disbursementDate.toISOString(),
    instalments: loanData.instalments.map((inst) => ({
      id: inst.id,
      sequenceNumber: inst.sequenceNumber,
      dueDate: inst.dueDate.toISOString(),
      principalComponent: inst.principalComponent,
      interestComponent: inst.interestComponent,
      totalDue: inst.totalDue,
      amountPaid: inst.amountPaid,
    })),
    position: loanData.position,
  };

  return <LoanPage initialLoanData={serialised} />;
}
