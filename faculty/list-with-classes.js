// src/pages/api/faculty/list-with-classes.js
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  console.log('=== FACULTY LIST WITH CLASSES API ===');
  
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

    console.log('Admin authenticated, fetching faculty with classes...');

    let faculty = [];
    
    try {
      // Get all faculty members
      faculty = await query(`
        SELECT 
          f.id,
          f.school_id,
          f.firstname,
          f.lastname,
          f.middlename,
          f.email,
          f.designation,
          f.contact_number,
          f.address,
          f.is_active,
          f.date_created,
          f.date_updated
        FROM faculty_list f
        ORDER BY f.lastname, f.firstname
      `);
      
      console.log(`✅ Found ${faculty.length} faculty members in database`);
      
      // For each faculty member, get their classes
      for (let i = 0; i < faculty.length; i++) {
        const fac = faculty[i];
        
        try {
          // Get classes taught by this faculty from faculty_classes table
          const classes = await query(`
            SELECT 
              c.id,
              c.curriculum,
              c.level,
              c.section,
              c.description,
              c.academic_year
            FROM faculty_classes fc
            JOIN class_list c ON fc.class_id = c.id
            WHERE fc.faculty_id = ? AND fc.status = 'active'
            ORDER BY c.curriculum, c.level, c.section
          `, [fac.id]);
          
          // Format classes information
          if (classes && classes.length > 0) {
            // Create a readable string of classes
            const classStrings = classes.map(cls => 
              `${cls.curriculum} Yr${cls.level}-${cls.section}`
            );
            
            faculty[i].classes_handled = classStrings.join(', ');
            faculty[i].classes_count = classes.length;
            faculty[i].classes_list = classes;
            
            // Get unique curriculums
            const curriculums = [...new Set(classes.map(cls => cls.curriculum))];
            faculty[i].curriculums_taught = curriculums.join(', ');
          } else {
            faculty[i].classes_handled = 'No classes assigned';
            faculty[i].classes_count = 0;
            faculty[i].classes_list = [];
            faculty[i].curriculums_taught = 'None';
          }
        } catch (classError) {
          console.error(`Error getting classes for faculty ${fac.id}:`, classError.message);
          faculty[i].classes_handled = 'No classes assigned';
          faculty[i].classes_count = 0;
          faculty[i].classes_list = [];
          faculty[i].curriculums_taught = 'None';
        }
      }
      
    } catch (error) {
      console.error('❌ Main database error:', error.message);
      faculty = [];
    }

    console.log(`📊 Returning ${faculty.length} faculty members to admin`);
    
    res.status(200).json(faculty);

  } catch (error) {
    console.error('❌ Error in faculty list with classes API:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch faculty data',
      error: error.message 
    });
  }
}