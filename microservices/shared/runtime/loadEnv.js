const path = require('path');

let loaded = false;

const loadEnv = () => {
    if (loaded) return;
    require('dotenv').config({ path: path.resolve(__dirname, '../../../backend/.env') });
    require('dotenv').config();
    loaded = true;
};

module.exports = {
    loadEnv,
};
