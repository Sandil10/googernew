# 08 — Authentication and Security

Backend: `controllers/authController.js` (131 KB), `routes/auth.js`,
`middleware/auth.js`. Tables: `users`, `auth_sessions`, `account_security_otps`,
`password_reset_otps`, `user_blocks`, `user_reports`.

Frontend: `services/authService.ts` (37 KB), `components/auth/LoginModal.tsx`,
`app/login/`, `app/register/`, `app/settings/**`,
`components/security/SecurityDevicesCenter.tsx` (30 KB).

## 1. Registration and login

| Endpoint | Handler |
| --- | --- |
| `POST /auth/register` | `register` |
| `POST /auth/login` | `login` |
| `POST /auth/login/verify-otp` | `verifyLoginOtp` |
| `POST /auth/login/device-approval/status` | `getDeviceApprovalStatus` |
| `GET /auth/username/:username`, `GET /auth/check-username` | availability |

**Rule:** login is **two-phase when challenged**. `POST /auth/login` may not return a
token — it can respond with an OTP challenge, which `POST /auth/login/verify-otp`
completes. A client that assumes a token always comes back from `/login` will break
on any account with 2FA or an unrecognised device.

**Rule:** an unrecognised device can require **approval from an existing session**.
`POST /auth/login/device-approval/status` is polled while the new device waits, so
the login screen can advance when the other device approves.

## 2. Token model

JWT claims used by `middleware/auth.js`: `id`, `tokenVersion`, `sessionId`.

Two independent revocation levers:

| Lever | Mechanism | Effect |
| --- | --- | --- |
| **Global** | `users.token_version` vs the `tokenVersion` claim | bump the column → every token for that user dies |
| **Per-device** | `auth_sessions.status` / `logout_at` vs the `sessionId` claim | kill one session |

Both return 401 `Session has been invalidated. Please log in again.`
An expired token instead yields `Session expired. Please log in again.` — the client
can distinguish "logged out elsewhere" from "token aged out".

**Rule:** if `auth_sessions` does not exist (Postgres `42P01`) the per-device check
is skipped rather than throwing. Session revocation degrades to global-only on a
fresh database.

Token storage on the client is checked in both `sessionStorage` and `localStorage`
(`app/dashboard/page.tsx:1564`) — session-scoped logins are supported.

## 3. Sessions and devices

| Endpoint | Purpose |
| --- | --- |
| `GET /auth/sessions` | active sessions |
| `GET /auth/sessions/history` | historical sessions |
| `PATCH /auth/sessions/:id` | update (e.g. trust a device) |
| `DELETE /auth/sessions/:id` | revoke one |
| `POST /auth/sessions/logout-others` | revoke all but current |

UI: `/settings/trusted-devices`, `/settings/security-alerts`,
`components/security/SecurityDevicesCenter.tsx`,
`components/security/LeafletDeviceMap.tsx` (device locations on a map),
`components/GlobalSecurityDeviceAlert.tsx` (app-wide new-device banner).

Location support: `app/api/viewer-country/route.ts`, `app/device-location/route.ts`,
`app/api/country-codes/route.ts`.

## 4. OTP flows

Three separate OTP purposes, two tables:

**Password reset (logged out)** — `password_reset_otps`

| Endpoint | Handler |
| --- | --- |
| `POST /auth/forgot-password/request-otp` | `requestPasswordResetOtp` |
| `POST /auth/forgot-password/verify-otp` | `verifyPasswordResetOtp` |
| `POST /auth/forgot-password/reset` | `resetPasswordWithOtp` |

**Account security (logged in)** — `account_security_otps`

| Endpoint | Handler | Purpose |
| --- | --- | --- |
| `POST /auth/security/request-otp` | `requestAccountSecurityOtp` | issue |
| `POST /auth/security/verify-otp` | `verifyAccountSecurityOtp` | verify |
| `POST /auth/security/change-email` | `changeLoginEmailWithOtp` | change login email |
| `POST /auth/security/reset-password` | `resetLoggedInPasswordWithOtp` | change password while signed in |
| `POST /auth/security/passkey` | `savePasskeyWithOtp` | register a passkey |
| `POST /auth/security/two-factor-phone` | `saveTwoFactorPhone` | set 2FA phone |
| `POST /auth/security/otp-delivery` | `updateOtpDeliveryMethod` | email vs SMS |

**Login OTP** — the challenge from §1.

**Rule:** every sensitive account change is OTP-gated. Email change, password change,
passkey registration and 2FA phone all require a fresh OTP — a valid session alone is
not sufficient.

**Rule:** OTP delivery method is user-configurable (`updateOtpDeliveryMethod`), so
the channel is a per-user setting rather than a global one.

Settings pages: `/settings/reset-password`, `/settings/change-login-email`,
`/settings/passkeys`, `/settings/two-factor`.
UI helper: `components/SecurityVerificationModal.tsx`.

## 5. Password change

| Endpoint | Purpose |
| --- | --- |
| `POST /auth/change-password` | with current password |
| `POST /auth/verify-password` | confirm identity before a sensitive action |
| `POST /auth/security/reset-password` | OTP-based, signed in |

**Rule:** `verifyPassword` exists as a standalone re-auth check — used to gate
actions without forcing a full re-login.

## 6. Account state

| Endpoint | Handler | Effect |
| --- | --- | --- |
| `POST /auth/self-deactivate` | `selfDeactivateAccount` | reversible; content disappears from feeds |
| `POST /auth/self-delete` | `selfDeleteAccount` | permanent |
| `GET /auth/suspension` | `getMySuspension` | suspension detail |
| `POST /auth/suspension/appeal` | `submitSuspensionAppeal` | appeal |

**Rule:** deactivation is enforced in the **feed queries**, not by deleting rows:

```sql
AND COALESCE(u.is_deactivated, false) = false
AND COALESCE(u.status, 'Active') <> 'Deactivated'
```

Two independent flags (`is_deactivated` boolean and `status` text) both gate
visibility. Reactivating restores everything.

Suspended users land on `/suspended` (`app/suspended/page.tsx`).

## 7. Rate limiting

`app.use('/api/', limiter)` in `server.js` — applied to the whole API.

The client is aware of it: `app/dashboard/page.tsx` implements like-cooldown
backoff (`extendLikeCooldown`, `isLikeBackedOff`, `isRateLimitedError`) so rapid
liking degrades gracefully instead of erroring.

## 8. Shared auth helpers

`shared/api/authToken` provides `extractAuthToken` and `getJwtSecret`, used by both
the main backend and the admin panel so header parsing and secret resolution cannot
drift between them.

## 9. Gaps and risks

1. **`processDueSubscriptionsForUser` runs on every authenticated request** — an
   extra query on the hot path of every API call, and the only renewal trigger.
2. **`ensureTokenVersionColumn` runs an `ALTER TABLE` at module load**, fire-and-forget.
3. **`console.log('[AUTH] Token Decoded:', ...)` on every request**
   (`middleware/auth.js:64`) — user ids in logs on every call.
4. **Blocking is filtered client-side** in the feed; the API still returns blocked
   users' content.
5. **Auth is per-route.** A new route file that forgets the middleware is public by
   default — worth an audit when adding endpoints.
