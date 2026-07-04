# Shared Infrastructure Boundaries

## Purpose

This document records the shared infrastructure/helpers that multiple backend modules
should reuse instead of re-implementing locally.

## Current Shared Helpers

### Optional user decoding

File:
[optionalUser.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/auth/optionalUser.js)

Used for:

- bearer token extraction
- optional JWT decoding
- optional user id lookup for public or mixed-auth endpoints

### UTC timestamp normalization

File:
[toUtcIso.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/time/toUtcIso.js)

Used for:

- marketplace interaction response timestamps
- feed/goog response timestamps

### Shared contracts

File:
[serviceContracts.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/contracts/serviceContracts.js)

Used for:

- service names
- share item type names
- reserved internal event names

## Step 3 Result

Step 3 establishes:

- shared helper ownership under `backend/src/shared`
- fewer duplicate token parsing utilities
- fewer duplicate timestamp formatting utilities
- one contract location for cross-module naming
