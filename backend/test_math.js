const fs = require('fs');

let googerBalance = 0;
let dbBudget = 0;
let dbSpend = 0;

function publish() {
  const payAmount = 300;
  googerBalance += payAmount; // payOrder
  // mock CampaignEditor.tsx before my fix
  // effectiveBudget is null, so budget: 0
  dbBudget = 0; 
}

function publishAfterFix() {
  const payAmount = 300;
  googerBalance += payAmount;
  dbBudget = 300;
}

function edit() {
  const payAmount = 300;
  googerBalance += payAmount; // payOrder
  // mock CampaignEditor.tsx before my fix
  dbBudget = 0;
}

function editAfterFix() {
  const payAmount = 300;
  googerBalance += payAmount;
  dbBudget = 600;
}

function cancel() {
  const refundAmount = Math.max(0, dbBudget - dbSpend);
  googerBalance -= refundAmount;
}

console.log("=== BEFORE FIX ===");
publish();
edit();
cancel();
console.log("Googer Balance after Cancel:", googerBalance);

googerBalance = 0;
console.log("=== AFTER FIX ===");
publishAfterFix();
editAfterFix();
cancel();
console.log("Googer Balance after Cancel:", googerBalance);

