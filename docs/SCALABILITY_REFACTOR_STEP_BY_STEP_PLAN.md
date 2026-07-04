# Scalability Refactor Step By Step Plan

## Purpose

This document is the working checklist for changing the current codebase into a scalable, microservice-ready architecture while development is still ongoing.

For current live progress counts, do not estimate from memory. Use:

- `docs/CURRENT_REFACTOR_PROGRESS_TRACKER.md`

The goal is not to rewrite the system immediately. The goal is to keep the current product working, preserve existing feature behavior, and gradually reshape the backend/frontend code so high-load modules can later be split into real microservices.

Target direction:

- 5,000+ concurrent users
- 10,000+ daily active users
- production-safe growth path
- minimal feature regression during refactor

## Current Architecture Name

The current system is a:

**Dockerized Modular Monolith With Separate Frontend, Backend, Admin, Worker, PostgreSQL, and Redis Containers**

This is a good foundation. The next architecture stage should be:

**Microservice-Ready Modular Monolith**

That means:

- keep one main backend for now
- create clean module boundaries inside the backend
- move heavy work into workers/queues
- remove local filesystem assumptions
- make every high-load area separable later

## Must-Read Reference Docs Before Any Refactor

Before changing a module, read the matching docs first and compare current behavior after the change.

### Main Feature And Architecture References

- `docs/FEATURES.md`
- `docs/SYSTEM_OVERVIEW.md`
- `docs/PROJECT_STRUCTURE.md`
- `docs/CORRECTED_CURRENT_ARCHITECTURE_OVERVIEW.md`
- `docs/ARCHITECTURE_DOCKER_SCALING_PLAN.md`
- `docs/PRODUCTION_HANDOVER.md`
- `docs/PRODUCTION_BUG_REPORT.md`

### Critical Money And Business Flow References

- `docs/CRITICAL_PROCESSES.md`
- `docs/wallet-sell-buy-flow.md`
- `docs/resell-commission-flow.md`
- `docs/Main googer balance.md`
- `docs/ad-coin-db-flow.md`
- `docs/AD_ENGINE_RULES.md`
- `docs/PRODUCT_PROMOTE_RULES.md`
- `docs/current-ad-logic-lock.md`
- `docs/feed-view-count-rule.md`
- `docs/ad-view-impression-counting-contract.md`

### Deep Mapping Docs From Admin Repo

These are currently in the admin repo:

- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_DATABASE_TABLE_BY_TABLE_MAPPING.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_WALLET_ORDER_SETTLEMENT_MAPPING.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_REMAINING_FEATURES_DEEP_DIVE.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_MINOR_FEATURES_AND_GAPS.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_RELIABILITY_SCALING_PLAN.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/MONITORING_AND_LOAD_TESTING.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/ORIGINAL_SENSITIVE_FLOW_COMPARISON.md`

When changing wallet/order/admin/reporting/database behavior, these docs should be copied or linked into the main repo before refactor work starts.

## Refactor Safety Rule

For every architecture step:

1. Read related docs first.
2. Write down the current behavior being preserved.
3. Make a small code change.
4. Run build/test/smoke checks.
5. Compare feature behavior with the docs.
6. Commit the change.
7. If behavior changes unexpectedly, revert that commit or restore from the documented flow.

Do not combine many modules in one commit.

## Step 1: Freeze Current Behavior With Documentation

Status: partially done.

Actions:

- Keep all existing flow docs in `docs/`.
- Move/copy important admin mapping docs into the main repo or create a cross-repo reference index.
- Add screenshots or short API examples for critical flows.
- Make sure every sensitive business flow has a current expected behavior document.

Required outputs:

- `docs/FEATURES.md` stays current.
- `docs/CRITICAL_PROCESSES.md` stays enforced.
- Wallet/order/ad/resell docs are used as behavior contracts.

Do not change code in this step unless only adding docs.

## Step 2: Create Backend Module Boundaries

Goal:

Make backend code easier to split later.

Target folder structure:

```text
backend/src/modules/auth
backend/src/modules/users
backend/src/modules/feed
backend/src/modules/media
backend/src/modules/chat
backend/src/modules/wallet
backend/src/modules/orders
backend/src/modules/marketplace
backend/src/modules/ads
backend/src/modules/notifications
backend/src/modules/admin
backend/src/modules/subscriptions
backend/src/modules/verification
```

Each module should eventually have:

```text
routes.js
controller.js
service.js
repository.js
validation.js
contracts.js
```

Important:

- Start with low-risk modules first.
- Do not start with wallet/order/ad settlement logic.
- Keep old route paths working.

Recommended first modules:

1. `media`
2. `notifications`
3. `verification`
4. `subscriptions`
5. `feed`
6. `chat`
7. `ads`
8. `marketplace`
9. `wallet`
10. `orders`

## Step 3: Move Business Logic Out Of Controllers

Goal:

Controllers should handle HTTP only.

Target flow:

```text
route -> controller -> service -> repository -> database
```

Controller responsibility:

- read request
- validate input
- call service
- return response

Service responsibility:

- business rules
- orchestration
- permissions
- transaction decisions

Repository responsibility:

- SQL queries
- database reads/writes
- row mapping

Refactor order:

1. Start with read-only endpoints.
2. Then simple create/update endpoints.
3. Only after tests/docs are ready, touch money/order/ad flows.

## Step 4: Centralize Database Access

Goal:

Make database queries easier to optimize and later move into separate services.

Actions:

- Add repository files per module.
- Keep SQL in repository layer.
- Add transaction helper usage for multi-step writes.
- Add clear naming for read queries vs write queries.
- Avoid random direct SQL in frontend-facing controllers.

Future-ready pattern:

```text
repository/read.js
repository/write.js
repository/transactions.js
```

This prepares for:

- read replicas
- query caching
- service-specific data access
- DB connection pool control

## Step 5: Make Backend Stateless

Goal:

Multiple backend containers should be able to run without sharing local memory or local files.

Actions:

- Keep auth token-based.
- Do not store sessions in process memory.
- Do not depend on local `public/uploads` for permanent media.
- Store temporary/realtime state in Redis.
- Store permanent records in PostgreSQL.
- Store media in Cloudinary/S3/R2.

Result:

Backend replicas can be added behind a load balancer later.

## Step 6: Move Media Uploads Into A Media Module

Goal:

Media should be the first microservice-ready area because it is heavy and mostly independent.

Actions:

- Create `backend/src/modules/media`.
- Move upload compression/provider logic there.
- All upload APIs must call media service functions.
- All uploaded URLs should come from Cloudinary/S3/R2 or a media abstraction.
- Avoid direct use of local upload paths from feature modules.

Target interface:

```js
mediaService.uploadImage(file, options)
mediaService.uploadVideo(file, options)
mediaService.createThumbnail(file, options)
mediaService.deleteAsset(assetId)
```

Later split option:

```text
media-service container
media-worker container
Cloudinary/S3/R2
```

## Step 7: Add Queue-Based Background Jobs

Goal:

Heavy tasks should not block API requests.

Recommended stack:

```text
Redis + BullMQ
```

Job types:

- video compression
- image thumbnail generation
- notification fanout
- email/SMS
- order auto-receive
- subscription renewal
- report generation
- cleanup jobs
- analytics aggregation

Target structure:

```text
backend/src/jobs/queues.js
backend/src/jobs/processors/mediaJobs.js
backend/src/jobs/processors/notificationJobs.js
backend/src/jobs/processors/orderJobs.js
backend/src/workers/backgroundWorker.js
```

This supports horizontal worker scaling later.

## Step 8: Add Redis For Realtime And Cache

Goal:

Prepare for multiple backend replicas.

Actions:

- Add Socket.IO Redis adapter.
- Store rate limit state in Redis.
- Cache public feed/product/ad reads where safe.
- Do not cache wallet/order balance reads unless rules are explicit.

Important:

Money and settlement flows must prioritize correctness over cache speed.

## Step 9: Add Idempotency To Sensitive Write APIs

Goal:

Prevent duplicate charges/orders/transfers from retries or double clicks.

Apply to:

- wallet transfers
- wallet requests
- order creation
- order receive/settlement
- ad billing
- withdrawal requests
- topups

Pattern:

```text
Idempotency-Key header
finance_idempotency_keys table
same key + same payload = same result
same key + different payload = reject
```

Some shared finance helpers already exist. Use them as the foundation.

## Step 10: Add API Versioning

Goal:

Prevent frontend/admin/mobile from breaking when APIs evolve.

Target:

```text
/api/v1/auth
/api/v1/feed
/api/v1/media
/api/v1/wallet
/api/v1/orders
```

Do this gradually:

- keep old routes
- add v1 aliases
- migrate frontend services one by one
- remove old routes only after stable release

## Step 11: Extract First Real Microservice

First recommended service:

```text
media-service
```

Why:

- high CPU/bandwidth
- easier boundary
- lower financial risk
- needed for scale

Media service responsibilities:

- uploads
- compression
- thumbnails
- CDN provider integration
- media metadata

Keep the main backend calling it through a service interface first. Later, replace the interface implementation with HTTP/internal API calls.

## Step 12: Extract Notification And Chat Services

Next services:

```text
notification-service
chat-service
```

Actions:

- move notification fanout into queue
- move chat socket handling behind Redis adapter
- keep message persistence in PostgreSQL first
- later split chat persistence if traffic requires it

## Step 13: Extract Feed Service

Goal:

Scale read-heavy feed traffic separately.

Actions:

- centralize feed query logic
- add indexes
- add caching where safe
- separate feed assembly from post write logic
- prepare feed-specific service API

Target:

```text
feed-service
Redis cache
PostgreSQL read replica later
```

## Step 14: Extract Wallet And Order Service Last

Goal:

Split the most sensitive domain only after tests, docs, and idempotency are strong.

Do not start here.

Required before split:

- current wallet/order docs are complete
- migrations are stable
- idempotency is implemented
- integration tests exist
- rollback plan exists
- manual smoke checklist exists

References:

- `docs/CRITICAL_PROCESSES.md`
- `docs/wallet-sell-buy-flow.md`
- `docs/resell-commission-flow.md`
- `docs/Main googer balance.md`
- `googeradminpanel/docs/workspace_artifacts/md-files/GOOGER_WALLET_ORDER_SETTLEMENT_MAPPING.md`

## Step 15: Production Infrastructure Target

For 5,000+ concurrent users, code architecture must pair with this infrastructure:

```text
Cloudflare / AWS ALB
        |
