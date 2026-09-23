# Authentication Contract

Status: Step 2 documented from the current backend routes/controllers and current Flutter authentication screens.

Base path: `/api/auth`

Unless marked **Public**, send `Authorization: Bearer <token>`. JSON requests use `Content-Type: application/json`; `/update-profile` may use `multipart/form-data`.

## Entry flows

### Register

`POST /register` - Public

Request:

```json
{
  "username": "required string",
  "fullName": "required string",
  "email": "required string",
  "password": "required string",
  "isSeller": "optional boolean",
  "referralCode": "optional string"
}
```

Password must contain at least 8 characters, one uppercase letter, one lowercase letter, and one number.

Success `201`:

```json
{
  "success": true,
  "message": "Account created successfully",
  "token": "jwt",
  "user": {
    "id": "value",
    "user_id": "value",
    "username": "value",
    "full_name": "value",
    "email": "value",
    "user_type": "value",
    "profile_picture": "value-or-null",
    "referral_code": "value-or-null",
    "wallet_balance": "value",
    "created_at": "timestamp"
  }
}
```

Errors: `400` missing/invalid fields, weak password, duplicate email, or duplicate username; `403` permanently deactivated account; `404` deleted profile; `500` registration failure.

Required UI states: form, local validation, terms not accepted, submitting, field/API error, offline/retry, and successful authenticated navigation.

### Login and OTP

`POST /login` - Public

Request: `{ "email": "required", "password": "required" }`

Valid credentials do not return a session immediately. Success `200` requires OTP:

```json
{
  "success": true,
  "otpRequired": true,
  "credentialMethod": "password-or-passkey",
  "message": "value",
  "maskedDestination": "value",
  "expiresInMinutes": 10,
  "debugOtp": "current-handler-value"
}
```

Errors: `400` missing fields; `401` invalid credentials; `403` permanently deactivated; `404` deleted account; `500` login failure.

Security note: the current login handler returns `debugOtp`. Production must not expose OTP values; gate or remove this field before release.

`POST /login/verify-otp` - Public

Request: `{ "email": "required", "password": "required", "otp": "exactly 6 digits" }`

Normal success `200`:

```json
{
  "success": true,
  "message": "value",
  "credentialMethod": "value",
  "token": "jwt",
  "user": {},
  "session": {}
}
```

Untrusted-device success `202`:

```json
{
  "success": true,
  "approvalRequired": true,
  "message": "value",
  "approval": {
    "id": "value",
    "token": "value",
    "expiresInSeconds": 300
  },
  "user": {},
  "session": {}
}
```

Errors: `400` malformed, invalid, or expired OTP; `401` invalid credentials; `403` permanently deactivated; `404` deleted account; `500` verification failure.

`POST /login/device-approval/status` - Public

Request: `{ "approvalId": "required", "approvalToken": "required" }`

- `200`: `{ "success": true, "status": "approved", "message": "value", "token": "jwt", "user": {} }`
- `202`: `{ "success": true, "status": "pending", "message": "value" }`
- `400`: missing fields
- `403`: denied
- `404`: approval not found
- `410`: expired
- `500`: status check failed

Required UI states: credentials form, submitting, OTP entry, invalid/expired OTP, resend, device approval pending, approved, denied, expired, polling/offline retry, and authenticated navigation. Flutter currently polls approval every two seconds.

### Forgot password

`POST /forgot-password/request-otp` - Public

Request: `{ "email": "required" }`

Success `200`: `{ "success": true, "message": "value", "expiresInMinutes": 10 }`. `debugOtp` is included only when `PASSWORD_RESET_DEBUG_OTP=true`.

Errors: `400` missing email; `403` permanently deactivated; `404` missing/deleted account; `429` five or more requests within ten minutes; `500` OTP generation or email delivery failure.

`POST /forgot-password/verify-otp` - Public

Request: `{ "email": "required", "otp": "exactly 6 digits" }`

Success `200`:

