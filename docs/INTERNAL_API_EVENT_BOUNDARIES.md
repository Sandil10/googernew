# Internal API And Event Boundaries

## Purpose

Step 7 defines explicit internal communication contracts so cross-module behavior is not hidden inside arbitrary imports.

## Shared Contracts

- event names: [serviceContracts.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/contracts/serviceContracts.js)
- internal API operation names: [internalApiContracts.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/contracts/internalApiContracts.js)

## Event Bus

- publisher/subscriber bus: [internalEventBus.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/events/internalEventBus.js)
- core handler registration: [coreInternalEventHandlers.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/events/coreInternalEventHandlers.js)

## Current Published Domain Events

- `subscription.purchased`
- `subscription.cancelled`
- `withdrawal.requested`
- `withdrawal.cancelled`

## Current Internal Event Routing

Current core handlers route selected domain events into background jobs:

- subscription purchase -> notification fanout queue
- withdrawal request -> reporting queue

This keeps internal communication explicit and queue-ready for later service splitting.
