// create-correct-hash.js
const bcrypt = require('bcryptjs');

async function createHash() {
  const password = 'admin123';
  const hash = await bcrypt.hash(password, 10);
  
  console.log('========================================');
  console.log('✅ REAL BCRYPT HASH FOR "admin123"');
  console.log('========================================');
  console.log(`Password: ${password}`);
  console.log(`Hash: ${hash}`);
  console.log(`Hash Length: ${hash.length} characters`);
  console.log('========================================');
  console.log('\n📋 SQL TO RUN IN phpMyAdmin:');
  console.log('========================================');
  console.log(`USE eval_db;`);
  console.log(`UPDATE users SET password = '${hash}' WHERE email = 'admin@fes.edu';`);
  console.log('========================================');
  
  // Verify
  const isValid = await bcrypt.compare(password, hash);
  console.log(`\n🔍 VERIFICATION: ${isValid ? '✅ Hash is valid!' : '❌ Hash is invalid!'}`);
  
  return hash;
}

createHash();