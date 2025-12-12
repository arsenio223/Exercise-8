import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  console.log('=== FACULTY EVALUATIONS API CALLED ===');
  
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

    const { facultyId, formId } = req.query;
    
    if (!facultyId) {
      console.log('❌ No facultyId provided');
      return res.status(400).json({ success: false, message: 'Faculty ID is required' });
    }

    console.log('Request parameters:', { facultyId, formId });

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
    
    // ==================== FETCH EVALUATIONS WITH CALCULATED SCORES ====================
    let evaluations = [];
    
    try {
      // First, get all evaluations for this faculty
      let queryString = `
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
          
          -- Student information
          CONCAT(s.firstname, ' ', s.lastname) as student_name,
          s.school_id as student_school_id,
          s.class_id as student_class_id,
          
          -- Class information
          c.curriculum as class_curriculum,
          c.level as class_level,
          c.section as class_section,
          c.description as class_description,
          CONCAT(c.curriculum, ' - Year ', c.level, ' - Section ', c.section) as class_name,
          
          -- Form information
          ef.title as form_title,
          ef.form_code,
          ef.description as form_description
          
        FROM student_evaluations se
        
        LEFT JOIN student_list s ON se.student_id = s.id
        LEFT JOIN class_list c ON s.class_id = c.id
        LEFT JOIN evaluation_forms ef ON se.form_id = ef.id
        
        WHERE se.faculty_id = ? 
          AND se.status = 'completed'
      `;
      
      const params = [facultyId];
      
      if (formId) {
        queryString += ` AND se.form_id = ?`;
        params.push(formId);
      }
      
      queryString += ` ORDER BY se.submitted_at DESC`;
      
      evaluations = await query(queryString, params);
      
      console.log(`✅ Found ${evaluations.length} evaluations`);
      
      // Now, for each evaluation, get responses and calculate scores
      for (let i = 0; i < evaluations.length; i++) {
        const evaluation = evaluations[i];
        
        // Get all responses for this evaluation
        const responsesQuery = `
          SELECT 
            er.id,
            er.student_evaluation_id,
            er.question_id,
            er.response_value,
            er.rating,
            er.submitted_at,
            fq.question_text,
            fq.question_type
          FROM evaluation_responses er
          LEFT JOIN form_questions fq ON er.question_id = fq.id
          WHERE er.student_evaluation_id = ?
          ORDER BY er.id
        `;
        
        const responses = await query(responsesQuery, [evaluation.id]);
        
        // Calculate average score from responses
        if (responses.length > 0) {
          let totalRating = 0;
          let validResponses = 0;
          
          responses.forEach(response => {
            // Try to get rating value from different possible fields
            const ratingStr = response.response_value || response.rating;
            if (ratingStr) {
              const rating = parseFloat(ratingStr);
              if (!isNaN(rating) && rating >= 1 && rating <= 5) {
                totalRating += rating;
                validResponses++;
              }
            }
          });
          
          if (validResponses > 0) {
            const calculatedScore = totalRating / validResponses;
            evaluations[i].calculated_score = calculatedScore.toFixed(2);
            evaluations[i].score = calculatedScore.toFixed(2); // Update the score field
            evaluations[i].response_count = responses.length;
            evaluations[i].responses = responses; // Include responses in the data
          } else {
            evaluations[i].calculated_score = '0.00';
            evaluations[i].score = '0.00';
            evaluations[i].response_count = 0;
            evaluations[i].responses = [];
          }
        } else {
          evaluations[i].calculated_score = '0.00';
          evaluations[i].score = evaluations[i].score || '0.00';
          evaluations[i].response_count = 0;
          evaluations[i].responses = [];
        }
        
        // If the evaluation already has a score, use it (but our calculated one is more accurate)
        if (evaluations[i].score && parseFloat(evaluations[i].score) > 0) {
          // Keep the existing score, but also have calculated_score as backup
          console.log(`Evaluation ${evaluation.id} has existing score: ${evaluations[i].score}`);
        }
      }
      
    } catch (error) {
      console.error('❌ Error querying evaluations:', error.message);
      return res.status(500).json({ 
        success: false, 
        message: 'Database error',
        error: error.message 
      });
    }
    
    // ==================== RETURN RESPONSE ====================
    console.log(`✅ Returning ${evaluations.length} evaluations with calculated scores`);
    
    // Log first evaluation for debugging
    if (evaluations.length > 0) {
      console.log('📊 Sample evaluation:', {
        id: evaluations[0].id,
        student_name: evaluations[0].student_name,
        score: evaluations[0].score,
        calculated_score: evaluations[0].calculated_score,
        response_count: evaluations[0].response_count,
        form_title: evaluations[0].form_title
      });
    }
    
    res.status(200).json({
      success: true,
      data: evaluations,
      count: evaluations.length,
      message: evaluations.length === 0 
        ? 'No evaluations found' 
        : `Found ${evaluations.length} evaluation${evaluations.length !== 1 ? 's' : ''}`
    });

  } catch (error) {
    console.error('❌ Error in faculty evaluations API:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch evaluations data',
      error: error.message 
    });
  }
}