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
  const { id } = req.query;
  
  // Verify authentication
  const token = req.headers.authorization?.split(' ')[1];
  const auth = verifyToken(token);
  
  console.log('🔐 Auth check for academic year:', {
    hasToken: !!token,
    authResult: auth,
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

  if (req.method === 'GET') {
    try {
      const [years] = await pool.query(
        'SELECT * FROM academic_years WHERE id = ?',
        [id]
      );
      
      if (years.length === 0) {
        return res.status(404).json({ success: false, message: 'Academic year not found' });
      }
      
      return res.status(200).json({ success: true, data: years[0] });
    } catch (error) {
      console.error('Error fetching academic year:', error);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }

  if (req.method === 'PUT') {
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

      console.log('📝 Updating academic year:', id, req.body);

      // Check if year exists
      const [existing] = await pool.query(
        'SELECT id FROM academic_years WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'Academic year not found' });
      }

      // Check if year code already exists (excluding current record)
      const [duplicate] = await pool.query(
        'SELECT id FROM academic_years WHERE year_code = ? AND id != ?',
        [year_code, id]
      );

      if (duplicate.length > 0) {
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

      // Update academic year
      await pool.query(`
        UPDATE academic_years SET
          year_code = ?,
          year_name = ?,
          start_date = ?,
          end_date = ?,
          semester = ?,
          evaluation_start = ?,
          evaluation_end = ?,
          status = ?,
          is_current = ?
        WHERE id = ?
      `, [
        year_code,
        year_name,
        start_date,
        end_date,
        semester || 1,
        evaluation_start || null,
        evaluation_end || null,
        status || 'upcoming',
        is_current ? 1 : 0,
        id
      ]);

      return res.status(200).json({ 
        success: true, 
        message: 'Academic year updated successfully'
      });
    } catch (error) {
      console.error('Error updating academic year:', error);
      return res.status(500).json({ success: false, message: 'Error updating academic year' });
    }
  }

  if (req.method === 'DELETE') {
    try {
      // Check if year exists
      const [existing] = await pool.query(
        'SELECT id FROM academic_years WHERE id = ?',
        [id]
      );

      if (existing.length === 0) {
        return res.status(404).json({ success: false, message: 'Academic year not found' });
      }

      // Check if year is current
      const [current] = await pool.query(
        'SELECT is_current FROM academic_years WHERE id = ?',
        [id]
      );

      if (current[0].is_current) {
        return res.status(400).json({ 
          success: false, 
          message: 'Cannot delete current academic year. Set another year as current first.' 
        });
      }

      // Delete the academic year
      await pool.query('DELETE FROM academic_years WHERE id = ?', [id]);

      return res.status(200).json({ 
        success: true, 
        message: 'Academic year deleted successfully' 
      });
    } catch (error) {
      console.error('Error deleting academic year:', error);
      return res.status(500).json({ success: false, message: 'Error deleting academic year' });
    }
  }

  return res.status(405).json({ success: false, message: 'Method not allowed' });
}