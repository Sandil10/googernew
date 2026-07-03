# Target Microservices Architecture For 1000+ Concurrent Users

## Purpose

This document defines the target architecture for scaling Googer toward:

- 1000+ concurrent users first
- 10,000+ daily active users
- future path toward 5000+ concurrent users

The current system should not be rewritten all at once. The correct path is to refactor the code into clean module boundaries first, then split high-load modules into microservices one by one.

## Current State

Current architecture:

```text
Dockerized Modular Monolith
```

Current containers:

```text
main-frontend
main-backend
main-worker
admin-app
postgres
redis
```

This is a good starting point, but not the final scale architecture.

## Final Target Architecture

Target architecture:

```text
Cloudflare / AWS ALB
        |
Frontend Web
Admin Web
        |
API Gateway / Edge Routing
        |
------------------------------------------------
Auth/User Service
Media Service
Feed Service
Marketplace Service
Order Service
Wallet/Finance Service
Chat Realtime Service
Notification Service
Ads Service
Subscription Service
Admin/Reporting Service
------------------------------------------------
        |
Managed PostgreSQL
Redis / Queue
Object Storage + CDN
Monitoring + Backups
```

## Service Split Plan

### 1. Auth/User Service

Responsibilities:

- registration
- login
- JWT/session validation
- user profile
- username availability
- profile status/suspension
- public profile identity

Why separate:

- every service needs user identity
- security boundary becomes clearer
- admin user controls become safer

Initial code boundary:

```text
backend/src/modules/auth
backend/src/modules/users
```

### 2. Media Service

Responsibilities:

- image upload
- video upload
- compression
- thumbnails
- CDN/object storage integration
- media metadata

Why separate first:

- high CPU/bandwidth
- easiest low-risk split
- removes local filesystem dependency

Target storage:

```text
Cloudinary or S3/R2 + CDN
```

Initial code boundary:

```text
backend/src/modules/media
backend/src/utils/localUpload.js -> media module
```

### 3. Feed Service

Responsibilities:

- feed listing
- post creation
- post comments
- likes
- shares
- views
- public feed reads

Why separate:

- feed is read-heavy
- caching helps a lot
- can scale independently from wallet/order

Initial code boundary:

```text
backend/src/modules/feed
backend/src/modules/googs
```

### 4. Marketplace Service

Responsibilities:

- products
- categories
- product comments
- product likes/views/shares
- promoted product display
- product public share links

Why separate:

- marketplace reads can be cached
- product catalog can scale separately
- order service can depend on product snapshots

Initial code boundary:

```text
backend/src/modules/marketplace
backend/src/modules/categories
```

### 5. Order Service

Responsibilities:

- cart checkout
- order creation
- order status
- receive/cancel flow
- seller fulfillment state
- order reports

Why separate:

- high business importance
- must be transactionally reliable
- needs clear integration with wallet service

Important:

Do not split this first. Orders are critical and should be split after documentation, tests, idempotency, and repository boundaries are stable.

Initial code boundary:

```text
backend/src/modules/orders
```

### 6. Wallet/Finance Service

Responsibilities:

- wallet balance
- transfers
- transfer requests
- holds
- refunds
- commission records
- withdrawals
- topups
- idempotency

Why separate:

- money logic needs the strongest boundary
- can scale with strict transaction controls
- should be isolated from feed/media traffic

Important:

Split wallet/finance after order boundaries are stable. This is the highest-risk service.

Initial code boundary:

```text
backend/src/modules/wallet
backend/src/modules/finance
shared/utils/finance*
```

### 7. Chat Realtime Service

Responsibilities:

- conversations
- direct messages
- Socket.IO connections
- presence
- call signaling
- reconnect handling

Why separate:

- realtime load behaves differently than REST API load
- needs Redis adapter for multiple replicas
- WebSocket traffic can scale separately

Initial code boundary:

```text
backend/src/modules/chat
backend/src/realtime/chatSocket.js
```

### 8. Notification Service

Responsibilities:

- notification records
- realtime notifications
- email/SMS hooks later
- fanout jobs
- admin alerts

Why separate:

- async workload
- can be queue-driven
- prevents notification spikes from slowing main APIs

Initial code boundary:

```text
backend/src/modules/notifications
backend/src/jobs/processors/notificationJobs.js
```

### 9. Ads Service

Responsibilities:

- ad campaigns
- ad impressions
- ad clicks
- reach billing
- ad coin rewards
- ad reporting
- profile/product/photo/video ads

Why separate:

- ad traffic can be high volume
- analytics writes can grow quickly
- billing must remain isolated and documented

