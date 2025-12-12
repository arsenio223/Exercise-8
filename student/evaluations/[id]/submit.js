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
  const { id } = req.query;
  
  console.log('📤 Submit evaluation API called for ID:', id);
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  let connection;
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

    const { responses, feedback } = req.body;
    
    if (!responses || !Array.isArray(responses)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid responses data' 
      });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    try {
      // 1. Verify evaluation exists
      const [evaluations] = await connection.execute(`
        SELECT 
          se.id,
          se.status,
          se.form_id,
          se.faculty_id,
          se.student_id,
          se.due_date
        FROM student_evaluations se
        WHERE se.id = ?
        AND se.student_id = ?
        FOR UPDATE
      `, [id, decoded.id]);

      if (evaluations.length === 0) {
        await connection.rollback();
        return res.status(404).json({ 
          success: false, 
          message: 'Evaluation not found' 
        });
      }

      const evaluation = evaluations[0];

      // 2. Check if already submitted
      if (evaluation.status === 'completed') {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          message: 'Evaluation already submitted' 
        });
      }

      // 3. Check if expired
      if (new Date(evaluation.due_date) < new Date()) {
        await connection.rollback();
        return res.status(400).json({ 
          success: false, 
          message: 'Evaluation deadline has passed' 
        });
      }

      // 4. Insert responses
      console.log(`💾 Saving ${responses.length} responses...`);
      
      for (const response of responses) {
        await connection.execute(`
          INSERT INTO evaluation_responses 
          (student_evaluation_id, question_id, response_value, rating, submitted_at)
          VALUES (?, ?, ?, ?, NOW())
          ON DUPLICATE KEY UPDATE
            response_value = VALUES(response_value),
            rating = VALUES(rating),
            submitted_at = NOW()
        `, [
          id,
          response.question_id,
          response.value,
          response.question_type === 'rating_1_5' ? parseInt(response.value) : null
        ]);
      }

      // 5. Calculate average score for rating questions
      const ratingQuestions = responses.filter(r => 
        r.question_type === 'rating_1_5' && !isNaN(parseInt(r.value))
      );
      
      let averageScore = null;
      if (ratingQuestions.length > 0) {
        const sum = ratingQuestions.reduce((acc, r) => acc + parseInt(r.value), 0);
        averageScore = (sum / ratingQuestions.length).toFixed(2);
      }

      // 6. Update evaluation status
      await connection.execute(`
        UPDATE student_evaluations 
        SET 
          status = 'completed',
          submitted_at = NOW(),
          completed_at = NOW(),
          score = ?,
          feedback = ?
        WHERE id = ?
      `, [averageScore, feedback || null, id]);

      await connection.commit();
      
      console.log(`✅ Evaluation ${id} submitted successfully`);

      return res.status(200).json({ 
        success: true,
        message: 'Evaluation submitted successfully',
        data: {
          evaluation_id: id,
          submitted_at: new Date().toISOString(),
          score: averageScore,
          total_questions: responses.length
        }
      });

    } catch (error) {
      await connection.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Error submitting evaluation:', error);
    
    return res.status(500).json({ 
      success: false, 
      message: 'Error submitting evaluation',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}