Frontend containers
        |
API gateway / backend replicas
        |
--------------------------------
media-service
notification-service
chat-service
feed-service
wallet-order-service
admin/reporting-service
--------------------------------
        |
Managed PostgreSQL
Redis / queue
Cloudinary/S3/R2 + CDN
Monitoring + backups
```

## Development Workflow For Each Refactor

Use this loop:

1. Select one module.
2. Read matching docs.
3. Create a small branch/commit.
4. Move code without changing behavior.
5. Run build.
6. Run smoke checks.
7. Compare behavior to docs.
8. Commit.
9. Deploy to Ubuntu Docker server.
10. Test again.

## Smoke Checks Per Area

### Auth

- register
- login
- profile fetch
- token-protected route

### Feed

- load feed
- create post
- like/comment/share
- public view

### Media

- upload image
- upload video
- thumbnail/preview
- public media URL

### Marketplace

- create product
- view product
- add to cart
- product share link

### Orders

- create order
- seller status update
- buyer receive
- cancel/refund where applicable

### Wallet

- balance read
- transfer
- request
- accept/reject
- transaction history

### Ads

- create campaign
- view impression/click
- ad coin reward
- billing/refund

### Chat

- conversation list
- send message
- receive message
- socket reconnect

### Admin

- admin login
- users list
- products list
- wallet/transaction views
- settings/customization save

## Rollback And Restore Plan

Use Git as the primary rollback system.

For every completed step:

- one focused commit
- clear commit message
- no mixed unrelated changes
- update docs if behavior intentionally changes

If a refactor breaks behavior:

```bash
git revert <commit>
docker compose --env-file .env.docker --profile local-db up -d --build
```

For database changes:

- use migration files
- keep SQL dump backups
- do not manually edit production schema without migration
- take backup before applying schema changes

For feature behavior:

- compare against docs in this folder
- restore the behavior described in the mapping docs
- update docs only if the user/client intentionally approves a behavior change

## Priority Order Summary

1. Documentation and mapping index
2. Backend module folder boundaries
3. Controller/service/repository separation
4. Centralized DB repositories
5. Stateless backend cleanup
6. Media module and object storage abstraction
7. Redis/BullMQ background jobs
8. Socket.IO Redis adapter
9. Idempotency for sensitive writes
10. API versioning
11. Media microservice
12. Notification/chat microservices
13. Feed service
14. Wallet/order service last
15. Load balancer, managed DB, CDN, monitoring, autoscaling

## Client-Friendly Summary

Because the project is still in development, the best scalability work is to reshape the code now before production. The current Dockerized modular monolith should become a microservice-ready modular monolith first. We will preserve all existing behavior using the current feature mapping documents, then gradually create module boundaries, service layers, repository layers, background queues, Redis realtime support, external media storage, and idempotent financial APIs. After those foundations are stable, high-load modules can be split into real microservices without rewriting the whole product.
