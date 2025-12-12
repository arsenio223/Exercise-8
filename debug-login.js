const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function debugLogin() {
  console.log('🔍 DEBUGGING LOGIN ISSUE');
  console.log('=========================\n');

  // Connect to database
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: '', // your password
    database: 'school_db'
  });

  try {
    // 1. Check database connection
    console.log('1. ✅ Connected to database: eval_db\n');

    // 2. Check if tables exist
    console.log('2. Checking tables...');
    const [tables] = await connection.execute("SHOW TABLES");
    const tableNames = tables.map(t => Object.values(t)[0]);
    console.log('Available tables:', tableNames);
    
    const requiredTables = ['users', 'faculty_list', 'student_list'];
    for (const table of requiredTables) {
      if (tableNames.includes(table)) {
        console.log(`   ✅ ${table} table exists`);
      } else {
        console.log(`   ❌ ${table} table MISSING`);
      }
    }
    console.log('');

    // 3. Check admin user
    console.log('3. Checking admin@fes.edu...');
    try {
      const [adminUsers] = await connection.execute(
        "SELECT * FROM users WHERE email = 'admin@fes.edu'"
      );
      
      if (adminUsers.length > 0) {
        const admin = adminUsers[0];
        console.log('   ✅ Admin user found:');
        console.log(`      ID: ${admin.id}`);
        console.log(`      Name: ${admin.firstname} ${admin.lastname}`);
        console.log(`      Email: ${admin.email}`);
        console.log(`      Active: ${admin.is_active ? 'Yes' : 'No'}`);
        console.log(`      Password hash: ${admin.password.substring(0, 30)}...`);
        console.log(`      Password length: ${admin.password.length}`);
        
        // Test password 'admin123' against the hash
        const isPasswordValid = await bcrypt.compare('admin123', admin.password);
        console.log(`      Password 'admin123' matches hash: ${isPasswordValid ? '✅ Yes' : '❌ No'}`);
        
        // If password doesn't match, create correct hash
        if (!isPasswordValid) {
          console.log('\n   🔧 Creating correct hash for "admin123"...');
          const correctHash = await bcrypt.hash('admin123', 10);
          console.log(`      Correct hash: ${correctHash.substring(0, 30)}...`);
          
          // Update database
          await connection.execute(
            "UPDATE users SET password = ? WHERE email = 'admin@fes.edu'",
            [correctHash]
          );
          console.log('      ✅ Database updated with correct hash');
          
          // Verify again
          const newHashValid = await bcrypt.compare('admin123', correctHash);
          console.log(`      New hash verification: ${newHashValid ? '✅ Valid' : '❌ Invalid'}`);
        }
      } else {
        console.log('   ❌ Admin user NOT FOUND in users table');
        
        // Check other tables
        console.log('\n   🔍 Searching for admin@fes.edu in all tables...');
        const tablesToCheck = ['faculty_list', 'student_list'];
        for (const table of tablesToCheck) {
          const [users] = await connection.execute(
            `SELECT email FROM ${table} WHERE email = 'admin@fes.edu'`
          );
          if (users.length > 0) {
            console.log(`      ⚠️ Found in ${table} table (should be in users table!)`);
          }
        }
        
        // Create admin user
        console.log('\n   🔧 Creating admin user...');
        const adminHash = await bcrypt.hash('admin123', 10);
        await connection.execute(`
          INSERT INTO users (firstname, lastname, email, password, user_type, is_active)
          VALUES ('Admin', 'User', 'admin@fes.edu', ?, 1, TRUE)
        `, [adminHash]);
        console.log('      ✅ Admin user created');
      }
    } catch (error) {
      console.log(`   ❌ Error checking admin: ${error.message}`);
    }
    console.log('');

    // 4. Check other test users
    console.log('4. Checking other test users...');
    const testUsers = [
      { email: 'student@test.com', table: 'student_list', type: 'student' },
      { email: 'faculty@test.com', table: 'faculty_list', type: 'faculty' }
    ];
    
    for (const user of testUsers) {
      try {
        const [users] = await connection.execute(
          `SELECT * FROM ${user.table} WHERE email = ?`,
          [user.email]
        );
        
        if (users.length > 0) {
          const userData = users[0];
          console.log(`   ✅ ${user.type} user found: ${user.email}`);
          
          // Test password
          const password = user.type === 'student' ? 'student123' : 'faculty123';
          const isPasswordValid = await bcrypt.compare(password, userData.password);
          console.log(`      Password '${password}' matches: ${isPasswordValid ? '✅ Yes' : '❌ No'}`);
          
          if (!isPasswordValid) {
            const correctHash = await bcrypt.hash(password, 10);
            await connection.execute(
              `UPDATE ${user.table} SET password = ? WHERE email = ?`,
              [correctHash, user.email]
            );
            console.log(`      ✅ Updated ${user.type} password hash`);
          }
        } else {
          console.log(`   ❌ ${user.type} user NOT FOUND: ${user.email}`);
          
          // Create the user
          const password = user.type === 'student' ? 'student123' : 'faculty123';
          const hash = await bcrypt.hash(password, 10);
          
          if (user.type === 'student') {
            await connection.execute(`
              INSERT INTO student_list (school_id, firstname, lastname, email, password, class_id, year_level, is_active)
              VALUES ('STU001', 'John', 'Doe', ?, ?, 1, '1', TRUE)
            `, [user.email, hash]);
          } else {
            await connection.execute(`
              INSERT INTO faculty_list (school_id, firstname, lastname, email, password, department, is_active)
              VALUES ('FAC001', 'Jane', 'Smith', ?, ?, 'Computer Science', TRUE)
            `, [user.email, hash]);
          }
          console.log(`      ✅ Created ${user.type} user`);
        }
      } catch (error) {
        console.log(`   ❌ Error checking ${user.type}: ${error.message}`);
      }
    }
    console.log('');

    // 5. Test the login API directly
    console.log('5. Testing login API logic...');
    
    // Simulate what the API does
    const testEmail = 'admin@fes.edu';
    const testPassword = 'admin123';
    
    console.log(`   Testing: ${testEmail} / ${testPassword}`);
    
    // Check in users table
    const [adminResults] = await connection.execute(
      "SELECT * FROM users WHERE email = ? AND is_active = TRUE",
      [testEmail]
    );
    
    if (adminResults.length > 0) {
      const admin = adminResults[0];
      console.log('   ✅ Found in users table');
      
      const passwordValid = await bcrypt.compare(testPassword, admin.password);
      console.log(`   Password validation: ${passwordValid ? '✅ SUCCESS' : '❌ FAILED'}`);
      
      if (!passwordValid) {
        console.log('\n   🔧 Password issue detected!');
        console.log(`   Stored hash: ${admin.password}`);
        console.log(`   Hash length: ${admin.password.length}`);
        console.log(`   Hash starts with: ${admin.password.substring(0, 7)}`);
        
        // Check if it's a bcrypt hash (should start with $2a$)
        if (!admin.password.startsWith('$2a$')) {
          console.log('   ❌ Password is NOT a bcrypt hash!');
          console.log('   It should start with: $2a$');
        }
      }
    } else {
      console.log('   ❌ NOT FOUND in users table');
    }

  } catch (error) {
    console.error('❌ Debug error:', error.message);
  } finally {
    await connection.end();
    console.log('\n✅ Debug complete!');
  }
}

debugLogin();