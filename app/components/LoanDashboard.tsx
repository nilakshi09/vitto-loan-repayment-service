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

interface LoanSummary {
  id: string;
  principal: number;
  annualRate: number;
  tenureMonths: number;
  disbursementDate: string;
}

export default function LoanDashboard({ user }: LoanDashboardProps) {
  const [loans, setLoans] = useState<LoanSummary[]>([]);
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  const [loanData, setLoanData] = useState<LoanData | null>(null);
  const [loading, setLoading] = useState(true);
  const [creatingLoan, setCreatingLoan] = useState(false);
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

  // Fetch list of loans
  const fetchLoans = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/loans', { headers });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to load loans');
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setLoans(data);
        if (data.length > 0) {
          setSelectedLoanId((prev) => (prev && data.some((l: LoanSummary) => l.id === prev) ? prev : data[0].id));
        } else {
          setSelectedLoanId(null);
          setLoanData(null);
        }
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load loans';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    fetchLoans();
  }, [fetchLoans]);

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

  async function handleCreateSampleLoan() {
    setCreatingLoan(true);
    setError(null);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/loans', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          principal: 20000000,
          annualRate: 1800,
          tenureMonths: 24,
          disbursementDate: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message || 'Failed to create sample loan');
      }

      await fetchLoans();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create sample loan';
      setError(message);
    } finally {
      setCreatingLoan(false);
    }
  }

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

  return (
    <div className="page-container">
      <div className="page-header">
        <div>
          <h1 className="page-title">Loan Repayment</h1>
          {loanData ? (
            <p className="page-subtitle">
              {loanData.tenureMonths}-month term at {loanData.annualRate / 100}% p.a. • Disbursed {formatDate(loanData.disbursementDate)}
            </p>
          ) : (
            <p className="page-subtitle">EMI schedule &amp; payment tracking</p>
          )}
        </div>
        <button className="btn-sign-out" onClick={handleSignOut}>
          Sign out
        </button>
      </div>

      {loans.length > 1 && (
        <div className="loan-selector">
          <label htmlFor="loan-select">Select Loan:</label>
          <select
            id="loan-select"
            value={selectedLoanId || ''}
            onChange={(e) => setSelectedLoanId(e.target.value)}
          >
            {loans.map((l, index) => (
              <option key={l.id} value={l.id}>
                Loan #{index + 1} — {formatRupeesCompact(l.principal)} ({l.tenureMonths}m @ {l.annualRate / 100}%)
              </option>
            ))}
          </select>
        </div>
      )}

      {error && (
        <div className="payment-card" style={{ textAlign: 'center', padding: '3rem 2rem', borderColor: 'var(--color-error)', backgroundColor: 'var(--bg-error)' }}>
          <h2 className="payment-title" style={{ fontSize: '1.1rem', color: 'var(--color-error)' }}>
            Couldn't load loan data. Please refresh.
          </h2>
          <p style={{ marginTop: '0.5rem', color: 'var(--text-secondary)' }}>{error}</p>
        </div>
      )}

      {(loading || (!loanData && loans.length > 0)) && !error && (
        <div className="payment-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <h2 className="payment-title" style={{ fontSize: '1.1rem', color: 'var(--text-secondary)' }}>
            Loading loan data…
          </h2>
        </div>
      )}

      {!loading && !loanData && loans.length === 0 && !error && (
        <div className="payment-card" style={{ textAlign: 'center', padding: '3rem 2rem' }}>
          <h2 className="payment-title" style={{ fontSize: '1.1rem', marginBottom: '0.5rem' }}>
            No Active Loans Found
          </h2>
          <p className="payment-helper" style={{ maxWidth: '400px', margin: '0 auto 1.5rem' }}>
            There are currently no active loans in the database. You can generate a sample loan with full 24-month EMI amortization schedule to get started.
          </p>
          <button
            className="btn-primary"
            onClick={handleCreateSampleLoan}
            disabled={creatingLoan}
            style={{ margin: '0 auto' }}
          >
            {creatingLoan ? 'Creating sample loan…' : 'Create Sample Loan (₹2,00,000)'}
          </button>
        </div>
      )}

      {loanData && (
        <>
          {/* Position Summary — hero numbers */}
          <div className="section-label">Repayment Position</div>
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
            <div className="position-item">
              <div className="position-label">Original principal</div>
              <div className="position-value">
                {formatRupeesCompact(loanData.principal)}
              </div>
            </div>
          </div>

          <div className="dashboard-body">
            <div className="dashboard-main">
              {/* Instalment Table */}
              <div className="section-label">Repayment Schedule</div>
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
                        <span className={`status-pill status-pill--${status}`}>
                          {STATUS_LABELS[status]}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="dashboard-sidebar">
          <div className="payment-card">
            {/* Payment Form */}
            <div className="payment-section">
              <h2 className="payment-title">Record a payment</h2>
              <p className="payment-helper">Payments are allocated to the earliest unpaid instalment first.</p>
              <form className="payment-form" onSubmit={handlePayment}>
                <div className="form-group">
                  <label className="form-label" htmlFor="amount">
                    Amount
                  </label>
                  <div className="input-with-prefix">
                    <span className="input-prefix">₹</span>
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
          </div>
        </div>
      </div>
    </>
  )}
</div>
  );
}
