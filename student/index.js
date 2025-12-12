import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (req.query.countOnly) {
      const classes = await query(`
        SELECT COUNT(*) as count FROM class_list WHERE is_active = TRUE
      `);

      return res.status(200).json({
        success: true,
        data: classes,
        count: classes[0]?.count || 0
      });
    }

    const classes = await query(`
      SELECT id, curriculum, level, section, description, academic_year
      FROM class_list 
      WHERE is_active = TRUE
      ORDER BY curriculum, level, section
    `);

    res.status(200).json(classes);

  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ message: 'Failed to fetch classes' });
  }
}