import { NextRequest } from 'next/server';
import { getFirebaseAdminAuth } from './firebase-admin';

export interface AuthResult {
  authenticated: boolean;
  uid?: string;
  error?: string;
}

/**
 * Verify the Firebase ID token from the Authorization header.
 * Server-side verification using firebase-admin — never trust a client-supplied uid.
 */
export async function verifyAuth(request: NextRequest): Promise<AuthResult> {
  const authHeader = request.headers.get('Authorization');

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { authenticated: false, error: 'Missing Authorization header' };
  }

  const token = authHeader.substring(7); // Remove 'Bearer '

  try {
    const decodedToken = await getFirebaseAdminAuth().verifyIdToken(token);
    return { authenticated: true, uid: decodedToken.uid };
  } catch (error) {
    console.error('Token verification failed:', error);
    return { authenticated: false, error: 'Invalid or expired token' };
  }
}
