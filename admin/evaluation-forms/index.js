// src/pages/api/admin/evaluation-forms/index.js
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
  console.log('=== FETCH EVALUATION FORMS API ===');
  console.log('Method:', req.method);
  console.log('Query:', req.query);
  
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

    const { formIds } = req.query;
    const connection = await pool.getConnection();
    
    try {
      let forms = [];
      let query = '';
      let params = [];
      
      if (formIds) {
        // Fetch specific forms by IDs
        const formIdArray = formIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
        
        if (formIdArray.length === 0) {
          connection.release();
          return res.status(200).json({ success: true, data: [] });
        }
        
        const placeholders = formIdArray.map(() => '?').join(',');
        query = `
          SELECT 
            ef.*,
            ay.year_name,
            ay.year_code,
            u.firstname as creator_firstname,
            u.lastname as creator_lastname,
            COUNT(DISTINCT fa.id) as assigned_classes_count,
            COUNT(DISTINCT fq.id) as questions_count
          FROM evaluation_forms ef
          LEFT JOIN academic_years ay ON ef.academic_year_id = ay.id
          LEFT JOIN users u ON ef.created_by = u.id
          LEFT JOIN form_assignments fa ON ef.id = fa.form_id
          LEFT JOIN form_questions fq ON ef.id = fq.form_id
          WHERE ef.id IN (${placeholders})
          GROUP BY ef.id
          ORDER BY ef.created_at DESC
        `;
        params = formIdArray;
      } else {
        // Fetch all forms
        query = `
          SELECT 
            ef.*,
            ay.year_name,
            ay.year_code,
            u.firstname as creator_firstname,
            u.lastname as creator_lastname,
            COUNT(DISTINCT fa.id) as assigned_classes_count,
            COUNT(DISTINCT fq.id) as questions_count
          FROM evaluation_forms ef
          LEFT JOIN academic_years ay ON ef.academic_year_id = ay.id
          LEFT JOIN users u ON ef.created_by = u.id
          LEFT JOIN form_assignments fa ON ef.id = fa.form_id
          LEFT JOIN form_questions fq ON ef.id = fq.form_id
          GROUP BY ef.id
          ORDER BY ef.created_at DESC
        `;
      }
      
      console.log('Executing query:', query.substring(0, 100) + '...');
      console.log('Params:', params);
      
      const [results] = await connection.execute(query, params);
      forms = results;
      
      connection.release();
      
      console.log(`Found ${forms.length} forms`);
      
      return res.status(200).json({
        success: true,
        data: forms,
        count: forms.length
      });
      
    } catch (error) {
      connection.release();
      console.error('Database error:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('Error fetching evaluation forms:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching evaluation forms: ' + error.message
    });
  }
}