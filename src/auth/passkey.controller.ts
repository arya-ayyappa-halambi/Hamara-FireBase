// ─────────────────────────────────────────────────────────────────────────────
//  src/auth/passkey.controller.ts
//  HTTP Controller for WebAuthn / Passkeys (FIDO2)
// ─────────────────────────────────────────────────────────────────────────────

import { Request, Response, NextFunction } from 'express';
import { passkeyService } from '../services/passkey.service';
import { generateToken, toPublicUser } from './auth.service';
import { tokenFamilyService } from '../services/token-family.service';
import { userSessionService } from '../services/user-session.service';
import { networkAccessService } from '../services/network-access.service';
import { userStore } from '../store/user.store';
import { getDb } from '../db/sqlite.connection';
import { AppError } from '../types/auth.types';

export async function getRegistrationOptionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required to register a passkey.', 401);

    const db = getDb();
    const user = db.prepare('SELECT id, email, name FROM users WHERE id = ?').get(userId) as any;
    if (!user) throw new AppError('User not found.', 404);

    const host = req.headers.host || 'localhost';
    const options = passkeyService.generateRegistrationOptions(user.id, user.email, user.name, host);

    res.status(200).json({
      success: true,
      message: 'WebAuthn registration options generated.',
      data: options
    });
  } catch (err) { next(err); }
}

export async function verifyRegistrationHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { challenge, credentialId, publicKey, deviceName, transports } = req.body;
    if (!challenge || !credentialId || !publicKey) {
      throw new AppError('challenge, credentialId, and publicKey are required.', 400);
    }

    const passkey = passkeyService.verifyRegistrationResponse({
      userId,
      challenge,
      credentialId,
      publicKey,
      deviceName,
      transports
    });

    userSessionService.logSecurityAction({
      userId,
      actionType: 'passkey_registered',
      ipAddress: networkAccessService.extractClientIp(req),
      userAgent: req.headers['user-agent'] as string,
      details: `Registered biometric passkey: ${passkey.deviceName}`
    });

    res.status(201).json({
      success: true,
      message: 'Passkey registered successfully.',
      data: passkey
    });
  } catch (err) { next(err); }
}

export async function getLoginOptionsHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT passkeyAuthEnabled FROM platform_settings WHERE id = ?').get('default') as any;
    if (!settings || (settings.passkeyAuthEnabled !== 1 && settings.passkeyAuthEnabled !== true)) {
      throw new AppError('Passkey biometric authentication is disabled by the administrator.', 403);
    }

    const email = req.query.email as string | undefined;
    const host = req.headers.host || 'localhost';
    const options = passkeyService.generateLoginOptions(host, email);

    res.status(200).json({
      success: true,
      message: 'WebAuthn login options generated.',
      data: options
    });
  } catch (err) { next(err); }
}

export async function verifyLoginAssertionHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const db = getDb();
    const settings = db.prepare('SELECT passkeyAuthEnabled FROM platform_settings WHERE id = ?').get('default') as any;
    if (!settings || (settings.passkeyAuthEnabled !== 1 && settings.passkeyAuthEnabled !== true)) {
      throw new AppError('Passkey biometric authentication is disabled by the administrator.', 403);
    }

    const { challenge, credentialId, signature, counter } = req.body;
    if (!challenge || !credentialId) {
      throw new AppError('challenge and credentialId are required.', 400);
    }

    const { userId, passkey } = passkeyService.verifyLoginAssertion({
      challenge,
      credentialId,
      signature,
      counter
    });

    const user = await userStore.findById(userId);
    if (!user) throw new AppError('User not found.', 404);

    const clientIp = networkAccessService.extractClientIp(req);
    const userAgent = req.headers['user-agent'] as string;

    const { verifyAdminLoginSecurity } = await import('./auth.service');
    verifyAdminLoginSecurity(user, clientIp);

    const token = generateToken(user);
    const { refreshToken } = tokenFamilyService.createTokenFamily(user.id);

    userSessionService.registerSession({
      userId: user.id,
      refreshToken,
      ipAddress: clientIp,
      userAgent
    });

    userSessionService.logSecurityAction({
      userId: user.id,
      actionType: 'login_passkey_success',
      ipAddress: clientIp,
      userAgent,
      details: `Logged in via biometric passkey (${passkey.deviceName})`
    });

    res.status(200).json({
      success: true,
      message: 'Logged in successfully with Passkey.',
      data: {
        user: toPublicUser(user),
        token,
        refreshToken
      }
    });
  } catch (err) { next(err); }
}

export async function listPasskeysHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required.', 401);

    const passkeys = passkeyService.listUserPasskeys(userId);
    res.status(200).json({
      success: true,
      message: 'User passkeys retrieved.',
      data: passkeys
    });
  } catch (err) { next(err); }
}

export async function deletePasskeyHandler(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user?.sub;
    if (!userId) throw new AppError('Authentication required.', 401);

    const { id } = req.params;
    const deleted = passkeyService.deletePasskey(userId, id);
    if (!deleted) throw new AppError('Passkey not found.', 404);

    userSessionService.logSecurityAction({
      userId,
      actionType: 'passkey_deleted',
      ipAddress: networkAccessService.extractClientIp(req),
      userAgent: req.headers['user-agent'] as string,
      details: `Deleted passkey ${id}`
    });

    res.status(200).json({
      success: true,
      message: 'Passkey deleted successfully.',
      data: null
    });
  } catch (err) { next(err); }
}
