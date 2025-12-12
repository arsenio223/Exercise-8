// src/pages/api/admin/evaluation-responses.js
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
  console.log('=== FETCH EVALUATION RESPONSES API ===');
  console.log('Method:', req.method);
  
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

    const { evaluationIds } = req.query;
    
    if (!evaluationIds) {
      return res.status(400).json({ success: false, message: 'Evaluation IDs are required' });
    }

    const evaluationIdArray = evaluationIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
    
    if (evaluationIdArray.length === 0) {
      return res.status(200).json({ 
        success: true, 
        data: { responses: [], questions: [] } 
      });
    }

    const connection = await pool.getConnection();
    
    try {
      // Fetch evaluation responses
      const placeholders = evaluationIdArray.map(() => '?').join(',');
      
      console.log('Fetching responses for evaluation IDs:', evaluationIdArray);
      
      // First, let's check the structure of the evaluation_responses table
      const [tableInfo] = await connection.execute(`
        SHOW COLUMNS FROM evaluation_responses
      `);
      
      console.log('Evaluation responses table columns:', tableInfo.map(col => col.Field));
      
      // Build query based on actual table structure
      let responseColumns = ['er.id', 'er.student_evaluation_id', 'er.question_id', 'er.response_value', 'er.created_at'];
      
      // Check if comments column exists
      const hasCommentsColumn = tableInfo.some(col => col.Field === 'comments');
      if (hasCommentsColumn) {
        responseColumns.push('er.comments');
      }
      
      // Build the query
      const query = `
        SELECT 
          ${responseColumns.join(', ')},
          se.student_id,
          se.faculty_id,
          se.form_id
         FROM evaluation_responses er
         JOIN student_evaluations se ON er.student_evaluation_id = se.id
         WHERE er.student_evaluation_id IN (${placeholders})
         ORDER BY er.student_evaluation_id, er.question_id
      `;
      
      console.log('Executing query:', query.substring(0, 100) + '...');
      
      const [responses] = await connection.execute(query, evaluationIdArray);

      console.log(`Found ${responses.length} responses`);

      // Get unique question IDs from responses
      const questionIds = [...new Set(responses.map(r => r.question_id).filter(Boolean))];
      
      console.log(`Unique question IDs: ${questionIds.length}`, questionIds);
      
      let questions = [];
      if (questionIds.length > 0) {
        const questionPlaceholders = questionIds.map(() => '?').join(',');
        const [questionResults] = await connection.execute(
          `SELECT 
            id, 
            question_text, 
            description, 
            question_type, 
            question_order,
            form_id
           FROM evaluation_questions 
           WHERE id IN (${questionPlaceholders})
           ORDER BY question_order`,
          questionIds
        );
        questions = questionResults;
        
        console.log(`Found ${questions.length} questions`);
        
        // If no questions found in evaluation_questions, try form_questions table
        if (questions.length === 0) {
          console.log('Trying form_questions table...');
          const [formQuestions] = await connection.execute(
            `SELECT 
              id, 
              question_text, 
              description, 
              question_type, 
              question_order,
              form_id
             FROM form_questions 
             WHERE id IN (${questionPlaceholders})
             ORDER BY question_order`,
            questionIds
          );
          questions = formQuestions;
          console.log(`Found ${questions.length} questions in form_questions table`);
        }
      }

      // Also get form information if available
      let formInfo = null;
      if (responses.length > 0 && responses[0].form_id) {
        const [formResults] = await connection.execute(
          `SELECT id, title, form_code, description 
           FROM evaluation_forms 
           WHERE id = ?`,
          [responses[0].form_id]
        );
        if (formResults.length > 0) {
          formInfo = formResults[0];
        }
      }

      // If still no form info, check student_evaluations for form title
      if (!formInfo && responses.length > 0) {
        const [evalInfo] = await connection.execute(
          `SELECT se.form_id, ef.title, ef.form_code
           FROM student_evaluations se
           LEFT JOIN evaluation_forms ef ON se.form_id = ef.id
           WHERE se.id = ?
           LIMIT 1`,
          [responses[0].student_evaluation_id]
        );
        if (evalInfo.length > 0 && evalInfo[0].title) {
          formInfo = {
            id: evalInfo[0].form_id,
            title: evalInfo[0].title,
            form_code: evalInfo[0].form_code || 'N/A'
          };
        }
      }

      connection.release();
      
      return res.status(200).json({
        success: true,
        data: {
          responses: responses || [],
          questions: questions || [],
          formInfo: formInfo || null
        },
        count: {
          responses: responses?.length || 0,
          questions: questions?.length || 0
        }
      });
      
    } catch (error) {
      connection.release();
      console.error('Database error:', error);
      throw error;
    }
    
  } catch (error) {
    console.error('Error fetching evaluation responses:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching evaluation responses: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}