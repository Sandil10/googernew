CREATE TABLE IF NOT EXISTS referral_commission_settings (
    setting_key VARCHAR(80) PRIMARY KEY,
    setting_value NUMERIC(8,2) NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE referral_commission_settings
    ADD COLUMN IF NOT EXISTS setting_key VARCHAR(80);

ALTER TABLE referral_commission_settings
    ADD COLUMN IF NOT EXISTS setting_value NUMERIC(8,2) DEFAULT 0;

ALTER TABLE referral_commission_settings
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP;

DELETE FROM referral_commission_settings
WHERE ctid IN (
    SELECT row_ctid
    FROM (
        SELECT
            ctid AS row_ctid,
            ROW_NUMBER() OVER (
                PARTITION BY setting_key
                ORDER BY updated_at DESC NULLS LAST, ctid DESC
            ) AS row_num
        FROM referral_commission_settings
        WHERE setting_key IS NOT NULL
    ) ranked
    WHERE ranked.row_num > 1
);

UPDATE referral_commission_settings
SET setting_key = 'legacy_' || substr(md5(ctid::text), 1, 12)
WHERE setting_key IS NULL;

UPDATE referral_commission_settings
SET setting_value = COALESCE(setting_value, 0)
WHERE setting_value IS NULL;

ALTER TABLE referral_commission_settings
    ALTER COLUMN setting_key SET NOT NULL;

ALTER TABLE referral_commission_settings
    ALTER COLUMN setting_value SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'referral_commission_settings'::regclass
          AND contype IN ('p', 'u')
          AND conkey = ARRAY[
              (SELECT attnum FROM pg_attribute WHERE attrelid = 'referral_commission_settings'::regclass AND attname = 'setting_key' AND NOT attisdropped)
          ]
    ) THEN
        ALTER TABLE referral_commission_settings
            ADD CONSTRAINT referral_commission_settings_setting_key_key UNIQUE (setting_key);
    END IF;
END $$;
