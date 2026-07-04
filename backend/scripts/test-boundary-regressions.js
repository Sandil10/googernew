const assert = require('assert');

const runMediaBoundaryChecks = () => {
    process.env.MEDIA_MANAGED_HOSTS = 'cdn.googer.test';
    process.env.MEDIA_MANAGED_URL_PREFIXES = '/media/';

    const mediaPolicy = require('../src/modules/media/mediaAssetPolicy');

    assert.strictEqual(mediaPolicy.isManagedMediaUrl('/uploads/ads/file.jpg'), true);
    assert.strictEqual(mediaPolicy.isManagedMediaUrl('uploads/ads/file.jpg'), true);
    assert.strictEqual(mediaPolicy.isManagedMediaUrl('https://res.cloudinary.com/demo/image/upload/v1/file.jpg'), true);
    assert.strictEqual(mediaPolicy.isManagedMediaUrl('https://cdn.googer.test/media/file.jpg'), true);
    assert.strictEqual(mediaPolicy.isExternalMediaUrl('https://example.com/file.jpg'), true);
    assert.strictEqual(mediaPolicy.isExternalMediaUrl('/uploads/ads/file.jpg'), false);

    assert.deepStrictEqual(
        mediaPolicy.classifyAdMediaSource({
            activeLink: '',
            mediaPreview: '/uploads/ads/photo.jpg',
            mediaType: 'image/jpeg',
        }),
        {
            ad_media_type: 'photo',
            ad_source_type: 'upload',
            previewIsExternalUrl: false,
        }
    );

    assert.deepStrictEqual(
        mediaPolicy.classifyAdMediaSource({
            activeLink: '',
            mediaPreview: 'https://res.cloudinary.com/demo/video/upload/v1/file.mp4',
            mediaType: 'video/mp4',
        }),
        {
            ad_media_type: 'video',
            ad_source_type: 'upload',
            previewIsExternalUrl: false,
        }
    );

    assert.deepStrictEqual(
        mediaPolicy.classifyAdMediaSource({
            activeLink: 'https://merchant.example/item',
            mediaPreview: '',
            mediaType: 'image/jpeg',
        }),
        {
            ad_media_type: 'photo',
            ad_source_type: 'link',
            previewIsExternalUrl: false,
        }
    );

    assert.deepStrictEqual(
        mediaPolicy.classifyAdMediaSource({
            activeLink: '',
            mediaPreview: 'https://example.com/banner.jpg',
            mediaType: 'image/jpeg',
        }),
        {
            ad_media_type: 'photo',
            ad_source_type: 'link',
            previewIsExternalUrl: true,
        }
    );

    const sqlPredicate = mediaPolicy.buildManagedMediaSqlPredicate('a.media_preview');
    assert.match(sqlPredicate, /uploads/);
    assert.match(sqlPredicate, /cloudinary/);
    assert.ok(sqlPredicate.includes('cdn\\.googer\\.test'));
};

const runContractBoundaryChecks = () => {
    const { DOMAIN_EVENTS, SERVICE_NAMES } = require('../src/shared/contracts/serviceContracts');
    const { INTERNAL_API_OPERATIONS } = require('../src/shared/contracts/internalApiContracts');

    const serviceValues = Object.values(SERVICE_NAMES);
    assert.strictEqual(new Set(serviceValues).size, serviceValues.length);

    const domainEvents = Object.values(DOMAIN_EVENTS);
    assert.strictEqual(new Set(domainEvents).size, domainEvents.length);

    const internalOperations = Object.values(INTERNAL_API_OPERATIONS);
    assert.strictEqual(new Set(internalOperations).size, internalOperations.length);
};

const runIdempotencyChecks = () => {
    const idempotencyService = require('../src/shared/idempotency/idempotencyService');

    const createReq = (overrides = {}) => ({
        body: {},
        header: () => null,
        method: 'POST',
        params: {},
        query: {},
        ...overrides,
    });

    assert.strictEqual(
        idempotencyService.getIdempotencyKey(createReq({ header: (name) => (name === 'Idempotency-Key' ? ' abc-123 ' : null) })),
        'abc-123'
    );
    assert.strictEqual(
        idempotencyService.getIdempotencyKey(createReq({
            body: { idempotencyKey: ' body-key ' },
        })),
        'body-key'
    );

    const hashA = idempotencyService.buildRequestHash(createReq({
        body: { amount: 10 },
        params: { id: '1' },
        query: { dryRun: '0' },
    }));
    const hashB = idempotencyService.buildRequestHash(createReq({
        body: { amount: 10 },
        params: { id: '1' },
        query: { dryRun: '0' },
    }));
    const hashC = idempotencyService.buildRequestHash(createReq({
        body: { amount: 11 },
        params: { id: '1' },
        query: { dryRun: '0' },
    }));

    assert.strictEqual(hashA, hashB);
    assert.notStrictEqual(hashA, hashC);
};

const run = async () => {
    runMediaBoundaryChecks();
    runContractBoundaryChecks();
    runIdempotencyChecks();
    console.log('boundary regression checks ok');
};

run().catch((error) => {
    console.error(error);
    process.exit(1);
});
