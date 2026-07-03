# Media Module Refactor Notes

## Purpose

The media module is the first step toward the future media microservice. It centralizes upload persistence behind a service interface while keeping existing upload behavior unchanged.

## Current Module Files

```text
backend/src/modules/media/index.js
backend/src/modules/media/mediaConfig.js
backend/src/modules/media/mediaService.js
backend/src/modules/media/mediaStorageService.js
backend/src/utils/localUpload.js
```

## Public Interface

New code should import from:

```js
const media = require('../modules/media');
```

Supported functions:

```js
media.uploadFile(file, { folder: 'profiles' })
media.uploadFiles(files, { folder: 'ads' })
media.uploadDataUrl(dataUrl, { folder: 'upload-content-thumbnails' })
media.getMediaStorageProvider()
media.getMediaStorageConfig()
```

Backward-compatible names remain available:

```js
media.saveUploadedFile(file, 'profiles')
media.saveUploadedFiles(files, 'ads')
media.saveDataUrl(dataUrl, 'upload-content-thumbnails')
```

The old import path still works:

```js
require('../utils/localUpload')
```

## Provider Behavior

Current providers:

- `local`
- `cloudinary`

Provider selection:

- if `FORCE_LOCAL_UPLOADS=true`, use local storage
- if Cloudinary credentials exist, use Cloudinary
- otherwise use local storage

Local storage root:

```text
UPLOADS_DIR or backend/public/uploads default
```

## Future Provider Path

Future providers can be added without changing controllers:

- S3
- Cloudflare R2
- dedicated media-service HTTP client

Add the provider behind `mediaService`/`mediaStorageService`, keep controller calls unchanged.

## Smoke Check

Run:

```bash
node backend/scripts/smoke-media-module.js
```

Expected output:

```text
media module smoke ok
```

## Refactor Rule

Do not change upload URL behavior unless intentionally approved.

Existing relative local URL behavior:

```text
/uploads/<folder>/<filename>
```

Cloudinary behavior:

```text
https://...
```

Any future storage change must preserve frontend compatibility or include a planned frontend migration.

