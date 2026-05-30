# Security Audit — Summary (automated + manual)

Findings:
- In-process locks (`withLock`) are not safe for multi-node deployments — risk of race conditions.
- Cron jobs run in-process (node-cron) and may be lost on restarts — critical job durability issue.
- No explicit `approved_by` field initially; approval recorded only in chat messages (now migrated).
- Some endpoints accept freeform strings without strict length checks (risk of large payloads).
- File uploads acceptance lacks explicit validations here — ensure upload middleware validates MIME type and size.
- Socket.IO room joins rely on client-provided room IDs; ensure authorization before joining rooms.

Recommendations:
- Add DB-level locks or Postgres advisory locks for cross-node serialization.
- Move critical scheduled jobs to external scheduler (supabase cron, serverless, or BullMQ + Redis).
- Harden uploads: validate content-type, maximum size, and store proofs in object storage with signed URLs.
- Add RBAC checks on socket join events: verify user is allowed to join `event:{id}:admins` and similar rooms.
- Add dependency scanning to CI: `npm audit`, `snyk`, or `npm audit` with fail-on-high.
- Add centralized logging and alerting (e.g., Datadog/ELK) and track failed cron runs.

Quick commands to run locally:

```bash
npm install
npm audit --production
# or use Snyk (if configured)
npx snyk test
```
