# Product Promote Rules

Product Promote is a real market product with ad overlay state.

## Contract

- Backend resolves the original market product.
- Frontend renders the resolved product only.
- Ad fields overlay on top of the real product.

## Allowed overlay fields

- `adId`
- `ad_id`
- `campaign_type`
- `is_sponsored`
- `likes_count`
- `views_count`
- `comments_count`
- `shares_count`
- `ad_coin_collected`

## Forbidden

Frontend must never convert Product Promote ad shell into fake product.
If backend cannot resolve original product, skip the Product Promote ad and log warning.

Frontend must never invent:

- product id
- product code
- price
- promo price
- variants
- sizes

## Required product fields

Every Product Promote payload must include the real market product fields:

- `id`
- `share_code`
- `title`
- `description`
- `images`
- `variants`
- `sizes`
- `stock`
- `shipping_info`
- `price`
- `promo_price`
- `product_price`
- `main_price`

## Notes

- Keep `adStore` unchanged.
- Keep `useAdActions` unchanged.
- Keep shared product card and product second-view modal unchanged.
- Product Promote second view must always use the normal product second view modal.
