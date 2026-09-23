# Home Feed Contract

Status: Step 2 documented from the current backend feed controller and current Flutter home feed.

## Canonical endpoint

`GET /api/feed/home` - Public, with optional Bearer authentication.

Query parameters:

| Field | Rule |
|---|---|
| `limit` | Optional integer; default `20`, maximum `50` |
| `offset` | Optional non-negative integer; default `0` |

An invalid or expired optional token is currently treated as anonymous rather than failing the request.

Success `200`:

```json
{
  "success": true,
  "items": [
    { "type": "write", "post": {} },
    { "type": "ad", "ad": {} },
    {
      "type": "profilePromoteCarousel",
      "id": "value",
      "ads": []
    }
  ],
  "posts": [],
  "ads": [],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "nextOffset": 20,
    "hasMore": true
  }
}
```

Failure `500`:

```json
{
  "success": false,
  "message": "Server error fetching home feed"
}
```

Anonymous responses may include `X-Home-Feed-Cache: HIT|WAIT|STALE|MISS`.

## Feed item models

The client must switch on `items[].type`; unknown types must be ignored safely and logged, not crash the feed.

### Write item

Verified normalized post fields:

```json
{
  "id": "value",
  "share_code": "value",
  "shareCode": "value",
  "text": "value",
  "textColor": "value",
  "createdAt": "timestamp",
  "created_at": "timestamp",
  "updatedAt": "timestamp",
  "updated_at": "timestamp",
  "likes": 0,
  "comments": 0,
  "views": 0,
  "reposts": 0,
  "shares": 0,
  "liked": false,
  "user": {
    "id": "value",
    "username": "value",
    "name": "value",
    "img": "value-or-null"
  }
}
```

Both snake_case and camelCase aliases are currently returned for selected fields. The Flutter model should accept both during migration but expose one canonical Dart property.

### Ad item

`{ "type": "ad", "ad": { ... } }` contains the active ad payload. Product-promotion ads may include hydrated product, media, advertiser, and seller fields. The exact discriminated ad DTO is **Envelope pending**; capture fixtures for each ad type before replacing dynamic parsing.

### Profile promotion carousel

`{ "type": "profilePromoteCarousel", "id": "value", "ads": [ ... ] }` is a horizontal profile-promotion unit. Empty carousel data should be omitted from rendering without leaving vertical space.

## Ordering and pagination

- The backend is authoritative for the order of `items`.
- Standard ads are inserted approximately every four organic posts.
- A profile-promotion carousel is inserted near feed positions two through four when eligible.
- Flutter must not reshuffle a canonical `/feed/home` page.
- Append the next page using `pagination.nextOffset`; stop when `hasMore=false`.
- De-duplicate by feed item identity when refresh and pagination overlap.
- Pull-to-refresh resets offset to zero and replaces the list only after a successful response.

## Permissions and personalization

- Anonymous users may load the feed.
- A valid Bearer token enables user-specific state such as `liked` and personalized ad selection.
- Invalid optional authentication currently falls back to anonymous behavior.
- Blocked/hidden/subscription filters must be applied consistently with the web app. The final ownership of these filters, server versus client, must be fixed during Step 3 so pagination counts remain valid.

## Required Flutter UI states

| State | Required behavior |
|---|---|
| Initial loading | Full feed loading indicator or skeleton; no false empty message. |
| Populated | Render backend `items` in order using the correct card/carousel type. |
| Empty | Show the genuine no-content state only after a successful empty response. |
| Refreshing | Keep existing content visible while refresh runs; replace on success. |
| Refresh failed | Keep existing content and show a retryable non-blocking error. |
| Initial transport/API error | Show an error and explicit retry, not the empty-feed state. |
| Offline | Preserve cached/previous content where available and show offline status. |
| Paginating | Show a footer loader and prevent duplicate requests. |
| Pagination failed | Keep loaded items and expose footer retry. |
| End reached | Stop requests when `hasMore=false`; do not show an endless spinner. |
| Unauthorized personalization | Continue anonymously where allowed and reconcile auth state separately. |
| Unknown item type | Skip safely and record diagnostics. |
| Filtering/search | Show active filters, filtered results, filtered-empty state, and a clear action. |

## Current Flutter implementation drift

Flutter currently loads three endpoints in parallel and mixes them locally:

| Endpoint | Current purpose |
|---|---|
| `GET /api/googs` | Organic Googs |
| `GET /api/upload-content/public` | Public uploaded content |
| `GET /api/ads/active-public` | Public ads |

`/api/ads/active-public` supports `limit`, `offset`, `shuffle`, and `user_id`, and returns:

```json
{
  "success": true,
  "ads": [],
  "pagination": {
    "limit": 20,
    "offset": 0,
    "nextOffset": 20,
    "hasMore": true
  }
}
```

Current Flutter then stable-shuffles organic content, inserts ads after the first organic item and every fourth item, and inserts profile carousels after three organic items and then every eight. This does not match the canonical backend `/api/feed/home` ordering.

Critical error-state drift: the central `Api.feed`, `Api.uploadContents`, and `Api.activeAds` methods catch failures and return empty lists. Consequently, network errors, HTML proxy responses, and backend `500` responses usually appear as `No live feed content yet`; the screen's retry/error branch is effectively unreachable.

Required correction in Steps 4-6:

- Add typed `HomeFeedResponse`, pagination, and discriminated item models.
- Use `/api/feed/home` as the canonical feed service unless the backend contract is intentionally changed.
- Return typed API failures instead of converting failures to empty lists.
- Treat non-JSON responses as gateway/service errors and retain status/content-type diagnostics.
- Keep empty, offline, unauthorized, server error, refresh error, and pagination error as distinct states.

## Contract fixtures and tests

Add sanitized fixtures for:

- Anonymous populated response.
- Authenticated response with `liked=true` and personalized ads.
- Empty response with `hasMore=false`.
- Write, standard ad, product ad, and profile carousel items.
- Unknown future item type.
- First page and overlapping next page.
- `500` JSON error, non-JSON gateway response, timeout, and offline transport error.

Regression tests must verify backend order is preserved, pagination de-duplicates correctly, failed refresh retains existing content, and a failed initial request never renders the empty state.

