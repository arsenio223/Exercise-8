// src/pages/api/admin/evaluation-forms/stats.js
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
  console.log('=== EVALUATION STATS API ===');
  
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
      let stats = {
        totalForms: 0,
        activeForms: 0,
        assignedClasses: 0,
        totalQuestions: 0,
        pendingEvaluations: 0,
        submittedEvaluations: 0,
        completedEvaluations: 0
      };
      
      // 1. Get evaluation form stats
      const [formStats] = await connection.execute(`
        SELECT 
          COUNT(DISTINCT ef.id) as total_forms,
          SUM(CASE WHEN ef.status = 'active' THEN 1 ELSE 0 END) as active_forms,
          COUNT(DISTINCT fa.id) as assigned_classes,
          COUNT(DISTINCT fq.id) as total_questions
        FROM evaluation_forms ef
        LEFT JOIN form_assignments fa ON ef.id = fa.form_id
        LEFT JOIN form_questions fq ON ef.id = fq.form_id
      `);
      
      if (formStats.length > 0) {
        stats.totalForms = formStats[0].total_forms || 0;
        stats.activeForms = formStats[0].active_forms || 0;
        stats.assignedClasses = formStats[0].assigned_classes || 0;
        stats.totalQuestions = formStats[0].total_questions || 0;
      }
      
      // 2. Get evaluation response stats (NEW SYSTEM)
      // First check if form_responses table exists
      const [responseTables] = await connection.execute(`
        SHOW TABLES LIKE 'form_responses'
      `);
      
      if (responseTables.length > 0) {
        const [responseStats] = await connection.execute(`
          SELECT 
            status,
            COUNT(*) as count
          FROM form_responses
          GROUP BY status
        `);
        
        responseStats.forEach(row => {
          if (row.status === 'draft') {
            stats.pendingEvaluations = row.count;
          } else if (row.status === 'submitted') {
            stats.submittedEvaluations = row.count;
          }
          stats.completedEvaluations = stats.submittedEvaluations;
        });
      } else {
        // Try old system (evaluation_list table)
        const [oldTables] = await connection.execute(`
          SHOW TABLES LIKE 'evaluation_list'
        `);
        
        if (oldTables.length > 0) {
          const [oldStats] = await connection.execute(`
            SELECT 
              status,
              COUNT(*) as count
            FROM evaluation_list
            GROUP BY status
          `);
          
          oldStats.forEach(row => {
            if (row.status === 'pending') {
              stats.pendingEvaluations = row.count;
            } else if (row.status === 'submitted') {
              stats.submittedEvaluations = row.count;
            }
            stats.completedEvaluations = stats.submittedEvaluations;
          });
        }
      }
      
      connection.release();
      
      console.log('Stats calculated:', stats);
      
      return res.status(200).json({
        success: true,
        data: stats
      });
      
    } catch (error) {
      connection.release();
      console.error('Database error in stats:', error);
      
      // Return default stats on error
      return res.status(200).json({
        success: true,
        data: {
          totalForms: 0,
          activeForms: 0,
          assignedClasses: 0,
          totalQuestions: 0,
          pendingEvaluations: 0,
          submittedEvaluations: 0,
          completedEvaluations: 0
        }
      });
    }
    
  } catch (error) {
    console.error('Error fetching evaluation stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching evaluation stats: ' + error.message
    });
  }
}