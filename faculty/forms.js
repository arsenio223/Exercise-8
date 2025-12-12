import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  console.log('=== FACULTY FORMS API CALLED ===');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded) {
      console.log('❌ Token verification failed');
      return res.status(401).json({ success: false, message: 'Unauthorized - Invalid token' });
    }

    const { facultyId, academic_year_id } = req.query;
    
    if (!facultyId) {
      console.log('❌ No facultyId provided');
      return res.status(400).json({ success: false, message: 'Faculty ID is required' });
    }

    console.log('Request parameters:', { facultyId, academic_year_id });

    // ==================== AUTHORIZATION CHECK ====================
    const isFaculty = decoded.userType === 'faculty' || 
                      decoded.user_type === 2 || 
                      decoded.user_type === 'faculty' ||
                      decoded.foundInTable === 'faculty_list';

    if (!isFaculty) {
      console.log('❌ User is not faculty');
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied - Faculty authorization required' 
      });
    }

    console.log('✅ Authorization passed');
    
    // ==================== FETCH EVALUATION FORMS ====================
    let evaluationForms = [];
    
    try {
      // Query to get forms created by ADMIN and assigned to this faculty's classes
      console.log('🔍 Querying admin-created forms for faculty:', facultyId);
      
      const formsQuery = `
  SELECT DISTINCT
    ef.id as form_id,
    ef.form_code,
    ef.title as form_title,
    ef.description as form_description,
    ef.academic_year_id,
    ef.semester,
    ef.status as form_status,
    ef.created_by,
    ef.created_at,
    ef.updated_at,
    ef.faculty_id as form_faculty_id,
    
    -- Academic year info
    ay.year_name,
    ay.year_code,
    
    -- Creator info
    u.firstname as creator_firstname,
    u.lastname as creator_lastname,
    u.user_type as creator_user_type
    
  FROM evaluation_forms ef
  
  INNER JOIN form_assignments fa ON ef.id = fa.form_id
  INNER JOIN class_list c ON fa.class_id = c.id
  INNER JOIN faculty_classes fc ON c.id = fc.class_id
  LEFT JOIN academic_years ay ON ef.academic_year_id = ay.id
  LEFT JOIN users u ON ef.created_by = u.id
  
  WHERE fc.faculty_id = ?
    AND (
      -- Form is assigned to THIS specific faculty
      ef.faculty_id = ?
      -- OR form has no specific faculty assigned
      OR ef.faculty_id IS NULL 
      OR ef.faculty_id = 0
    )
    AND ef.status IN ('not_started', 'starting', 'closed')
    ${academic_year_id ? 'AND ef.academic_year_id = ?' : ''}
  
  GROUP BY ef.id
  ORDER BY ef.created_at DESC
`;

const params = [facultyId, facultyId]; // facultyId twice
if (academic_year_id) params.push(academic_year_id);
      
      console.log('📋 Executing query with params:', params);
      
      evaluationForms = await query(formsQuery, params);
      
      console.log(`✅ Found ${evaluationForms.length} admin-created forms for faculty ${facultyId}`);
      
    } catch (error) {
      console.error('❌ Error querying evaluation forms:', error.message);
      console.error('❌ Error stack:', error.stack);
      
      return res.status(500).json({ 
        success: false, 
        message: 'Database error fetching forms',
        error: error.message 
      });
    }
    
    // ==================== ENRICH FORM DATA ====================
    if (evaluationForms.length > 0) {
      console.log(`🔧 Enriching ${evaluationForms.length} forms with details...`);
      
      for (let i = 0; i < evaluationForms.length; i++) {
        const form = evaluationForms[i];
        
        try {
          // Get assigned classes details (ONLY for this faculty)
          const classesQuery = `
            SELECT 
              c.id,
              c.curriculum,
              c.level,
              c.section,
              c.description,
              c.academic_year,
              c.semester,
              CONCAT(c.curriculum, ' ', c.level, '-', c.section) as class_name
            FROM class_list c
            JOIN form_assignments fa ON c.id = fa.class_id
            JOIN faculty_classes fc ON c.id = fc.class_id
            WHERE fa.form_id = ?
              AND fc.faculty_id = ?
            ORDER BY c.curriculum, c.level, c.section
          `;
          
          const classes = await query(classesQuery, [form.form_id, facultyId]);
          evaluationForms[i].assigned_classes = classes || [];
          
          console.log(`Form ${form.form_id} has ${classes.length} classes assigned to faculty ${facultyId}`);
          
        } catch (classError) {
          console.log(`❌ Could not fetch class details:`, classError.message);
          evaluationForms[i].assigned_classes = [];
        }
        
        try {
          // Get questions count
          const questionsResult = await query(
            'SELECT COUNT(*) as question_count FROM form_questions WHERE form_id = ?',
            [form.form_id]
          );
          evaluationForms[i].question_count = questionsResult[0]?.question_count || 0;
          
        } catch (questionError) {
          console.log(`❌ Could not fetch questions count:`, questionError.message);
          evaluationForms[i].question_count = 0;
        }
        
        try {
          // Get student evaluation statistics (ONLY for this faculty)
          const statsQuery = `
            SELECT 
              COUNT(DISTINCT se.id) as total_submissions,
              COUNT(DISTINCT se.student_id) as total_students
            FROM student_evaluations se
            WHERE se.form_id = ?
              AND se.faculty_id = ?
              AND se.status = 'completed'
          `;
          
          const statsResult = await query(statsQuery, [form.form_id, facultyId]);
          
          // Calculate average score from evaluation_responses (ONLY for this faculty)
          const scoreQuery = `
            SELECT 
              AVG(er.response_value) as average_score
            FROM evaluation_responses er
            JOIN student_evaluations se ON er.student_evaluation_id = se.id
            WHERE se.form_id = ?
              AND se.faculty_id = ?
              AND se.status = 'completed'
              AND er.response_value IS NOT NULL
              AND er.response_value > 0
          `;
          
          const scoreResult = await query(scoreQuery, [form.form_id, facultyId]);
          
          if (statsResult[0]) {
            evaluationForms[i].statistics = {
              total_submissions: statsResult[0].total_submissions || 0,
              total_students: statsResult[0].total_students || 0,
              average_score: scoreResult[0]?.average_score 
                ? parseFloat(scoreResult[0].average_score).toFixed(2) 
                : '0.00'
            };
          } else {
            evaluationForms[i].statistics = {
              total_submissions: 0,
              total_students: 0,
              average_score: '0.00'
            };
          }
          
          console.log(`Form ${form.form_id} stats:`, evaluationForms[i].statistics);
          
        } catch (statsError) {
          console.log(`❌ Could not fetch statistics:`, statsError.message);
          evaluationForms[i].statistics = {
            total_submissions: 0,
            total_students: 0,
            average_score: '0.00'
          };
        }
      }
    } else {
      console.log('⚠️ No admin-created evaluation forms found for faculty:', facultyId);
      
      // Debug: Check what's happening
      try {
        // Check what forms are assigned but created by non-admin
        const debugQuery = `
          SELECT 
            ef.id,
            ef.form_code,
            ef.title,
            ef.status,
            ef.faculty_id,
            u.firstname as creator_firstname,
            u.lastname as creator_lastname,
            u.user_type as creator_user_type
          FROM evaluation_forms ef
          JOIN form_assignments fa ON ef.id = fa.form_id
          JOIN class_list c ON fa.class_id = c.id
          JOIN faculty_classes fc ON c.id = fc.class_id
          JOIN users u ON ef.created_by = u.id
          WHERE fc.faculty_id = ?
            AND ef.status IN ('not_started', 'starting', 'closed')
        `;
        
        const allForms = await query(debugQuery, [facultyId]);
        console.log(`All forms assigned to faculty ${facultyId}:`, allForms);
        
      } catch (debugError) {
        console.log('Debug query error:', debugError.message);
      }
    }
    
    // ==================== RETURN RESPONSE ====================
    console.log(`✅ Returning ${evaluationForms.length} admin-created forms for faculty ${facultyId}`);
    
    res.status(200).json({
      success: true,
      forms: evaluationForms,
      count: evaluationForms.length,
      faculty_id: facultyId,
      message: evaluationForms.length === 0 
        ? 'No evaluation forms assigned to your classes' 
        : `Found ${evaluationForms.length} evaluation form${evaluationForms.length !== 1 ? 's' : ''}`
    });

  } catch (error) {
    console.error('❌ Error in faculty forms API:', error);
    console.error('❌ Error stack:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch evaluation forms',
      error: error.message 
    });
  }
}