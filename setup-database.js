const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

async function setupDatabase() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };

  try {
    console.log('🔧 Setting up database...');

    // Create connection WITHOUT multipleStatements
    const connection = await mysql.createConnection(config);

    // Read SQL file
    const sqlPath = path.join(__dirname, 'database_schema.sql');
    let sql = fs.readFileSync(sqlPath, 'utf8');
    
    // Remove problematic statements
    sql = sql.replace(/GRANT\s+SELECT.*?FLUSH PRIVILEGES;/igs, '');
    sql = sql.replace(/CREATE USER IF NOT EXISTS.*?FLUSH PRIVILEGES;/igs, '');

    // Split by DELIMITER markers and execute
    console.log('📝 Executing database schema...');
    
    // Split statements more carefully
    const statements = sql
      .split(/;(?=\s*(--|\/\*|$|DELIMITER|CREATE|ALTER|INSERT|DELETE|UPDATE|DROP|SELECT))/i)
      .map(stmt => stmt.trim())
      .filter(stmt => stmt && !stmt.startsWith('--') && stmt.length > 5);
    
    let count = 0;
    for (const statement of statements) {
      try {
        if (statement.includes('DELIMITER')) {
          // Handle DELIMITER statements
          const parts = statement.split(/DELIMITER\s+(.+?)\s+/);
          continue;
        }
        
        // Execute the statement
        await connection.query(statement + ';');
        count++;
      } catch (error) {
        if (error.message.includes('already exists') || error.message.includes('Already exists')) {
          // Ignore duplicate table/index errors
          continue;
        }
        console.error(`⚠️  Statement error: ${error.message.substring(0, 100)}`);
      }
    }
    
    console.log(`✅ Database setup completed! Executed ${count} statements`);
    
    // Test the connection with new database
    const dbConfig = {
      ...config,
      database: process.env.DB_NAME || 'school_db'
    };
    
    const testConnection = await mysql.createConnection(dbConfig);
    await testConnection.execute('SELECT 1');
    console.log('✅ Database connection test passed!');
    
    // Verify tables exist
    const [tables] = await testConnection.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'school_db' LIMIT 10"
    );
    console.log(`✅ Found ${tables.length} tables in school_db`);
    
    await testConnection.end();
    await connection.end();
    
  } catch (error) {
    console.error('❌ Database setup failed:', error.message);
    process.exit(1);
  }
}

setupDatabase();