// src/pages/api/admin/dashboard/all-stats.js
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
  console.log('=== ALL DASHBOARD STATS API ===');
  
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
      // Get all stats in one query
      const [stats] = await connection.execute(`
        SELECT 
          (SELECT COUNT(*) FROM faculty_list WHERE is_active = TRUE) as faculties,
          (SELECT COUNT(*) FROM student_list WHERE is_active = TRUE) as students,
          (SELECT COUNT(*) FROM class_list WHERE is_active = TRUE) as classes,
          (SELECT COUNT(*) FROM subject_list WHERE is_active = TRUE) as subjects,
          (SELECT COUNT(*) FROM academic_years) as academic_years
      `);
      
      // Get evaluation stats
      let evaluations = 0;
      let pendingEvaluations = 0;
      
      // Check new system first
      const [newSystemTables] = await connection.execute(`
        SHOW TABLES LIKE 'form_responses'
      `);
      
      if (newSystemTables.length > 0) {
        const [evalStats] = await connection.execute(`
          SELECT 
            (SELECT COUNT(*) FROM form_responses WHERE status = 'submitted') as submitted_evaluations,
            (SELECT COUNT(*) FROM form_responses WHERE status = 'draft') as pending_evaluations
        `);
        
        evaluations = evalStats[0]?.submitted_evaluations || 0;
        pendingEvaluations = evalStats[0]?.pending_evaluations || 0;
      } else {
        // Check old system
        const [oldSystemTables] = await connection.execute(`
          SHOW TABLES LIKE 'evaluation_list'
        `);
        
        if (oldSystemTables.length > 0) {
          const [oldEvalStats] = await connection.execute(`
            SELECT 
              (SELECT COUNT(*) FROM evaluation_list WHERE status = 'submitted') as submitted_evaluations,
              (SELECT COUNT(*) FROM evaluation_list WHERE status = 'pending') as pending_evaluations
          `);
          
          evaluations = oldEvalStats[0]?.submitted_evaluations || 0;
          pendingEvaluations = oldEvalStats[0]?.pending_evaluations || 0;
        }
      }
      
      connection.release();
      
      const result = {
        faculties: stats[0]?.faculties || 0,
        students: stats[0]?.students || 0,
        classes: stats[0]?.classes || 0,
        subjects: stats[0]?.subjects || 0,
        academicYears: stats[0]?.academic_years || 0,
        evaluations: evaluations,
        pendingEvaluations: pendingEvaluations
      };
      
      console.log('All stats:', result);
      
      return res.status(200).json({
        success: true,
        data: result
      });
      
    } catch (error) {
      connection.release();
      console.error('Database error:', error);
      
      // Return default stats on error
      return res.status(200).json({
        success: true,
        data: {
          faculties: 0,
          students: 0,
          classes: 0,
          subjects: 0,
          academicYears: 0,
          evaluations: 0,
          pendingEvaluations: 0
        }
      });
    }
    
  } catch (error) {
    console.error('Error fetching all stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching stats: ' + error.message,
      data: {
        faculties: 0,
        students: 0,
        classes: 0,
        subjects: 0,
        academicYears: 0,
        evaluations: 0,
        pendingEvaluations: 0
      }
    });
  }
}