// ─────────────────────────────────────────────────────────────────────────────
//  src/services/policy.service.ts
//  Platform Terms & Conditions, Security & Backup Policy Service.
//  Handles dynamic policy versioning, rollout, and user consent gates.
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from '../db/sqlite.connection';
import { PlatformPolicy, AppError } from '../types/auth.types';
import { auditLogService } from './audit-log.service';

export interface UpdatePolicyDto {
  termsAndConditions?: string;
  securityPolicy?: string;
  backupPolicy?: string;
  newVersion?: string;
}

export class PolicyService {
  /**
   * Retrieve the currently active platform policies.
   */
  public getActivePolicy(): PlatformPolicy {
    const db = getDb();
    let row = db.prepare('SELECT * FROM platform_policies WHERE id = ?').get('default') as any;
    if (!row) {
      const now = new Date().toISOString();
      const defaultTerms = `# AegisDB Platform Terms & Conditions (v1.0.0)\n\n### 1. Acceptance of Terms\nBy creating an account, connecting client applications, or utilizing AegisDB APIs, SDKs, and storage services, you agree to comply with these terms. You agree not to engage in malicious scraping, DDoS, credential harvesting, unlawful payload transmission, or unauthorized multi-tenant tampering.\n\n### 2. Trust, Safety & Automated Moderation\nAegisDB continuously monitors incoming requests for abusive, bot, or malicious activity. Accounts exhibiting high-risk behavioral anomalies may be flagged, issued formal compliance violation notices, or subjected to permanent automated erasure.\n\n### 3. Data Ownership & Portability\nYou retain ownership of all data stored within your projects. Under GDPR Article 20, you may export your data bundle at any time.`;
      const defaultSecurity = `# AegisDB Security & Cryptographic Policy (v1.0.0)\n\n### 1. Zero-Trust Architecture\nAll data at rest is protected with two-tier envelope encryption (AES-256-GCM) with hardware-isolated HKDF Master Key Derivation. All traffic requires TLS 1.3 / HTTPS.\n\n### 2. Credential Protection\nDevelopers and users are responsible for safeguarding API keys, JWT access tokens, and RFC 6238 TOTP authenticator devices. Compromised credentials or accounts with excessive lockout velocity will be flagged for investigation.`;
      const defaultBackup = `# AegisDB Backup & Disaster Recovery Policy (v1.0.0)\n\n### 1. Automated Snapshotting\nAegisDB provides localized snapshotting and automated S3-compatible remote backup mechanisms.\n\n### 2. Right to Erasure & Grace Period\nIn accordance with GDPR Article 17, account deletion enforces a 7-day cooling-off grace period before permanent, irreversible cascading erasure.`;

      try {
        db.prepare(`
          INSERT OR REPLACE INTO platform_policies (id, version, termsAndConditions, securityPolicy, backupPolicy, effectiveDate, updatedAt, updatedBy)
          VALUES ('default', 'v1.0.0', ?, ?, ?, ?, ?, 'system')
        `).run(defaultTerms, defaultSecurity, defaultBackup, now, now);
        row = db.prepare('SELECT * FROM platform_policies WHERE id = ?').get('default') as any;
      } catch (_) {}
    }
    return {
      id: row?.id || 'default',
      version: row?.version || 'v1.0.0',
      termsAndConditions: row?.termsAndConditions || '',
      securityPolicy: row?.securityPolicy || '',
      backupPolicy: row?.backupPolicy || '',
      effectiveDate: row?.effectiveDate || new Date().toISOString(),
      updatedAt: row?.updatedAt || new Date().toISOString(),
      updatedBy: row?.updatedBy || 'system',
    };
  }

  /**
   * Super Admin updates policies and rolls out a new version to all platform users.
   */
  public updatePolicy(adminId: string, adminEmail: string, dto: UpdatePolicyDto): PlatformPolicy {
    const db = getDb();
    const current = this.getActivePolicy();
    const now = new Date().toISOString();

    const termsAndConditions = dto.termsAndConditions !== undefined ? dto.termsAndConditions : current.termsAndConditions;
    const securityPolicy = dto.securityPolicy !== undefined ? dto.securityPolicy : current.securityPolicy;
    const backupPolicy = dto.backupPolicy !== undefined ? dto.backupPolicy : current.backupPolicy;
    
    // Increment version if not explicitly provided
    let version = dto.newVersion;
    if (!version) {
      const match = current.version.match(/^v?(\d+)\.(\d+)\.(\d+)$/);
      if (match) {
        const major = parseInt(match[1], 10);
        const minor = parseInt(match[2], 10) + 1;
        version = `v${major}.${minor}.0`;
      } else {
        version = `v${Date.now()}`;
      }
    }

    db.prepare(`
      UPDATE platform_policies
      SET version = ?,
          termsAndConditions = ?,
          securityPolicy = ?,
          backupPolicy = ?,
          effectiveDate = ?,
          updatedAt = ?,
          updatedBy = ?
      WHERE id = 'default'
    `).run(version, termsAndConditions, securityPolicy, backupPolicy, now, now, adminId);

    auditLogService.logAction({
      actorId: adminId,
      actorEmail: adminEmail,
      actionType: 'super_admin_operation',
      status: 'success',
      details: `Rolled out updated platform policies version ${version} (Terms, Security & Backup).`
    });

    console.log(`📜 [PolicyService] Rolled out new platform policy version: ${version}`);

    return this.getActivePolicy();
  }

  /**
   * Records user consent to the specified policy version.
   */
  public recordUserConsent(userId: string, accountType: 'developer' | 'project_user', version: string): { success: boolean; version: string; acceptedAt: string } {
    const db = getDb();
    const active = this.getActivePolicy();
    const now = new Date().toISOString();

    if (version !== active.version) {
      throw new AppError(`Cannot accept outdated policy version "${version}". Active platform version is "${active.version}".`, 400);
    }

    if (accountType === 'developer') {
      const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (!user) throw new AppError('User not found', 404);

      db.prepare(`
        UPDATE users 
        SET acceptedTermsVersion = ?, acceptedTermsAt = ?, updatedAt = ?
        WHERE id = ?
      `).run(version, now, now, userId);
    } else {
      const pUser = db.prepare('SELECT id FROM project_users WHERE id = ?').get(userId);
      if (!pUser) throw new AppError('Project user not found', 404);

      db.prepare(`
        UPDATE project_users 
        SET acceptedTermsVersion = ?, acceptedTermsAt = ?, updatedAt = ?
        WHERE id = ?
      `).run(version, now, now, userId);
    }

    return { success: true, version, acceptedAt: now };
  }

  /**
   * Checks if user has accepted the latest platform policy.
   */
  public requiresConsent(acceptedVersion?: string | null): boolean {
    const active = this.getActivePolicy();
    if (!acceptedVersion) return true;
    return acceptedVersion !== active.version;
  }
}

export const policyService = new PolicyService();
