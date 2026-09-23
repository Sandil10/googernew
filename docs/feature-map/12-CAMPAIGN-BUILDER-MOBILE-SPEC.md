# 12 — Campaign Builder: Mobile Rebuild Spec

**Read this first if you are picking up the campaign-builder work.** It is a
complete brief. You do not need the user to re-explain anything or re-attach
screenshots — everything they showed has been transcribed below.

## 0. The job in one line

Rebuild the Flutter campaign editor so it matches the **web** campaign builder
(`googer.site`) section for section, keeping the existing dark background, and
wire it to the same backend.

## 1. Where the code is

| Thing | Path |
| --- | --- |
| **The file to rebuild** | `googer-flutter/lib/screens/widgets/campaign_editor.dart` (~29 KB, shared by all types) |
| Type entry points | `lib/screens/photo_video_ad_screen.dart`, `product_promote_screen.dart`, `profile_promote_screen.dart`, `flash_content_screen.dart`, `upload_content_screen.dart` — each is a thin wrapper passing flags to `CampaignEditor` |
| Type chooser | `lib/screens/ad_campaign_screen.dart` |
| Web reference | `googernew-main/app/dashboard/ad-campaign/**/page.tsx` |
| Rules + endpoints | `docs/feature-map/05-ADS-AND-CAMPAIGNS.md` |

Deploy: `cd googer-flutter; .\deploy.ps1` (~40 s, stamps a cache-buster, serves
on :8081 → `expo.googer.site`). Flutter SDK is at
`D:\googer-recovery-code\tools\flutter\bin\flutter.bat`; git for the toolchain is
at `D:\googer-recovery-code\tools\PortableGit-latest\cmd`.

**Do not edit source with PowerShell `Get-Content`/`Set-Content`.** It decodes
with the ANSI codepage and silently corrupts every non-ASCII character in the
file. Use the Edit tool. (A repair script exists at
`scratchpad/fixenc.ps1` if it happens.)

## 2. Status

| Section | State |
| --- | --- |
| Location / Select Countries | **Done** — use it as the styling + sheet reference |
| Everything else below | **Not started** — still the original Flutter design |

The user's complaint is precisely that one new card among a dozen old ones does
not read as "updated". The remaining sections need doing together.

## 3. Screen chrome

- Topbar carries horizontal **type tabs**: `PHOTO & VIDEO` · `PRODUCT PROMOTE` ·
  `PROFILE PROMOTE`, active one in a raised dark pill with its icon. Tabs scroll
  horizontally and are cut off at the right edge on a phone.
- Below: a circular back button, a small caps label **`AD BAR`**, then the page
  title in large bold — "Photo and Video", "Product Promote", "Profile Promote".

## 4. Sections, in order

### 4.1 Apply Link
- Heading **Apply Link**, sub-line "Add landing destination", link icon right.
- Input, placeholder `https://your-landing-page.com`.
- Full-width **white pill APPLY** button, black bold letter-spaced text.
- **Product Promote** differs: the input is a product search — placeholder
  `Search goog` — and the heading stays "Apply Link".
- **Profile Promote** differs: heading **Share Profile**, sub-line "Add your
  public profile link", value prefilled `https://googer.site/@<username>`, and
  below APPLY two outline buttons: **COPY LINK** and **USE MY PROFILE**.

### 4.2 Select Ad Media *(Photo & Video only)*
- Heading **Select Ad Media**, sub-line "Upload image or video", then the grey
  note "Video: upload directly up to 1 min, crop longer videos".
- **Upload Media** tile with image icon.
- Preview panel below with wide-tracked placeholder
  `SELECT IMAGE OR VIDEO TO PREVIEW`.

### 4.3 Description *(Photo & Video)*
- Heading **Description** with a right-aligned counter **`0/50`**.
- Textarea, placeholder "Write a short ad description...".

### 4.4 Call to Action *(Photo & Video)*
- Heading **Call to Action**, native-style select defaulting to **Visit**.
- Below it label **Website link**, input placeholder `https://example.com`.

### 4.5 Budget
- Heading **Budget**.
- Row: grey **`RUPIEER`** pill · large bold amount (default **300**) · the words
  "Total Budget" · a small square edit button.
- **`PROMO CODE`** input with a **red ADD** button attached to its right.
- Slider from **R300** to **R100,000**, min/max printed under the ends.
- Centred chip: **`Rupieer Balance: 9,453`**.
- **Profile Promote** replaces the slider with four fixed package chips —
  **R500 · R900 · R2,000 · R3,000** — and shows `—` as the total until one is
  chosen.

### 4.6 Duration
- Heading **Duration**, value **`1 day`** with a small caps **`FIXED`** beside it.
- Slider (disabled-looking when fixed).
- Grey note: "Ads usually complete within your selected time, but may finish
  sooner or take longer depending on audience reach."

