import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  const { studentId } = req.query;
  
  console.log('📚 Student evaluations API called:', {
    method: req.method,
    studentId: studentId || 'from-token'
  });
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Check authorization
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded) {
      console.log('❌ No valid token');
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }

    const actualStudentId = studentId || decoded.id;
    
    console.log('🔍 Fetching evaluations for student:', actualStudentId);
    
    const evaluations = await query(`
      SELECT 
        se.id,
        se.status,
        se.assigned_date,
        se.submitted_at,
        se.due_date,
        se.score,
        se.feedback,
        se.form_id,
        ef.form_code,
        ef.title as form_title,
        ef.description as form_description,
        ef.is_anonymous,
        ef.academic_year_id,
        ef.semester,
        f.id as faculty_id,
        f.firstname as faculty_firstname,
        f.lastname as faculty_lastname,
        CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
        CONCAT(c.curriculum, ' Year ', c.level, '-', c.section) as class_name,
        s.class_id,
        ay.year_name as academic_year,
        DATEDIFF(se.due_date, CURDATE()) as days_remaining,
        CASE 
          WHEN se.status = 'completed' THEN 'Completed'
          WHEN se.due_date < CURDATE() THEN 'Expired'
          WHEN se.status = 'in_progress' THEN 'In Progress'
          ELSE 'Pending'
        END as display_status
      FROM student_evaluations se
      INNER JOIN evaluation_forms ef ON se.form_id = ef.id
      INNER JOIN faculty_list f ON se.faculty_id = f.id
      INNER JOIN student_list s ON se.student_id = s.id
      LEFT JOIN class_list c ON s.class_id = c.id
      LEFT JOIN academic_years ay ON ef.academic_year_id = ay.id
      WHERE se.student_id = ?
      ORDER BY 
        CASE 
          WHEN se.status = 'pending' THEN 1
          WHEN se.status = 'in_progress' THEN 2
          WHEN se.due_date < CURDATE() THEN 3
          WHEN se.status = 'completed' THEN 4
          ELSE 5
        END,
        se.due_date ASC
    `, [actualStudentId]);

    console.log(`✅ Found ${evaluations.length} evaluations`);

    const formattedEvaluations = evaluations.map(evaluation => ({
      id: evaluation.id,
      evaluation_id: evaluation.id,
      form_id: evaluation.form_id,
      form_code: evaluation.form_code,
      title: evaluation.form_title,
      description: evaluation.form_description,
      faculty: {
        id: evaluation.faculty_id,
        name: evaluation.faculty_name,
        firstname: evaluation.faculty_firstname,
        lastname: evaluation.faculty_lastname
      },
      status: evaluation.status,
      displayStatus: evaluation.display_status,
      assignedDate: evaluation.assigned_date,
      dueDate: evaluation.due_date,
      submittedAt: evaluation.submitted_at,
      daysRemaining: evaluation.days_remaining,
      isAnonymous: evaluation.is_anonymous === 1,
      score: evaluation.score,
      feedback: evaluation.feedback,
      academicYear: evaluation.academic_year,
      semester: evaluation.semester,
      className: evaluation.class_name,
      classId: evaluation.class_id,
      canSubmit: evaluation.status !== 'completed' && 
                 (!evaluation.due_date || new Date(evaluation.due_date) >= new Date())
    }));
    
    return res.status(200).json({ 
      success: true, 
      data: formattedEvaluations
    });
    
  } catch (error) {
    console.error('❌ Error in student evaluations API:', error);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Unable to load evaluations',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}