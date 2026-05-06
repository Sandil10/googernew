const fs = require('fs');
const path = 'backend/src/controllers/marketController.js';
let content = fs.readFileSync(path, 'utf8');

// Update UPDATE query
content = content.replace(
    'commission_info = COALESCE($12, commission_info),',
    'commission_info = COALESCE($12, commission_info),\n                  links_data = COALESCE($13, links_data),'
);
content = content.replace(
    'WHERE id = $13 RETURNING *`,',
    'WHERE id = $14 RETURNING *`,'
);
// Update parameters array (this is trickier as it might match multiple times, but let's be specific)
content = content.replace(
    'commission_info ? JSON.stringify(commission_info) : null,\n                id',
    'commission_info ? JSON.stringify(commission_info) : null,\n                links_info ? JSON.stringify(links_info) : null,\n                id'
);

fs.writeFileSync(path, content);
console.log('Successfully updated marketController.js');
