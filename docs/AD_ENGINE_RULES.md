# Shared Ad Engine Rules

These rules exist to prevent:

- duplicated ad UI
- stale local ad state
- account-specific interaction bugs
- giant page-level ad logic
- bypassing the shared Ad Engine

All ad development must follow this document.

## Shared Ad Engine Source Of Truth

All ads must use the shared system below:

- `PromotedAdCard`
- `SharedProductCard`
- `SharedPhotoVideoAdCard`
- `SharedProfilePromoteAdCard`
- `SharedAdSecondViewModal`
- `useAdActions`
- `adStore`
- `normalizeAdData`
- `matchesAdIdentity`

If a new ad feature does not pass through these shared layers, it is considered an architecture violation.

## Forbidden Patterns

The following patterns are not allowed:

- No page-specific custom ad JSX
- No local ad like state
- No local coin eligibility logic
- No direct ad interaction logic outside `useAdActions`
- No duplicate sponsored modal systems
- No frontend N+1 product hydration
- No base64 media in feed payloads

### Forbidden Example

```tsx
const [liked, setLiked] = useState(false);

const handleLike = async () => {
  setLiked(true);
  await marketService.toggleLike(ad.id);
};
```

Reason:

- bypasses `adStore`
- bypasses `useAdActions`
- creates stale local state
- breaks parity across Home, Shop, Profile, and Share pages

### Required Direction

```tsx
const adActions = useAdActions(ad, { currentUser, viewerReady });
```

Use shared reactive store state and shared action handling only.

## Store Rules

`adStore` rules are strict:

- `adStore` state must be viewer/account scoped
- Never cache user-specific ad state globally by ad id only
- Reset/resync `adStore` on account switch

Viewer-specific fields include:

- `user_liked`
- `ad_coin_collected`
- `ad_like_locked`

These fields must never be treated as global ad state.

## UI Rules

UI parity rules:

- Product Promote must use exact normal product UI
- Profile Promote UI source of truth = Home feed
- Shared components only

### Product Promote

Must use the same product card experience as normal products.

Allowed difference:

- show `Ad` label

Not allowed:

- custom product promote layout for only one page
- separate product promote interaction system

### Profile Promote

Profile Promote design and behavior must match the Home feed shared implementation.

Not allowed:

- Shop-only redesign
- page-specific profile promote cards
- reintroducing like/comment/share controls where shared rules removed them

## Feed Rules

Feed rules:

- Home feed uses backend mixed feed endpoint
- Shop feed uses backend mixed feed endpoint
- Pagination required
- No double-loading ads

Additional requirements:

- do not group all ads together
- do not freeze ads in identical positions on every refresh
- do not duplicate the same ad too aggressively

## File Size Rules

No page/component should exceed:

- `500–700` lines max

When logic grows, split into:

- `hooks/`
- `utils/`
- `services/`
- shared components

Page files should orchestrate shared systems, not contain full ad engines inline.

## Performance Rules

Performance rules:

- Images/videos must use URLs
- No base64 feed payloads
- Use pagination + lazy loading

Additional guidance:

- backend feed payloads should stay lightweight
- media preview fields must not bloat feed responses
- product hydration should be batched, not fetched per card

## Before Any Ad Change

Checklist:

1. Does this bypass `adStore`?
2. Does this bypass `useAdActions`?
3. Is this duplicating shared UI?
4. Will this break Home/Shop/Profile parity?
5. Is this viewer/account scoped?

If any answer is `yes`, stop and redesign the change before merging.

## Architecture Goal

One shared reactive Ad Engine across:

- Home
- Shop
- Profile
- Share pages
- First view
- Second view

## Development Safety Notes

When adding or changing ad behavior:

- change shared logic first
- keep backend and frontend per-user rules aligned
- never patch only one feed unless placement is intentionally feed-specific
- verify Home, Shop, Profile, and Share parity after shared ad changes

## Summary Rule

There must be one shared Ad Engine, not multiple page-specific ad systems.

If behavior must differ, only the placement algorithm may be feed-specific.

Interaction logic, viewer state, modal behavior, and shared ad UI must remain centralized.
