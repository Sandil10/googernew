# Boundary Regression Tests

## Purpose

This document records the Step 9 regression checks added for the microservice
readiness refactor.

## Current Checks

Run:

```bash
cd backend
npm run test:boundaries
```

The current regression script verifies:

- provider-aware media classification boundaries
- managed-media SQL predicate generation
- service contract uniqueness
- internal API contract uniqueness
- idempotency key extraction behavior
- idempotency request hashing stability

## Why This Matters

These checks protect the shared boundaries introduced during Steps 6 to 9 so the
codebase can keep moving toward deployable service splits without silently
breaking the contracts those splits depend on.