```json
{
  "success": true,
  "message": "OTP verified",
  "resetToken": "short-lived-token",
  "expiresInMinutes": 10
}
```

Errors: `400` invalid/expired OTP or malformed input; `500` verification failure.

`POST /forgot-password/reset` - Public

Request: `{ "email": "required", "resetToken": "required", "newPassword": "required" }`. The same 8-character/uppercase/lowercase/number policy applies.

Success `200`: `{ "success": true, "message": "value" }`.

Errors: `400` missing fields, weak password, or invalid/expired reset session; `500` reset failure.

Required UI states: email entry, requesting, OTP entry, invalid/expired OTP, resend/rate limit, new password, password-policy validation, mismatch, resetting, session expired, success, and offline/retry.

Known drift:

- `lib/services/auth_service.dart` has an alternate reset call that sends `email`, `otp`, and `password`; the backend requires `email`, `resetToken`, and `newPassword`. The active screen currently uses the correct central API method.
- The Flutter reset screen checks only a six-character minimum before submission, while the backend requires the full registration password policy.

## Authenticated security flows

| Endpoint | Request | Success | Main failures / UI states |
|---|---|---|---|
| `POST /verify-password` | `password` | `200` success, message, credential method | `400`, `401`, `404`, `500`; idle, verifying, rejected, verified |
| `POST /change-password` | `currentPassword`, `newPassword` | `200` success/message | Current credential and full password-policy validation; `400`, `401`, `404`, `500` |
| `POST /security/request-otp` | `purpose`; optional `destinationType`, `phoneNumber`, `dialCode` | OTP sent envelope | Invalid destination/purpose, rate or delivery error; sending, sent, retry |
| `POST /security/verify-otp` | `purpose`, six-digit `otp` | Short-lived `securityToken` | Invalid/expired OTP; verifying, rejected, verified |
| `POST /security/change-email` | `newEmail`, `securityToken` | Email changed envelope | Invalid token/input, `409` duplicate email; editing, verifying, saved |
| `POST /security/reset-password` | `newPassword`, `securityToken` | Password changed and token version invalidated | Weak password or invalid token; validate, submit, force reauthentication |
| `POST /security/passkey` | Six-digit `passkey`, `securityToken` | Passkey saved envelope | Invalid token/passkey; setup, confirmation, saved |
| `POST /security/two-factor-phone` | `emailSecurityToken`, optional `phoneSecurityToken`, `countryCode`, `countryName`, `dialCode`, `phoneNumber`, optional `otpDeliveryMethod` | Phone/2FA saved envelope | Invalid token or phone; email OTP, phone OTP, saved |
| `POST /security/otp-delivery` | `otpDeliveryMethod` = `email` or `phone` | Preference saved envelope | Invalid method/unconfigured phone; saving, saved, rejected |

Allowed security OTP purposes: `login`, `change_email`, `reset_password`, `passkey`, `setup_2fa_email`, `setup_2fa_phone`, `self_deactivate`, and `self_delete`.

## Session contract

All session routes require Bearer authentication.

| Endpoint | Request | Required behavior |
|---|---|---|
| `GET /sessions` | None | Return active sessions and identify the current session. UI: loading, list, empty, error/retry. |
| `GET /sessions/history` | None | Return session/security history. UI: loading, chronological list, empty, error/retry. |
| `POST /sessions/logout-others` | None | Revoke all sessions except current. UI: confirmation, submitting, success, partial/error retry. |
| `PATCH /sessions/:id` | Session ID plus handler-supported JSON changes | Update a session/trust setting. UI: saving, saved, not found/forbidden. |
| `DELETE /sessions/:id` | Session ID | Revoke selected session. Revoking current session must return to login. |

Exact session item envelopes are **Envelope pending** and require captured fixtures before strict Flutter models are finalized.

## Profile, account, and social endpoint matrix

