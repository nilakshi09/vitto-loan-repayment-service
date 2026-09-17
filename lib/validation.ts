import { z } from 'zod';

export const createLoanSchema = z.object({
  principal: z.number().int().positive('Principal must be a positive integer (paise)'),
  annualRate: z.number().int().positive('Annual rate must be a positive integer (rate * 100)'),
  tenureMonths: z.number().int().positive('Tenure must be a positive integer (months)'),
  disbursementDate: z.string().datetime({ message: 'disbursementDate must be a valid ISO date string' }),
});

export const createPaymentSchema = z.object({
  amount: z.number().int().positive('Amount must be a positive integer (paise)'),
  paymentDate: z.string().datetime({ message: 'paymentDate must be a valid ISO date string' }),
});

export type CreateLoanInput = z.infer<typeof createLoanSchema>;
export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;
