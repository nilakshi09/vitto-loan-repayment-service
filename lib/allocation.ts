import { createHash } from 'crypto';

/**
 * Payment allocation — oldest-due-first order.
 * 
 * Decision: Overpayment settles the next instalment, not principal reduction.
 * This keeps allocation logic simple and predictable; the alternative (reducing
 * principal) would require redefining amortization mid-schedule, which is out of scope.
 */

export interface InstalmentForAllocation {
  id: string;
  sequenceNumber: number;
  dueDate: Date;
  totalDue: number;
  amountPaid: number;
}

export interface AllocationResult {
  updates: Array<{ instalmentId: string; newAmountPaid: number }>;
  allocatedAmount: number;
  unallocatedAmount: number;
}

/**
 * Allocate a payment to instalments in oldest-due-first order.
 * 1. Find the earliest instalment where amountPaid < totalDue.
 * 2. Apply up to its totalDue.
 * 3. If money remains, roll to the next unpaid instalment.
 * 4. If money remains after all instalments are fully paid, return it as unallocatedAmount.
 */
export function allocatePayment(
  instalments: InstalmentForAllocation[],
  amount: number
): AllocationResult {
  // Sort by sequenceNumber (oldest first)
  const sorted = [...instalments].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  
  let remaining = amount;
  const updates: AllocationResult['updates'] = [];
  
  for (const inst of sorted) {
    if (remaining <= 0) break;
    
    const shortfall = inst.totalDue - inst.amountPaid;
    if (shortfall <= 0) continue; // Already fully paid
    
    const applied = Math.min(remaining, shortfall);
    updates.push({
      instalmentId: inst.id,
      newAmountPaid: inst.amountPaid + applied,
    });
    remaining -= applied;
  }
  
  return {
    updates,
    allocatedAmount: amount - remaining,
    unallocatedAmount: remaining,
  };
}

/**
 * Compute idempotency key: sha256(loanId + amount + paymentDateISOString)
 */
export function computeIdempotencyKey(
  loanId: string,
  amount: number,
  paymentDate: Date
): string {
  const data = `${loanId}${amount}${paymentDate.toISOString()}`;
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Compute loan position summary.
 */
export interface LoanPosition {
  outstandingPrincipal: number;  // sum of principalComponent where amountPaid < totalDue
  nextDueDate: string | null;   // earliest instalment where amountPaid < totalDue
  nextDueAmount: number;        // totalDue - amountPaid for that instalment
  overdueAmount: number;        // sum of (totalDue - amountPaid) where dueDate < today AND amountPaid < totalDue
}

export function computePosition(
  instalments: Array<{
    principalComponent: number;
    interestComponent: number;
    totalDue: number;
    amountPaid: number;
    dueDate: Date;
  }>,
  today: Date = new Date()
): LoanPosition {
  let outstandingPrincipal = 0;
  let overdueAmount = 0;
  let nextDueDate: Date | null = null;
  let nextDueAmount = 0;

  // Sort by dueDate for consistent ordering
  const sorted = [...instalments].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime());

  for (const inst of sorted) {
    const shortfall = inst.totalDue - inst.amountPaid;
    if (shortfall > 0) {
      outstandingPrincipal += inst.principalComponent;
      
      // Overdue: dueDate < today AND not fully paid
      if (inst.dueDate < today) {
        overdueAmount += shortfall;
      }
      
      // Next due: earliest unpaid instalment
      if (!nextDueDate) {
        nextDueDate = inst.dueDate;
        nextDueAmount = shortfall;
      }
    }
  }

  return {
    outstandingPrincipal,
    nextDueDate: nextDueDate ? nextDueDate.toISOString() : null,
    nextDueAmount,
    overdueAmount,
  };
}