Initial code boundary:

```text
backend/src/modules/ads
```

### 10. Subscription Service

Responsibilities:

- profile subscriptions
- content access subscriptions
- plan management
- renewal jobs
- expiry warnings

Why separate:

- scheduled renewal workload
- clean integration with wallet/order later

Initial code boundary:

```text
backend/src/modules/subscriptions
```

### 11. Admin/Reporting Service

Responsibilities:

- admin dashboard
- reports
- moderation
- user controls
- transaction views
- platform settings

Why separate:

- admin traffic should not slow user traffic
- reporting queries can be heavy
- security boundary is clearer

Initial code boundary:

```text
googeradminpanel
admin routes/controllers
```

## Recommended Split Order

Do not start with money/order logic.

Recommended order:

1. Media module/service
2. Notification queue/service
3. Chat realtime service preparation
4. Feed module/service
5. Marketplace module/service
6. Ads module/service
7. Subscription module/service
8. Auth/user service
9. Order service
10. Wallet/finance service
11. Admin/reporting service

## Code Architecture Required Before Splitting

Before a module becomes a microservice, it needs:

```text
routes
controller
service
repository
validation
contracts
tests/smoke checks
docs mapping
```

Required internal flow:

```text
HTTP route -> controller -> service -> repository -> database
```

No module should directly reach into another module's database logic. It should call a service interface.

## Database Strategy

Phase 1:

```text
one PostgreSQL database
separate schemas/tables by domain
repository layer per module
```

Phase 2:

```text
managed PostgreSQL
read replicas for feed/catalog/reporting
connection pool control
```

Phase 3:

```text
service-owned tables
events for cross-service updates
no direct cross-service writes
```

Do not split into many databases at the beginning. Start with one managed PostgreSQL and strong module boundaries.

## Event And Queue Strategy

Use Redis/BullMQ first.

Events/jobs:

- `media.uploaded`
- `media.compressed`
- `notification.created`
- `order.created`
- `order.received`
- `wallet.transfer.completed`
- `ad.view.recorded`
- `ad.reward.queued`
- `subscription.expiring`

Heavy jobs:

- video compression
- thumbnail generation
- notification fanout
- order auto-receive
- subscription renewal
- report generation
- analytics aggregation

## API Gateway Strategy

Start with Nginx/ALB routing:

```text
/api/auth -> auth/user
/api/media -> media
/api/feed -> feed
/api/market -> marketplace
/api/orders -> orders
/api/wallet -> wallet
/api/chat -> chat
/api/notifications -> notifications
/api/ads -> ads
/api/subscriptions -> subscriptions
```

During transition, the main backend can still serve all routes while routes are gradually moved.

## Scaling Target For 1000+ Concurrent Users

Minimum production architecture:

```text
2 frontend containers
3 backend/API containers
1-2 worker containers
managed PostgreSQL
Redis
CDN/object storage
Nginx/ALB
monitoring
backups
```

Expected capacity after this phase:

```text
1000+ concurrent users
10,000+ DAU
```

## Scaling Target For 5000+ Concurrent Users Later

Future architecture:

```text
multiple frontend replicas
multiple service replicas
managed PostgreSQL with read replicas
Redis cluster/managed Redis
separate media service
separate chat service
separate feed service
separate wallet/order service
CDN for all media
load balancer/autoscaling
observability stack
```

Expected capacity after this phase:

```text
5000+ concurrent users
50,000+ DAU possible with tuning
```

## What We Start With Now

Step 1:

```text
create module folders and service boundaries
```

Step 2:

```text
move media/upload logic into media module
```

Step 3:

```text
add queue structure for media/notifications/background jobs
```

Step 4:

```text
add Redis adapter for Socket.IO
```

Step 5:

```text
move feed code into service/repository structure
```

Only after these are stable should we touch wallet/order/ad settlement.

## Restore Point

Before this architecture refactor starts, both repositories are tagged:

```text
before-scalability-refactor-2026-06-22
```

Use this tag if we need to restore the exact pre-refactor state.

## Client-Friendly Summary

The final target is a microservice-ready architecture that can support 1000+ concurrent users and 10,000+ DAU first, with a path to 5000+ concurrent users later. We should not rewrite everything at once. The correct engineering path is to keep the current Dockerized modular monolith running, then create clean module boundaries, move heavy work into queues, externalize media storage, add Redis-backed realtime/cache support, and gradually split media, notifications, chat, feed, marketplace, ads, subscriptions, auth, orders, and wallet into services in that order.

