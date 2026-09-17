'use client';

import { useState, useEffect, FormEvent, useCallback } from 'react';
import { User } from 'firebase/auth';
import { signOut } from '@/lib/firebase-client';

interface Instalment {
  id: string;
  sequenceNumber: number;
  dueDate: string;
  principalComponent: number;
  interestComponent: number;
  totalDue: number;
  amountPaid: number;
}

interface LoanPosition {
  outstandingPrincipal: number;
  nextDueDate: string | null;
  nextDueAmount: number;
  overdueAmount: number;
}

interface LoanData {
  id: string;
  principal: number;
  annualRate: number;
  tenureMonths: number;
  disbursementDate: string;
  instalments: Instalment[];
  position: LoanPosition;
}

/**
 * Format paise as rupees with Indian numbering (₹1,23,456.78)
 */
function formatRupees(paise: number): string {
  const rupees = paise / 100;
  // Indian numbering: first group of 3, then groups of 2
  const [whole, decimal] = rupees.toFixed(2).split('.');
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const result = rest ? `${formatted},${lastThree}` : lastThree;
  return `₹${result}.${decimal}`;
}

/**
 * Compact format for hero numbers: ₹2,00,000 (no decimals)
 */
function formatRupeesCompact(paise: number): string {
  const rupees = Math.round(paise / 100);
  const whole = rupees.toString();
  const lastThree = whole.slice(-3);
  const rest = whole.slice(0, -3);
  const formatted = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',');
  const result = rest ? `${formatted},${lastThree}` : lastThree;
  return `₹${result}`;
}

function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function getInstalmentStatus(
  inst: Instalment,
  today: Date
): 'paid' | 'partial' | 'overdue' | 'upcoming' {
  if (inst.amountPaid >= inst.totalDue) return 'paid';
  if (inst.amountPaid > 0 && inst.amountPaid < inst.totalDue) return 'partial';
  if (new Date(inst.dueDate) < today && inst.amountPaid < inst.totalDue) return 'overdue';
  return 'upcoming';
}

const STATUS_LABELS: Record<string, string> = {
  paid: 'Paid',
  partial: 'Partial',
  overdue: 'Overdue',
  upcoming: 'Upcoming',
};

interface LoanDashboardProps {
  user: User;
}

