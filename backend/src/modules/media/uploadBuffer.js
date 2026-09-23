const fs = require('node:fs/promises');
let active = 0;
const waiting = [];
const concurrency = Math.max(1, Math.min(4, Number(process.env.MEDIA_PROCESS_CONCURRENCY) || 2));
async function withUploadBuffer(file, action) {
    if (active >= concurrency) await new Promise(resolve => waiting.push(resolve));
    else active++;
    try {
        const buffer = file.buffer || await fs.readFile(file.path);
        return await action({ ...file, buffer });
    } finally {
        const next = waiting.shift();
        if (next) next(); else active--;
    }
}
module.exports = { withUploadBuffer };
