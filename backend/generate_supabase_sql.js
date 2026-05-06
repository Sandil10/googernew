const pool = require('./src/config/database');
const fs = require('fs');

async function generateSchema() {
    try {
        console.log('🔍 Fetching all table schemas...');
        
        // List all non-system tables
        const tablesRes = await pool.query(`
            SELECT table_name 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        `);
        
        let fullSql = `-- =====================================================
-- COMPLETE GOOGER DATABASE SCHEMA FOR SUPABASE
-- Generated: ${new Date().toISOString()}
-- =====================================================

-- Enable necessary extensions
-- CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

`;

        for (const row of tablesRes.rows) {
            const tableName = row.table_name;
            console.log(`📋 Processing table: ${tableName}`);
            
            // Get columns for this table
            const colsRes = await pool.query(`
                SELECT 
                    column_name, 
                    data_type, 
                    is_nullable, 
                    column_default,
                    character_maximum_length,
                    numeric_precision,
                    numeric_scale,
                    udt_name
                FROM information_schema.columns 
                WHERE table_name = $1 
                AND table_schema = 'public'
                ORDER BY ordinal_position;
            `, [tableName]);
            
            fullSql += `-- Table: ${tableName}\n`;
            fullSql += `CREATE TABLE IF NOT EXISTS ${tableName} (\n`;
            
            const colDefinitions = colsRes.rows.map(col => {
                let def = `    ${col.column_name} `;
                
                // Map PostgreSQL types to standard SQL/Supabase compatible types
                let type = col.data_type.toUpperCase();
                if (type === 'USER-DEFINED' || col.udt_name === 'jsonb') {
                    type = 'JSONB';
                } else if (type === 'CHARACTER VARYING') {
                    type = `VARCHAR(${col.character_maximum_length || 255})`;
                } else if (type === 'NUMERIC') {
                    type = `DECIMAL(${col.numeric_precision || 15}, ${col.numeric_scale || 2})`;
                } else if (type === 'TIMESTAMP WITHOUT TIME ZONE') {
                    type = 'TIMESTAMP';
                } else if (type === 'INTEGER' && col.column_default && col.column_default.includes('nextval')) {
                    // Convert SERIAL types
                    type = 'SERIAL';
                    col.column_default = null; // Default handled by SERIAL
                } else if (type === 'BIGINT' && col.column_default && col.column_default.includes('nextval')) {
                    type = 'BIGSERIAL';
                    col.column_default = null;
                }

                def += type;

                if (col.is_nullable === 'NO') {
                    def += ' NOT NULL';
                }

                if (col.column_default) {
                    // Clean up default values (e.g. '0'::numeric or 'user'::character varying)
                    let cleanDefault = col.column_default;
                    if (cleanDefault.includes('::')) {
                        cleanDefault = cleanDefault.split('::')[0];
                    }
                    def += ` DEFAULT ${cleanDefault}`;
                }
                
                return def;
            });

            // Add primary key if it's 'id' (simplified assumption for export)
            // A more robust check would query information_schema.table_constraints
            if (colsRes.rows.some(c => c.column_name === 'id')) {
                // Find where 'id' is defined and make it PRIMARY KEY if it's not already handled by SERIAL
                const idIdx = colsRes.rows.findIndex(c => c.column_name === 'id');
                if (!colDefinitions[idIdx].includes('PRIMARY KEY')) {
                   colDefinitions[idIdx] += ' PRIMARY KEY';
                }
            }

            fullSql += colDefinitions.join(',\n');
            fullSql += '\n);\n\n';
            
            // Generate standard indexes (id, created_at, specific ones if known)
            if (tableName === 'users') {
                fullSql += `CREATE INDEX IF NOT EXISTS idx_users_user_id ON users(user_id);\n`;
                fullSql += `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);\n`;
                fullSql += `CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);\n\n`;
            } else if (tableName === 'market') {
                fullSql += `CREATE INDEX IF NOT EXISTS idx_market_owner ON market(owner_user_id);\n\n`;
            }
        }
        
        fs.writeFileSync('supabase_complete_schema.sql', fullSql);
        console.log('✅ COMPLETE SCHEMA SAVED to supabase_complete_schema.sql');
        
    } catch (err) {
        console.error('❌ Error during schema generation:', err);
    } finally {
        await pool.end();
        process.exit(0);
    }
}

generateSchema();
