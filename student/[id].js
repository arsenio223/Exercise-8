// pages/api/students/[id].js
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  const { id } = req.query;
  
  console.log('📞 Student DELETE API called:', {
    method: req.method,
    id: id,
    url: req.url,
    headers: req.headers
  });
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
    return res.status(200).end();
  }
  
  if (req.method === 'DELETE') {
    try {
      console.log('🗑️ Deleting student ID:', id);
      
      // Check authorization
      const token = req.headers.authorization?.split(' ')[1];
      console.log('🔑 Token received:', token ? 'Yes' : 'No');
      
      const decoded = verifyToken(token);
      
      if (!decoded) {
        console.log('❌ Invalid or missing token');
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized: Invalid or missing token' 
        });
      }

      if (!id || isNaN(parseInt(id))) {
        return res.status(400).json({ 
          success: false, 
          message: 'Valid student ID is required' 
        });
      }

      const studentId = parseInt(id);

      // DEBUG: Check before delete
      console.log('🔍 Checking student before delete...');
      const beforeDelete = await query(
        `SELECT id, school_id, firstname, lastname, is_active FROM student_list WHERE id = ?`,
        [studentId]
      );
      console.log('Before delete:', beforeDelete[0]);

      if (beforeDelete.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Student not found' 
        });
      }

      // Check if already inactive
      if (beforeDelete[0].is_active === 0) {
        console.log('⚠️ Student already inactive');
        return res.status(400).json({ 
          success: false, 
          message: 'Student is already deleted' 
        });
      }

      // Soft delete - set is_active to 0 (FALSE)
      console.log('🔄 Updating is_active to 0...');
      const result = await query(
        `UPDATE student_list SET is_active = 0 WHERE id = ?`,
        [studentId]
      );

      console.log('✅ Update result:', result);
      console.log('📊 Affected rows:', result.affectedRows);

      // DEBUG: Check after delete
      console.log('🔍 Checking student after delete...');
      const afterDelete = await query(
        `SELECT id, school_id, firstname, lastname, is_active FROM student_list WHERE id = ?`,
        [studentId]
      );
      console.log('After delete:', afterDelete[0]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'No student was updated' 
        });
      }

      console.log('✅ Student soft deleted successfully, ID:', id);

      res.status(200).json({ 
        success: true, 
        message: 'Student deleted successfully',
        data: {
          id: studentId,
          before: beforeDelete[0],
          after: afterDelete[0]
        }
      });
      
    } catch (error) {
      console.error('❌ Error deleting student:', error);
      console.error('❌ Error stack:', error.stack);
      res.status(500).json({ 
        success: false, 
        message: 'Error deleting student: ' + error.message,
        errorDetails: error
      });
    }
  } else {
    res.status(405).json({ 
      success: false, 
      message: `Method ${req.method} not allowed. Use DELETE.` 
    });
  }
}