import mysql from 'mysql2/promise';
import { verifyToken } from '@/lib/auth';

// Create database pool - FIXED DATABASE NAME
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'eval_db',  // CHANGED from school_db to eval_db
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default async function handler(req, res) {
  const { id } = req.query;
  
  console.log('📚 Evaluation details API called:', {
    method: req.method,
    evaluationId: id,
    query: req.query
  });
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Check authorization
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }

    const studentId = decoded.id || decoded.user_id;
    
    console.log('🔍 Fetching evaluation details for:', { studentId, evaluationId: id });
    
    let connection;
    try {
      connection = await pool.getConnection();
      
      // Try to find evaluation in student_evaluations table first
      let [evaluations] = await connection.execute(`
        SELECT 
          se.id,
          se.student_id,
          se.status,
          se.assigned_date,
          se.submitted_at,
          se.due_date,
          se.score,
          se.feedback,
          se.completed_at,
          se.form_id,
          ef.form_code,
          ef.title as form_title,
          ef.description as form_description,
          ef.is_anonymous,
          ef.academic_year_id,
          ef.semester,
          ef.status as form_status,
          f.id as faculty_id,
          f.firstname as faculty_firstname,
          f.lastname as faculty_lastname,
          CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
          f.email as faculty_email,
          s.firstname as student_firstname,
          s.lastname as student_lastname,
          s.class_id,
          c.curriculum,
          c.level,
          c.section,
          CONCAT(c.curriculum, ' Year ', c.level, '-', c.section) as class_name,
          ay.year_name as academic_year
        FROM student_evaluations se
        INNER JOIN evaluation_forms ef ON se.form_id = ef.id
        INNER JOIN faculty_list f ON se.faculty_id = f.id
        INNER JOIN student_list s ON se.student_id = s.id
        LEFT JOIN class_list c ON s.class_id = c.id
        LEFT JOIN academic_years ay ON ef.academic_year_id = ay.id
        WHERE se.id = ?
        AND se.student_id = ?
      `, [id, studentId]);
      
      // If not found, check form_assignments
      if (evaluations.length === 0) {
        console.log('🔍 Not found in student_evaluations, checking form_assignments...');
        
        [evaluations] = await connection.execute(`
          SELECT 
            fa.id,
            fa.student_id,
            'pending' as status,
            fa.assigned_at as assigned_date,
            NULL as submitted_at,
            fa.due_date,
            NULL as score,
            NULL as feedback,
            NULL as completed_at,
            fa.form_id,
            ef.form_code,
            ef.title as form_title,
            ef.description as form_description,
            ef.is_anonymous,
            ef.academic_year_id,
            ef.semester,
            ef.status as form_status,
            ef.faculty_id,
            f.firstname as faculty_firstname,
            f.lastname as faculty_lastname,
            CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
            f.email as faculty_email,
            s.firstname as student_firstname,
            s.lastname as student_lastname,
            s.class_id,
            c.curriculum,
            c.level,
            c.section,
            CONCAT(c.curriculum, ' Year ', c.level, '-', c.section) as class_name,
            ay.year_name as academic_year
          FROM form_assignments fa
          INNER JOIN evaluation_forms ef ON fa.form_id = ef.id
          INNER JOIN faculty_list f ON ef.faculty_id = f.id
          INNER JOIN student_list s ON fa.student_id = s.id
          LEFT JOIN class_list c ON s.class_id = c.id
          LEFT JOIN academic_years ay ON ef.academic_year_id = ay.id
          WHERE fa.id = ?
          AND fa.student_id = ?
        `, [id, studentId]);
      }
      
      if (evaluations.length === 0) {
        console.log('❌ Evaluation not found for student:', { studentId, evaluationId: id });
        return res.status(404).json({ 
          success: false, 
          message: 'Evaluation not found or you do not have access to it' 
        });
      }
      
      const evaluation = evaluations[0];
      
      // Get questions for this form
      let questions = [];
      if (evaluation.form_id) {
        console.log('📝 Fetching questions for form_id:', evaluation.form_id);
        const [questionRows] = await connection.execute(`
          SELECT 
            id,
            question_text,
            question_type,
            is_required,
            display_order
          FROM form_questions
          WHERE form_id = ?
          ORDER BY display_order ASC
        `, [evaluation.form_id]);
        
        questions = questionRows;
        console.log(`✅ Found ${questions.length} questions for form ${evaluation.form_id}`);
      } else {
        console.log('⚠️ No form_id found in evaluation');
      }
      
      // Check if student has already submitted responses
      let existingResponses = [];
      if (evaluation.id) {
        const [responseRows] = await connection.execute(`
          SELECT 
            question_id,
            response_value,
            rating,
            submitted_at
          FROM evaluation_responses
          WHERE student_evaluation_id = ?
        `, [evaluation.id]);
        
        existingResponses = responseRows;
      }
      
      // Format the evaluation object for frontend
      const formattedEvaluation = {
        id: evaluation.id,
        evaluation_id: evaluation.id,
        form_id: evaluation.form_id,
        form_code: evaluation.form_code,
        form_title: evaluation.form_title,
        form_description: evaluation.form_description,
        faculty: {
          id: evaluation.faculty_id,
          name: evaluation.faculty_name,
          firstname: evaluation.faculty_firstname,
          lastname: evaluation.faculty_lastname,
          email: evaluation.faculty_email
        },
        student: {
          id: evaluation.student_id,
          name: `${evaluation.student_firstname} ${evaluation.student_lastname}`,
          class_id: evaluation.class_id,
          class_name: evaluation.class_name
        },
        status: evaluation.status,
        assigned_date: evaluation.assigned_date,
        submitted_at: evaluation.submitted_at,
        completed_at: evaluation.completed_at,
        due_date: evaluation.due_date,
        score: evaluation.score,
        feedback: evaluation.feedback,
        is_anonymous: evaluation.is_anonymous === 1,
        academic_year: evaluation.academic_year,
        semester: evaluation.semester,
        form_status: evaluation.form_status,
        can_submit: evaluation.status !== 'completed' && 
                   (!evaluation.due_date || new Date(evaluation.due_date) >= new Date())
      };
      
      // Format questions with existing responses
      const formattedQuestions = questions.map(q => ({
        id: q.id,
        question_text: q.question_text,
        question_type: q.question_type || 'rating_1_5',
        is_required: q.is_required === 1,
        display_order: q.display_order,
        existing_response: existingResponses.find(r => r.question_id === q.id)
      }));
      
      console.log(`✅ Found evaluation: ${formattedEvaluation.form_title} with ${questions.length} questions`);
      console.log('📊 Question types:', formattedQuestions.map(q => q.question_type));
      
      return res.status(200).json({ 
        success: true, 
        evaluation: formattedEvaluation,
        questions: formattedQuestions,
        meta: {
          total_questions: questions.length,
          has_responses: existingResponses.length > 0,
          is_completed: formattedEvaluation.status === 'completed'
        }
      });
      
    } finally {
      if (connection) connection.release();
    }
    
  } catch (error) {
    console.error('❌ Error fetching evaluation details:', error);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching evaluation details',
      error: process.env.NODE_ENV === 'development' ? {
        message: error.message,
        stack: error.stack
      } : undefined
    });
  }
}