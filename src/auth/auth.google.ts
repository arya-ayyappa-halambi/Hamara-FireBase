import { OAuth2Client } from 'google-auth-library';
import { getDb } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';

// Memoize client to avoid recreating it
let client: OAuth2Client | null = null;

export async function verifyGoogleToken(idToken: string): Promise<{ email: string, name: string }> {
  const db = getDb();
  
  // Fetch current platform settings
  const settings = db.prepare('SELECT googleAuthEnabled, googleClientId FROM platform_settings WHERE id = ?').get('default') as any;
  
  if (!settings || settings.googleAuthEnabled !== 1) {
    throw new AppError('Google authentication is currently disabled by the administrator.', 403);
  }

  if (!settings.googleClientId) {
    throw new AppError('Google Client ID is not configured on the server.', 500);
  }

  if (!client) {
    client = new OAuth2Client(settings.googleClientId);
  }

  try {
    const ticket = await client.verifyIdToken({
      idToken,
      audience: settings.googleClientId,
    });
    
    const payload = ticket.getPayload();
    if (!payload || !payload.email) {
      throw new AppError('Invalid Google token payload.', 401);
    }

    return {
      email: payload.email,
      name: payload.name || payload.email.split('@')[0]
    };
  } catch (error) {
    console.error('Google Auth Error:', error);
    throw new AppError('Failed to verify Google authentication token.', 401);
  }
}
