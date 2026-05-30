# Future Deployment Notes

## OAuth — Google Login Domain

### Problem
Google's "Pilih akun" screen shows `emmqhyslxjvqlumjvqge.supabase.co` instead of our own domain. This happens because the registered OAuth redirect URI in Google Cloud Console points to Supabase's built-in callback.

### Development (localhost)
**No fix needed.** This is normal — Google shows the domain of the registered redirect URI, which is always `supabase.co` during dev. The flow still works: Google → Supabase callback → redirect back to `localhost:5173`.

### Production Options (when deploying)

| Option | Cost | Domain shown in Google | Complexity |
|---|---|---|---|
| **A. Deploy to Vercel** (`creaticks.vercel.app`) | Free | Still `supabase.co` (flow works) | Low |
| **B. Supabase Custom Domain** | $25/month (Pro) | `auth.creaticks.com` | Medium |
| **C. Self-handle callback** + Vercel | Free | `creaticks.vercel.app` | Medium-High |

#### A. Deploy to Vercel (keep Supabase callback)
- Deploy to Vercel → get `creaticks.vercel.app`
- Update Supabase Dashboard → Authentication → Settings → Site URL to `https://creaticks.vercel.app`
- Update `redirectTo` in `useAuth.ts` if needed (currently uses `window.location.origin` → auto-adapts)
- Google still shows `emmqhyslxjvqlumjvqge.supabase.co` — acceptable for MVP

#### B. Supabase Custom Domain
1. Supabase Dashboard → Authentication → Settings → Custom Domain → add `auth.creaticks.com`
2. DNS provider: add CNAME `auth.creaticks.com` → Supabase
3. Google Cloud Console: update OAuth redirect URI to `https://auth.creaticks.com/auth/v1/callback`
4. Update `src/lib/supabase.ts`:
```ts
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    siteUrl: 'https://creaticks.com',
    redirectTo: 'https://creaticks.com/auth/callback'
  }
})
```

#### C. Self-handle callback
1. Create endpoint `/auth/callback` on our server
2. Register `https://creaticks.vercel.app/auth/callback` in Google Cloud Console
3. Handle OAuth code exchange manually via Supabase Auth API
4. More control, no Supabase URL exposure, free

### Recommended Path
1. **Now (dev)**: Do nothing — `localhost` flow works fine
2. **MVP launch**: Deploy to Vercel (Option A) — get live quick, accept Supabase URL cosmetic
3. **Post-MVP**: If custom domain available, implement Option C (self-handle callback, free) for a branded auth experience

---

## Server Capacity

Current server (if self-hosted) already runs:
- LostFound
- Indiepoint

Adding Creaticks may overload. Deploying frontend to Vercel (static hosting) removes that load. Backend (Express API) could go to a separate Railway / Render instance or the same server if capacity allows.
