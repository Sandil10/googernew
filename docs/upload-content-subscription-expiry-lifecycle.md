# Upload content subscription expiry lifecycle

This flow applies to approved Flash and Vault uploads.

## Admin settings

- Every plan, including Basic, owns an Upload Content Expiry value and unit.
- Supported units are minutes, hours, days, months, and lifetime.
- Paid plans share an editable grace period. Supported grace units are minutes, hours, and days.
- Updating a plan synchronizes its approved uploads. A previously paid upload that has fallen back to Basic receives a fresh Basic retention window.

## Runtime lifecycle

1. When an upload is approved, the backend snapshots the owner's effective plan and content expiry policy onto the upload.
2. While a paid subscription is active, the upload follows the paid plan policy.
3. When the paid subscription expires, its configured grace period begins. Paid content is retained throughout grace even if its old content deadline is reached.
4. Only the owner, on their own profile Googs tab, sees: `Subscription Expired: Auto-delete in X unless renewed.` Here X is the current Basic plan content retention, not the grace duration.
5. Renewing during grace keeps the paid plan and removes the notice.
6. When grace ends without renewal, the subscription becomes expired and approved uploads move to Basic. Their deletion deadline starts from the downgrade time using the current Basic policy.
7. The owner-only profile notice changes to: `This content will be automatically deleted in X. Upgrade to a subscription plan to keep it longer.` X is calculated from the upload's actual remaining deadline.
8. The recurring subscription job permanently deletes the upload when its effective deadline is reached. Grace-protected content is excluded from deletion.

Neither notice is rendered in Home, another user's profile, or other feed presentations.

## API fields used by clients

- `expires_at`: effective deletion deadline after Basic fallback.
- `approval_plan_slug`, `approval_expiry_value`, `approval_expiry_unit`: snapshotted approval policy.
- `owner_subscription_expired_in_grace`: selects the grace notice.
- `owner_basic_content_expiry_value`, `owner_basic_content_expiry_unit`: current Basic retention shown during grace.

## Live policy verified on 2026-09-07

- Basic content expiry: 5 days.
- Plan 1 content expiry: 10 days.
- Package 2 content expiry: lifetime.
- Package 3 content expiry: 20 days.
- Paid-plan grace period: 10 minutes.

These values remain editable in the admin Subscription plan controls.
