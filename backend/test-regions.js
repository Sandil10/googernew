const dns = require('dns');

const regions = [
    'ap-south-1', // Mumbai
    'ap-southeast-1', // Singapore
    'us-east-1', // N. Virginia
    'eu-central-1', // Frankfurt
    'eu-west-1', // Ireland
    'us-west-1' // N. California
];

(async () => {
    console.log("Health Check: Identifying Supabase Region & Reachable IPv4 Address...");

    for (const region of regions) {
        const host = `aws-0-${region}.pooler.supabase.com`;
        try {
            const addresses = await dns.promises.resolve4(host);
            if (addresses && addresses.length > 0) {
                console.log(`✅ REACHABLE: ${host} -> ${addresses[0]}`);
                console.log(`   (This implies your project might be in '${region}' or this pooler is globally accessible)`);
            }
        } catch (e) {
            // console.log(`   Unreachable: ${host}`);
        }
    }
    console.log("Done.");
})();
