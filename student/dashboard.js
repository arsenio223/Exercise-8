import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const studentId = req.query.studentId || decoded.id;
    
    console.log('📊 Fetching dashboard data for student:', studentId);

    // 1. Get student info with class
    const [student] = await query(`
      SELECT s.*, c.curriculum, c.level, c.section, c.academic_year
      FROM student_list s
      LEFT JOIN class_list c ON s.class_id = c.id
      WHERE s.id = ?
    `, [studentId]);

    if (!student) {
      return res.status(404).json({ 
        success: false, 
        message: 'Student not found' 
      });
    }

    // 2. Get evaluation statistics - FIXED LOGIC
    let stats = { submitted: 0, pending: 0 };
    try {
      const [statsResult] = await query(`
        SELECT 
          COUNT(CASE WHEN status = 'completed' THEN 1 END) as submitted,
          COUNT(CASE WHEN (status = 'pending' OR status = 'in_progress') AND (due_date IS NULL OR due_date >= CURDATE()) THEN 1 END) as pending
        FROM student_evaluations 
        WHERE student_id = ?
      `, [studentId]);
      
      if (statsResult) {
        stats = {
          submitted: parseInt(statsResult.submitted) || 0,
          pending: parseInt(statsResult.pending) || 0
        };
      }
    } catch (error) {
      console.log('⚠️ Error getting evaluation stats:', error.message);
    }

    // 3. Get total faculty count
    let totalFaculty = 0;
    try {
      const [facultyCount] = await query(`
        SELECT COUNT(*) as total FROM faculty_list WHERE is_active = 1
      `);
      totalFaculty = facultyCount?.total || 0;
    } catch (error) {
      console.log('⚠️ Error getting faculty count:', error.message);
    }

    // 4. Get pending evaluations - FIXED: Only get truly pending, not completed ones
    let pendingEvaluations = [];
    try {
      pendingEvaluations = await query(`
        SELECT 
          se.id,
          se.status,
          se.assigned_date,
          se.due_date,
          ef.form_code,
          ef.title as form_title,
          ef.description as form_description,
          f.firstname as faculty_firstname,
          f.lastname as faculty_lastname,
          CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
          ay.year_name as academic_year,
          ef.semester,
          DATEDIFF(se.due_date, CURDATE()) as days_remaining
        FROM student_evaluations se
        LEFT JOIN evaluation_forms ef ON se.form_id = ef.id
        LEFT JOIN faculty_list f ON se.faculty_id = f.id
        LEFT JOIN academic_years ay ON ef.academic_year_id = ay.id
        WHERE se.student_id = ?
        AND se.status IN ('pending', 'in_progress')
        AND (se.due_date IS NULL OR se.due_date >= CURDATE())
        ORDER BY se.due_date ASC
        LIMIT 5
      `, [studentId]);
      
      console.log(`📋 Found ${pendingEvaluations.length} truly pending evaluations`);
    } catch (error) {
      console.log('⚠️ Error getting pending evaluations:', error.message);
    }

    // 5. Get recent submissions - FIXED: Only get completed evaluations
    let recentSubmissions = [];
    try {
      recentSubmissions = await query(`
        SELECT 
          se.id,
          se.submitted_at,
          se.completed_at,
          ef.title as form_title,
          f.firstname as faculty_firstname,
          f.lastname as faculty_lastname,
          CONCAT(f.firstname, ' ', f.lastname) as faculty_name
        FROM student_evaluations se
        LEFT JOIN evaluation_forms ef ON se.form_id = ef.id
        LEFT JOIN faculty_list f ON se.faculty_id = f.id
        WHERE se.student_id = ?
        AND se.status = 'completed'
        ORDER BY COALESCE(se.submitted_at, se.completed_at) DESC
        LIMIT 3
      `, [studentId]);
    } catch (error) {
      console.log('⚠️ Error getting recent submissions:', error.message);
    }

    res.status(200).json({
      success: true,
      data: {
        student,
        stats: {
          ...stats,
          totalFaculty
        },
        pendingEvaluations,
        recentSubmissions
      }
    });
    
  } catch (error) {
    console.error('❌ Error fetching dashboard data:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard data',
      error: error.message
    });
  }
}