// src/pages/api/student/list.js
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  console.log('=== STUDENT LIST API ===');
  
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

    console.log('Admin authenticated, fetching ACTIVE students with class info...');

    // Get all ACTIVE students with their class information
    let students = [];
    
    try {
      // Query to join student_list with class_list to get class level
      // CRITICAL: Added WHERE s.is_active = 1 to filter out deleted students
      students = await query(`
        SELECT 
          s.id,
          s.school_id,
          s.firstname,
          s.lastname,
          s.middlename,
          s.email,
          s.class_id,
          s.year_level as student_year_level,
          s.is_active,
          s.date_created,
          s.date_updated,
          c.curriculum as class_curriculum,
          c.level as class_level,
          c.section as class_section,
          c.description as class_description,
          c.academic_year as class_academic_year,
          CONCAT(c.curriculum, ' - Year ', c.level, ' - Section ', c.section) as class_name
        FROM student_list s
        LEFT JOIN class_list c ON s.class_id = c.id
        WHERE s.is_active = 1  -- ⭐️⭐️⭐️ THIS IS THE FIX! ⭐️⭐️⭐️
        ORDER BY s.lastname, s.firstname
      `);
      
      console.log(`✅ Found ${students.length} ACTIVE students`);
      
      // Debug: Check total vs active count
      const stats = await query(`
        SELECT 
          COUNT(*) as total_students,
          SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_students,
          SUM(CASE WHEN is_active = 0 THEN 1 ELSE 0 END) as inactive_students
        FROM student_list
      `);
      
      console.log('📊 Student Statistics:', stats[0]);
      
    } catch (error) {
      console.error('❌ Database error:', error.message);
      students = [];
    }

    console.log(`📊 Returning ${students.length} ACTIVE students to admin`);

    res.status(200).json(students);

  } catch (error) {
    console.error('❌ Error in student list API:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch students data',
      error: error.message 
    });
  }
}