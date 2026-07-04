# Media Storage Boundaries

## Purpose

This document records the Step 8 boundary that removes hardcoded local-upload
assumptions from active business logic.

## What Changed

- active backend media classification no longer assumes uploaded media must look
  like `/uploads/...`
- shared provider-aware media boundary added in
  `backend/src/modules/media/mediaAssetPolicy.js`
- ads save classification now uses the shared media boundary
- raw Photo and Video ad lifecycle SQL now uses the shared managed-media
  predicate instead of local-path-only checks

## Managed Media Rules

Managed media is now identified by a shared rule set:

- local relative upload paths such as `/uploads/...`
- provider-managed remote hosts such as Cloudinary
- optional CDN/object-storage hostnames from `MEDIA_MANAGED_HOSTS`
- optional managed URL prefixes from `MEDIA_MANAGED_URL_PREFIXES`

External link media is treated separately from uploaded/managed media.

## Why This Matters

This keeps feature modules independent from the storage backend choice.

That means we can move from local uploads to Cloudinary, S3, R2, or CDN-backed
delivery without rewriting the ad/business classification logic again.
