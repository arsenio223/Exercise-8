// src/pages/api/admin/evaluations/[id].js
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  const { id } = req.query;
  
  console.log('=== ADMIN DELETE EVALUATION API ===');
  console.log('Evaluation ID:', id);
  console.log('Method:', req.method);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method === 'DELETE') {
    try {
      // Check authorization
      const token = req.headers.authorization?.split(' ')[1];
      const auth = verifyToken(token);
      
      if (!auth) {
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }
      
      const isAdmin = auth.user_type === 1 || auth.userType === 'admin';
      if (!isAdmin) {
        return res.status(403).json({ 
          success: false, 
          message: 'Admin access required' 
        });
      }

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ 
          success: false, 
          message: 'Valid evaluation ID is required' 
        });
      }

      const evaluationId = parseInt(id);
      console.log('Deleting evaluation ID:', evaluationId);

      // Check if evaluation exists in student_evaluations table
      const evaluation = await query(
        `SELECT id, student_id, faculty_id, form_id, status 
         FROM student_evaluations 
         WHERE id = ?`,
        [evaluationId]
      );

      if (evaluation.length === 0) {
        console.log('❌ Evaluation not found in student_evaluations table');
        return res.status(404).json({ 
          success: false, 
          message: 'Evaluation not found' 
        });
      }

      console.log('✅ Evaluation found:', evaluation[0]);

      // Delete the evaluation from student_evaluations table
      console.log('🗑️ Deleting from student_evaluations...');
      const result = await query(
        `DELETE FROM student_evaluations WHERE id = ?`,
        [evaluationId]
      );

      console.log('✅ Delete result:', result);
      console.log('📊 Affected rows:', result.affectedRows);

      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'No evaluation was deleted' 
        });
      }

      console.log('✅ Evaluation deleted successfully');

      res.status(200).json({ 
        success: true, 
        message: 'Evaluation deleted successfully',
        data: {
          id: evaluationId,
          deleted_evaluation: evaluation[0]
        }
      });
      
    } catch (error) {
      console.error('❌ Error deleting evaluation:', error);
      console.error('❌ Error stack:', error.stack);
      res.status(500).json({ 
        success: false, 
        message: 'Error deleting evaluation: ' + error.message,
        errorDetails: process.env.NODE_ENV === 'development' ? error.message : undefined
      });
    }
  } else {
    res.status(405).json({ 
      success: false, 
      message: `Method ${req.method} not allowed. Use DELETE.` 
    });
  }
}