export default function LoanDashboard({ user }: LoanDashboardProps) {
  const [loans, setLoans] = useState<string[]>([]);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [loanData, setLoanData] = useState<LoanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Payment form state
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [submitting, setSubmitting] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const token = await user.getIdToken();
    return {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    };
  }, [user]);

  // Fetch list of loans (from seeded data)
  useEffect(() => {
    async function fetchLoans() {
      try {
        const headers = await getAuthHeaders();
        // We'll fetch all loans by trying to get the first seeded one
        // Since there's no list endpoint, we use the seed script's known loan
        // For now, we need a way to discover loans — let's add a simple list
        const res = await fetch('/api/loans', { headers });
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data)) {
            setLoans(data.map((l: { id: string }) => l.id));
            if (data.length > 0) setSelectedLoanId(data[0].id);
          }
        }
      } catch {
        // No list endpoint, try fetching from localStorage or show empty
      } finally {
        setLoading(false);
      }
    }
    fetchLoans();
  }, [getAuthHeaders]);

  // Fetch selected loan details
  const fetchLoanDetails = useCallback(async (loanId: string) => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/loans/${loanId}`, { headers });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to load loan');
      }
      const data: LoanData = await res.json();
      setLoanData(data);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load loan';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    if (selectedLoanId) {
      fetchLoanDetails(selectedLoanId);
    }
  }, [selectedLoanId, fetchLoanDetails]);

  async function handlePayment(e: FormEvent) {
    e.preventDefault();
    if (!selectedLoanId || !paymentAmount) return;

    setSubmitting(true);
    setPaymentMessage(null);

    try {
      const headers = await getAuthHeaders();
      const amountPaise = Math.round(parseFloat(paymentAmount) * 100);

      if (isNaN(amountPaise) || amountPaise <= 0) {
        setPaymentMessage({ type: 'error', text: 'Enter a valid positive amount' });
        setSubmitting(false);
        return;
      }

      const res = await fetch(`/api/loans/${selectedLoanId}/payments`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          amount: amountPaise,
          paymentDate: new Date(paymentDate).toISOString(),
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error?.message || 'Payment failed');
      }

      // Update the table in place — no window.location.reload()
      setLoanData(data);
      setPaymentAmount('');
      setPaymentMessage({
        type: 'success',
        text: data.duplicate
          ? 'Duplicate payment detected — showing existing result'
          : `Payment of ${formatRupees(amountPaise)} recorded successfully`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Payment failed';
      setPaymentMessage({ type: 'error', text: message });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSignOut() {
    await signOut();
    window.location.href = '/login';
  }

  const today = new Date();

  if (loading && !loanData) {
    return <div className="loading">Loading loan data…</div>;
  }

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Loan Repayment</h1>
          <p className="page-subtitle">EMI schedule &amp; payment tracking</p>
        </div>
        <button className="btn-sign-out" onClick={handleSignOut}>
          Sign out
        </button>
      </div>

      {error && (
        <div className="payment-message payment-message--error" style={{ marginBottom: '1rem' }}>
          {error}
        </div>
      )}

      {loanData && (
        <>
          {/* Position Summary — hero numbers */}
          <div className="position-summary">
            <div className="position-item">
              <div className="position-label">Outstanding principal</div>
              <div className="position-value">
                {formatRupeesCompact(loanData.position.outstandingPrincipal)}
              </div>
            </div>
            <div className="position-item">
              <div className="position-label">Next due</div>
              <div className="position-value">
                {loanData.position.nextDueDate
                  ? formatRupeesCompact(loanData.position.nextDueAmount)
                  : '—'}
              </div>
              {loanData.position.nextDueDate && (
                <div className="position-sub">
                  {formatDate(loanData.position.nextDueDate)}
                </div>
              )}
            </div>
            <div className="position-item">
              <div className="position-label">Overdue</div>
              <div
                className={`position-value ${
                  loanData.position.overdueAmount > 0 ? 'position-value--overdue' : ''
                }`}
              >
                {loanData.position.overdueAmount > 0
                  ? formatRupeesCompact(loanData.position.overdueAmount)
                  : '₹0'}
              </div>
            </div>
          </div>

          {/* Instalment Table */}
          <div className="table-container">
            <table className="instalment-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Due date</th>
                  <th className="col-money">Principal</th>
                  <th className="col-money">Interest</th>
                  <th className="col-money">Total due</th>
                  <th className="col-money">Paid</th>
                  <th style={{ textAlign: 'right' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loanData.instalments.map((inst) => {
                  const status = getInstalmentStatus(inst, today);
                  return (
                    <tr key={inst.id}>
                      <td>{inst.sequenceNumber}</td>
                      <td>{formatDate(inst.dueDate)}</td>
                      <td className="col-money">{formatRupees(inst.principalComponent)}</td>
                      <td className="col-money">{formatRupees(inst.interestComponent)}</td>
                      <td className="col-money">{formatRupees(inst.totalDue)}</td>
                      <td className="col-money">{formatRupees(inst.amountPaid)}</td>
                      <td style={{ textAlign: 'right' }}>
                        <span className={`status status--${status}`}>
                          <span className="status-dot" />
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Payment Form */}
          <div className="payment-section">
            <h2 className="payment-title">Record a payment</h2>
            <form className="payment-form" onSubmit={handlePayment}>
              <div className="form-group">
                <label className="form-label" htmlFor="amount">
                  Amount (₹)
                </label>
                <input
                  id="amount"
                  className="form-input"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="9,986.00"
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label" htmlFor="pay-date">
                  Payment date
                </label>
                <input
                  id="pay-date"
                  className="form-input"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                  required
                />
              </div>
              <button
                className="btn-primary"
                type="submit"
                disabled={submitting}
              >
                {submitting ? 'Recording…' : 'Record payment'}
              </button>
            </form>
            {paymentMessage && (
              <div
                className={`payment-message payment-message--${paymentMessage.type}`}
              >
                {paymentMessage.text}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
