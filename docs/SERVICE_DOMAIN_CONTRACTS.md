# Service Domain Contracts

## Purpose

This document defines the current internal domain contracts for the modular-monolith
backend so each module can later move to a separate service without changing feature behavior.

## Current Service Names

- `auth`
- `users`
- `feed`
- `marketplace`
- `ads`
- `chat`
- `notifications`
- `subscriptions`
- `verification`

These names are currently stored in [serviceContracts.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/contracts/serviceContracts.js).

## Shared Content Contract

Share lookup now returns one of these stable content types:

- `profile`
- `product`
- `goog`
- `ad`

This contract is used in marketplace share lookup so clients can branch on `type`
without needing route-specific parsing.

## Domain Events Reserved For Split Services

- `marketplace.item.created`
- `marketplace.item.updated`
- `marketplace.item.review_required`
- `chat.message.created`
- `user.profile.updated`

These are declared now so later queue/event work can reuse stable names.

## Step 2 Result

Step 2 establishes:

- stable service names
- stable share content types
- stable reserved event names
- a single contract source for future microservice extraction
