# Contributing to FlareBase

Thank you for your interest in contributing to **FlareBase**! We welcome contributions from developers, security researchers, and teams worldwide to make FlareBase the fastest, most reliable self-hosted Firebase alternative.

---

## Code of Conduct

We are committed to providing a welcoming, inclusive, and harassment-free environment for everyone. Please be respectful, constructive, and collaborative in all communications, issues, and pull requests.

---

## Getting Started

### Prerequisites
- **Node.js**: v18.x or later (v20+ recommended)
- **npm**: v9.x or later
- **Operating System**: macOS, Linux, or Windows

### Repository Setup

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/<your-username>/Hamara-FireBase.git
   cd Hamara-FireBase
   ```
3. **Install dependencies**:
   ```bash
   npm install
   ```
4. **Configure your environment**:
   ```bash
   cp .env.example .env
   ```
5. **Start the local development server**:
   ```bash
   npm run dev
   ```
   Or use the double-clickable launchers:
   - macOS: `./start.command`
   - Linux: `./start.sh`
   - Windows: `start.bat`

---

## Running Automated Tests

FlareBase enforces a zero-regression invariant across all 22 test suites with over 365 verification checks. All tests run in isolated, in-memory SQLite instances (`DB_PATH=:memory:`) to ensure reproducibility.

Before submitting any code changes, verify that the entire test suite passes cleanly:

```bash
# Run all 22 test suites
npm test

# Run a specific test suite
npx ts-node tests/vulnerability-hardening.test.ts
```

Every pull request must maintain a **100% pass rate** across all automated tests.

---

## Reporting Issues & Feature Requests

- **Bug Reports**: Open an issue on GitHub describing the bug, reproduction steps, expected behavior, and your operating system / Node.js version.
- **Feature Requests**: Open an issue with the `enhancement` tag, outlining the use case, suggested API design, and why it benefits FlareBase users.
- **Security Vulnerabilities**: For sensitive security issues, please report responsibly by creating a private GitHub Security Advisory or contacting the maintainers directly before public disclosure.

---

## Pull Request Guidelines

1. **Create a topic branch** from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   # or
   git checkout -b fix/issue-description
   ```
2. **Write clean, typed TypeScript**:
   - Adhere to the existing project architecture and error-handling patterns (`AppError`).
   - Preserve comments and docstrings.
   - Ensure all database queries follow parameterized prepared statements to prevent SQL injection.
3. **Add or update tests**:
   - If adding a feature or fixing a bug, include unit or integration tests in `tests/`.
4. **Run the full test suite**:
   ```bash
   npm test
   ```
5. **Commit your changes**:
   - Write clear, concise commit messages.
6. **Push and open a Pull Request**:
   - Reference any related issues in the PR description.

---

## Licensing

By contributing to FlareBase, you agree that your contributions will be licensed under the project's [MIT License](LICENSE).
