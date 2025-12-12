import mysql from 'mysql2/promise';
import { verifyToken } from '@/lib/auth';

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default async function handler(req, res) {
  const { id } = req.query; // Get ID from query parameters
  
  // Verify authentication
  const token = req.headers.authorization?.split(' ')[1];
  const auth = verifyToken(token);
  
  console.log('🔄 Setting current academic year (query param version):', {
    hasToken: !!token,
    yearId: id,
    method: req.method
  });
  
  if (!auth) {
    return res.status(401).json({ success: false, message: 'Unauthorized - No valid token' });
  }
  
  // Check if user is admin
  const isAdmin = auth.user_type === 1 || auth.userType === 'admin' || auth.role === 'admin';
  
  if (!isAdmin) {
    return res.status(403).json({ success: false, message: 'Forbidden - Admin access required' });
  }

  if (req.method !== 'PUT') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  if (!id) {
    return res.status(400).json({ 
      success: false, 
      message: 'Academic year ID is required' 
    });
  }

  try {
    // Check if year exists
    const [existing] = await pool.query(
      'SELECT id FROM academic_years WHERE id = ?',
      [id]
    );

    if (existing.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'Academic year not found' 
      });
    }

    // Start transaction
    const connection = await pool.getConnection();
    
    try {
      await connection.beginTransaction();
      
      // 1. Unset ALL current years
      console.log('📊 Unsetting all current academic years...');
      await connection.query('UPDATE academic_years SET is_current = 0');
      
      // 2. Set THIS year as current and mark as active
      console.log(`📊 Setting year ${id} as current...`);
      await connection.query(
        'UPDATE academic_years SET is_current = 1, status = "active" WHERE id = ?',
        [id]
      );
      
      // 3. Update status for other years based on dates
      console.log('📊 Updating status for other years...');
      const [allYears] = await connection.query('SELECT id, start_date, end_date FROM academic_years WHERE id != ?', [id]);
      
      for (const year of allYears) {
        const today = new Date();
        const startDate = new Date(year.start_date);
        const endDate = new Date(year.end_date);
        
        let newStatus = 'active';
        if (endDate < today) {
          newStatus = 'completed';
        } else if (startDate > today) {
          newStatus = 'upcoming';
        }
        
        await connection.query(
          'UPDATE academic_years SET status = ? WHERE id = ?',
          [newStatus, year.id]
        );
      }

      await connection.commit();
      connection.release();
      
      console.log(`✅ Successfully set year ${id} as current`);
      
      return res.status(200).json({ 
        success: true, 
        message: 'Current academic year updated successfully',
        data: { id }
      });
      
    } catch (error) {
      await connection.rollback();
      connection.release();
      console.error('❌ Transaction error:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('❌ Error setting current year:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Error setting current academic year'
    });
  }
}