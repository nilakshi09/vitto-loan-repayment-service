'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase-client';
import LoanDashboard from '@/app/components/LoanDashboard';

/**
 * Root page — auth gate.
 *
 * After Firebase auth resolves, fetches the loan list and redirects to
 * /loans/[firstLoanId] so the user lands on the server-rendered detail
 * page. Falls back to the full LoanDashboard for the "no loans" / "create
 * sample loan" flow.
 */
export default function HomePage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [noLoans, setNoLoans] = useState(false);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);

        // Fetch loan list and redirect to first loan's server-rendered page
        try {
          const token = await firebaseUser.getIdToken();
          const res = await fetch('/api/loans', {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
          });

          if (res.ok) {
            const loans = await res.json();
            if (Array.isArray(loans) && loans.length > 0) {
              window.location.href = `/loans/${loans[0].id}`;
              return; // Don't set loading=false; we're navigating away
            }
          }
        } catch {
          // Fall through to show LoanDashboard
        }

        // No loans found — show the "create sample loan" UI
        setNoLoans(true);
      } else {
        window.location.href = '/login';
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    return <div className="loading">Loading…</div>;
  }

  if (!user) {
    return null; // Will redirect
  }

  // Show the full LoanDashboard only when there are no loans
  // (so the user can create a sample loan and then get redirected)
  return <LoanDashboard user={user} />;
}
