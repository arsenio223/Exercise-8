// /pages/api/faculty/classes.js
import { verifyToken } from '@/lib/auth';
import { query } from '@/lib/db';

export default async function handler(req, res) {
  console.log('=== FACULTY CLASSES API CALLED ===');
  
  if (req.method !== 'GET') {
    return res.status(405).json({ 
      success: false, 
      message: 'Method not allowed' 
    });
  }

  try {
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded) {
      console.log('❌ Token verification failed');
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized - Invalid token' 
      });
    }

    const { facultyId } = req.query;
    
    if (!facultyId) {
      console.log('❌ No facultyId provided');
      return res.status(400).json({ 
        success: false, 
        message: 'Faculty ID is required' 
      });
    }

    console.log('Requested facultyId:', facultyId);

    // ==================== AUTHORIZATION CHECK ====================
    const isFaculty = decoded.userType === 'faculty' || 
                      decoded.user_type === 2 || 
                      decoded.user_type === 'faculty' ||
                      decoded.foundInTable === 'faculty_list';

    if (!isFaculty) {
      console.log('❌ User is not faculty');
      return res.status(403).json({ 
        success: false, 
        message: 'Access denied - Faculty authorization required' 
      });
    }

    console.log('✅ Authorization passed');
    console.log(`📊 Fetching classes for faculty ID: ${facultyId}`);

    // ==================== METHOD 1: CHECK FACULTY_CLASSES TABLE ====================
    console.log('🔍 Method 1: Checking faculty_classes table...');
    let assignedClasses = [];
    
    try {
      assignedClasses = await query(`
        SELECT DISTINCT
          c.id as class_id,
          c.curriculum,
          c.level,
          c.section,
          c.academic_year,
          c.description,
          c.semester,
          CONCAT(c.curriculum, ' - Year ', c.level, ' - Section ', c.section) as class_name,
          0 as evaluation_count,
          0 as evaluated_students,
          NULL as last_evaluation_date,
          NULL as average_score
        FROM faculty_classes fc
        JOIN class_list c ON fc.class_id = c.id
        WHERE fc.faculty_id = ? 
        ORDER BY c.level, c.section, c.curriculum
      `, [facultyId]);
      
      console.log(`✅ faculty_classes: ${assignedClasses.length} classes`);
    } catch (error) {
      console.error('❌ Error checking faculty_classes:', error.message);
    }

    // ==================== METHOD 2: CHECK FACULTY_SUBJECTS TABLE ====================
    console.log('🔍 Method 2: Checking faculty_subjects table...');
    let subjectClasses = [];
    
    try {
      // Try to get column info first by checking if table exists and has common columns
      subjectClasses = await query(`
        SELECT DISTINCT
          c.id as class_id,
          c.curriculum,
          c.level,
          c.section,
          c.academic_year,
          c.description,
          c.semester,
          CONCAT(c.curriculum, ' - Year ', c.level, ' - Section ', c.section) as class_name,
          0 as evaluation_count,
          0 as evaluated_students,
          NULL as last_evaluation_date,
          NULL as average_score
        FROM faculty_subjects fs
        JOIN class_list c ON fs.class_id = c.id
        WHERE fs.faculty_id = ? 
        ORDER BY c.level, c.section, c.curriculum
      `, [facultyId]);
      
      console.log(`✅ faculty_subjects: ${subjectClasses.length} classes`);
    } catch (error) {
      console.error('❌ Error checking faculty_subjects (simple query):', error.message);
      
      // If simple query fails, try with LEFT JOIN instead of assuming subject_list exists
      try {
        subjectClasses = await query(`
          SELECT DISTINCT
            c.id as class_id,
            c.curriculum,
            c.level,
            c.section,
            c.academic_year,
            c.description,
            c.semester,
            CONCAT(c.curriculum, ' - Year ', c.level, ' - Section ', c.section) as class_name,
            0 as evaluation_count,
            0 as evaluated_students,
            NULL as last_evaluation_date,
            NULL as average_score
          FROM faculty_subjects fs
          JOIN class_list c ON fs.class_id = c.id
          WHERE fs.faculty_id = ? 
          ORDER BY c.level, c.section, c.curriculum
        `, [facultyId]);
        
        console.log(`✅ faculty_subjects (fallback): ${subjectClasses.length} classes`);
      } catch (error2) {
        console.error('❌ Fallback query also failed:', error2.message);
      }
    }

    // ==================== METHOD 3: CHECK EVALUATION FORM ASSIGNMENTS ====================
    console.log('🔍 Method 3: Checking evaluation form assignments...');
    let formClasses = [];
    
    try {
      formClasses = await query(`
        SELECT DISTINCT
          c.id as class_id,
          c.curriculum,
          c.level,
          c.section,
          c.academic_year,
          c.description,
          c.semester,
          CONCAT(c.curriculum, ' - Year ', c.level, ' - Section ', c.section) as class_name,
          0 as evaluation_count,
          0 as evaluated_students,
          NULL as last_evaluation_date,
          NULL as average_score
        FROM form_assignments fa
        JOIN class_list c ON fa.class_id = c.id
        WHERE fa.faculty_id = ? 
        ORDER BY c.level, c.section, c.curriculum
      `, [facultyId]);
      
      console.log(`✅ form_assignments: ${formClasses.length} classes`);
    } catch (error) {
      console.error('❌ Error checking form_assignments:', error.message);
      
      // Try alternative if fa.faculty_id doesn't exist
      try {
        formClasses = await query(`
          SELECT DISTINCT
            c.id as class_id,
            c.curriculum,
            c.level,
            c.section,
            c.academic_year,
            c.description,
            c.semester,
            CONCAT(c.curriculum, ' - Year ', c.level, ' - Section ', c.section) as class_name,
            0 as evaluation_count,
            0 as evaluated_students,
            NULL as last_evaluation_date,
            NULL as average_score
          FROM form_assignments fa
          JOIN evaluation_forms ef ON fa.form_id = ef.id
          JOIN class_list c ON fa.class_id = c.id
          WHERE ef.faculty_id = ? 
          ORDER BY c.level, c.section, c.curriculum
        `, [facultyId]);
        
        console.log(`✅ form_assignments (alternative): ${formClasses.length} classes`);
      } catch (error2) {
        console.error('❌ Alternative form_assignments query failed:', error2.message);
      }
    }

    // ==================== METHOD 4: CHECK STUDENT EVALUATIONS (indirect) ====================
    console.log('🔍 Method 4: Checking student evaluations...');
    let evalClasses = [];
    
    try {
      evalClasses = await query(`
        SELECT DISTINCT
          c.id as class_id,
          c.curriculum,
          c.level,
          c.section,
          c.academic_year,
          c.description,
          c.semester,
          CONCAT(c.curriculum, ' - Year ', c.level, ' - Section ', c.section) as class_name,
          COUNT(DISTINCT se.id) as evaluation_count,
          COUNT(DISTINCT se.student_id) as evaluated_students,
          MAX(se.submitted_at) as last_evaluation_date,
          AVG(CASE WHEN se.score IS NOT NULL THEN se.score ELSE NULL END) as average_score
        FROM student_evaluations se
        JOIN student_list s ON se.student_id = s.id
        JOIN class_list c ON s.class_id = c.id
        WHERE se.faculty_id = ? 
          AND se.status = 'completed'
        GROUP BY c.id, c.curriculum, c.level, c.section, 
                 c.academic_year, c.description, c.semester
        ORDER BY c.level, c.section, c.curriculum
      `, [facultyId]);
      
      console.log(`✅ student_evaluations: ${evalClasses.length} classes`);
    } catch (error) {
      console.error('❌ Error checking student_evaluations:', error.message);
      
      // Try without status check
      try {
        evalClasses = await query(`
          SELECT DISTINCT
            c.id as class_id,
            c.curriculum,
            c.level,
            c.section,
            c.academic_year,
            c.description,
            c.semester,
            CONCAT(c.curriculum, ' - Year ', c.level, ' - Section ', c.section) as class_name,
            COUNT(DISTINCT se.id) as evaluation_count,
            COUNT(DISTINCT se.student_id) as evaluated_students,
            MAX(se.submitted_at) as last_evaluation_date,
            AVG(CASE WHEN se.score IS NOT NULL THEN se.score ELSE NULL END) as average_score
          FROM student_evaluations se
          JOIN student_list s ON se.student_id = s.id
          JOIN class_list c ON s.class_id = c.id
          WHERE se.faculty_id = ? 
          GROUP BY c.id, c.curriculum, c.level, c.section, 
                   c.academic_year, c.description, c.semester
          ORDER BY c.level, c.section, c.curriculum
        `, [facultyId]);
        
        console.log(`✅ student_evaluations (without status): ${evalClasses.length} classes`);
      } catch (error2) {
        console.error('❌ Fallback student_evaluations query failed:', error2.message);
      }
    }

    // ==================== COMBINE ALL CLASSES ====================
    console.log('🔧 Combining all classes from all sources...');
    
    const allClasses = [];
    const processedClassIds = new Set();
    
    // Combine classes from ALL sources
    const allSources = [
      ...assignedClasses,
      ...subjectClasses,
      ...formClasses,
      ...evalClasses
    ];
    
    allSources.forEach(cls => {
      if (!processedClassIds.has(cls.class_id)) {
        processedClassIds.add(cls.class_id);
        
        // Determine source
        let source = 'unknown';
        let hasEvaluations = false;
        
        if (cls.evaluation_count > 0) {
          source = 'evaluations';
          hasEvaluations = true;
        } else {
          source = 'assigned';
        }
        
        allClasses.push({
          id: cls.class_id,
          class_id: cls.class_id,
          class_name: cls.class_name || `${cls.curriculum || ''} ${cls.level || ''} ${cls.section || ''}`.trim(),
          curriculum: cls.curriculum,
          level: cls.level,
          section: cls.section,
          academic_year: cls.academic_year,
          description: cls.description || 'Assigned class',
          semester: cls.semester,
          is_officially_assigned: true,
          source: source,
          enrolled_students: 0, // Will be updated
          evaluated_students: cls.evaluated_students || 0,
          evaluation_count: cls.evaluation_count || 0,
          average_score: cls.average_score ? parseFloat(cls.average_score).toFixed(2) : null,
          last_evaluation_date: cls.last_evaluation_date,
          has_evaluations: hasEvaluations,
          completion_rate: 0
        });
      }
    });

    // ==================== GET ENROLLED STUDENT COUNTS ====================
    console.log('👥 Getting enrolled student counts...');
    
    if (allClasses.length > 0) {
      const classIds = allClasses.map(cls => cls.class_id);
      
      console.log('Class IDs to check:', classIds);
      
      try {
        // Get enrolled student counts for each class
        if (classIds.length > 0) {
          // Handle array parameters properly
          const placeholders = classIds.map(() => '?').join(',');
          const enrolledCounts = await query(`
            SELECT 
              class_id,
              COUNT(*) as enrolled_students
            FROM student_list
            WHERE class_id IN (${placeholders})
              AND (is_active = 1 OR is_active IS NULL)
            GROUP BY class_id
          `, classIds);
          
          console.log('✅ Enrolled counts query result:', enrolledCounts);
          
          // Update classes with enrolled student counts
          const enrolledMap = {};
          enrolledCounts.forEach(item => {
            enrolledMap[item.class_id] = item.enrolled_students;
          });
          
          allClasses.forEach(cls => {
            if (enrolledMap[cls.class_id]) {
              cls.enrolled_students = enrolledMap[cls.class_id];
              if (cls.enrolled_students > 0) {
                cls.completion_rate = (cls.evaluated_students / cls.enrolled_students) * 100;
              }
            } else {
              cls.enrolled_students = 0;
              cls.completion_rate = 0;
            }
          });
        }
      } catch (error) {
        console.error('❌ Error getting enrolled counts:', error.message);
        allClasses.forEach(cls => {
          cls.enrolled_students = 0;
          cls.completion_rate = 0;
        });
      }
    }

    // ==================== LOG RESULTS ====================
    console.log(`📊 Final result: ${allClasses.length} total classes from all sources`);

    // ==================== RETURN RESPONSE ====================
    console.log(`✅ Returning ${allClasses.length} classes`);
    
    res.status(200).json({
      success: true,
      data: allClasses,
      summary: {
        total_classes: allClasses.length,
        officially_assigned: allClasses.length,
      },
      faculty: {
        id: facultyId,
        name: decoded.name || `Faculty ${facultyId}`,
        email: decoded.email
      }
    });

  } catch (error) {
    console.error('❌ Error in faculty classes API:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch faculty classes',
      error: error.message 
    });
  }
}