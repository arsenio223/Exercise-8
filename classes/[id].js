// pages/api/classes/[id].js
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  const { id } = req.query;
  
  console.log('📞 Class DELETE API called:', {
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
      console.log('🗑️ Deleting class ID:', id);
      
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
          message: 'Valid class ID is required' 
        });
      }

      const classId = parseInt(id);

      // DEBUG: Check before delete
      console.log('🔍 Checking class before delete...');
      const beforeDelete = await query(
        `SELECT id, curriculum, level, section, is_active FROM class_list WHERE id = ?`,
        [classId]
      );
      console.log('Before delete:', beforeDelete[0]);

      if (beforeDelete.length === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'Class not found' 
        });
      }

      // Check if already inactive
      if (beforeDelete[0].is_active === 0) {
        console.log('⚠️ Class already inactive');
        return res.status(400).json({ 
          success: false, 
          message: 'Class is already deleted' 
        });
      }

      // Check if class has students assigned (optional safety check)
      const hasStudents = await query(
        `SELECT COUNT(*) as count FROM student_list WHERE class_id = ? AND is_active = 1`,
        [classId]
      );

      if (hasStudents[0]?.count > 0) {
        console.log('⚠️ Class has students:', hasStudents[0].count);
        return res.status(400).json({ 
          success: false, 
          message: `Cannot delete class with ${hasStudents[0].count} assigned student(s). Remove students first.` 
        });
      }

      // Soft delete - set is_active to 0 (FALSE)
      console.log('🔄 Updating is_active to 0...');
      const result = await query(
        `UPDATE class_list SET is_active = 0 WHERE id = ?`,
        [classId]
      );

      console.log('✅ Update result:', result);
      console.log('📊 Affected rows:', result.affectedRows);

      // DEBUG: Check after delete
      console.log('🔍 Checking class after delete...');
      const afterDelete = await query(
        `SELECT id, curriculum, level, section, is_active FROM class_list WHERE id = ?`,
        [classId]
      );
      console.log('After delete:', afterDelete[0]);

      if (result.affectedRows === 0) {
        return res.status(404).json({ 
          success: false, 
          message: 'No class was updated' 
        });
      }

      console.log('✅ Class soft deleted successfully, ID:', id);

      res.status(200).json({ 
        success: true, 
        message: 'Class deleted successfully',
        data: {
          id: classId,
          before: beforeDelete[0],
          after: afterDelete[0]
        }
      });
      
    } catch (error) {
      console.error('❌ Error deleting class:', error);
      console.error('❌ Error stack:', error.stack);
      res.status(500).json({ 
        success: false, 
        message: 'Error deleting class: ' + error.message,
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