import mysql from 'mysql2/promise';
import { verifyToken } from '@/lib/auth';

// FIXED DATABASE NAME
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'eval_db',  // CHANGED from school_db to eval_db
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default async function handler(req, res) {
  console.log('=== EVALUATION FORM API CALLED ===');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  let connection;
  try {
    // Verify admin authentication
    const token = req.headers.authorization?.split(' ')[1];
    const auth = verifyToken(token);
    
    if (!auth) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    
    const isAdmin = auth.user_type === 1 || auth.userType === 'admin';
    if (!isAdmin) {
      return res.status(403).json({ success: false, message: 'Admin access required' });
    }

    const { form, questions } = req.body;
    console.log('📋 Creating evaluation form for faculty:', form.faculty_id);
    console.log('🏫 Classes selected:', form.class_ids);
    console.log('🔍 form.class_ids type:', typeof form.class_ids);
    console.log('🔍 form.class_ids length:', form.class_ids.length);
    
    // Generate form code
    const formCode = `EVAL-${new Date().getFullYear()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    
    // Start transaction
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    try {
      // 1. Create/Ensure evaluation_forms table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS evaluation_forms (
          id INT AUTO_INCREMENT PRIMARY KEY,
          form_code VARCHAR(100) UNIQUE NOT NULL,
          title VARCHAR(255) NOT NULL,
          description TEXT,
          academic_year_id INT,
          semester VARCHAR(20),
          faculty_id INT,
          is_anonymous BOOLEAN DEFAULT FALSE,
          status ENUM('not_started', 'starting', 'closed') DEFAULT 'not_started',
          created_by INT,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          
          INDEX idx_academic_year (academic_year_id),
          INDEX idx_faculty (faculty_id),
          INDEX idx_status (status),
          INDEX idx_created_by (created_by)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      console.log('✅ Table verified/created');
      
      // 2. Insert evaluation form
      console.log('📝 Inserting evaluation form...');
      
      const [formResult] = await connection.execute(`
        INSERT INTO evaluation_forms (
          form_code, title, description, academic_year_id, semester,
          faculty_id, is_anonymous, status, created_by
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        formCode,
        form.title,
        form.description || '',
        form.academic_year_id,
        form.semester,
        form.faculty_id,
        form.is_anonymous ? 1 : 0,
        'starting',
        auth.id || auth.user_id
      ]);
      
      const formId = formResult.insertId;
      console.log('✅ Form inserted with ID:', formId);
      
      // 3. Insert questions
      console.log(`📝 Inserting ${questions.length} questions...`);
      for (let i = 0; i < questions.length; i++) {
        const question = questions[i];
        await connection.execute(`
          INSERT INTO form_questions (form_id, question_text, question_type, is_required, display_order)
          VALUES (?, ?, ?, ?, ?)
        `, [
          formId,
          question.text,
          question.type || 'rating_1_5',
          question.required ? 1 : 0,
          i + 1
        ]);
      }
      
      // 4. Create form_assignments table if not exists
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS form_assignments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          form_id INT NOT NULL,
          class_id INT NOT NULL,
          assigned_by INT,
          assigned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          UNIQUE KEY unique_assignment (form_id, class_id),
          INDEX idx_form_id (form_id),
          INDEX idx_class_id (class_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // 5. Assign form to classes - FIXED: Prevent duplicate assignments
      console.log(`🏫 Assigning form to ${form.class_ids.length} classes...`);
      for (const classId of form.class_ids) {
        await connection.execute(`
          INSERT INTO form_assignments (form_id, class_id, assigned_by)
          VALUES (?, ?, ?)
          ON DUPLICATE KEY UPDATE 
            assigned_by = VALUES(assigned_by)
        `, [formId, classId, auth.id || auth.user_id]);
      }
      
      // 6. CRITICAL: Link evaluations to students
      console.log('\n👥 LINKING EVALUATIONS TO STUDENTS (DEBUG MODE) 👥');
      console.log('=' .repeat(50));
      
      let totalStudents = 0;
      let failedStudents = 0;
      
      try {
        // First ensure student_evaluations table exists
        await connection.execute(`
          CREATE TABLE IF NOT EXISTS student_evaluations (
            id INT AUTO_INCREMENT PRIMARY KEY,
            student_id INT NOT NULL,
            form_id INT NOT NULL,
            faculty_id INT NOT NULL,
            status ENUM('pending', 'in_progress', 'completed', 'expired') DEFAULT 'pending',
            submitted_at DATETIME NULL,
            score DECIMAL(5,2) NULL,
            feedback TEXT NULL,
            assigned_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            due_date DATE,
            completed_at DATETIME NULL,
            
            UNIQUE KEY unique_student_evaluation (student_id, form_id),
            INDEX idx_student_id (student_id),
            INDEX idx_form_id (form_id),
            INDEX idx_faculty_id (faculty_id),
            INDEX idx_status (status),
            INDEX idx_due_date (due_date)
          ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        `);
        
        // DEBUG: Check what class IDs are being passed
        console.log(`🔍 Looking for students in classes: ${JSON.stringify(form.class_ids)}`);
        console.log(`🔍 Class IDs as array: ${form.class_ids.join(', ')}`);
        
        // Check if form.class_ids is valid
        if (!Array.isArray(form.class_ids) || form.class_ids.length === 0) {
          console.error('❌ ERROR: form.class_ids is not a valid array!');
          console.error('❌ form.class_ids:', form.class_ids);
          throw new Error('Invalid class_ids array');
        }
        
        // Convert class IDs to numbers to ensure proper comparison
        const classIds = form.class_ids.map(id => parseInt(id)).filter(id => !isNaN(id));
        console.log(`🔍 Parsed class IDs: ${classIds.join(', ')}`);
        
        // DEBUG: First check each class individually
        console.log('\n🔍 CHECKING EACH CLASS INDIVIDUALLY:');
        for (const classId of classIds) {
          const [classStudents] = await connection.execute(`
            SELECT s.id, s.firstname, s.lastname, s.class_id, s.is_active
            FROM student_list s
            WHERE s.class_id = ?
            AND s.is_active = 1
          `, [classId]);
          
          console.log(`   🏫 Class ${classId}: ${classStudents.length} active students`);
          classStudents.forEach(student => {
            console.log(`      👤 ${student.id}: ${student.firstname} ${student.lastname} (Active: ${student.is_active})`);
          });
        }
        
        // Now get ALL students from selected classes
        console.log('\n🔍 QUERYING ALL STUDENTS FROM SELECTED CLASSES:');
        
        // FIXED: Create proper placeholders for MySQL IN clause
        const placeholders = classIds.map(() => '?').join(',');
        const query = `
          SELECT s.id as student_id, s.firstname, s.lastname, s.class_id, s.is_active
          FROM student_list s
          WHERE s.class_id IN (${placeholders})
          AND s.is_active = 1
        `;
        
        console.log(`   SQL: ${query}`);
        console.log(`   Parameters: ${JSON.stringify(classIds)}`);
        
        const [students] = await connection.execute(query, classIds);
        
        console.log(`\n📊 FOUND ${students.length} ACTIVE STUDENTS IN ALL SELECTED CLASSES`);
        
        if (students.length > 0) {
          console.log('📋 ALL STUDENTS FOUND:');
          students.forEach(student => {
            console.log(`   👤 ${student.student_id}: ${student.firstname} ${student.lastname} (Class: ${student.class_id}, Active: ${student.is_active})`);
          });
          
          // Group by class for analysis
          const studentsByClass = {};
          students.forEach(student => {
            if (!studentsByClass[student.class_id]) {
              studentsByClass[student.class_id] = [];
            }
            studentsByClass[student.class_id].push(student);
          });
          
          console.log('\n📊 STUDENTS GROUPED BY CLASS:');
          Object.keys(studentsByClass).forEach(classId => {
            console.log(`   🏫 Class ${classId}: ${studentsByClass[classId].length} students`);
          });
          
          console.log('\n📝 CREATING STUDENT EVALUATIONS:');
          
          // Assign evaluation to each student
          for (const student of students) {
            try {
              console.log(`   🚀 Creating evaluation for student ${student.student_id}: ${student.firstname} ${student.lastname}...`);
              
              const [result] = await connection.execute(`
                INSERT INTO student_evaluations 
                (student_id, form_id, faculty_id, status, assigned_date, due_date)
                VALUES (?, ?, ?, 'pending', NOW(), DATE(NOW() + INTERVAL 30 DAY))
                ON DUPLICATE KEY UPDATE 
                  due_date = VALUES(due_date),
                  status = VALUES(status)
              `, [
                student.student_id,
                formId,
                form.faculty_id
              ]);
              
              if (result.affectedRows > 0) {
                totalStudents++;
                console.log(`      ✅ SUCCESS: Created evaluation for student ${student.student_id}`);
              } else {
                console.log(`      ⚠️  SKIPPED: Evaluation already exists for student ${student.student_id}`);
              }
              
            } catch (error) {
              failedStudents++;
              console.error(`      ❌ ERROR for student ${student.student_id}:`, error.message);
              console.error(`      ❌ Error code:`, error.code);
              console.error(`      ❌ SQL State:`, error.sqlState);
            }
          }
          
        } else {
          console.error('\n❌ CRITICAL: NO ACTIVE STUDENTS FOUND IN ANY SELECTED CLASSES!');
          console.error('❌ This means the query returned 0 students.');
          console.error('❌ Possible reasons:');
          console.error('   1. No students have is_active = 1');
          console.error('   2. Class IDs in student_list don\'t match form.class_ids');
          console.error('   3. MySQL IN() clause is not working correctly');
          
          // Additional debugging
          console.log('\n🔍 EXTRA DEBUGGING: Check all active students');
          const [allActiveStudents] = await connection.execute(`
            SELECT id, firstname, lastname, class_id, is_active 
            FROM student_list 
            WHERE is_active = 1
            ORDER BY class_id
          `);
          
          console.log(`🔍 Total active students in database: ${allActiveStudents.length}`);
          allActiveStudents.forEach(student => {
            console.log(`   👤 ${student.id}: ${student.firstname} ${student.lastname} (Class: ${student.class_id})`);
          });
        }
        
        console.log('\n' + '=' .repeat(50));
        console.log(`🎯 FINAL RESULT: Created ${totalStudents} student evaluation assignments`);
        console.log(`⚠️  Failed: ${failedStudents} students`);
        console.log('=' .repeat(50));
        
      } catch (studentError) {
        console.error('\n❌ CRITICAL ERROR IN STUDENT EVALUATION CREATION:');
        console.error('❌ Error:', studentError.message);
        console.error('❌ Stack:', studentError.stack);
        // Don't rollback - continue with form creation
      }
      
      // 7. Create evaluation_responses table
      await connection.execute(`
        CREATE TABLE IF NOT EXISTS evaluation_responses (
          id INT AUTO_INCREMENT PRIMARY KEY,
          student_evaluation_id INT NOT NULL,
          question_id INT NOT NULL,
          response_value TEXT,
          rating INT,
          submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          
          UNIQUE KEY unique_question_response (student_evaluation_id, question_id),
          INDEX idx_evaluation_id (student_evaluation_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
      `);
      
      // Commit transaction
      await connection.commit();
      console.log('\n✅ TRANSACTION COMMITTED SUCCESSFULLY');
      
      // Get faculty details for response
      const [facultyRows] = await connection.execute(
        'SELECT firstname, lastname FROM faculty_list WHERE id = ?',
        [form.faculty_id]
      );
      
      const facultyName = facultyRows.length > 0 
        ? `${facultyRows[0].firstname} ${facultyRows[0].lastname}`
        : 'Unknown Faculty';
      
      return res.status(201).json({
        success: true,
        message: 'Evaluation form created and assigned to students successfully',
        data: {
          formId: formId,
          formCode: formCode,
          totalQuestions: questions.length,
          totalClasses: form.class_ids.length,
          totalStudents: totalStudents,
          failedStudents: failedStudents,
          facultyName: facultyName,
          status: 'starting'
        }
      });
      
    } catch (error) {
      await connection.rollback();
      console.error('\n❌ DATABASE ERROR:');
      console.error('❌ Error:', error.message);
      console.error('❌ Code:', error.code);
      
      if (error.code === 'ER_BAD_FIELD_ERROR') {
        return res.status(500).json({
          success: false,
          message: 'Database structure issue: ' + error.message
        });
      }
      
      throw error;
    }
    
  } catch (error) {
    console.error('\n❌ ERROR IN EVALUATION FORM CREATION:');
    console.error('❌ Error:', error.message);
    console.error('❌ Stack:', error.stack);
    
    return res.status(500).json({
      success: false,
      message: 'Error creating evaluation form: ' + error.message,
      error: process.env.NODE_ENV === 'development' ? {
        code: error.code,
        message: error.message,
        stack: error.stack
      } : undefined
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
}