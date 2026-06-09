# Bettors Edge Security Audit Notes

_Last updated: June 9, 2026_

## Fixed in repository

- Removed the public startup error overlay from `index.html`.
- Hardened global client-side error handling so production users do not see stack traces.
- Updated `ErrorBoundary` so raw error messages are only displayed outside production builds.
- Cleaned up stale Firebase client code and unused host checks.
- Cleaned up Vite config comments and removed unused environment loading.
- Updated package metadata from the placeholder `react-example` name to `bettorsedge`.
- Added an `npm run audit` script.
- Removed the silent `|| true` behavior from the build script so build/copy failures surface during deployment.
- Expanded `.env.example` with production deployment requirements.

## Required provider-console actions

These cannot be completed from GitHub code alone.

### Firebase Authentication authorized domains

Add these domains in Firebase Console > Authentication > Settings > Authorized domains:

- `bettorsedge.com`
- `www.bettorsedge.com`

### Hosting / DNS / SSL

Confirm both hostnames resolve to the active production deployment:

- `https://bettorsedge.com`
- `https://www.bettorsedge.com`

Confirm the SSL certificate covers both domains.

### Firestore rules

Verify Firestore rules prevent public reads/writes to these collections:

- `users`
- `app_logs`
- `api_logs`
- `login_errors`
- `source_audits`

Minimum expectation:

- Users can read/write only their own user document.
- Admin functions require server-side verification or trusted custom claims.
- Log collections should not be publicly readable.

## Backend item requiring careful patch

### Stripe webhook raw body order

`server.ts` currently registers global JSON body parsing before `/api/webhook`. Stripe webhook signature verification requires the raw request body.

The safest fix is to register the webhook route before this middleware:

```ts
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

Recommended pattern:

```ts
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Stripe signature verification here
});

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
```

Because `server.ts` is large, review this change carefully after patching and run:

```bash
npm run lint
npm run build
npm run audit
```

## Recommended commands before deploy

```bash
rm -rf node_modules package-lock.json
npm install
npm run lint
npm run build
npm audit
```

Commit the regenerated `package-lock.json` after reinstalling dependencies.

## Production hardening still recommended

- Move client-side paywall/admin bypass email lists to server-side checks or Firebase custom claims.
- Re-enable stricter Helmet settings for production after Firebase popup/login behavior is confirmed on the real domain.
- Add GitHub Dependabot alerts and security updates.
- Add CI that runs `npm run lint`, `npm run build`, and `npm audit --audit-level=high` on every push.
