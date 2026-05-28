**DB Migration: reserve_ticket_requests function**

We've added a Postgres function `reserve_ticket_requests` to perform atomic ticket reservations and insert `ticket_requests` rows inside a row-locked transaction.

To apply this migration to your Supabase/Postgres database run one of the following:

Using `psql` (Postgres client):

```bash
psql "postgresql://<DB_USER>:<DB_PASS>@<DB_HOST>:5432/<DB_NAME>" -f supabase/migrations/004_reserve_ticket_requests.sql
```

Using `supabase` CLI:

```bash
supabase db remote set <your-connection-string>
supabase db execute --file supabase/migrations/004_reserve_ticket_requests.sql
```

Notes:
- The function uses `FOR UPDATE` on `ticket_tiers` to serialize availability checks.
- After applying the migration, the backend will call this RPC from `POST /api/tickets`.
- For multi-node deployments this approach is safe because the DB enforces the lock across connections.

Testing locally:
- Start the backend:

```bash
cd backend
npm run dev
```

- Run the concurrency test script (adjust IDs):

```bash
node backend/scripts/concurrency_test.js <EVENT_ID> "Regular" <TEST_USER_ID> 20
```

This will attempt 20 concurrent single-ticket reservations and show which succeeded or failed.
