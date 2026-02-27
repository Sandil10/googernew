const fs = require('fs');
const path = 'backend/src/controllers/marketController.js';
let content = fs.readFileSync(path, 'utf8');

// Be very flexible with spaces
content = content.replace(
    /commission_info\s*\?\s*JSON\.stringify\(commission_info\)\s*:\s*null\s*,\s*id/g,
    'commission_info ? JSON.stringify(commission_info) : null,\n                links_info ? JSON.stringify(links_info) : null,\n                id'
);

fs.writeFileSync(path, content);
console.log('Successfully updated marketController.js params');
