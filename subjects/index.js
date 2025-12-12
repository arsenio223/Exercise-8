import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  // Verify token for all methods
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  // Check if user is admin for POST, PUT, DELETE
  if (req.method !== 'GET') {
    if (decoded.userType !== 'admin' && decoded.user_type !== 1) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }
  }

  try {
    switch (req.method) {
      case 'GET':
        const subjects = await query(`
          SELECT 
            id,
            code,
            subject,
            description,
            units,
            subject_type,
            date_created
          FROM subject_list 
          WHERE is_active = TRUE
          ORDER BY code
        `);
        return res.status(200).json({ success: true, data: subjects });

      case 'POST':
        const { code, subject, description, units, subject_type } = req.body;
        
        // Validate required fields
        if (!code || !subject) {
          return res.status(400).json({ 
            success: false, 
            message: 'Subject code and name are required' 
          });
        }

        // Check if subject code already exists
        const existing = await query(
          'SELECT id FROM subject_list WHERE code = ?',
          [code]
        );

        if (existing.length > 0) {
          return res.status(409).json({ 
            success: false, 
            message: 'Subject code already exists' 
          });
        }

        // Insert new subject
        const result = await query(
          `INSERT INTO subject_list (code, subject, description, units, subject_type) 
           VALUES (?, ?, ?, ?, ?)`,
          [code, subject, description || '', parseFloat(units) || 3.0, subject_type || 'Lecture']
        );

        // Get the inserted subject
        const newSubject = await query(
          'SELECT * FROM subject_list WHERE id = ?',
          [result.insertId]
        );

        return res.status(201).json({ 
          success: true, 
          message: 'Subject created successfully',
          data: newSubject[0]
        });

      default:
        res.setHeader('Allow', ['GET', 'POST']);
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