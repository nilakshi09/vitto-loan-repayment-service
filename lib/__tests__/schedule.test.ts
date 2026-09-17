import { describe, it, expect } from 'vitest';
import { generateSchedule } from '../schedule';

describe('EMI Schedule Generation', () => {
  // Reference case: ₹2,00,000 principal (20000000 paise), 18% annual rate (1800), 24 months
  const principal = 20000000; // ₹2,00,000 in paise
  const annualRate = 1800;    // 18% stored as rate * 100
  const tenureMonths = 24;
  const disbursementDate = new Date('2024-01-15');

  const schedule = generateSchedule(principal, annualRate, tenureMonths, disbursementDate);

  it('should generate correct number of instalments', () => {
    expect(schedule).toHaveLength(24);
  });

  it('EMI should be approximately ₹9,986/month (998600 paise, ±200 paise variance)', () => {
    // Each instalment's totalDue should be approximately 998600 paise (₹9,986)
    // Allow ₹2 variance = 200 paise, except possibly the final instalment which absorbs remainder
    for (let i = 0; i < schedule.length - 1; i++) {
      expect(schedule[i].totalDue).toBeGreaterThan(998600 - 200);
      expect(schedule[i].totalDue).toBeLessThan(998600 + 200);
    }
  });

  it('sum of principalComponents must equal principal exactly', () => {
    const totalPrincipal = schedule.reduce((sum, inst) => sum + inst.principalComponent, 0);
    expect(totalPrincipal).toBe(principal);
  });

  it('final instalment absorbs remainder so outstanding principal is exactly 0', () => {
    // Verify by computing outstanding after each instalment
    let outstanding = principal;
    for (const inst of schedule) {
      outstanding -= inst.principalComponent;
    }
    expect(outstanding).toBe(0);
  });

  it('each instalment should have correct totalDue = principalComponent + interestComponent', () => {
    for (const inst of schedule) {
      expect(inst.totalDue).toBe(inst.principalComponent + inst.interestComponent);
    }
  });

  it('due dates should increment by one month from disbursement date', () => {
    for (let i = 0; i < schedule.length; i++) {
      expect(schedule[i].sequenceNumber).toBe(i + 1);
      // Each due date should be roughly i+1 months from disbursement
      const expectedMonth = (disbursementDate.getMonth() + i + 1) % 12;
      expect(schedule[i].dueDate.getMonth()).toBe(expectedMonth);
    }
  });

  it('all money values should be integers (paise)', () => {
    for (const inst of schedule) {
      expect(Number.isInteger(inst.principalComponent)).toBe(true);
      expect(Number.isInteger(inst.interestComponent)).toBe(true);
      expect(Number.isInteger(inst.totalDue)).toBe(true);
    }
  });
});
