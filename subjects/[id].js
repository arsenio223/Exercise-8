import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // Check if user is admin
  if (decoded.userType !== 'admin' && decoded.user_type !== 1) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }

  const { id } = req.query;

  try {
    switch (req.method) {
      case 'DELETE':
        // Soft delete - set is_active to false
        await query(
          'UPDATE subject_list SET is_active = FALSE WHERE id = ?',
          [id]
        );
        
        return res.status(200).json({ 
          success: true, 
          message: 'Subject deleted successfully' 
        });

      case 'PUT':
        const { code, subject, description, units, subject_type } = req.body;
        
        // Check if subject exists
        const existingSubject = await query(
          'SELECT * FROM subject_list WHERE id = ?',
          [id]
        );
        
        if (existingSubject.length === 0) {
          return res.status(404).json({ 
            success: false, 
            message: 'Subject not found' 
          });
        }

        // Check if new code conflicts with other subjects
        if (code && code !== existingSubject[0].code) {
          const codeExists = await query(
            'SELECT id FROM subject_list WHERE code = ? AND id != ?',
            [code, id]
          );
          
          if (codeExists.length > 0) {
            return res.status(409).json({ 
              success: false, 
              message: 'Subject code already exists' 
            });
          }
        }

        // Update subject
        await query(
          `UPDATE subject_list 
           SET code = ?, subject = ?, description = ?, units = ?, subject_type = ?
           WHERE id = ?`,
          [
            code || existingSubject[0].code,
            subject || existingSubject[0].subject,
            description || existingSubject[0].description,
            units ? parseFloat(units) : existingSubject[0].units,
            subject_type || existingSubject[0].subject_type,
            id
          ]
        );

        // Get updated subject
        const updatedSubject = await query(
          'SELECT * FROM subject_list WHERE id = ?',
          [id]
        );

        return res.status(200).json({ 
          success: true, 
          message: 'Subject updated successfully',
          data: updatedSubject[0]
        });

      default:
        res.setHeader('Allow', ['DELETE', 'PUT']);
        return res.status(405).json({ 
          success: false, 
          message: `Method ${req.method} not allowed` 
        });
    }
  } catch (error) {
    console.error('API Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: error.message 
    });
  }
}