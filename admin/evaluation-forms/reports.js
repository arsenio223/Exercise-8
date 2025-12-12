// src/pages/api/admin/evaluation-forms/reports.js
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
  console.log('=== GET EVALUATION FORMS REPORTS API ===');
  
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

    const { academic_year_id } = req.query;
    
    if (!academic_year_id) {
      return res.status(400).json({ success: false, message: 'Academic year is required' });
    }

    const connection = await pool.getConnection();
    
    try {
      // First, get all evaluation forms for the academic year
      const [forms] = await connection.execute(`
        SELECT 
          ef.*,
          ay.year_name,
          ay.year_code
        FROM evaluation_forms ef
        LEFT JOIN academic_years ay ON ef.academic_year_id = ay.id
        WHERE ef.academic_year_id = ?
        ORDER BY ef.created_at DESC
      `, [academic_year_id]);
      
      // Get statistics and assigned classes for each form
      for (let form of forms) {
        // Get total students assigned
        const [studentCount] = await connection.execute(`
          SELECT COUNT(DISTINCT student_id) as count 
          FROM student_evaluations 
          WHERE form_id = ?
        `, [form.id]);
        form.total_students = studentCount[0]?.count || 0;
        
        // Get total completed submissions
        const [submissionCount] = await connection.execute(`
          SELECT COUNT(*) as count 
          FROM student_evaluations 
          WHERE form_id = ? AND status = 'completed'
        `, [form.id]);
        form.total_submissions = submissionCount[0]?.count || 0;
        
        // Get total responses
        const [responseCount] = await connection.execute(`
          SELECT COUNT(*) as count 
          FROM evaluation_responses er
          JOIN student_evaluations se ON er.student_evaluation_id = se.id
          WHERE se.form_id = ?
        `, [form.id]);
        form.total_responses = responseCount[0]?.count || 0;
        
        // Get average score
        const [avgScore] = await connection.execute(`
          SELECT AVG(score) as average 
          FROM student_evaluations 
          WHERE form_id = ? AND status = 'completed' AND score IS NOT NULL
        `, [form.id]);
        form.average_score = avgScore[0]?.average || 0;
        
        // Get count of questions
        const [questionCount] = await connection.execute(
          'SELECT COUNT(*) as count FROM form_questions WHERE form_id = ?',
          [form.id]
        );
        form.total_questions = questionCount[0]?.count || 0;
        
        // Get count of assigned classes
        const [classCount] = await connection.execute(
          'SELECT COUNT(*) as count FROM form_assignments WHERE form_id = ?',
          [form.id]
        );
        form.total_classes = classCount[0]?.count || 0;
        
        // Get assigned classes details - NEW: Added class information
        const [assignedClasses] = await connection.execute(`
          SELECT 
            c.*,
            fa.assigned_at,
            fa.status as assignment_status
          FROM form_assignments fa
          LEFT JOIN class_list c ON fa.class_id = c.id
          WHERE fa.form_id = ?
          ORDER BY c.curriculum, c.level, c.section
        `, [form.id]);
        
        form.assigned_classes = assignedClasses || [];
        
        // Add formatted class names for easy display
        if (assignedClasses.length > 0) {
          form.formatted_class_names = assignedClasses.map(c => {
            const parts = [];
            if (c.curriculum) parts.push(c.curriculum);
            if (c.level) parts.push(c.level);
            if (c.section) parts.push(c.section);
            return parts.join(' ');
          }).filter(name => name).join(', ');
          
          // Set primary assigned class (first one)
          const primaryClass = assignedClasses[0];
          if (primaryClass) {
            form.assigned_class_name = [
              primaryClass.curriculum,
              primaryClass.level,
              primaryClass.section
            ].filter(Boolean).join(' ') || `Class ${primaryClass.id}`;
            
            form.primary_class_id = primaryClass.id;
            form.primary_class_curriculum = primaryClass.curriculum;
            form.primary_class_level = primaryClass.level;
            form.primary_class_section = primaryClass.section;
          }
        } else {
          form.formatted_class_names = 'Not assigned';
          form.assigned_class_name = 'Not assigned';
        }
      }
      
      connection.release();
      
      console.log(`✅ Found ${forms.length} evaluation forms for academic year ${academic_year_id}`);
      console.log(`📊 Forms with classes: ${forms.filter(f => f.assigned_classes.length > 0).length}`);
      
      return res.status(200).json({
        success: true,
        forms: forms || []
      });
      
    } catch (dbError) {
      connection.release();
      console.error('Database error:', dbError);
      throw dbError;
    }
    
  } catch (error) {
    console.error('Error fetching evaluation forms reports:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching evaluation forms',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}