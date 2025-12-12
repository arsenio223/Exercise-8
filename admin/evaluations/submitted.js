// src/pages/api/admin/evaluations/submitted.js
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  console.log('=== ADMIN SUBMITTED EVALUATIONS API ===');
  
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

    console.log('Admin authenticated, fetching submitted evaluations...');

    // Get all completed evaluations
    let evaluations = [];
    
    try {
      // First, get the basic evaluation data
      evaluations = await query(`
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
          ef.title as form_title,
          ef.form_code,
          ef.status as form_status
        FROM student_evaluations se
        LEFT JOIN evaluation_forms ef ON se.form_id = ef.id
        WHERE se.status = 'completed' OR se.status = 'submitted'
        ORDER BY se.submitted_at DESC
      `);
      
      console.log(`Found ${evaluations.length} completed/submitted evaluations`);
      
      // Process evaluations
      for (let i = 0; i < evaluations.length; i++) {
        const item = evaluations[i];
        
        // Get student name and school ID
        if (item.student_id) {
          try {
            const studentResult = await query(
              'SELECT firstname, lastname, middlename, school_id, class_id FROM student_list WHERE id = ?',
              [item.student_id]
            );
            if (studentResult.length > 0) {
              const student = studentResult[0];
              evaluations[i].student_name = `${student.firstname} ${student.lastname}`;
              evaluations[i].student_school_id = student.school_id;
              evaluations[i].student_class_id = student.class_id;
              if (student.middlename) {
                evaluations[i].student_fullname = `${student.firstname} ${student.middlename} ${student.lastname}`;
              }
            }
          } catch (error) {
            console.error(`Error fetching student ${item.student_id}:`, error.message);
            evaluations[i].student_name = `Student ${item.student_id}`;
          }
        }
        
        // Get faculty name and school ID
        if (item.faculty_id) {
          try {
            const facultyResult = await query(
              'SELECT firstname, lastname, middlename, department, school_id FROM faculty_list WHERE id = ?',
              [item.faculty_id]
            );
            if (facultyResult.length > 0) {
              const faculty = facultyResult[0];
              evaluations[i].faculty_name = `${faculty.firstname} ${faculty.lastname}`;
              evaluations[i].faculty_department = faculty.department;
              evaluations[i].faculty_school_id = faculty.school_id;
              if (faculty.middlename) {
                evaluations[i].faculty_fullname = `${faculty.firstname} ${faculty.middlename} ${faculty.lastname}`;
              }
            }
          } catch (error) {
            console.error(`Error fetching faculty ${item.faculty_id}:`, error.message);
            evaluations[i].faculty_name = `Faculty ${item.faculty_id}`;
          }
        }
        
        // Get class information for the student - FIXED COLUMN NAMES
        if (evaluations[i].student_class_id) {
          try {
            // First try with the correct column names
            const classResult = await query(
              'SELECT id, curriculum, level, section, description FROM class_list WHERE id = ?',
              [evaluations[i].student_class_id]
            );
            
            if (classResult.length > 0) {
              const classInfo = classResult[0];
              evaluations[i].class_id = classInfo.id;
              evaluations[i].curriculum = classInfo.curriculum;
              evaluations[i].level = classInfo.level;
              evaluations[i].section = classInfo.section;
              // Create class_name from curriculum, level, section
              evaluations[i].class_name = `${classInfo.curriculum || ''} ${classInfo.level || ''}-${classInfo.section || ''}`.trim();
              evaluations[i].class_description = classInfo.description;
            }
          } catch (error) {
            console.error(`Error fetching class ${evaluations[i].student_class_id}:`, error.message);
          }
        }
        
        // Try to get score from form_responses if available
        try {
          // Check if form_responses table exists
          const [tables] = await query(`SHOW TABLES LIKE 'form_responses'`);
          
          if (tables.length > 0) {
            // Try to get score from form_responses
            const formResponsesResult = await query(`
              SELECT fr.* 
              FROM form_responses fr
              WHERE fr.evaluation_id = ?
            `, [item.id]);
            
            if (formResponsesResult.length > 0) {
              // Check if there's a score field in form_responses
              const firstResponse = formResponsesResult[0];
              
              // Look for any numeric score fields
              const possibleScoreFields = [
                'score', 'total_score', 'final_score', 'rating', 'average_score',
                'overall_score', 'calculated_score', 'percentage'
              ];
              
              let foundScore = 0;
              for (const field of possibleScoreFields) {
                if (firstResponse[field] !== undefined && firstResponse[field] !== null) {
                  const score = parseFloat(firstResponse[field]);
                  if (!isNaN(score)) {
                    foundScore = score;
                    break;
                  }
                }
              }
              
              // If no score found in form_responses, check evaluation_responses
              if (foundScore === 0) {
                // Check if evaluation_responses table exists
                const [evalRespTables] = await query(`SHOW TABLES LIKE 'evaluation_responses'`);
                
                if (evalRespTables.length > 0) {
                  // Try a simpler query without joining to evaluation_questions
                  const evalRespResult = await query(`
                    SELECT er.score
                    FROM evaluation_responses er
                    WHERE er.evaluation_id = ?
                  `, [item.id]);
                  
                  if (evalRespResult.length > 0) {
                    // Calculate average of all responses
                    let totalScore = 0;
                    let validResponses = 0;
                    
                    evalRespResult.forEach(response => {
                      if (response.score !== null && response.score !== undefined) {
                        const score = parseFloat(response.score);
                        if (!isNaN(score)) {
                          totalScore += score;
                          validResponses++;
                        }
                      }
                    });
                    
                    if (validResponses > 0) {
                      foundScore = totalScore / validResponses;
                    }
                  }
                }
              }
              
              if (foundScore > 0) {
                evaluations[i].calculated_score = parseFloat(foundScore.toFixed(2));
                evaluations[i].has_responses = true;
                console.log(`Evaluation ${item.id}: Found score ${foundScore.toFixed(2)} from responses`);
              } else {
                evaluations[i].calculated_score = 0;
                evaluations[i].has_responses = false;
              }
              
              evaluations[i].total_responses = formResponsesResult.length;
            } else {
              evaluations[i].calculated_score = 0;
              evaluations[i].has_responses = false;
              evaluations[i].total_responses = 0;
            }
          } else {
            // form_responses table doesn't exist
            evaluations[i].calculated_score = 0;
            evaluations[i].has_responses = false;
            evaluations[i].total_responses = 0;
          }
        } catch (error) {
          console.error(`Error checking responses for evaluation ${item.id}:`, error.message);
          evaluations[i].calculated_score = 0;
          evaluations[i].has_responses = false;
          evaluations[i].total_responses = 0;
        }
        
        // Use calculated score if available, otherwise use stored score
        let finalScore = 0;
        
        // First check calculated_score
        if (evaluations[i].calculated_score > 0) {
          finalScore = evaluations[i].calculated_score;
        } 
        // Then check the stored score
        else if (item.score && parseFloat(item.score) > 0) {
          finalScore = parseFloat(item.score);
        }
        // If no score found, try to see if faculty dashboard shows scores
        // by checking if there are any responses at all
        else if (evaluations[i].has_responses) {
          // If there are responses but no score calculated, use a default or check another way
          console.log(`Evaluation ${item.id}: Has responses but no score calculated`);
        }
        
        evaluations[i].average_rating = finalScore;
        evaluations[i].score = finalScore;
        evaluations[i].percentage_score = (finalScore / 5) * 100;
        
        // Set date for display
        evaluations[i].date_taken = item.submitted_at || item.completed_at || item.created_at;
        
        // Get subject information - FIXED: removed subject_code reference
        if (item.form_id) {
          try {
            // Try to get subject from evaluation_forms directly
            const subjectResult = await query(`
              SELECT ef.subject_id, s.subject 
              FROM evaluation_forms ef
              LEFT JOIN subject_list s ON ef.subject_id = s.id
              WHERE ef.id = ?
            `, [item.form_id]);
            
            if (subjectResult.length > 0) {
              const subjectData = subjectResult[0];
              // Check if we got subject from join or need to get it another way
              if (subjectData.subject) {
                evaluations[i].subject = subjectData.subject;
              } else if (subjectData.subject_id) {
                // Try to get subject directly
                const directSubjectResult = await query(
                  'SELECT subject FROM subject_list WHERE id = ?',
                  [subjectData.subject_id]
                );
                if (directSubjectResult.length > 0) {
                  evaluations[i].subject = directSubjectResult[0].subject;
                }
              }
            }
          } catch (error) {
            console.error(`Error fetching subject for form ${item.form_id}:`, error.message);
            // Silently ignore - subject is optional
          }
        }
      }
      
      // Log sample data for debugging
      if (evaluations.length > 0) {
        console.log('=== SAMPLE EVALUATION DATA ===');
        const sampleCount = Math.min(3, evaluations.length);
        for (let i = 0; i < sampleCount; i++) {
          console.log(`Evaluation ${i + 1}:`, {
            id: evaluations[i].id,
            student_name: evaluations[i].student_name,
            faculty_name: evaluations[i].faculty_name,
            stored_score: evaluations[i].score,
            calculated_score: evaluations[i].calculated_score,
            average_rating: evaluations[i].average_rating,
            class_name: evaluations[i].class_name,
            has_responses: evaluations[i].has_responses,
            total_responses: evaluations[i].total_responses,
            subject: evaluations[i].subject
          });
        }
        
        // Calculate overall average
        const validScores = evaluations.filter(e => e.average_rating > 0).map(e => e.average_rating);
        if (validScores.length > 0) {
          const overallAverage = validScores.reduce((a, b) => a + b, 0) / validScores.length;
          console.log(`Overall average score: ${overallAverage.toFixed(2)}/5.0 (from ${validScores.length} evaluations with scores)`);
        }
      }
      
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
        : `Found ${evaluations.length} submitted evaluation${evaluations.length !== 1 ? 's' : ''}`
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