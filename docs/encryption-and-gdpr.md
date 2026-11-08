# Envelope Encryption & GDPR Data Sovereignty

FlareBase is designed from the ground up for strict data privacy, enterprise zero-trust security, and regulatory compliance (GDPR, CCPA, and India DPDP Act).

---

## 1. Two-Tier AES-256-GCM Envelope Encryption

FlareBase implements enterprise-grade envelope encryption:

```
+-------------------------------------------------------+
|  Primary Master Key (KEK)                             |
|  (Derived from ENCRYPTION_KEY via PBKDF2 / Argon2id)  |
+---------------------------+---------------------------+
                            | Encrypts DEK
                            v
+-------------------------------------------------------+
|  Per-User Data Encryption Key (DEK)                   |
|  (Unique 256-bit cryptographically random key)        |
+---------------------------+---------------------------+
                            | Encrypts User Data
                            v
+-------------------------------------------------------+
|  User Payload / Documents / Files                     |
|  (AES-256-GCM Authenticated Encryption with 12B IV)   |
+-------------------------------------------------------+
```

### Encryption Parameters
- **Algorithm**: `AES-256-GCM` (Galois/Counter Mode).
- **Initialization Vector (IV)**: 12-byte cryptographically random unique nonce per record.
- **Authentication Tag**: 16-byte GCM authentication tag verifying integrity and preventing ciphertext tampering.

---

## 2. Cryptographic Shredding (GDPR Article 17)

Standard database record deletion often leaves residues in filesystem blocks, write-ahead logs (WAL), and cold backups.

FlareBase achieves provable **Right to Erasure** via **Cryptographic Shredding**:
1. When a user or tenant requests account deletion, FlareBase immediately shreds their unique Data Encryption Key (DEK).
2. Without the DEK, all existing ciphertext records across live tables, WAL journals, and cold backup snapshots become computationally unrecoverable random noise ($2^{-256}$ brute-force complexity).
3. The database record metadata is then flagged for purge and scheduled vacuum.

---

## 3. Blind Indexing for Encrypted Search

To allow exact-match searching on sensitive encrypted fields (such as user email addresses and phone numbers) without decrypting entire tables or leaking plaintext:

- FlareBase generates a **Canonical Blind Index** using `HMAC-SHA256(canonical(email), EMAIL_HASH_PEPPER)`.
- The email is lowercased, whitespace-stripped, and alias-normalized (removing Gmail `+` tags and dots).
- Lookups query the un-invertible HMAC blind index column, maintaining fast $O(1)$ indexed queries while keeping the actual email encrypted at rest.

---

## 4. Right to Data Portability (GDPR Article 20)

Users have the right to export all personal data stored in FlareBase in a structured, commonly used, and machine-readable format.

- **Endpoint**: `GET /api/v1/project-auth/export-data`
- **Output**: Complete JSON bundle containing user identity, profile attributes, activity history, uploaded asset references, and document records owned by the user.
