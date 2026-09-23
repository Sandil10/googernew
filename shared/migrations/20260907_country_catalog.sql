CREATE TABLE IF NOT EXISTS country_catalog (
    code CHAR(2) PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    flag VARCHAR(16) NOT NULL DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS country_catalog_name_idx
    ON country_catalog (name);