| Endpoint | Permission | Request | Success contract / required UI |
|---|---|---|---|
| `GET /username/:username` | Public | Path username | User envelope; profile loading, found, not found, error. **Envelope pending.** |
| `GET /user/:id` | Public | Path user ID | User envelope; profile loading, found, not found, error. **Envelope pending.** |
| `GET /profile` | Bearer | None | Current profile envelope; loading, loaded, unauthorized, retry. **Envelope pending.** |
| `GET /search-users` | Bearer | Handler-supported query | People results; typing/debounce, loading, empty, results, pagination/error. **Envelope pending.** |
| `GET /check-username` | Bearer | Query `username` | Availability result; checking, available, unavailable, invalid/error. |
| `PUT /update-profile` | Bearer | Profile fields; optional multipart `profile_picture_file` | Updated profile; editing, media upload, validation, saving, saved/error. |
| `PUT /update-shipping-address` | Bearer | `shippingAddress` | Updated address; editing, validation, saving, saved/error. |
| `GET /wallet` | Bearer | Query `include_referrals`, `page`, `limit` | Wallet/referral envelope; loading, loaded, empty, pagination/error. **Envelope pending.** |
| `GET /suspension` | Bearer | None | Current suspension state; clear/suspended/loading/error. **Envelope pending.** |
| `POST /suspension/appeal` | Bearer | Appeal body accepted by account service | Appeal result; compose, submit, submitted/already pending/error. **Envelope pending.** |
| `POST /self-deactivate` | Bearer | None | Account deactivated; confirmation, security verification, submit, logout. |
| `POST /self-delete` | Bearer | None | Account deleted; destructive confirmation, security verification, submit, local-data purge. |
| `GET /user/:id/subscription` | Public | Path user ID | Subscription status; loading/subscribed/not subscribed/error. **Envelope pending.** |
| `GET /user/:id/followers` | Public | Path user ID | Followers list; loading/list/empty/pagination/error. **Envelope pending.** |
| `GET /user/:id/following` | Public | Path user ID | Following list; loading/list/empty/pagination/error. **Envelope pending.** |
| `GET /user/:id/blocked` | Public route | Path user ID | Blocked list; do not expose private data without handler-level authorization. **Envelope pending/security review.** |
| `GET /user/:id/views` | Public route | Path user ID | Profile views; do not expose private analytics without handler-level authorization. **Envelope pending/security review.** |
| `POST /user/:id/subscribe` | Bearer | Path user ID | Toggle result; optimistic/loading, subscribed/unsubscribed, rollback/error. **Envelope pending.** |
| `POST /user/:id/view` | Public | Path user ID | View logged result; fire-and-forget, no blocking spinner. **Envelope pending.** |
| `POST /user/:id/report` | Bearer | `reason`, optional `custom_reason` | Report result; reason picker, validation, submitting, submitted/error. |
| `POST /user/:id/block` | Bearer | Path user ID | Toggle result; confirmation, blocked/unblocked, feed/profile refresh, rollback/error. **Envelope pending.** |

`update-profile` currently accepts a broad set including username/name, email/contact email, bio, profile picture, shipping address, phone/country/province, and date of birth. A captured multipart fixture is required before generating the final typed update DTO.

## Shared error rules

- Preserve HTTP status separately from the server message. Do not reduce all failures to a string.
- `401` clears invalid credentials and routes to login, except public login credential rejection where it remains a form error.
- `403` displays the suspension/deactivation/permission state and must not retry indefinitely.
- `404` distinguishes missing account/resource from network failure.
- `409` is a field conflict such as duplicate email.
- `410` means an approval/session has expired and the UI returns to the appropriate earlier step.
- `429` displays a cooldown and disables resend until retry is valid.
- `500` and transport failures retain entered data and expose retry.

## Step 3 follow-up

Authentication/token mapping must define secure token storage, token restoration, logout cleanup, current-session identity, token-version invalidation, optional-auth requests, and whether web cookie behavior has a Flutter bearer equivalent.

