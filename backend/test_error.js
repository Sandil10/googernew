const pool = require('./src/config/database');
const marketController = require('./src/controllers/marketController');
const fs = require('fs');

const originalConsoleError = console.error;
console.error = (msg, err) => {
  fs.writeFileSync('err.txt', `${msg}\n${err?.stack || err}`);
};

async function test() {
  const req = { params: { id: 19 }, user: { id: 1 }, header: () => null };
  const res = {
    status: (code) => { console.log('Status set to:', code); return res; },
    json: (obj) => { console.log('JSON sent:', obj); return res; }
  };

  try {
    await marketController.toggleLike(req, res);
  } catch (err) {
    fs.writeFileSync('err.txt', `THROWN: ${err.stack}`);
  } finally {
    process.exit();
  }
}

test();
