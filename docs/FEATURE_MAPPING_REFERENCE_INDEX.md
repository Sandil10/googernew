# Feature Mapping Reference Index

Use this index before changing code. It tells you which document protects each feature area.

## Global References

- Current feature list: `docs/FEATURES.md`
- System overview: `docs/SYSTEM_OVERVIEW.md`
- Project structure: `docs/PROJECT_STRUCTURE.md`
- Current architecture: `docs/CORRECTED_CURRENT_ARCHITECTURE_OVERVIEW.md`
- Docker/scaling plan: `docs/ARCHITECTURE_DOCKER_SCALING_PLAN.md`
- Refactor plan: `docs/SCALABILITY_REFACTOR_STEP_BY_STEP_PLAN.md`

## Critical Locked Flows

Read first:

- `docs/CRITICAL_PROCESSES.md`

This protects:

- wallet transfers
- product/order settlement
- ad billing/rewards
- resell/referral commissions

Do not refactor these flows without explicit approval for the exact change.

## Wallet

References:

- `docs/wallet-sell-buy-flow.md`
- `docs/Main googer balance.md`
- `docs/CRITICAL_PROCESSES.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_WALLET_ORDER_SETTLEMENT_MAPPING.md`

Code areas:

- `backend/src/controllers/walletController.js`
- `shared/utils/financeCommands.js`
- `shared/utils/financeBoundary.js`
- `services/walletService.ts`
- `app/dashboard/wallet/**`

## Orders And Settlement

References:

- `docs/resell-commission-flow.md`
- `docs/wallet-sell-buy-flow.md`
- `docs/CRITICAL_PROCESSES.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_WALLET_ORDER_SETTLEMENT_MAPPING.md`

Code areas:

- `backend/src/controllers/orderController.js`
- `shared/utils/orderSettlementHelpers.js`
- `shared/utils/orderRefundHelpers.js`
- `shared/utils/orderTransferHelpers.js`
- `services/orderService.ts`
- `app/components/CartSidebar.tsx`

## Ads

References:

- `docs/AD_ENGINE_RULES.md`
- `docs/ad-coin-db-flow.md`
- `docs/current-ad-logic-lock.md`
- `docs/ad-view-impression-counting-contract.md`
- `docs/PRODUCT_PROMOTE_RULES.md`

Code areas:

- `backend/src/controllers/adsController.js`
- `backend/src/utils/adDelivery.js`
- `app/components/ads/**`
- `services/adsService.ts`

## Feed And Social Posts

References:

- `docs/feed-view-count-rule.md`
- `docs/FEATURES.md`
- `docs/SYSTEM_OVERVIEW.md`

Code areas:

- `backend/src/controllers/feedController.js`
- `backend/src/controllers/googController.js`
- `app/components/googs/**`
- `services/googService.ts`

## Marketplace And Products

References:

- `docs/PRODUCT_PROMOTE_RULES.md`
- `docs/FEATURES.md`
- `docs/SYSTEM_OVERVIEW.md`

Code areas:

- `backend/src/controllers/marketController.js`
- `backend/src/routes/market.js`
- `app/components/market/**`
- `services/marketService.ts`

## Media And Upload Content

References:

- `docs/SCALABILITY_REFACTOR_STEP_BY_STEP_PLAN.md`
- `docs/ARCHITECTURE_DOCKER_SCALING_PLAN.md`
- `docs/FEATURES.md`

Code areas:

- `backend/src/utils/localUpload.js`
- `backend/src/controllers/uploadContentController.js`
- `backend/src/routes/uploadContent.js`
- `app/components/UploadContentMedia.tsx`
- `app/components/UploadContentWatchModal.tsx`
- `services/uploadContentService.ts`

## Chat And Realtime

References:

- `docs/FEATURES.md`
- `docs/ARCHITECTURE_DOCKER_SCALING_PLAN.md`
- `docs/SCALABILITY_REFACTOR_STEP_BY_STEP_PLAN.md`

Code areas:

- `backend/src/realtime/chatSocket.js`
- `backend/src/controllers/chatController.js`
- `backend/src/routes/chat.js`
- `app/dashboard/chats/**`
- `services/chatService.ts`

## Admin

References:

- `docs/CORRECTED_CURRENT_ARCHITECTURE_OVERVIEW.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_DATABASE_TABLE_BY_TABLE_MAPPING.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_REMAINING_FEATURES_DEEP_DIVE.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_MINOR_FEATURES_AND_GAPS.md`

Code areas:

- `googeradminpanel/app/admin/**`
- `googeradminpanel/controllers/**`
- `googeradminpanel/routes/**`

## Database

References:

- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_DATABASE_TABLE_BY_TABLE_MAPPING.md`
- `docs/PRODUCTION_HANDOVER.md`
- `docs/ARCHITECTURE_DOCKER_SCALING_PLAN.md`

Code areas:

- `database/**`
- `shared/migrations/**`
- `backend/scripts/run-migrations.js`
- `backend/src/config/database.js`
- `googeradminpanel/config/database.js`

## Reliability And Load Testing

References:

- `googeradminpanel/docs/workspace_artifacts/md-files/MONITORING_AND_LOAD_TESTING.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_RELIABILITY_SCALING_PLAN.md`
- `docs/ARCHITECTURE_DOCKER_SCALING_PLAN.md`

Code areas:

- `shared/scripts/load-test.js`
- `shared/load-test-scenarios/**`
- `backend/src/server.js`
- `backend/src/workers/backgroundWorker.js`

## Refactor Checklist

Before editing:

1. Identify the feature area.
2. Read the docs listed in this index.
3. Note the behavior that must not change.
4. Make a small code change.
5. Build and test.
6. Compare behavior to docs.
7. Commit separately.

If behavior changes unintentionally, restore the behavior from the mapped docs before moving on.

