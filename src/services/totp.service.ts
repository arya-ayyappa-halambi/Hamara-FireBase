import crypto from 'crypto';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.length; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

function base32Decode(input: string): Buffer {
  const cleanInput = input.toUpperCase().replace(/=+$/, '').replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const index = BASE32_CHARS.indexOf(cleanInput[i]);
    if (index === -1) continue;

    value = (value << 5) | index;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return Buffer.from(bytes);
}

export class TotpService {
  /**
   * Generates a random 20-byte Base32 secret key
   */
  generateSecret(): string {
    const randomBuffer = crypto.randomBytes(20);
    return base32Encode(randomBuffer);
  }

  /**
   * Generates standard OTPAuth URI for QR code generation
   */
  generateOtpAuthUrl(email: string, secret: string, issuer: string = 'AegisDB'): string {
    const label = encodeURIComponent(`${issuer}:${email}`);
    return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}`;
  }

  /**
   * Generates 6-digit TOTP code for a secret and time step counter
   */
  generateCode(secret: string, timeStep: number = Math.floor(Date.now() / 1000 / 30)): string {
    const key = base32Decode(secret);
    const timeBuffer = Buffer.alloc(8);

    timeBuffer.writeUInt32BE(0, 0);
    timeBuffer.writeUInt32BE(timeStep, 4);

    const hmac = crypto.createHmac('sha1', key);
    hmac.update(timeBuffer);
    const digest = hmac.digest();

    const offset = digest[digest.length - 1] & 0xf;
    const binary =
      ((digest[offset] & 0x7f) << 24) |
      ((digest[offset + 1] & 0xff) << 16) |
      ((digest[offset + 2] & 0xff) << 8) |
      (digest[offset + 3] & 0xff);

    const otp = (binary % 1000000).toString();
    return otp.padStart(6, '0');
  }

  /**
   * Verifies 6-digit TOTP code against secret with ±1 time step tolerance (90s window)
   */
  verifyCode(secret: string, code: string, window: number = 1): boolean {
    if (!secret || !code || code.trim().length !== 6) return false;

    const currentStep = Math.floor(Date.now() / 1000 / 30);
    const cleanCode = code.trim();

    for (let i = -window; i <= window; i++) {
      const generated = this.generateCode(secret, currentStep + i);
      if (crypto.timingSafeEqual(Buffer.from(generated), Buffer.from(cleanCode))) {
        return true;
      }
    }

    return false;
  }
}

export const totpService = new TotpService();
