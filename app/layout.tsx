import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Vitto — Loan Repayment Service',
  description: 'Track loan repayments, EMI schedules, and payment allocation',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
