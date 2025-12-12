// src/pages/api/admin/all-evaluations.js
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  console.log('=== ADMIN ALL EVALUATIONS API ===');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    const auth = verifyToken(token);
    
    if (!auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const isAdmin = auth.user_type === 1 || auth.userType === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    // Get academic year ID from query parameters
    const { academicYearId } = req.query;
    console.log('Academic Year ID from query:', academicYearId);

    // Get all evaluations with scores calculated from evaluation_responses
    let evaluations = [];
    
    try {
      // Base query
      let queryStr = `
        SELECT 
          se.id,
          se.student_id,
          se.faculty_id,
          se.form_id,
          se.status,
          se.submitted_at,
          se.score,
          se.feedback,
          se.assigned_date,
          se.due_date,
          se.completed_at,
          se.created_at,
          se.updated_at,
          
          -- Student information
          CONCAT(s.firstname, ' ', s.lastname) as student_name,
          s.school_id as student_school_id,
          s.class_id as student_class_id,
          
          -- Faculty information
          CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
          f.school_id as faculty_school_id,
          
          -- Class information
          c.curriculum,
          c.level,
          c.section,
          
          -- Form information
          ef.title as form_title,
          ef.form_code,
          ef.academic_year_id,
          ef.semester,
          
          -- Academic year information
          ay.year_name,
          ay.year_code
          
        FROM student_evaluations se
        
        -- Join with student to get student info
        LEFT JOIN student_list s ON se.student_id = s.id
        
        -- Join with faculty
        LEFT JOIN faculty_list f ON se.faculty_id = f.id
        
        -- Join with class
        LEFT JOIN class_list c ON s.class_id = c.id
        
        -- Join with evaluation form
        LEFT JOIN evaluation_forms ef ON se.form_id = ef.id
        
        -- Join with academic years
        LEFT JOIN academic_years ay ON ef.academic_year_id = ay.id
        
        WHERE (se.status = 'completed' OR se.submitted_at IS NOT NULL)
      `;
      
      // Add academic year filter if provided
      if (academicYearId) {
        queryStr += ` AND ef.academic_year_id = ? `;
      }
      
      queryStr += ` ORDER BY se.submitted_at DESC `;
      
      // Execute query with or without academic year parameter
      let evaluationResults;
      if (academicYearId) {
        evaluationResults = await query(queryStr, [academicYearId]);
      } else {
        evaluationResults = await query(queryStr);
      }
      
      evaluations = evaluationResults || [];
      console.log(`Found ${evaluations.length} completed/submitted evaluations ${academicYearId ? 'for academic year ' + academicYearId : ''}`);
      
      // For each evaluation, calculate score from evaluation_responses
      for (let i = 0; i < evaluations.length; i++) {
        const evaluation = evaluations[i];
        
        try {
          // Calculate score from evaluation_responses
          const scoreResult = await query(`
            SELECT 
              AVG(response_value) as calculated_score,
              COUNT(*) as response_count
            FROM evaluation_responses
            WHERE student_evaluation_id = ?
              AND response_value IS NOT NULL
          `, [evaluation.id]);
          
          if (scoreResult && scoreResult.length > 0 && scoreResult[0].calculated_score !== null) {
            const calculatedScore = parseFloat(scoreResult[0].calculated_score).toFixed(2);
            evaluations[i].calculated_score = calculatedScore;
            evaluations[i].response_count = scoreResult[0].response_count;
            
            // Use calculated score as the main score
            evaluations[i].average_rating = parseFloat(calculatedScore);
          } else {
            // If no calculated score, use stored score
            evaluations[i].calculated_score = 0;
            evaluations[i].average_rating = parseFloat(evaluation.score) || 0;
          }
        } catch (error) {
          console.error(`Error calculating score for evaluation ${evaluation.id}:`, error.message);
          evaluations[i].calculated_score = 0;
          evaluations[i].average_rating = parseFloat(evaluation.score) || 0;
        }
        
        // Create class name
        if (evaluations[i].curriculum && evaluations[i].level && evaluations[i].section) {
          evaluations[i].class_name = `${evaluations[i].curriculum} Year ${evaluations[i].level}-${evaluations[i].section}`;
        }
      }
      
      console.log(`Processed ${evaluations.length} evaluations with calculated scores`);
      
    } catch (error) {
      console.error('Database error:', error.message);
      evaluations = [];
    }

    res.status(200).json({
      success: true,
      data: evaluations,
      count: evaluations.length,
      message: evaluations.length === 0 
        ? 'No submitted evaluations found' 
        : `Found ${evaluations.length} evaluation${evaluations.length !== 1 ? 's' : ''} ${academicYearId ? 'for selected academic year' : ''}`
    });

  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch evaluations data',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}