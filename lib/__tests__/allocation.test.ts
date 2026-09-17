import { describe, it, expect } from 'vitest';
import { allocatePayment, computeIdempotencyKey, computePosition } from '../allocation';

function makeInstalments(count: number, totalDueEach: number): Array<{
  id: string;
  sequenceNumber: number;
  dueDate: Date;
  totalDue: number;
  amountPaid: number;
  principalComponent: number;
  interestComponent: number;
}> {
  return Array.from({ length: count }, (_, i) => ({
    id: `inst-${i + 1}`,
    sequenceNumber: i + 1,
    dueDate: new Date(2024, i, 15), // Jan 15, Feb 15, etc.
    totalDue: totalDueEach,
    amountPaid: 0,
    principalComponent: Math.floor(totalDueEach * 0.7),
    interestComponent: totalDueEach - Math.floor(totalDueEach * 0.7),
  }));
}

describe('Payment Allocation', () => {
  it('underpayment: ₹5,000 against ₹9,986 due instalment', () => {
    const instalments = makeInstalments(3, 998600); // ₹9,986 each
    const result = allocatePayment(instalments, 500000); // ₹5,000

    expect(result.allocatedAmount).toBe(500000);
    expect(result.unallocatedAmount).toBe(0);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].instalmentId).toBe('inst-1');
    expect(result.updates[0].newAmountPaid).toBe(500000);
    // Instalment stays short by ₹4,986 (498600 paise)
  });

  it('overpayment: 2x instalment amount rolls to next instalment', () => {
    const instalments = makeInstalments(3, 998600);
    const result = allocatePayment(instalments, 998600 * 2); // 2x EMI

    expect(result.allocatedAmount).toBe(998600 * 2);
    expect(result.unallocatedAmount).toBe(0);
    expect(result.updates).toHaveLength(2);
    // First instalment fully paid
    expect(result.updates[0].instalmentId).toBe('inst-1');
    expect(result.updates[0].newAmountPaid).toBe(998600);
    // Second instalment fully paid
    expect(result.updates[1].instalmentId).toBe('inst-2');
    expect(result.updates[1].newAmountPaid).toBe(998600);
  });

  it('excess after all instalments paid returns as unallocatedAmount', () => {
    const instalments = makeInstalments(2, 100000); // 2 instalments of ₹1,000 each
    const result = allocatePayment(instalments, 300000); // ₹3,000 — more than total

    expect(result.allocatedAmount).toBe(200000);
    expect(result.unallocatedAmount).toBe(100000);
    expect(result.updates).toHaveLength(2);
  });

  it('skips already-paid instalments', () => {
    const instalments = makeInstalments(3, 100000);
    instalments[0].amountPaid = 100000; // First already fully paid
    const result = allocatePayment(instalments, 100000);

    expect(result.updates).toHaveLength(1);
    expect(result.updates[0].instalmentId).toBe('inst-2');
    expect(result.updates[0].newAmountPaid).toBe(100000);
  });
});

describe('Idempotency Key', () => {
  it('same inputs produce same key', () => {
    const date = new Date('2024-03-15T00:00:00.000Z');
    const key1 = computeIdempotencyKey('loan-1', 500000, date);
    const key2 = computeIdempotencyKey('loan-1', 500000, date);
    expect(key1).toBe(key2);
  });

  it('different inputs produce different keys', () => {
    const date = new Date('2024-03-15T00:00:00.000Z');
    const key1 = computeIdempotencyKey('loan-1', 500000, date);
    const key2 = computeIdempotencyKey('loan-1', 600000, date);
    expect(key1).not.toBe(key2);
  });
});

describe('Loan Position', () => {
  it('computes overdue amount when instalments are past due', () => {
    const today = new Date('2024-04-01');
    const instalments = [
      { principalComponent: 70000, interestComponent: 30000, totalDue: 100000, amountPaid: 0, dueDate: new Date('2024-01-15') },
      { principalComponent: 72000, interestComponent: 28000, totalDue: 100000, amountPaid: 0, dueDate: new Date('2024-02-15') },
      { principalComponent: 74000, interestComponent: 26000, totalDue: 100000, amountPaid: 0, dueDate: new Date('2024-03-15') },
      { principalComponent: 76000, interestComponent: 24000, totalDue: 100000, amountPaid: 0, dueDate: new Date('2024-04-15') },
    ];

    const position = computePosition(instalments, today);

    // First 3 instalments are overdue (dueDate < today)
    expect(position.overdueAmount).toBe(300000); // 3 * 100000
    expect(position.outstandingPrincipal).toBe(70000 + 72000 + 74000 + 76000);
    expect(position.nextDueDate).toBeTruthy();
    expect(position.nextDueAmount).toBe(100000);
  });

  it('partial payment affects position correctly', () => {
    const today = new Date('2024-02-01');
    const instalments = [
      { principalComponent: 70000, interestComponent: 30000, totalDue: 100000, amountPaid: 60000, dueDate: new Date('2024-01-15') },
      { principalComponent: 72000, interestComponent: 28000, totalDue: 100000, amountPaid: 0, dueDate: new Date('2024-02-15') },
    ];

    const position = computePosition(instalments, today);

    // First instalment is overdue and partially paid
    expect(position.overdueAmount).toBe(40000); // 100000 - 60000
    expect(position.outstandingPrincipal).toBe(70000 + 72000);
    expect(position.nextDueAmount).toBe(40000); // remaining on first
  });

  it('all paid means no outstanding', () => {
    const instalments = [
      { principalComponent: 70000, interestComponent: 30000, totalDue: 100000, amountPaid: 100000, dueDate: new Date('2024-01-15') },
      { principalComponent: 72000, interestComponent: 28000, totalDue: 100000, amountPaid: 100000, dueDate: new Date('2024-02-15') },
    ];

    const position = computePosition(instalments, new Date('2024-03-01'));

    expect(position.outstandingPrincipal).toBe(0);
    expect(position.overdueAmount).toBe(0);
    expect(position.nextDueDate).toBeNull();
    expect(position.nextDueAmount).toBe(0);
  });
});
