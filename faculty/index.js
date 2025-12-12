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

    const faculty = await query(`
      SELECT COUNT(*) as count FROM faculty_list WHERE is_active = TRUE
    `);

    res.status(200).json({
      success: true,
      data: faculty,
      count: faculty[0]?.count || 0
    });

  } catch (error) {
    console.error('Error fetching faculty:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch faculty data' });
  }
}