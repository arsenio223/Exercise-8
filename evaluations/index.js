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

    const evaluations = await query(`
      SELECT COUNT(*) as count FROM evaluation_list WHERE status = 'submitted'
    `);

    res.status(200).json({
      success: true,
      data: evaluations,
      count: evaluations[0]?.count || 0
    });

  } catch (error) {
    console.error('Error fetching evaluations:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch evaluations data' });
  }
}