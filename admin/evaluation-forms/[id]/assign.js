// pages/api/admin/evaluation-forms/[id]/assign.js
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  const { id } = req.query;
  
  console.log('📝 Assign evaluation form API called:', {
    method: req.method,
    formId: id,
    body: req.body
  });
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    // Check authorization
    const token = req.headers.authorization?.split(' ')[1];
    const decoded = verifyToken(token);
    
    if (!decoded) {
      console.log('❌ No valid token');
      return res.status(401).json({ 
        success: false, 
        message: 'Unauthorized' 
      });
    }

    const { faculty_id, student_ids, due_date, academic_year_id, semester } = req.body;
    
    if (!faculty_id || !student_ids || !Array.isArray(student_ids) || student_ids.length === 0) {
      return res.status(400).json({ 
        success: false, 
        message: 'Faculty ID and at least one student ID are required' 
      });
    }

    // Check if form exists and is active
    console.log('🔍 Checking form existence...');
    const formCheck = await query(
      `SELECT id, title, is_active FROM evaluation_forms WHERE id = ?`,
      [id]
    );

    if (formCheck.length === 0) {
      console.log('❌ Form not found');
      return res.status(404).json({ 
        success: false, 
        message: 'Evaluation form not found' 
      });
    }

    if (!formCheck[0].is_active) {
      console.log('❌ Form not active');
      return res.status(400).json({ 
        success: false, 
        message: 'Evaluation form is not active' 
      });
    }

    // Check if faculty exists
    console.log('🔍 Checking faculty existence...');
    const facultyCheck = await query(
      `SELECT id, firstname, lastname FROM faculty_list WHERE id = ? AND is_active = 1`,
      [faculty_id]
    );

    if (facultyCheck.length === 0) {
      console.log('❌ Faculty not found');
      return res.status(404).json({ 
        success: false, 
        message: 'Faculty member not found' 
      });
    }

    // CRITICAL FIX: Check if students actually have this faculty as their teacher
    console.log('🔍 Verifying student-faculty relationships...');
    const placeholders = student_ids.map(() => '?').join(',');
    
    // This query checks which students actually have this faculty assigned to them
    const studentFacultyCheck = await query(
      `SELECT 
        sl.id as student_id,
        sl.firstname,
        sl.lastname,
        sl.school_id,
        -- Check if there's any relationship between this student and faculty
        EXISTS (
          SELECT 1 FROM student_faculty_assignments sfa
          WHERE sfa.student_id = sl.id 
          AND sfa.faculty_id = ?
          AND sfa.is_active = 1
          AND (sfa.academic_year_id = ? OR ? IS NULL)
          AND (sfa.semester = ? OR ? IS NULL)
        ) as has_faculty_relationship,
        -- Get the specific assignment if exists
        (
          SELECT sfa.id FROM student_faculty_assignments sfa
          WHERE sfa.student_id = sl.id 
          AND sfa.faculty_id = ?
          AND sfa.is_active = 1
          AND (sfa.academic_year_id = ? OR ? IS NULL)
          AND (sfa.semester = ? OR ? IS NULL)
          LIMIT 1
        ) as assignment_id
       FROM student_list sl
       WHERE sl.id IN (${placeholders}) 
       AND sl.is_active = 1`,
      [
        // Parameters for EXISTS subquery
        faculty_id, academic_year_id || null, academic_year_id || null,
        semester || 1, semester || 1,
        // Parameters for assignment_id subquery  
        faculty_id, academic_year_id || null, academic_year_id || null,
        semester || 1, semester || 1,
        // Student IDs
        ...student_ids
      ]
    );

    console.log('📊 Student-faculty relationship check:', {
      requested_students: student_ids.length,
      found_students: studentFacultyCheck.length,
      with_relationship: studentFacultyCheck.filter(s => s.has_faculty_relationship).length,
      without_relationship: studentFacultyCheck.filter(s => !s.has_faculty_relationship).length
    });

    // Separate students with and without relationship
    const studentsWithRelationship = studentFacultyCheck.filter(s => s.has_faculty_relationship);
    const studentsWithoutRelationship = studentFacultyCheck.filter(s => !s.has_faculty_relationship);

    if (studentsWithRelationship.length === 0) {
      console.log('❌ No students have this faculty as their teacher');
      return res.status(400).json({ 
        success: false, 
        message: 'None of the selected students have this faculty assigned as their teacher for the specified academic period.',
        data: {
          students_without_relationship: studentsWithoutRelationship.map(s => ({
            id: s.student_id,
            name: `${s.firstname} ${s.lastname}`,
            school_id: s.school_id
          }))
        }
      });
    }

    // Warn if some students don't have the relationship
    if (studentsWithoutRelationship.length > 0) {
      console.log('⚠️ Some students do not have this faculty as teacher:', 
        studentsWithoutRelationship.map(s => `${s.firstname} ${s.lastname} (${s.school_id})`)
      );
    }

    // Create assignments ONLY for students who have the faculty relationship
    console.log('📝 Creating assignments for eligible students...');
    const assignments = [];
    const newAssignments = [];
    const skippedStudents = [];
    
    for (const student of studentsWithRelationship) {
      // Check if assignment already exists
      const existingAssignment = await query(
        `SELECT id FROM form_assignments 
         WHERE form_id = ? AND faculty_id = ? AND student_id = ? 
         AND academic_year_id = ? AND semester = ?`,
        [id, faculty_id, student.student_id, academic_year_id || null, semester || 1]
      );

      if (existingAssignment.length === 0) {
        // Create new assignment
        console.log(`➕ Creating assignment for student ${student.student_id} (${student.firstname} ${student.lastname})`);
        const result = await query(
          `INSERT INTO form_assignments 
           (form_id, faculty_id, student_id, academic_year_id, semester, due_date, status, assigned_by, assigned_at)
           VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, NOW())`,
          [id, faculty_id, student.student_id, academic_year_id || null, semester || 1, 
           due_date || null, decoded.userId || decoded.id]
        );
        
        newAssignments.push(result.insertId);
        assignments.push({
          studentId: student.student_id,
          studentName: `${student.firstname} ${student.lastname}`,
          schoolId: student.school_id,
          assignmentId: result.insertId,
          status: 'assigned',
          hasRelationship: true
        });
      } else {
        console.log(`⚠️ Assignment already exists for student ${student.student_id}`);
        assignments.push({
          studentId: student.student_id,
          studentName: `${student.firstname} ${student.lastname}`,
          schoolId: student.school_id,
          assignmentId: existingAssignment[0].id,
          status: 'already_assigned',
          hasRelationship: true
        });
      }
    }

    // Track skipped students
    studentsWithoutRelationship.forEach(student => {
      skippedStudents.push({
        studentId: student.student_id,
        studentName: `${student.firstname} ${student.lastname}`,
        schoolId: student.school_id,
        reason: 'No faculty relationship found'
      });
    });

    console.log('✅ Assignments created:', {
      total_eligible: studentsWithRelationship.length,
      total_assigned: assignments.length,
      new: newAssignments.length,
      existing: assignments.length - newAssignments.length,
      skipped: skippedStudents.length
    });

    // Prepare response
    const response = {
      success: true,
      message: `Evaluation form assigned to ${assignments.length} student(s)`,
      data: {
        form_id: id,
        faculty_id,
        faculty_name: `${facultyCheck[0].firstname} ${facultyCheck[0].lastname}`,
        assignments,
        skipped_students: skippedStudents,
        total_assigned: assignments.length,
        new_assignments: newAssignments.length,
        skipped_count: skippedStudents.length
      }
    };

    // Add warning if some students were skipped
    if (skippedStudents.length > 0) {
      response.warning = `${skippedStudents.length} student(s) were skipped because they don't have this faculty assigned as their teacher.`;
      response.data.skipped_details = skippedStudents.map(s => ({
        name: s.studentName,
        school_id: s.schoolId,
        reason: s.reason
      }));
    }

    res.status(200).json(response);
    
  } catch (error) {
    console.error('❌ Error assigning evaluation form:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error assigning evaluation form',
      error: error.message
    });
  }
}