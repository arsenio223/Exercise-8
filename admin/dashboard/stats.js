// src/pages/api/admin/dashboard/stats.js
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
  const { type } = req.query;
  console.log('=== DASHBOARD STATS API ===');
  console.log('Type requested:', type);
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Verify admin authentication
    const token = req.headers.authorization?.split(' ')[1];
    const auth = verifyToken(token);
    
    if (!auth) {
      console.log('No valid token');
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const isAdmin = auth.user_type === 1 || auth.userType === 'admin';
    if (!isAdmin) {
      console.log('Not an admin user');
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const connection = await pool.getConnection();
    
    try {
      let count = 0;
      let message = '';
      
      console.log(`Fetching stats for type: ${type}`);
      
      switch (type) {
        case 'faculty':
          console.log('Fetching faculty count...');
          const [facultyResult] = await connection.execute(
            'SELECT COUNT(*) as count FROM faculty_list WHERE is_active = TRUE'
          );
          count = facultyResult[0]?.count || 0;
          message = `Found ${count} active faculty`;
          break;
          
        case 'student':
          console.log('Fetching student count...');
          const [studentResult] = await connection.execute(
            'SELECT COUNT(*) as count FROM student_list WHERE is_active = TRUE'
          );
          count = studentResult[0]?.count || 0;
          message = `Found ${count} active students`;
          break;
          
        case 'evaluation':
          console.log('Fetching evaluation count...');
          // Try new system first (form_responses)
          try {
            const [evalResult] = await connection.execute(
              "SELECT COUNT(*) as count FROM form_responses WHERE status = 'submitted'"
            );
            count = evalResult[0]?.count || 0;
            message = `Found ${count} submitted evaluations (new system)`;
          } catch (e) {
            // Try old system
            try {
              const [oldEvalResult] = await connection.execute(
                "SELECT COUNT(*) as count FROM evaluation_list WHERE status = 'submitted'"
              );
              count = oldEvalResult[0]?.count || 0;
              message = `Found ${count} submitted evaluations (old system)`;
            } catch (e2) {
              count = 0;
              message = 'Evaluation tables not found';
            }
          }
          break;
          
        case 'class':
          console.log('Fetching class count...');
          const [classResult] = await connection.execute(
            'SELECT COUNT(*) as count FROM class_list WHERE is_active = TRUE'
          );
          count = classResult[0]?.count || 0;
          message = `Found ${count} active classes`;
          break;
          
        case 'subject':
          console.log('Fetching subject count...');
          const [subjectResult] = await connection.execute(
            'SELECT COUNT(*) as count FROM subject_list WHERE is_active = TRUE'
          );
          count = subjectResult[0]?.count || 0;
          message = `Found ${count} active subjects`;
          break;
          
        case 'academic-year':
          console.log('Fetching academic year count...');
          const [yearResult] = await connection.execute(
            'SELECT COUNT(*) as count FROM academic_years'
          );
          count = yearResult[0]?.count || 0;
          message = `Found ${count} academic years`;
          break;
          
        case 'pending-evaluations':
          console.log('Fetching pending evaluations count...');
          // Try new system first (form_responses with status = 'draft')
          try {
            const [pendingResult] = await connection.execute(
              "SELECT COUNT(*) as count FROM form_responses WHERE status = 'draft'"
            );
            count = pendingResult[0]?.count || 0;
            message = `Found ${count} pending evaluations (draft forms)`;
            
            // If no results in new system, check old system
            if (count === 0) {
              try {
                const [oldPendingResult] = await connection.execute(
                  "SELECT COUNT(*) as count FROM evaluation_list WHERE status = 'pending'"
                );
                count = oldPendingResult[0]?.count || 0;
                if (count > 0) {
                  message = `Found ${count} pending evaluations (old system)`;
                }
              } catch (e2) {
                // Old system table doesn't exist
              }
            }
          } catch (e) {
            // New system table doesn't exist
            count = 0;
            message = 'No pending evaluations found (form_responses table might not exist)';
          }
          break;
          
        default:
          console.log(`Unknown type: ${type}`);
          count = 0;
          message = `Unknown type: ${type}`;
      }
      
      connection.release();
      
      console.log(`Stats result for ${type}: count=${count}, message=${message}`);
      
      return res.status(200).json({
        success: true,
        count: count,
        total: count,
        message: message
      });
      
    } catch (error) {
      connection.release();
      console.error('Database error:', error);
      
      return res.status(200).json({
        success: true,
        count: 0,
        total: 0,
        message: `Error: ${error.message}`
      });
    }
    
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    return res.status(500).json({
      success: false,
      count: 0,
      total: 0,
      message: 'Error fetching stats: ' + error.message
    });
  }
}