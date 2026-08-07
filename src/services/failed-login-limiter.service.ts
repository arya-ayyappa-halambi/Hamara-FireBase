// ─────────────────────────────────────────────────────────────────────────────
//  src/services/failed-login-limiter.service.ts
//  Tracks failed login attempts and enforces lockout windows to prevent brute-force attacks.
// ─────────────────────────────────────────────────────────────────────────────

interface FailedLoginRecord {
  attempts: number;
  lastAttemptAt: number;
  lockoutUntil: number | null;
}

export class FailedLoginService {
  private records = new Map<string, FailedLoginRecord>();
  private maxAttempts = 5;
  private lockoutWindowMs = 15 * 60 * 1000; // 15 minutes

  private getKey(ip: string, email: string): string {
    const cleanIp = ip || 'unknown';
    const cleanEmail = (email || '').toLowerCase().trim();
    return `failed_login:${cleanIp}:${cleanEmail}`;
  }

  isLockedOut(ip: string, email: string): { locked: boolean; remainingSec: number; attempts: number } {
    const key = this.getKey(ip, email);
    const record = this.records.get(key);

    if (!record) {
      return { locked: false, remainingSec: 0, attempts: 0 };
    }

    const now = Date.now();

    if (record.lockoutUntil && record.lockoutUntil > now) {
      const remainingSec = Math.ceil((record.lockoutUntil - now) / 1000);
      return { locked: true, remainingSec, attempts: record.attempts };
    }

    // Lockout expired — reset record
    if (record.lockoutUntil && record.lockoutUntil <= now) {
      this.records.delete(key);
      return { locked: false, remainingSec: 0, attempts: 0 };
    }

    return { locked: false, remainingSec: 0, attempts: record.attempts };
  }

  recordFailedAttempt(ip: string, email: string): { attempts: number; locked: boolean; remainingSec: number } {
    const key = this.getKey(ip, email);
    const now = Date.now();
    let record = this.records.get(key);

    if (!record) {
      record = { attempts: 0, lastAttemptAt: now, lockoutUntil: null };
    }

    record.attempts += 1;
    record.lastAttemptAt = now;

    if (record.attempts >= this.maxAttempts) {
      record.lockoutUntil = now + this.lockoutWindowMs;
      this.records.set(key, record);
      const remainingSec = Math.ceil(this.lockoutWindowMs / 1000);
      return { attempts: record.attempts, locked: true, remainingSec };
    }

    this.records.set(key, record);
    return { attempts: record.attempts, locked: false, remainingSec: 0 };
  }

  recordSuccessfulLogin(ip: string, email: string): void {
    const key = this.getKey(ip, email);
    this.records.delete(key);
  }

  getFailedAttempts(ip: string, email: string): number {
    const record = this.records.get(this.getKey(ip, email));
    return record ? record.attempts : 0;
  }
}

export const failedLoginService = new FailedLoginService();
