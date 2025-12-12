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
  // Verify authentication
  const token = req.headers.authorization?.split(' ')[1];
  const auth = verifyToken(token);
  
  console.log('🔐 Auth check for academic years:', {
    hasToken: !!token,
    authResult: auth,
    path: req.url,
    method: req.method
  });
  
  if (!auth) {
    return res.status(401).json({ success: false, message: 'Unauthorized - No valid token' });
  }
  
  // Check if user is admin
  // Your system might use user_type: 1 or userType: 'admin'
  const isAdmin = auth.user_type === 1 || auth.userType === 'admin' || auth.role === 'admin';
  
  console.log('👤 User info:', {
    user_id: auth.user_id || auth.id,
    user_type: auth.user_type,
    userType: auth.userType,
    role: auth.role,
    isAdmin: isAdmin
  });
  
  if (!isAdmin) {
    return res.status(403).json({ success: false, message: 'Forbidden - Admin access required' });
  }

  if (req.method === 'GET') {
    try {
      // Get all academic years
      const [years] = await pool.query(`
        SELECT * FROM academic_years 
        ORDER BY 
          CASE WHEN is_current = 1 THEN 0 ELSE 1 END,
          start_date DESC
      `);
      
      return res.status(200).json({ success: true, data: years });
    } catch (error) {
      console.error('Error fetching academic years:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  if (req.method === 'POST') {
    try {
      const { 
        year_code, 
        year_name, 
        start_date, 
        end_date, 
        semester,
        evaluation_start,
        evaluation_end,
        status,
        is_current 
      } = req.body;

      console.log('📝 Creating academic year:', req.body);

      // Validate required fields
      if (!year_code || !year_name || !start_date || !end_date) {
        return res.status(400).json({ 
          success: false, 
          message: 'Year code, name, start date, and end date are required' 
        });
      }

      // Check if year code already exists
      const [existing] = await pool.query(
        'SELECT id FROM academic_years WHERE year_code = ?',
        [year_code]
      );

      if (existing.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Year code already exists' 
        });
      }

      // If setting as current, unset any other current year
      if (is_current) {
        await pool.query(
          'UPDATE academic_years SET is_current = 0 WHERE is_current = 1'
        );
      }

      // Insert new academic year
      const [result] = await pool.query(`
        INSERT INTO academic_years (
          year_code, year_name, start_date, end_date, semester,
          evaluation_start, evaluation_end, status, is_current
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        year_code,
        year_name,
        start_date,
        end_date,
        semester || 1,
        evaluation_start || null,
        evaluation_end || null,
        status || 'upcoming',
        is_current ? 1 : 0
      ]);

      return res.status(201).json({ 
        success: true, 
        message: 'Academic year created successfully',
        id: result.insertId 
      });
    } catch (error) {
      console.error('Error creating academic year:', error);
      return res.status(500).json({ success: false, message: 'Error creating academic year' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}