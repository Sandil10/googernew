# Current Ad Logic Lock

This file is a guardrail for future work. The ad behavior below is the current accepted contract and must not be changed casually. If any future change touches ad code, it must preserve these rules unless the product owner explicitly asks for a coordinated rules change.

## Ad Categories

The platform currently supports these ad categories:

- Photo & Video Ads
- Product Promote Ads
- Profile Promote Ads

## Placements

These ad flows currently operate across:

- Home Feed
- Shop Feed
- Chat-related placements where supported
- Profile page saved/completed ad display where applicable
- Published Ads / Ad Center views

## View Count Mechanism

Views follow the view-count mechanism.

- A view is counted when a user sees the same ad for the first time within a 24-hour window.
- The same user seeing the same ad again within 24 hours must not increase views.
- After 24 hours, a new counted view is allowed again.
- Users do not need to click the ad for a view to count.
- The backend is the source of truth for view totals.

## Impression Mechanism

Impressions follow the impression mechanism.

- Every display counts as an impression.
- There is no 24-hour restriction for impressions.
- Refreshing and seeing the same ad again increases impressions again.
- Impressions are separate from views and must never be replaced with view totals.

## Reach Display Rule

Under Published Ads / Ad Center, the current accepted UI rule is:

- `Reach` display must mirror the view-count mechanism.
- For all ad types shown there, `Reach` must display the same total as counted views.

This is a display rule. It does not change backend impression storage.

## Reach Cap Rule

Reach cap currently follows the admin panel multiplier contract.

- Admin panel `Max Reach Multiplier` means: `ad budget x multiplier`.
- Example: `R300 x 0.05 = 15 impressions`.
- Ads complete when total impressions meet or exceed the calculated cap.
- This applies to live completion checks and to tier updates.

## Saved Photo & Video Ads

For saved completed Photo & Video ads on the profile page:

- Saved ads must remain visible according to the accepted save/subscription flow.
- The displayed saved ad image must come from the ad's own media preview / media gallery.
- A generic `image_url` from another context must not override the ad's real uploaded media.

## Profile Page Merge Rule

When profile-page saved completed ads are merged with active owner ads:

- Matching ad ids must preserve the real ad media fields.
- Do not replace the correct ad media with stale or mismatched preview data.

## Performance Safety Rule

When improving performance:

- Do not change ad algorithms, ad placements, view logic, impression logic, save logic, or publish logic.
- Only reduce redundant polling, unnecessary rerenders, or duplicate fetches.

## Change Policy

Future AI agents and developers should treat these rules as locked behavior.

- Do not reinterpret `Max Reach Multiplier` as a direct cap number.
- Do not change view counting to require clicks.
- Do not derive impressions from views.
- Do not change Published Ads `Reach` display away from counted views unless explicitly requested.
- Do not alter saved completed ad image sourcing away from the ad's own media without explicit approval.
