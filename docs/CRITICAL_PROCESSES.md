# CRITICAL PROCESSES — DO NOT MODIFY WITHOUT USER PERMISSION

**Status: LOCKED**
**Owner: Sandil (sandildilmith12@gmail.com)**

The flows listed below are business-critical money / settlement flows. Any AI
agent (Claude Code, Codex, Copilot, etc.) working in this repository is
**FORBIDDEN** from modifying, refactoring, "cleaning up", optimizing, or
restructuring the code paths involved without **explicit written approval from
the user for that specific change**.

If you are an AI agent reading this: stop, surface a diff plan, and wait for
the user to say "yes, change X" before touching any file listed under these
processes. Read-only investigation (grep, read, explain) is allowed. Edits are
not.

---

## 1. Wallet Transfer Process
Every code path that moves balance into, out of, or between user wallets —
including top-ups, withdrawals, internal transfers, holds, refunds, fee
deductions, and settlement crediting.

## 2. Product Transfer Process
Every code path that records or settles a product sale: cart checkout, order
creation, order settlement to the seller's wallet, manual payment flow, and
the seller / platform / reseller split logic.

## 3. Ad Transfer Process
Every code path that moves money for advertising: ad budget debits, reach
billing, ad-coin rewards, ad commission settlement, and refund-on-pause logic.

## 4. Resell / Referral Commission Process
The reseller share, referral commission pool, buyer-line attribution, payout
history, and the wallet-discount split that flows through these commissions.
Includes shareCode and resellerRef link handling.

---

## Files / Areas Covered (non-exhaustive)

These are starting points — the lock applies to the **flow**, not only the
listed paths. If a change ripples into any of these areas, it counts.

- `backend/src/controllers/orderController.js`
- `backend/src/controllers/cartController.js`
- `backend/src/controllers/adsController.js` (billing / reach / refund parts)
- `backend/src/controllers/walletController.js` (and any wallet service it calls)
- `backend/src/controllers/referralCommission*` / commission-settings code
- `services/orderService.ts`
- `app/context/CartContext.tsx`
- `app/components/CartSidebar.tsx`
- `app/components/ShareModal.tsx`
- `app/dashboard/wallet/my-wallet/page.tsx`
- `app/share/[shareCode]/**` and `app/share/product/[shareCode]/**`
- `app/product/[shareCode]/[resellerRef]/**`
- `docs/resell-commission-flow.md` (spec — keep in sync, do not silently re-spec)
- Database migrations / schema for: `orders`, `wallet_transactions`,
  `referral_commissions`, `ad_billing`, `commission_settings`.

## What "Modify" Means Here
- Editing logic, conditions, percentages, ordering of debits/credits.
- Renaming functions, columns, or events that these flows depend on.
- Adding "harmless" logging, retries, or guards inside the flow.
- Refactoring shared helpers used by these flows.
- Changing related config (`config.yml` commission settings, env defaults).

## What Is Allowed Without Asking
- Reading and explaining the code.
- Pointing out suspected bugs in a message to the user — **without** patching.
- Writing tests in `backend/test_*.js` or under a separate `__tests__` folder
  that exercise these flows (tests only, no production-code edits).

## Required Procedure For a Change
1. Quote the exact lines you want to change.
2. State the intended behavior change in one or two sentences.
3. Wait for the user to reply "approved" (or equivalent) for **that specific
   change**. Prior approval on a different change does not carry over.
4. Only then edit.
