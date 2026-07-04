# Deployable Service Splits

## Purpose

This document records the Step 10 extraction that turns selected backend modules
into real deployable services.

## Extracted Services

### 1. Media Service

Files:

- `microservices/media-service/src/server.js`
- `docker/media-service.Dockerfile`

Responsibilities:

- internal upload API for single-file upload
- internal upload API for multi-file upload
- internal data-url persistence API
- reuse of the existing media module storage/compression logic

Main backend integration:

- `backend/src/modules/media/mediaService.js`
- `backend/src/modules/media/mediaHttpClient.js`

When `MEDIA_SERVICE_URL` is configured, the main backend calls the deployable
media service instead of writing media directly inside the main backend process.

### 2. Notification Service

Files:

- `microservices/notification-service/src/server.js`
- `microservices/notification-service/src/worker.js`
- `docker/notification-service.Dockerfile`

Responsibilities:

- internal notification fanout API
- dedicated notification queue worker
- notification persistence through the existing notification repository boundary

Main backend integration:

- `backend/src/modules/notifications/notificationService.js`
- `backend/src/modules/notifications/notificationHttpClient.js`
- `backend/src/jobs/queues.js`

When `NOTIFICATION_SERVICE_URL` is configured, the main backend delegates
notification creation/fanout to the deployable notification service.

## Queue Split

Notification fanout jobs now go to the `googer-notifications` queue instead of
the main queue, which allows the notification worker to scale separately.

## Docker Split

The compose stack now includes:

- `media-service`
- `notification-service`
- `notification-worker`

This makes the selected service boundaries deployable as separate containers
without changing user-facing routes.
