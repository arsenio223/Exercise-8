import { supabase } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { faculty_id, class_id } = req.query;

    if (!faculty_id || !class_id) {
      return res.status(400).json({ 
        message: 'Faculty ID and Class ID are required' 
      });
    }

    // Verify admin access
    // Add your auth verification logic here

    // Get active evaluation form
    const { data: evalForms, error: formError } = await supabase
      .from('evaluation_forms')
      .select('id')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (formError) {
      throw formError;
    }

    if (!evalForms || evalForms.length === 0) {
      return res.status(404).json({ 
        success: false, 
        message: 'No active evaluation form found' 
      });
    }

    const evaluationFormId = evalForms[0].id;

    // Get all responses for this faculty and class
    const { data: responses, error: responseError } = await supabase
      .from('evaluation_responses')
      .select('*')
      .eq('faculty_id', faculty_id)
      .eq('class_id', class_id)
      .eq('evaluation_form_id', evaluationFormId);

    if (responseError) {
      throw responseError;
    }

    // Get total students in this class
    const { data: classStudents, error: studentError } = await supabase
      .from('class_students')
      .select('student_id')
      .eq('class_id', class_id);

    if (studentError) {
      throw studentError;
    }

    const totalStudents = classStudents?.length || 0;
    const evaluatedStudents = responses?.length || 0;

    // Get evaluation criteria and questions
    const { data: evaluationForm, error: formDetailError } = await supabase
      .from('evaluation_forms')
      .select(`
        id,
        title,
        criteria:evaluation_criteria (
          id,
          criteria,
          order_by,
          questions:evaluation_questions (
            id,
            question,
            order_by
          )
        )
      `)
      .eq('id', evaluationFormId)
      .single();

    if (formDetailError) {
      throw formDetailError;
    }

    // Process responses to get rating counts
    let allCriteriaData = [];
    let totalOverallPoints = 0;
    let totalPossiblePoints = 0;

    if (evaluationForm.criteria && responses && responses.length > 0) {
      evaluationForm.criteria.forEach(criterion => {
        const criteriaData = {
          id: criterion.id,
          criteria: criterion.criteria,
          questions: [],
          total_points: 0
        };

        if (criterion.questions) {
          criterion.questions.forEach(question => {
            const questionData = {
              id: question.id,
              question: question.question,
              rating_1: 0,
              rating_2: 0,
              rating_3: 0,
              rating_4: 0,
              rating_5: 0,
              total_points: 0
            };

            // Count ratings for this question
            responses.forEach(response => {
              if (response.responses && Array.isArray(response.responses)) {
                response.responses.forEach(resp => {
                  if (resp.question_id === question.id && resp.rating) {
                    const rating = parseInt(resp.rating);
                    if (rating >= 1 && rating <= 5) {
                      questionData[`rating_${rating}`] += 1;
                      questionData.total_points += rating;
                      criteriaData.total_points += rating;
                      totalOverallPoints += rating;
                    }
                  }
                });
              }
            });

            totalPossiblePoints += (evaluatedStudents * 5); // Max 5 points per student per question
            criteriaData.questions.push(questionData);
          });
        }

        allCriteriaData.push(criteriaData);
      });
    }

    // Calculate average percentage
    const averagePercentage = totalPossiblePoints > 0 
      ? (totalOverallPoints / totalPossiblePoints) * 100 
      : 0;

    // Calculate overall rating (out of 5)
    const overallRating = evaluatedStudents > 0 && evaluationForm.criteria?.length > 0
      ? totalOverallPoints / (evaluatedStudents * evaluationForm.criteria.reduce((sum, c) => 
          sum + (c.questions?.length || 0), 0))
      : 0;

    // Generate recommendations based on rating
    let recommendations = '';
    if (overallRating >= 4.5) {
      recommendations = 'Excellent performance. Consider this faculty for recognition or awards.';
    } else if (overallRating >= 4.0) {
      recommendations = 'Very good performance. Continue current teaching methods.';
    } else if (overallRating >= 3.5) {
      recommendations = 'Good performance. Some areas may need minor improvements.';
    } else if (overallRating >= 3.0) {
      recommendations = 'Satisfactory performance. Consider additional training or mentoring.';
    } else {
      recommendations = 'Performance needs improvement. Schedule a meeting to discuss areas for development.';
    }

    res.status(200).json({
      success: true,
      data: {
        faculty_id,
        class_id,
        total_students: totalStudents,
        evaluated_students: evaluatedStudents,
        response_rate: totalStudents > 0 ? ((evaluatedStudents / totalStudents) * 100).toFixed(2) + '%' : '0%',
        criteria: allCriteriaData,
        average_percentage: averagePercentage,
        overall_rating: overallRating,
        recommendations
      }
    });

  } catch (error) {
    console.error('Error generating report:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
}