### 4.7 Location — **already built**
Card with globe icon → sheet titled **`SELECT LOCATIONS`**, country search,
`All Countries` pinned first and mutually exclusive with individual picks,
checkbox rows, **`NOT AVAILABLE`** pill on disabled countries, **CANCEL** /
**DONE** footer. Allowed list comes from
`GET /admin/customization/ad-allowed-countries` — **the fetch is not wired yet**;
`_allowedCountries` is empty, which currently means "unrestricted".

### 4.8 Gender
Heading **Gender**, segmented control **ALL · MALE · FEMALE**, active in a
**pink/red** filled pill with a glow.

### 4.9 Age
Heading **Age** with the current range as a chip on the right (**`18 - 65`**).
Dual-thumb range slider, pink/red track with glowing round thumbs.

### 4.10 Interest Topics
Collapsed card: heading **Interest Topics**, sub-line **`0/10 selected`**,
circular chevron-down expander on the right.

### 4.11 Placements
Heading **Placements**, dropdown row with a grid icon showing **All**.

### 4.12 Actions
Side-by-side: **`✕ CANCEL`** (dark outline) and **`🚀 PUBLISH`** (coral/red
filled, glowing).

**Profile Promote** adds, above these, a yellow-bordered notice with a checkbox:
"Profile promotion packages are non-refundable once activated."

### 4.13 Ad Preview
- Heading **Ad Preview**, sub-line "Live device preview" (Profile Promote:
  "Profile promotion card").
- Toggle: **MOBILE** (white active) · **DESKTOP**.
- Panel labelled **`MOBILE PREVIEW`** containing a phone mock rendering the ad:
  `AD` / `SPONSORED` header, avatar + name + "Promoted", media area with a
  `LIVE AD` chip, skeleton lines, the description text, then a footer row
  "Media Ad / Add link to ..." with a white **VISIT** button.
- **Profile Promote** preview instead shows `PROFILE PREVIEW`: avatar, name,
  `@handle`, a white **SUBSCRIBE** button, a ⋮ menu, a 3-tile grid, and the note
  "Add products, flash contents, vault contents, or Googs to feature them here."

### 4.14 Order Summary
Panel headed **`ORDER SUMMARY`** with a **`LIVE`** pill top-right, then a 2-column
grid of label/value tiles:

| | |
| --- | --- |
| `TOTAL BUDGET` → "Rupieer 300" | `DURATION` → "1 day" |
| `AGE` → "All" | `GENDER` → "All" |
| `ESTIMATED REACH` → "900 – 1.5K people" (full width) | |

## 5. Type matrix

| Section | Photo & Video | Product Promote | Profile Promote |
| --- | --- | --- | --- |
| Apply Link | URL | product search | profile URL + COPY LINK / USE MY PROFILE |
| Select Ad Media | ✅ | ✕ | ✕ |
| Description | ✅ | ✕ | ✕ |
| Call to Action | ✅ | ✕ | ✕ |
| Budget | slider | slider | **fixed packages** |
| Duration · Location · Gender · Age · Interests · Placements | ✅ | ✅ | ✅ |
| Non-refundable checkbox | ✕ | ✕ | ✅ |
| Preview | device mock | device mock | profile card |

## 6. Backend

Create is `POST /ads`; edit `PUT /ads/:adId`. Reach config:
`GET /admin/customization/reach-settings/public` and `.../reach-tiers/public`.
Promo codes: `POST /promo-codes/validate` then `/redeem`. Spend and refunds go
through `POST /wallet/record-promo-ad` and `POST /wallet/refund-ad-budget-edit`;
Profile Promote bills via `POST /wallet/pay-profile-promote`.

**Reach-first vs duration-first matters** — Product Promote and Photo/Video end
when reach is met, not when days elapse; Profile Promote ignores the budget gate
entirely. See `05-ADS-AND-CAMPAIGNS.md` §1–3 before touching budget or duration
logic.

Client reach maths already exists on the web at `utils/reachCalc.ts` — port it
for the ESTIMATED REACH tile rather than inventing a formula.

## 7. Suggested order of work

1. Screen chrome (type tabs, AD BAR header) — makes the change visible immediately.
2. Budget, Duration, Gender, Age — the dense controls, and where the pink/red
   accent lives.
3. Interest Topics, Placements.
4. CANCEL / PUBLISH, plus the Profile Promote notice.
5. Ad Preview and Order Summary — largest, and safe to do last.
6. Wire `GET /admin/customization/ad-allowed-countries`, then confirm `POST /ads`
   carries country/gender/age/interest/placement targeting.

Deploy and verify after each step: check the served stamp matches the build, e.g.
`Invoke-WebRequest https://expo.googer.site/flutter_bootstrap.js` and grep for
`main.dart.js?v=`.
