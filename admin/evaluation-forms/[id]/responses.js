// src/pages/api/admin/evaluation-forms/[id]/responses.js
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
  console.log(`=== GET FORM RESPONSES API (Form ID: ${id}) ===`);
  
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
      // Get all student evaluations for this form
      const [evaluations] = await connection.execute(`
        SELECT 
          se.id as evaluation_id,
          se.student_id,
          sl.firstname as student_firstname,
          sl.lastname as student_lastname,
          se.faculty_id,
          f.firstname as faculty_firstname,
          f.lastname as faculty_lastname,
          sl.class_id,
          c.curriculum,
          c.level,
          c.section,
          se.status as evaluation_status,
          se.submitted_at,
          se.score,
          se.completed_at,
          se.created_at as evaluation_created_at
        FROM student_evaluations se
        JOIN student_list sl ON se.student_id = sl.id
        JOIN faculty_list f ON se.faculty_id = f.id
        LEFT JOIN class_list c ON sl.class_id = c.id
        WHERE se.form_id = ?
        ORDER BY se.submitted_at DESC, se.id
      `, [id]);
      
      console.log(`Found ${evaluations.length} evaluations for form ${id}`);
      
      // Get all responses for these evaluations
      const evaluationIds = evaluations.map(e => e.evaluation_id);
      let responses = [];
      let overallAverage = 0;
      
      if (evaluationIds.length > 0) {
        const placeholders = evaluationIds.map(() => '?').join(',');
        console.log(`Fetching responses for evaluation IDs: ${evaluationIds.join(',')}`);
        
        // FIXED: Use response_value instead of rating column
        const [responseRows] = await connection.execute(`
          SELECT 
            er.id,
            er.student_evaluation_id,
            er.question_id,
            fq.question_text,
            er.response_value,
            er.response_value as rating_value,  -- Using response_value as rating
            er.submitted_at as created_at
          FROM evaluation_responses er
          JOIN form_questions fq ON er.question_id = fq.id
          WHERE er.student_evaluation_id IN (${placeholders})
          ORDER BY er.student_evaluation_id, fq.display_order
        `, evaluationIds);
        
        responses = responseRows;
        console.log(`Found ${responses.length} responses for form ${id}`);
        
        // Calculate overall average from response_value
        const calculateOverallAverage = (responses) => {
          let total = 0;
          let count = 0;
          
          responses.forEach(row => {
            const value = parseFloat(row.response_value);
            if (!isNaN(value)) {
              total += value;
              count++;
            }
          });
          
          return count > 0 ? (total / count).toFixed(2) : 0;
        };
        
        overallAverage = calculateOverallAverage(responses);
        console.log(`Calculated overall average: ${overallAverage}`);
        
        // Also calculate and update scores in student_evaluations table
        for (const evaluation of evaluations) {
          const evalResponses = responses.filter(r => r.student_evaluation_id === evaluation.evaluation_id);
          
          if (evalResponses.length > 0) {
            let studentTotal = 0;
            let studentCount = 0;
            
            evalResponses.forEach(r => {
              const value = parseFloat(r.response_value);
              if (!isNaN(value)) {
                studentTotal += value;
                studentCount++;
              }
            });
            
            if (studentCount > 0) {
              const studentAverage = (studentTotal / studentCount).toFixed(2);
              
              // Update score in database if it's NULL or different
              if (evaluation.score === null || parseFloat(evaluation.score || 0) !== parseFloat(studentAverage)) {
                await connection.execute(
                  'UPDATE student_evaluations SET score = ? WHERE id = ?',
                  [studentAverage, evaluation.evaluation_id]
                );
                console.log(`Updated score for evaluation ${evaluation.evaluation_id}: ${studentAverage}`);
              }
            }
          }
        }
      }
      
      connection.release();
      
      console.log(`✅ Successfully fetched ${evaluations.length} evaluations and ${responses.length} responses for form ${id}`);
      console.log(`📊 Overall average: ${overallAverage}`);
      
      return res.status(200).json({
        success: true,
        data: {
          evaluations: evaluations || [],
          responses: responses || [],
          statistics: {
            overallAverage: overallAverage,
            totalEvaluations: evaluations.length,
            totalResponses: responses.length,
            totalStudents: new Set(evaluations.map(e => e.student_id)).size
          }
        }
      });
      
    } catch (dbError) {
      connection.release();
      console.error('Database error in responses API:', dbError);
      console.error('Error SQL:', dbError.sql);
      console.error('Error message:', dbError.message);
      throw dbError;
    }
    
  } catch (error) {
    console.error('Error fetching form responses:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching form responses',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      details: error.code || 'Unknown error'
    });
  }
}