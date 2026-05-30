# Performance Audit — Summary

Findings:
- N+1 queries: invoice enrichment previously fetched chat messages per-invoice; changed to use invoice columns and batch resolve approvers.
- Socket.IO emits may become a bottleneck at scale — seat updates and queue events are frequent.
- In-memory locks (`locks` map) are process-local; for high concurrency and horizontal scaling use Redis or DB advisory locks.
- No rate limiting on socket events — consider rate-limiting critical endpoints and socket actions.

Recommendations:
- Use Redis adapter for Socket.IO when scaling horizontally.
- Convert frequent DB updates into batched writes where possible (e.g., seat updates).
- Add metrics (Prometheus) for key operations and set alerts for high-latency/queue length.
- Profile endpoints (`/api/tickets`, `/api/events`) under realistic load with `k6` or `artillery`.

Quick profiling commands (example):

```bash
# install k6 and run a basic test
npm i -g k6
k6 run perf/ticket_queue_test.js
```
