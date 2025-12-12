// src/pages/api/faculty/list.js - SIMPLE VERSION
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  console.log('=== SIMPLE FACULTY LIST API ===');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Verify authentication
    const token = req.headers.authorization?.split(' ')[1];
    const auth = verifyToken(token);
    
    if (!auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const isAdmin = auth.user_type === 1 || auth.userType === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    console.log('Admin authenticated, fetching simple faculty list...');

    // Get all faculty members - simple query
    const faculty = await query(`
      SELECT 
        id,
        school_id,
        firstname,
        lastname,
        middlename,
        email,
        department,
        designation,
        contact_number,
        address,
        is_active,
        date_created,
        date_updated
      FROM faculty_list 
      ORDER BY lastname, firstname
    `);
    
    console.log(`✅ Found ${faculty.length} faculty members in simple query`);
    
    res.status(200).json(faculty);

  } catch (error) {
    console.error('❌ Error in simple faculty list API:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch faculty data',
      error: error.message 
    });
  }
}