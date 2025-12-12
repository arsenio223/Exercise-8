// src/pages/api/admin/evaluation-forms/[id]/questions.js
import mysql from 'mysql2/promise';
import { verifyToken } from '@/lib/auth';

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'eval_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default async function handler(req, res) {
  const { id } = req.query;
  console.log(`=== GET FORM QUESTIONS API (Form ID: ${id}) ===`);
  
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

    if (!id) {
      return res.status(400).json({ success: false, message: 'Form ID is required' });
    }

    const connection = await pool.getConnection();
    
    try {
      // Get form questions
      const [questions] = await connection.execute(`
        SELECT 
          id,
          form_id,
          question_text,
          question_type,
          is_required,
          display_order,
          created_at
        FROM form_questions 
        WHERE form_id = ?
        ORDER BY display_order
      `, [id]);
      
      connection.release();
      
      console.log(`✅ Found ${questions.length} questions for form ${id}`);
      
      return res.status(200).json({
        success: true,
        data: questions || []
      });
      
    } catch (dbError) {
      connection.release();
      console.error('Database error in questions API:', dbError);
      throw dbError;
    }
    
  } catch (error) {
    console.error('Error fetching form questions:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching form questions',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}