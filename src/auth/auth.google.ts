import { OAuth2Client } from 'google-auth-library';
import { getDb } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';

let client: OAuth2Client | null = null;
let lastConfiguredClientId: string | null = null;

export async function verifyGoogleToken(idToken: string): Promise<{ email: string, name: string }> {
  const db = getDb();
  
  // 1. Fetch current platform settings and check environment variables
  const settings = db.prepare('SELECT googleAuthEnabled, googleClientId FROM platform_settings WHERE id = ?').get('default') as any;
  
  const envGoogleClientId = process.env.GOOGLE_CLIENT_ID?.trim() || '';
  const dbGoogleClientId = (settings?.googleClientId || '').trim();
  const effectiveClientId = envGoogleClientId || dbGoogleClientId;

  const isGoogleEnabled = Boolean(envGoogleClientId || (settings && settings.googleAuthEnabled === 1));

  if (!isGoogleEnabled) {
    throw new AppError('Google authentication is currently disabled by administrator.', 403);
  }

  if (!effectiveClientId) {
    throw new AppError('Google Client ID is not configured on the server (set GOOGLE_CLIENT_ID in .env).', 500);
  }

  if (!client || lastConfiguredClientId !== effectiveClientId) {
    client = new OAuth2Client(effectiveClientId);
    lastConfiguredClientId = effectiveClientId;
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: effectiveClientId,
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new AppError('Invalid Google token payload.', 401);
    }

    return {
      email: payload.email,
      name: payload.name || payload.email.split('@')[0]
    };
  } catch (error: any) {
    console.error('Google Auth Error:', error?.message || 'Token verification failure');
    throw new AppError('Failed to verify Google authentication token.', 401);
  }
}
