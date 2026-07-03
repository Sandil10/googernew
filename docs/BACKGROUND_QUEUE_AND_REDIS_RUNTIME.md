# Background Queue And Redis Runtime

## Step 4

Background work is now organized through the backend job layer:

- queue types: [jobTypes.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/jobs/jobTypes.js)
- queue topology: [queueTopology.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/jobs/queueTopology.js)
- enqueue helpers: [queues.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/jobs/queues.js)
- worker runner: [backgroundWorkerRunner.js](C:/Users/Administrator/Documents/new/shared/utils/backgroundWorkerRunner.js)
- background worker entry: [backgroundWorker.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/workers/backgroundWorker.js)

Current supported background job domains:

- media compression
- notification fanout
- report generation
- ads maintenance sweep
- subscription renewal sweep

## Step 5

Redis runtime support now exists through:

- shared Redis runtime: [runtime.js](C:/Users/Administrator/Documents/new/googernew-main/backend/src/shared/redis/runtime.js)
- Socket.IO Redis adapter hookup in chat socket runtime
- Redis wake-up publishing for background queue enqueues
- Redis wake-up subscription inside the worker loop

## Current Runtime Behavior

- if Redis is available, queue producers publish a wake signal immediately
- if Redis is available, workers wake faster instead of only waiting for poll intervals
- if Redis is not available, the system falls back to the existing database-backed worker polling path

This keeps the current architecture safe for development while preparing distributed runtime behavior for scale.
