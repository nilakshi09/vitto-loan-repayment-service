'use client';

import { useEffect, useState } from 'react';
import { onAuthStateChanged, User } from 'firebase/auth';
import { getFirebaseAuth } from '@/lib/firebase-client';
import LoanDashboardClient from '@/app/components/LoanDashboardClient';
import type { LoanData } from '@/app/components/LoanDashboardClient';

/**
 * Client-side auth gate for the loan detail page.
 *
 * The server component (page.tsx) passes pre-fetched loan data here.
 * This component waits for Firebase client auth to resolve, then renders
 * the interactive dashboard — the user never sees "Loading loan data…"
 * because the data is already available from the server.
 */
interface LoanPageProps {
  initialLoanData: LoanData;
}

export default function LoanPage({ initialLoanData }: LoanPageProps) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      if (firebaseUser) {
        setUser(firebaseUser);
      } else {
        window.location.href = '/login';
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  if (loading) {
    // The server-rendered HTML is already showing the loan data in the
    // initial paint. This brief loading state only appears while Firebase
    // client auth is initialising — it's fast and doesn't require a
    // network round-trip for loan data.
    return <div className="loading">Loading…</div>;
  }

  if (!user) {
    return null; // Will redirect to /login
  }

  return <LoanDashboardClient initialLoanData={initialLoanData} user={user} />;
}
