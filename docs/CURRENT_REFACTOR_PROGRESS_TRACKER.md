# Current Refactor Progress Tracker

## Purpose

This is the single source of truth for refactor progress tracking.

Use this document when answering:

- how many steps are done
- how many steps are left
- what current architecture name is
- what "microservice-ready" means in this repo

This tracker exists because progress can be counted in two different ways:

1. **Major steps**
   - domain-level or architecture-level checkpoints
   - example: "ads domain modularized"

2. **Sub-steps**
   - smaller safe slices inside one major step
   - example: "ads saved/analytics extracted"

Previous progress answers became inconsistent when those two levels were mixed. From now on:

- when asked **"how many steps left"**, answer with **major steps first**
- if helpful, also show the **sub-steps inside the current major step**

## Current Architecture Name

Current backend architecture is:

**Microservice-Ready Modular Monolith**

Meaning:

- still one main backend runtime
- not yet true deployed microservices
- major domains are now separated into explicit module boundaries
- controller/service/repository structure is established across the main backend areas
- routes now flow through domain modules instead of depending directly on large route-owned controller wiring

This is **not** yet final deployed microservices architecture.

## Counting Rule

### Major Step Definition

A major step is counted complete only when a meaningful backend domain or architecture area has been modularized enough that it can be tracked as a stable checkpoint.

Examples:

- auth module split
- ads module split
- marketplace read/report split
- feed module split

### Sub-Step Definition

A sub-step is a smaller extraction inside a major step.

Examples inside `ads`:

- saved ads + analytics
- read endpoints
- report endpoint
- active public feed
- create/update mutations

## Completed Major Steps

These are considered completed major refactor checkpoints already done in the repo:

1. Documentation foundation created
2. Media module boundary created
3. Notifications module boundary created
4. Verification module boundary created
5. Subscriptions module boundary created
6. Auth module boundary greatly improved
7. Chat/socket boundary created
8. Background job processor structure created
9. Feed partial module boundary created
10. Marketplace initial module boundary created
11. Ads major modularization completed
12. Marketplace deeper split completed
13. Feed deeper split completed
14. Cross-domain cleanup pass completed

## Completed Sub-Steps By Area

### Auth

- social subscriptions extracted
- account endpoints extracted
- public/profile read endpoints extracted

### Subscriptions

- plan and user subscription controller/service/repository split

### Feed

- home feed module split
- goog read endpoints split
- goog engagement metrics boundary split
- goog mutation boundary wired
- goog interaction boundary wired

### Marketplace

- category read endpoints split
- report endpoint split
- product/public read endpoints split
- mutation boundary wired
- interaction boundary wired
- unified share lookup boundary wired

### Ads

- saved ads + analytics split
- read endpoints split
- report endpoint split
- active public ads feed split
- create/update mutation split

### Chat

- chat module boundary
- socket service boundary
- optional Redis adapter structure

### Jobs

- processor files split from central handlers

## Current Remaining Major Steps

All currently planned major refactor steps in this tracker are completed.

## Exact Remaining Major Step Count

Current remaining **major step count**:

**0**

## Current Marketplace Sub-Step Count

Remaining marketplace sub-steps in this tracker:

**0**

## Current Feed Sub-Step Count

Remaining feed sub-steps in this tracker:

**0**

## Answer Template To Use Going Forward

When asked about progress, use this format:

### Progress

- Architecture now: `Microservice-Ready Modular Monolith`
- Remaining major steps: `0`
- Current major step in progress: `None`

### If More Detail Is Needed

- Marketplace sub-steps left: `0`
- Feed sub-steps left: `0`
- Final cleanup pass: `0`

## Important Rule

Do not change this count casually in chat.

Update this file first when:

- a major step becomes complete
- a new remaining major step is discovered
- a major step is split into named sub-steps

Then use the updated numbers from this file in future answers.
