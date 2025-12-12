// src/pages/api/admin/evaluation-forms/[id].js
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
  
  if (req.method === 'GET') {
    console.log(`=== GET EVALUATION FORM API (ID: ${id}) ===`);
    return handleGetForm(req, res, id);
  }
  
  if (req.method === 'DELETE') {
    console.log(`=== DELETE EVALUATION FORM API (ID: ${id}) ===`);
    return handleDeleteForm(req, res, id);
  }
  
  return res.status(405).json({ success: false, message: 'Method not allowed' });
}

// GET handler - Get form details
async function handleGetForm(req, res, id) {
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
      // Get form details with academic year info
      const [forms] = await connection.execute(`
        SELECT 
          ef.*,
          ay.year_name,
          ay.year_code,
          ay.is_current,
          ay.status as academic_year_status
        FROM evaluation_forms ef
        LEFT JOIN academic_years ay ON ef.academic_year_id = ay.id
        WHERE ef.id = ?
      `, [id]);
      
      if (forms.length === 0) {
        connection.release();
        return res.status(404).json({ success: false, message: 'Form not found' });
      }
      
      const form = forms[0];
      
      // Get form statistics from student_evaluations table - FIXED: using score instead of total_score
      const [statistics] = await connection.execute(`
        SELECT 
          COUNT(DISTINCT student_id) as total_students,
          COUNT(DISTINCT id) as total_submissions,
          AVG(score) as average_score
        FROM student_evaluations 
        WHERE form_id = ? AND status = 'completed'
      `, [id]);
      
      // Get assigned classes
      const [assignedClasses] = await connection.execute(`
        SELECT 
          c.*,
          fa.assigned_at,
          fa.status as assignment_status
        FROM form_assignments fa
        LEFT JOIN class_list c ON fa.class_id = c.id
        WHERE fa.form_id = ?
      `, [id]);
      
      connection.release();
      
      return res.status(200).json({
        success: true,
        data: {
          ...form,
          statistics: statistics[0] || { total_students: 0, total_submissions: 0, average_score: 0 },
          assigned_classes: assignedClasses || []
        }
      });
      
    } catch (dbError) {
      connection.release();
      console.error('Database error:', dbError);
      throw dbError;
    }
    
  } catch (error) {
    console.error('Error fetching evaluation form:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching evaluation form',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}

// DELETE handler - Delete form
async function handleDeleteForm(req, res, id) {
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
    await connection.beginTransaction();
    
    try {
      // First check if form exists
      const [formExists] = await connection.execute(
        'SELECT id FROM evaluation_forms WHERE id = ?',
        [id]
      );
      
      if (formExists.length === 0) {
        await connection.rollback();
        connection.release();
        return res.status(404).json({ success: false, message: 'Form not found' });
      }
      
      // Delete form (cascade will handle related records if foreign keys are set up)
      await connection.execute(
        'DELETE FROM evaluation_forms WHERE id = ?',
        [id]
      );
      
      await connection.commit();
      connection.release();
      
      console.log(`✅ Form ${id} deleted successfully`);
      
      return res.status(200).json({
        success: true,
        message: 'Evaluation form deleted successfully'
      });
      
    } catch (error) {
      await connection.rollback();
      connection.release();
      console.error('Database error:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('Error deleting evaluation form:', error);
    
    if (error.code === 'ER_ROW_IS_REFERENCED_2') {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete form because it has related records (responses, assignments, etc.)'
      });
    }
    
    return res.status(500).json({
      success: false,
      message: 'Error deleting evaluation form: ' + error.message
    });
  }
}