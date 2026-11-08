# FlareBase Quickstart Guide

Get up and running with **FlareBase** in under 2 minutes. FlareBase can be launched natively via 1-click platform scripts, standard Node.js, or containerized with Docker.

---

## 1. Native 1-Click Launchers (Recommended for Local Dev)

FlareBase includes native launcher scripts that verify Node.js prerequisites, install dependencies, compile TypeScript, and launch the server in your default browser automatically:

### macOS
Double-click `setup.command` in Finder, or run:
```bash
./setup.command
```

### Windows
Double-click `setup.bat` in File Explorer, or run in Command Prompt:
```cmd
setup.bat
```

### Linux
Run the shell script:
```bash
chmod +x setup.sh start.sh stop.sh
./setup.sh
```

### Server Management Scripts
- **Start server in background / daemon**: `./start.sh` (macOS/Linux) or `start.bat` (Windows)
- **Stop server safely**: `./stop.sh` (macOS/Linux) or `stop.bat` (Windows)

---

## 2. Manual Node.js Installation

If you prefer using the command line directly:

### Step 1: Clone & Install Dependencies
```bash
git clone https://github.com/arya-ayyappa-halambi/Hamara-FireBase.git flarebase
cd flarebase
npm install
```

### Step 2: Configure Environment
Copy the example environment configuration:
```bash
cp .env.example .env
```
Key configuration parameters:
- `PORT`: HTTP port (default: `3000`)
- `NODE_ENV`: `development` or `production`
- `DB_PATH`: Path to SQLite database (default: `database.sqlite` or `:memory:`)
- `JWT_SECRET`: 64+ char random hex string for signing session JWTs
- `ENCRYPTION_KEY`: 32-byte hex key for AES-256-GCM envelope encryption
- `EMAIL_HASH_PEPPER`: HMAC secret for canonical blind indexing

### Step 3: Build & Start
```bash
# Build client SDK packages and server TypeScript
npm run build

# Start server
npm start
```

---

## 3. Docker Deployment

FlareBase is fully containerized and runs out of the box with `docker-compose`:

```yaml
version: '3.8'

services:
  flarebase:
    image: node:20-alpine
    working_dir: /app
    volumes:
      - ./:/app
      - flarebase_data:/app/data
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DB_PATH=/app/data/flarebase.db
      - JWT_SECRET=${JWT_SECRET}
      - ENCRYPTION_KEY=${ENCRYPTION_KEY}
    command: sh -c "npm ci && npm run build && npm start"
    restart: unless-stopped

volumes:
  flarebase_data:
```

Launch with:
```bash
docker-compose up -d
```

---

## 4. Super Admin First-Boot Initialization

When FlareBase boots for the very first time, it seeds the Super Admin account:

- **Default Email**: `admin@flarebase.dev`
- **Development Password**: `Admin@123` (or configured via `ADMIN_PASSWORD` in `.env`)
- **Production Password**: If no `ADMIN_PASSWORD` is provided in `.env`, a cryptographically secure 24-character random password is automatically generated, hashed with bcrypt (cost factor 12), and printed **once** to standard output at boot.

Log in to the Web Console at `http://localhost:3000` to create your first project, generate API keys, and configure security policies.
