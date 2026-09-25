# FlareBase Product Demo Video

## Overview
This directory contains the deterministic product walkthrough video for **FlareBase** — showcasing both the **Super Admin Security & Infrastructure Controls** and the **Developer & User Interface Dashboard** as documented in the [main README](../README.md).

- **Recording Date**: September 20, 2026
- **Exact Duration**: 80.0 seconds (Target: 60–90 seconds)
- **Resolution**: 1920x1080 (1080p Full HD) @ 30 FPS
- **Video Format**: MP4 (H.264 / AAC compatible, `yuv420p`, faststart enabled)
- **Primary Deliverable**: `demo-video/final/flarebase-demo-20260920-175014.mp4`
- **Latest Alias**: `demo-video/final/flarebase-demo-latest.mp4`

---

## Demonstrated Workflow & Storyboard

### Part A: Super Admin Security & Infrastructure Controls (`0:00 - 0:37`)
| Scene | Timestamp | Feature | Description |
| :--- | :--- | :--- | :--- |
| **1** | `0:00 - 0:07` | **Super Admin Gateway & Login** | Zero-trust emergency portal, 1-click demo login (`admin@flarebase.dev`), and RS256 token verification. |
| **2** | `0:07 - 0:14` | **Telemetry & Rate Limits** | Live CPU/RAM metrics, query latency charts, dynamic token bucket rate limit sliders, and DDoS defense. |
| **3** | `0:14 - 0:21` | **Network Access Center** | Subnet access control, connected device roster with bandwidth meters, and 1-click IP toggle blocking. |
| **4** | `0:21 - 0:29` | **Threat Intelligence Radar** | 5 live KPI cards, composite risk scores (0-100), $D_{\text{hash}}$ device fingerprints, and live security audit scans. |
| **5** | `0:29 - 0:37` | **Hosting & System Recovery** | Dual Local/LAN discovery (`http://192.168.31.57:3850`), Cloudflare tunnels, and 6-digit `RECOVERY_PIN` emergency recovery portal. |

### Part B: Developer & User Interface Dashboard (`0:37 - 1:14`)
| Scene | Timestamp | Feature | Description |
| :--- | :--- | :--- | :--- |
| **6** | `0:37 - 0:44` | **Developer Metrics & Projects** | Scoped API keys, project workspace isolation, database operation metrics, and repository sync. |
| **7** | `0:44 - 0:52` | **Organizations & Teams** | Multi-tenant workspace switcher, member rosters, functional groups (`@org/team`), and project permission grants. |
| **8** | `0:52 - 1:00` | **NoSQL Database & RLS** | Schemaless JSON document collections, embedded `_rules` evaluation, and real-time reactive search. |
| **9** | `1:00 - 1:07` | **Storage Vault & Quotas** | Magic byte binary validation, real-time visual 500MB quota metering bar, and temporary signed URLs. |
| **10** | `1:07 - 1:14` | **User Security Console** | FIDO2 Biometric Passkeys, active sessions with remote device killswitch, scoped PATs, and GDPR Art. 20 export. |

### Part C: Architecture Showcase (`1:14 - 1:20`)
| Scene | Timestamp | Feature | Description |
| :--- | :--- | :--- | :--- |
| **11** | `1:14 - 1:20` | **Outro Summary Card** | Branded high-resolution showcase highlighting all security controls and developer primitives. |

---

## Safe Demo Data & Privacy Verification
- **Zero Real Secrets**: All displayed credentials use standard local demo accounts (`admin@flarebase.dev` / `Admin@123`).
- **No Token Leaks**: Auth tokens and sensitive PII are masked and encrypted.
- **Isolated Execution**: Recorded on dedicated local port `3850` without touching production databases or external endpoints.

---

## Reproducing the Recording
To re-run the deterministic demo capture from scratch:

```bash
# 1. Compile TypeScript backend
npm run build

# 2. Run the deterministic demo capture script
node demo-video/record-demo.js
```

### Prerequisites
- Node.js `>= 20.x`
- `ffmpeg` & `ffprobe` (available at `/opt/homebrew/bin/ffmpeg` or system `PATH`)
- Chrome / Chromium (managed via Puppeteer)
