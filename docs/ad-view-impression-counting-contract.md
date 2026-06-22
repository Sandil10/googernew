# Ad View and Impression Counting Contract

This file is a product and engineering guardrail. Do not change these rules unless the ad counting implementation, dashboard display, and feed behavior are updated together.

## Supported Ad Categories

The platform supports these ad categories for this counting flow:

- Photo & Video Ads
- Product Promotion Ads

The rules apply anywhere these ads are displayed:

- Home Feed
- Shop Feed
- Chat Page
- Shared ad/product pages when they render the sponsored ad

## Views

A view is counted when a user sees the same ad for the first time in a 24-hour window.

- Count at most once per viewer per ad per 24 hours.
- If the same viewer sees the same ad again before 24 hours pass, do not increment views.
- If the same viewer sees the same ad after 24 hours, increment views again.
- This rule applies equally to Photo & Video Ads and Product Promotion Ads.
- Sponsored ads must use the canonical engagement id format `ad-<ad_id>` when calling the view endpoint.

The backend source of truth is `POST /market/:id/view` with an `ad-<ad_id>` id. Frontend code must use the returned `views_count`/`viewCount` total instead of guessing or incrementing locally.

## Impressions

An impression is counted every time an ad is displayed to a user.

- Count every display.
- Do not apply the 24-hour view restriction.
- Refreshing or seeing the ad again increments impressions again.
- Count impressions separately from views.
- This rule applies equally to Photo & Video Ads and Product Promotion Ads.

The backend source of truth is `POST /market/:id/impression` with an `ad-<ad_id>` id. Frontend code must use the returned `impressions` total instead of deriving impressions from views.

## Display Rules

Home Feed and Shop Feed must show the view icon and total views under Photo & Video Ads and Product Promotion Ads.

Publisher dashboards must show both:

- Total Views
- Total Impressions

## Implementation Notes

- `ad_views` stores counted views. Multiple rows for the same viewer and ad are allowed only when the next counted view is at least 24 hours after the previous counted view.
- `ads.impressions` stores total ad displays and is updated by the impression endpoint.
- Do not replace impressions with `ad_views` counts.
- Do not increment sponsored ad views optimistically on the frontend unless the backend response confirms the authoritative total.
