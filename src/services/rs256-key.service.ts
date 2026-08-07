import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

interface KeyPair {
  publicKeyPem: string;
  privateKeyPem: string;
  kid: string;
}

export class Rs256KeyService {
  private currentKeyPair: KeyPair | null = null;
  private keyDir = path.join(process.cwd(), 'keys');

  constructor() {
    this.ensureKeyDirectory();
    this.loadOrGenerateKeyPair();
  }

  private ensureKeyDirectory(): void {
    if (!fs.existsSync(this.keyDir)) {
      fs.mkdirSync(this.keyDir, { recursive: true });
    }
  }

  private loadOrGenerateKeyPair(): void {
    const privPath = path.join(this.keyDir, 'rs256_private.pem');
    const pubPath = path.join(this.keyDir, 'rs256_public.pem');
    const kidPath = path.join(this.keyDir, 'rs256_kid.txt');

    if (fs.existsSync(privPath) && fs.existsSync(pubPath) && fs.existsSync(kidPath)) {
      this.currentKeyPair = {
        privateKeyPem: fs.readFileSync(privPath, 'utf8'),
        publicKeyPem: fs.readFileSync(pubPath, 'utf8'),
        kid: fs.readFileSync(kidPath, 'utf8').trim()
      };
      console.log(`🔐 Loaded existing RS256 key pair (KID: ${this.currentKeyPair.kid})`);
      return;
    }

    console.log('🗝️ Generating new RS256 2048-bit key pair...');
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: { type: 'spki', format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
    });

    const kid = `aegis-key-${crypto.randomBytes(8).toString('hex')}`;

    fs.writeFileSync(privPath, privateKey);
    fs.writeFileSync(pubPath, publicKey);
    fs.writeFileSync(kidPath, kid);

    this.currentKeyPair = { privateKeyPem: privateKey, publicKeyPem: publicKey, kid };
    console.log(`✅ Generated RS256 Key Pair (KID: ${kid})`);
  }

  getPrivateKey(): { pem: string; kid: string } {
    if (!this.currentKeyPair) throw new Error('RS256 Key Pair not initialized');
    return { pem: this.currentKeyPair.privateKeyPem, kid: this.currentKeyPair.kid };
  }

  getPublicKey(): { pem: string; kid: string } {
    if (!this.currentKeyPair) throw new Error('RS256 Key Pair not initialized');
    return { pem: this.currentKeyPair.publicKeyPem, kid: this.currentKeyPair.kid };
  }

  getJwks(): { keys: any[] } {
    const { publicKeyPem, kid } = this.currentKeyPair!;
    const pubKeyObj = crypto.createPublicKey(publicKeyPem);
    const jwk = pubKeyObj.export({ format: 'jwk' });

    return {
      keys: [
        {
          kty: jwk.kty,
          n: jwk.n,
          e: jwk.e,
          alg: 'RS256',
          use: 'sig',
          kid: kid
        }
      ]
    };
  }
}

export const rs256KeyService = new Rs256KeyService();
