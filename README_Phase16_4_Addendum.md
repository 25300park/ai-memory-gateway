# Phase 16-4 Addendum

## Mini PC Actual Setup / Runtime Verification

This addendum explains how to verify that the 24-hour Mini PC can run AI Memory Gateway as a runtime server candidate.

Recommended order:

```bash
git clone https://github.com/25300park/ai-memory-gateway.git
cd ai-memory-gateway
npm install
cp .env.example .env
npm run dev
```

Required manual checks:

```txt
1. Restore .env with real values.
2. Confirm Tailscale is connected.
3. Confirm NAS MariaDB is reachable.
4. Open Admin Console at localhost:3010.
5. Run Summary Worker in separate Git Bash window.
6. Verify restart recovery after Mini PC reboot.
```

Do not upload `.env`, backups, imports, or node_modules to GitHub.
