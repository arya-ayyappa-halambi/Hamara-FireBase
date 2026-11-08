# FlareBase Authentication & Identity Architecture

FlareBase provides a modern, developer-friendly identity layer featuring passwordless FIDO2/WebAuthn passkeys, social OAuth, passwordless magic links, and granular Personal Access Tokens (PATs).

---

## 1. FIDO2 / WebAuthn Passkeys

FlareBase natively implements the W3C WebAuthn Level 3 standard via `@simplewebauthn`, enabling phishing-resistant authentication using device biometrics (Apple Touch ID / Face ID, Windows Hello, Android Biometrics, and YubiKeys).

### Registration Flow
1. **Challenge Generation**: The client requests registration options via `POST /api/v1/auth/passkeys/register-options`. FlareBase returns an unguessable 64-byte cryptographic challenge bound to the user's session with a 60-second TTL.
2. **Authenticator Ceremony**: The browser executes `navigator.credentials.create()` using the platform authenticator.
3. **Attestation & Verification**: The signed attestation response is submitted to `POST /api/v1/auth/passkeys/register-verify`. FlareBase verifies the signature, origin, and user verification flags, persisting the public key credential and initial counter.

### Authentication Ceremony
1. Client requests authentication options: `POST /api/v1/auth/passkeys/login-options`.
2. Browser signs challenge via `navigator.credentials.get()`.
3. Client posts assertion: `POST /api/v1/auth/passkeys/login-verify`. FlareBase validates the assertion signature, verifies that the counter strictly incremented (protecting against cloned authenticators), and issues a session JWT.

---

## 2. Social OAuth Providers

FlareBase supports Google, GitHub, and Apple social logins out of the box with zero third-party dependencies:

- **Google**: OpenID Connect ID token validation against Google's public certs (`googleapis.com/oauth2/v3/certs`) with `iss` and `aud` verification.
- **GitHub**: Token exchange via GitHub API (`api.github.com/user`) retrieving verified primary email.
- **Apple**: Sign in with Apple JWT verification with elliptic-curve cryptographic validation.

---

## 3. Passwordless Magic Links

For frictionless onboarding without passwords or authenticators:

1. **Request Magic Link**: `POST /api/v1/auth/magic-link/send` with `{ "email": "user@example.com" }`.
2. **Cryptographic Token**: FlareBase generates a high-entropy single-use token with a 15-minute expiration, hashing the token at rest.
3. **Verification**: When the user clicks the link or submits the 6-digit backup code, `POST /api/v1/auth/magic-link/verify` validates and immediately burns the token, returning an authenticated session.

---

## 4. Personal Access Tokens (PATs)

For CI/CD pipelines, CLI automation, and server-to-server integrations:

- **Prefix**: All PATs are formatted with `flare_pat_<random_hex>` for instant secret scanning detectability.
- **Granular Scopes**: PATs can be scoped to specific permissions: `db:read`, `db:write`, `storage:upload`, `admin:network`.
- **IP Restrictions**: Optional CIDR and IP locks restrict PAT usage to specific runner or office IP ranges.
- **Header**: Authenticate requests with `x-flarebase-pat: flare_pat_...`.

---

## 5. Multi-Account Defense & Device Scoring

FlareBase actively defends against registration flooding, credential stuffing, and bot armies:

- **Hardware Fingerprinting**: Aggregates screen depth, WebGL renderer, hardware concurrency, and canvas hashing into a stable device fingerprint.
- **Subnet Velocity**: Throttles registration surges from the same `/24` subnet.
- **Shared Wi-Fi / NAT Intelligence**: Accurately differentiates university or corporate shared Wi-Fi networks from distributed botnets to avoid false positives.
