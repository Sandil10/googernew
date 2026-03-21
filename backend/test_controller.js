const pool = require('./src/config/database');
const marketController = require('./src/controllers/marketController');

// Mock req/res
async function test() {
  const req = { params: { id: 19 }, user: null, header: () => null };
  const res = {
    status: (code) => {
      console.log('Status:', code);
      return res;
    },
    json: (obj) => {
      console.log('JSON:', JSON.stringify(obj, null, 2));
      return res;
    }
  };

  try {
    console.log('--- Testing logView ---');
    await marketController.logView(req, res);
    
    console.log('--- Testing toggleLike ---');
    req.user = { id: 1 }; // Mock logged in user
    await marketController.toggleLike(req, res);
  } catch (err) {
    console.error('Test Execution Error:', err);
  } finally {
    process.exit();
  }
}

test();
