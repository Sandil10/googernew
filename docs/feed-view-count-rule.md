# Feed View Count Rule

Home feed, Shop feed, chat ad feed, public profile promoted feed, and similar feed cards must treat the eye icon count as `views`.

Rules:

- Eye icon count must come from `views`, `views_count`, or `viewCount`.
- Eye icon count must not fall back to `impressions`.
- Scroll/impression logging must not overwrite `views_count` with `impressions`.
- Click tracking must not rewrite the view count.
- `impressions` can still be tracked separately for analytics and Ad Center reporting, but not shown under the eye icon in feeds.

Expected behavior:

- First render shows the real view count.
- Scrolling the feed must not suddenly change the eye count to impressions.
- Home, Shop, and every feed should keep the view count stable unless the backend returns a real new view count.
