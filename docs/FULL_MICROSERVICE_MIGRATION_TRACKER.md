# Full Microservice Migration Tracker

## Purpose

This is the canonical tracker for the remaining code-side work from the current
`Microservice-Ready Modular Monolith` to a fully split microservice architecture.

This tracker is intentionally locked to **10 main steps**.

Do not add extra top-level steps casually in chat. If a new task appears, it should
be classified under one of these 10 unless it truly represents a new migration phase.

## Fixed 10-Step Count

1. Remove remaining legacy-controller delegation inside modularized backend areas
2. Define service-to-service domain contracts
3. Extract stronger shared infrastructure and helper boundaries
4. Move heavy async workflows fully to queue/worker execution
5. Activate Redis-based distributed runtime paths
6. Add idempotency for sensitive write flows
7. Define internal API and event communication boundaries
8. Remove remaining local-storage assumptions from business logic
9. Add stronger integration, contract, and regression tests
10. Split selected modules into real deployable services

## Current Status

Current status by step:

1. Completed
2. Completed
3. Completed
4. Completed
5. Completed
6. Completed
7. Completed
8. Completed
9. Completed
10. Completed

## Step 1 Breakdown

Step 1 is completed at the module-boundary level.

Completed inside step 1 so far:

- `feed` read boundary extracted
- `feed` engagement boundary extracted
- `feed` route wiring moved through module controllers
- `marketplace` read boundary extracted
- `marketplace` route wiring moved through module controllers
- `goog` mutation create/update/delete now runs through module service + repository logic instead of legacy controller delegation
- `goog` interaction like/subscribe/report/comment/save flows now run through module service + repository logic instead of legacy controller delegation
- `marketplace` mutation status/delete paths now run through module service + repository logic instead of legacy controller delegation
- `marketplace` comment/share/view/list interaction flows for normal product items now run through module service + repository logic instead of legacy controller delegation
- `marketplace` normal product like toggle now runs through module service + repository logic while preserving the promoted-product coin lock rule
- `marketplace` create/update item flows now run through module service + repository logic instead of legacy controller delegation
- `marketplace` unified share lookup now runs through module service logic instead of legacy controller delegation
- `chat` socket runtime now uses module runtime service instead of direct controller wiring inside socket handling
- `auth` and `users` module entrypoints no longer import the legacy auth controller directly
- `ads` module repositories now use module runtime helpers for ads schema/reach-cap runtime concerns instead of direct controller imports

Marketplace interaction note:

- ad-specific interaction flows still delegate intentionally in this step so sponsored behavior stays unchanged while normal marketplace behavior is extracted first.
- `interactionService` still contains intentional legacy delegation for sponsored ad like/comment/share/view/reward paths.

Step 1 completion note:

- legacy business logic still exists in some older controller files, but the active modularized backend boundaries no longer depend on those controller files directly for the previously tracked Step 1 hotspots
- dedicated module bridge/runtime files now isolate the remaining legacy internals behind module boundaries where a deeper service rewrite would be higher risk than this migration step requires

## Step 2 Breakdown

Completed inside step 2:

- shared service names defined in `backend/src/shared/contracts/serviceContracts.js`
- shared share-item contract types defined in `backend/src/shared/contracts/serviceContracts.js`
- reserved internal domain event names defined in `backend/src/shared/contracts/serviceContracts.js`
- service contract document added in `docs/SERVICE_DOMAIN_CONTRACTS.md`

## Step 3 Breakdown

Completed inside step 3:

- shared optional auth decoding helper added in `backend/src/shared/auth/optionalUser.js`
- shared UTC timestamp helper added in `backend/src/shared/time/toUtcIso.js`
- `feed/googReadService` now uses shared auth/time helpers
- `marketplace/interactionService` now uses shared auth/time helpers
- shared helper boundary document added in `docs/SHARED_INFRASTRUCTURE_BOUNDARIES.md`

## Step 4 Breakdown

Completed inside step 4:

- background queue topology documented in `backend/src/jobs/queueTopology.js`
- queue types expanded in `backend/src/jobs/jobTypes.js`
- existing worker/queue system confirmed and documented in `docs/BACKGROUND_QUEUE_AND_REDIS_RUNTIME.md`
- queue processing remains behavior-preserving and ready for dedicated worker-service splitting

## Step 5 Breakdown

Completed inside step 5:

- shared Redis runtime added in `backend/src/shared/redis/runtime.js`
- Socket.IO Redis adapter now uses shared Redis runtime
- background queue enqueue path now publishes Redis wake signals
- background worker loop now subscribes to Redis wake signals and falls back to polling when Redis is absent

## Step 6 Breakdown

Completed inside step 6:

- shared idempotency storage added in `backend/src/shared/idempotency/idempotencyRepository.js`
- shared idempotency service added in `backend/src/shared/idempotency/idempotencyService.js`
- shared idempotency middleware added in `backend/src/shared/idempotency/idempotencyMiddleware.js`
- wallet-sensitive POST routes now support idempotent replay protection
- withdrawal request, cancel, and admin review routes now support idempotent replay protection
- subscription subscribe/cancel/auto-renew routes now support idempotent replay protection
- coverage document added in `docs/IDEMPOTENT_WRITE_BOUNDARIES.md`

## Step 7 Breakdown

Completed inside step 7:

- shared internal API operation names added in `backend/src/shared/contracts/internalApiContracts.js`
- shared internal event bus added in `backend/src/shared/events/internalEventBus.js`
- core internal event handlers added in `backend/src/shared/events/coreInternalEventHandlers.js`
- subscription and withdrawal flows now publish explicit domain events
- selected domain events now route into background queues through explicit handlers
- internal communication boundary document added in `docs/INTERNAL_API_EVENT_BOUNDARIES.md`

## Step 8 Breakdown

Completed inside step 8:

- shared provider-aware media policy added in `backend/src/modules/media/mediaAssetPolicy.js`
- ads media classification no longer depends only on `/uploads` path assumptions
- raw uploaded-ad SQL lifecycle checks now use shared managed-media predicates
- media storage boundary document added in `docs/MEDIA_STORAGE_BOUNDARIES.md`

## Step 9 Breakdown

Completed inside step 9:

- boundary regression script added in `backend/scripts/test-boundary-regressions.js`
- backend regression command added as `npm run test:boundaries`
- regression coverage added for media boundaries, service contracts, internal API contracts, and idempotency helpers
- regression-test document added in `docs/BOUNDARY_REGRESSION_TESTS.md`

## Step 10 Breakdown

Completed inside step 10:

- deployable `media-service` extracted in `microservices/media-service`
- deployable `notification-service` extracted in `microservices/notification-service`
- main backend media uploads can now delegate through `MEDIA_SERVICE_URL`
- main backend notification creation/fanout can now delegate through `NOTIFICATION_SERVICE_URL`
- notification fanout jobs now run on a dedicated `googer-notifications` queue
- Docker service split added for media and notification runtimes
- extraction document added in `docs/DEPLOYABLE_SERVICE_SPLITS.md`

## Rule For Migration Work

- no intentional feature removal
- no intentional UI change
- no intentional route contract change unless explicitly planned and documented
- behavior-preserving extraction first
- verify after every change

## Current Progress Summary

- Remaining fixed main steps: **0**
- Active step: **Completed**
- Current architecture: **Hybrid Modular Monolith With Extracted Services**
- End goal: **Fully split microservice architecture without feature loss**
