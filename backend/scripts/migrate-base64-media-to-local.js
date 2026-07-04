const pool = require('../src/config/database');
const { saveDataUrl } = require('../src/utils/localUpload');

const isDataUrl = (value) => typeof value === 'string' && value.startsWith('data:');

const safeJsonParse = (value, fallback = value) => {
    if (!value || typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
};

const migrateMediaValue = async (value, folder) => {
    if (isDataUrl(value)) return saveDataUrl(value, folder);
    return value;
};

const migrateVariants = async (rawVariants, folder) => {
    const variants = safeJsonParse(rawVariants, rawVariants);
    if (!Array.isArray(variants)) return { changed: false, value: rawVariants };

    let changed = false;
    const nextVariants = [];
    for (const variant of variants) {
        const next = { ...variant };
        for (const key of ['url', 'image_url', 'image', 'video_url']) {
            if (isDataUrl(next[key])) {
                next[key] = await saveDataUrl(next[key], folder);
                changed = true;
            }
        }
        nextVariants.push(next);
    }

    return { changed, value: changed ? JSON.stringify(nextVariants) : rawVariants };
};

const migrateGallery = async (rawGallery, folder) => {
    const gallery = safeJsonParse(rawGallery, rawGallery);
    if (!Array.isArray(gallery)) return { changed: false, value: rawGallery };

    let changed = false;
    const nextGallery = [];
    for (const item of gallery) {
        if (isDataUrl(item)) {
            nextGallery.push(await saveDataUrl(item, folder));
            changed = true;
            continue;
        }
        if (item && typeof item === 'object') {
            const next = { ...item };
            for (const key of ['url', 'image_url', 'image', 'src']) {
                if (isDataUrl(next[key])) {
                    next[key] = await saveDataUrl(next[key], folder);
                    changed = true;
                }
            }
            nextGallery.push(next);
            continue;
        }
        nextGallery.push(item);
    }

    return { changed, value: changed ? JSON.stringify(nextGallery) : rawGallery };
};

const migrateMarket = async () => {
    const result = await pool.query('SELECT id, image_url, variants FROM market');
    let count = 0;

    for (const row of result.rows) {
        let imageUrl = row.image_url;
        let changed = false;

        if (isDataUrl(imageUrl)) {
            imageUrl = await saveDataUrl(imageUrl, 'products');
            changed = true;
        }

        const variants = await migrateVariants(row.variants, 'products');
        if (variants.changed) changed = true;

        if (changed) {
            await pool.query(
                'UPDATE market SET image_url = $1, variants = $2 WHERE id = $3',
                [imageUrl, variants.value, row.id]
            );
            count += 1;
        }
    }

    return count;
};

const migrateAds = async () => {
    const result = await pool.query('SELECT ad_id, media_preview, media_gallery FROM ads');
    let count = 0;

    for (const row of result.rows) {
        let mediaPreview = row.media_preview;
        let changed = false;

        if (isDataUrl(mediaPreview)) {
            mediaPreview = await saveDataUrl(mediaPreview, 'ads');
            changed = true;
        }

        const gallery = await migrateGallery(row.media_gallery, 'ads');
        if (gallery.changed) changed = true;

        if (changed) {
            await pool.query(
                'UPDATE ads SET media_preview = $1, media_gallery = $2 WHERE ad_id = $3',
                [mediaPreview, gallery.value, row.ad_id]
            );
            count += 1;
        }
    }

    return count;
};

const migrateUsers = async () => {
    const result = await pool.query('SELECT id, profile_picture FROM users WHERE profile_picture LIKE $1', ['data:%']);
    let count = 0;

    for (const row of result.rows) {
        const profilePicture = await saveDataUrl(row.profile_picture, 'profiles');
        if (!profilePicture) continue;
        await pool.query('UPDATE users SET profile_picture = $1 WHERE id = $2', [profilePicture, row.id]);
        count += 1;
    }

    return count;
};

(async () => {
    try {
        const [marketCount, adsCount, usersCount] = await Promise.all([
            migrateMarket(),
            migrateAds(),
            migrateUsers(),
        ]);

        console.log(`Migrated market rows: ${marketCount}`);
        console.log(`Migrated ad rows: ${adsCount}`);
        console.log(`Migrated user profile rows: ${usersCount}`);
    } catch (error) {
        console.error('Base64 media migration failed:', error);
        process.exitCode = 1;
    } finally {
        await pool.end();
    }
})();
