import { getDb } from '../db/sqlite.connection';

export interface SecurityIssue {
  severity: 'high' | 'medium' | 'low';
  category: 'authentication' | 'rules' | 'secrets';
  message: string;
  remediation: string;
}

export interface SecurityReport {
  score: number; // 0 to 100
  scannedAt: string;
  issues: SecurityIssue[];
}

export class SecurityAdvisorService {
  runScan(): SecurityReport {
    const issues: SecurityIssue[] = [];
    const db = getDb();

    // ── Check 1: Weak or default JWT Secrets ──
    const jwtSecret = process.env.JWT_SECRET || '';
    if (!jwtSecret) {
      issues.push({
        severity: 'high',
        category: 'secrets',
        message: 'JWT_SECRET is not configured or is empty.',
        remediation: 'Set a strong random 64-character hex string as JWT_SECRET in your .env file.'
      });
    } else {
      const isDevDefault = jwtSecret.includes('dev') || jwtSecret.includes('testing') || jwtSecret.includes('abc123');
      if (isDevDefault) {
        issues.push({
          severity: 'high',
          category: 'secrets',
          message: 'JWT_SECRET is set to a default development value.',
          remediation: 'Change JWT_SECRET in your .env file to a production-grade cryptographic key.'
        });
      }
      if (jwtSecret.length < 32) {
        issues.push({
          severity: 'medium',
          category: 'secrets',
          message: 'JWT_SECRET is too short (< 32 characters).',
          remediation: 'Generate a longer key (preferably 256-bit or 512-bit) to prevent brute-force attacks.'
        });
      }
    }

    // ── Check 2: Unsecured collections (missing rules or fully open) ──
    try {
      const collections = db.prepare('SELECT name, projectId, rules FROM collections').all() as any[];
      for (const col of collections) {
        let isPublic = false;
        let isMissing = false;

        if (!col.rules) {
          isMissing = true;
        } else {
          try {
            const rules = JSON.parse(col.rules);
            if (rules.read === true && rules.write === true) {
              isPublic = true;
            }
          } catch (_) {
            // Fails closed, so not an open issue
          }
        }

        if (isMissing) {
          issues.push({
            severity: 'high',
            category: 'rules',
            message: `Collection "${col.name}" (Project: ${col.projectId || 'Global'}) has no security rules configured.`,
            remediation: `Configure security rules for collection "${col.name}" in the database console.`
          });
        } else if (isPublic) {
          issues.push({
            severity: 'medium',
            category: 'rules',
            message: `Collection "${col.name}" has completely open rules (read & write are both set to true).`,
            remediation: 'Lock down write access to authenticated users or service roles.'
          });
        }
      }
    } catch (_) {}

    // ── Check 3: Exposed or missing Service Role Key hashes ──
    try {
      const projectsWithoutSk = db.prepare('SELECT id, name FROM projects WHERE serviceKeyHash IS NULL').all() as any[];
      for (const proj of projectsWithoutSk) {
        issues.push({
          severity: 'medium',
          category: 'secrets',
          message: `Project "${proj.name}" is missing a Service Role Key hash.`,
          remediation: 'Ensure the system runs database migrations to backfill service role keys.'
        });
      }
    } catch (_) {}

    // Calculate score
    let score = 100;
    for (const issue of issues) {
      if (issue.severity === 'high') score -= 25;
      else if (issue.severity === 'medium') score -= 10;
      else score -= 5;
    }
    score = Math.max(0, score);

    return {
      score,
      scannedAt: new Date().toISOString(),
      issues
    };
  }
}

export const securityAdvisorService = new SecurityAdvisorService();
