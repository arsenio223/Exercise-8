// src/pages/api/admin/evaluations/list.js
import mysql from 'mysql2/promise';
import { verifyToken } from '@/lib/auth';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'school_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default async function handler(req, res) {
  console.log('=== FETCH SUBMITTED EVALUATIONS API ===');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Verify admin authentication
    const token = req.headers.authorization?.split(' ')[1];
    const auth = verifyToken(token);
    
    if (!auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const isAdmin = auth.user_type === 1 || auth.userType === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const connection = await pool.getConnection();
    
    try {
      // Try to fetch from form_responses (new system)
      let evaluations = [];
      
      // Check if form_responses table exists
      const [tables] = await connection.execute(`
        SHOW TABLES LIKE 'form_responses'
      `);
      
      if (tables.length > 0) {
        // Use new system
        const [results] = await connection.execute(`
          SELECT 
            fr.*,
            ef.title as form_title,
            CONCAT(s.firstname, ' ', s.lastname) as student_name,
            CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
            sb.subject,
            c.curriculum,
            c.level,
            c.section
          FROM form_responses fr
          LEFT JOIN evaluation_forms ef ON fr.form_id = ef.id
          LEFT JOIN student_list s ON fr.student_id = s.id
          LEFT JOIN faculty_list f ON fr.faculty_id = f.id
          LEFT JOIN subject_list sb ON fr.subject_id = sb.id
          LEFT JOIN class_list c ON s.class_id = c.id
          WHERE fr.status = 'submitted'
          ORDER BY fr.submitted_at DESC
        `);
        
        evaluations = results;
      } else {
        // Try old system (evaluation_list table)
        const [oldTables] = await connection.execute(`
          SHOW TABLES LIKE 'evaluation_list'
        `);
        
        if (oldTables.length > 0) {
          const [oldResults] = await connection.execute(`
            SELECT 
              el.*,
              CONCAT(s.firstname, ' ', s.lastname) as student_name,
              CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
              sb.subject as subject_name
            FROM evaluation_list el
            LEFT JOIN student_list s ON el.student_id = s.id
            LEFT JOIN faculty_list f ON el.faculty_id = f.id
            LEFT JOIN subject_list sb ON el.subject_id = sb.id
            WHERE el.status = 'submitted'
            ORDER BY el.date_taken DESC
          `);
          
          evaluations = oldResults;
        }
      }
      
      connection.release();
      
      return res.status(200).json({
        success: true,
        data: evaluations,
        count: evaluations.length
      });
      
    } catch (error) {
      connection.release();
      console.error('Database error:', error);
      
      // Return empty array if there's an error
      return res.status(200).json({
        success: true,
        data: [],
        count: 0,
        message: 'No evaluations found or tables not set up yet'
      });
    }
    
  } catch (error) {
    console.error('Error fetching evaluations:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching evaluations: ' + error.message
    });
  }
}