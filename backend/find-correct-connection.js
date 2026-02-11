const { Client } = require('pg');

const projectRef = 'kmaxihzxqoxakdjytohb';
const password = 'Ss718643654@'; // Raw password

const regions = [
    'ap-south-1', // Mumbai
    'ap-southeast-1', // Singapore
    'ap-northeast-1', // Tokyo
    'ap-northeast-2', // Seoul
    'us-east-1', // N. Virginia
    'us-west-1', // N. California
    'eu-central-1', // Frankfurt
    'eu-west-1', // Ireland
    'eu-west-2', // London
    'eu-west-3', // Paris
    'ca-central-1', // Canada
    'sa-east-1' // Sao Paulo
];

(async () => {
    console.log(`🔎 Searching for correct Supabase Pooler Region for project '${projectRef}'...`);

    for (const region of regions) {
        const host = `aws-0-${region}.pooler.supabase.com`;
        const connectionString = `postgresql://postgres.${projectRef}:${encodeURIComponent(password)}@${host}:5432/postgres?sslmode=require`;

        console.log(`\nTesting Region: ${region} (${host})...`);

        const client = new Client({
            connectionString,
            connectionTimeoutMillis: 5000 // 5s timeout
        });

        try {
            await client.connect();
            console.log(`✅ SUCCESS! Connected to region: ${region}`);
            console.log(`👉 Update your .env DATABASE_URL to use this host: ${host}`);
            await client.end();
            process.exit(0);
        } catch (err) {
            if (err.code === 'XX000' || err.message.includes('Tenant or user not found')) {
                console.log(`❌ Incorrect Region (Tenant not found)`);
            } else if (err.code === '28P01' || err.message.includes('password authentication failed')) {
                console.log(`⚠️  Right Region, but Password Failed! (Region: ${region})`);
                // This means we found the right server, but password might be wrong.
                process.exit(0);
            } else if (err.code === 'ENOTFOUND') {
                console.log(`❌ Host Unreachable (DNS)`);
            } else {
                console.log(`❌ Error: ${err.message} (${err.code})`);
            }
        } finally {
            try { await client.end(); } catch (e) { }
        }
    }

    console.log("\n❌ Could not find the correct region. Please check your Project Ref or Password.");
})();
