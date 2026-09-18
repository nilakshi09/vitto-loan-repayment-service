import { NextRequest, NextResponse } from 'next/server';
import { verifyAuth } from '@/lib/auth';
import { getLoanWithPosition } from '@/lib/queries';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const [authResult, loanData] = await Promise.all([
    verifyAuth(request),
    getLoanWithPosition(params.id),
  ]);

  if (!authResult.authenticated) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authentication token' } },
      { status: 401 }
    );
  }

  if (!loanData) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: `Loan ${params.id} not found` } },
      { status: 404 }
    );
  }

  return NextResponse.json(loanData);
}
