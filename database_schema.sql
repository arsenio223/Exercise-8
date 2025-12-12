-- Create Database
CREATE DATABASE IF NOT EXISTS eval_db;
USE eval_db;

-- ====================
-- 1. USERS TABLE (Administrators)
-- ====================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  firstname VARCHAR(200) NOT NULL,
  lastname VARCHAR(200) NOT NULL,
  email VARCHAR(200) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  avatar TEXT DEFAULT '/uploads/avatars/default-avatar.png',
  user_type INT DEFAULT 1 COMMENT '1=Admin, 2=Faculty, 3=Student',
  is_active BOOLEAN DEFAULT TRUE,
  last_login DATETIME,
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_user_type (user_type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 2. FACULTY TABLE
-- ====================
CREATE TABLE IF NOT EXISTS faculty_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(100) UNIQUE NOT NULL,
  firstname VARCHAR(200) NOT NULL,
  lastname VARCHAR(200) NOT NULL,
  middlename VARCHAR(200),
  email VARCHAR(200) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  avatar TEXT DEFAULT '/uploads/avatars/default-avatar.png',
  department VARCHAR(200),
  designation VARCHAR(200),
  contact_number VARCHAR(20),
  address TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_school_id (school_id),
  INDEX idx_email (email),
  INDEX idx_department (department),
  FULLTEXT idx_full_name (firstname, lastname, middlename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 3. STUDENT TABLE
-- ====================
CREATE TABLE IF NOT EXISTS student_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  school_id VARCHAR(100) UNIQUE NOT NULL,
  firstname VARCHAR(200) NOT NULL,
  lastname VARCHAR(200) NOT NULL,
  middlename VARCHAR(200),
  email VARCHAR(200) UNIQUE NOT NULL,
  password TEXT NOT NULL,
  class_id INT,
  avatar TEXT DEFAULT '/uploads/avatars/default-avatar.png',
  contact_number VARCHAR(20),
  address TEXT,
  year_level VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_school_id (school_id),
  INDEX idx_email (email),
  INDEX idx_class_id (class_id),
  FULLTEXT idx_full_name (firstname, lastname, middlename)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 4. CLASS TABLE
-- ====================
CREATE TABLE IF NOT EXISTS class_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  curriculum VARCHAR(100) NOT NULL COMMENT 'e.g., BSIT, BSCS, BSED',
  level VARCHAR(50) NOT NULL COMMENT 'e.g., 1, 2, 3, 4',
  section VARCHAR(50) NOT NULL,
  description TEXT,
  academic_year VARCHAR(50),
  semester INT DEFAULT 1,
  is_active BOOLEAN DEFAULT TRUE,
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  UNIQUE KEY unique_class (curriculum, level, section, academic_year),
  INDEX idx_curriculum (curriculum),
  INDEX idx_level (level),
  INDEX idx_academic_year (academic_year)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 5. SUBJECT TABLE
-- ====================
CREATE TABLE IF NOT EXISTS subject_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  subject VARCHAR(200) NOT NULL,
  description TEXT,
  units DECIMAL(3,1) DEFAULT 3.0,
  subject_type ENUM('Lecture', 'Laboratory', 'Lecture/Lab') DEFAULT 'Lecture',
  is_active BOOLEAN DEFAULT TRUE,
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_code (code),
  FULLTEXT idx_subject (subject, description)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 6. EVALUATION TABLE (Main Table)
-- ====================
CREATE TABLE IF NOT EXISTS evaluation_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  academic_year VARCHAR(50) NOT NULL,
  semester INT NOT NULL,
  class_id INT,
  student_id INT NOT NULL,
  subject_id INT NOT NULL,
  faculty_id INT NOT NULL,
  
  -- Ratings (1-5 scale)
  knowledge_rating INT CHECK (knowledge_rating BETWEEN 1 AND 5),
  teaching_skills_rating INT CHECK (teaching_skills_rating BETWEEN 1 AND 5),
  communication_rating INT CHECK (communication_rating BETWEEN 1 AND 5),
  punctuality_rating INT CHECK (punctuality_rating BETWEEN 1 AND 5),
  interaction_rating INT CHECK (interaction_rating BETWEEN 1 AND 5),
  
  -- Calculated fields
  average_rating DECIMAL(3,2) GENERATED ALWAYS AS (
    (knowledge_rating + teaching_skills_rating + communication_rating + 
     punctuality_rating + interaction_rating) / 5
  ) STORED,
  
  total_score INT GENERATED ALWAYS AS (
    knowledge_rating + teaching_skills_rating + communication_rating + 
    punctuality_rating + interaction_rating
  ) STORED,
  
  percentage_score DECIMAL(5,2) GENERATED ALWAYS AS (
    ((knowledge_rating + teaching_skills_rating + communication_rating + 
      punctuality_rating + interaction_rating) / 25) * 100
  ) STORED,
  
  comments TEXT,
  status ENUM('pending', 'submitted', 'reviewed', 'archived') DEFAULT 'submitted',
  is_anonymous BOOLEAN DEFAULT FALSE,
  date_taken DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  -- Foreign Keys
  FOREIGN KEY (class_id) REFERENCES class_list(id) ON DELETE SET NULL,
  FOREIGN KEY (student_id) REFERENCES student_list(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subject_list(id) ON DELETE CASCADE,
  FOREIGN KEY (faculty_id) REFERENCES faculty_list(id) ON DELETE CASCADE,
  
  -- Unique constraint to prevent duplicate evaluations
  UNIQUE KEY unique_evaluation (student_id, faculty_id, subject_id, academic_year, semester),
  
  -- Indexes for performance
  INDEX idx_academic_year (academic_year),
  INDEX idx_semester (semester),
  INDEX idx_faculty_id (faculty_id),
  INDEX idx_student_id (student_id),
  INDEX idx_subject_id (subject_id),
  INDEX idx_date_taken (date_taken),
  INDEX idx_status (status),
  INDEX idx_average_rating (average_rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 7. CRITERIA TABLE (Evaluation Criteria)
-- ====================
CREATE TABLE IF NOT EXISTS criteria_list (
  id INT AUTO_INCREMENT PRIMARY KEY,
  criteria_code VARCHAR(50) UNIQUE NOT NULL,
  criteria_name VARCHAR(200) NOT NULL,
  description TEXT,
  max_score INT DEFAULT 5,
  weight DECIMAL(3,2) DEFAULT 1.00 COMMENT 'Weight for weighted average',
  order_by INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_criteria_code (criteria_code),
  INDEX idx_order_by (order_by)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 8. EVALUATION CRITERIA DETAILS
-- ====================
CREATE TABLE IF NOT EXISTS evaluation_criteria (
  id INT AUTO_INCREMENT PRIMARY KEY,
  evaluation_id INT NOT NULL,
  criteria_id INT NOT NULL,
  rating INT CHECK (rating BETWEEN 1 AND 5),
  comments TEXT,
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (evaluation_id) REFERENCES evaluation_list(id) ON DELETE CASCADE,
  FOREIGN KEY (criteria_id) REFERENCES criteria_list(id) ON DELETE CASCADE,
  
  UNIQUE KEY unique_evaluation_criteria (evaluation_id, criteria_id),
  INDEX idx_evaluation_id (evaluation_id),
  INDEX idx_criteria_id (criteria_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 9. PASSWORD RESETS TABLE
-- ====================
CREATE TABLE IF NOT EXISTS password_resets (
  id INT AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(200) NOT NULL,
  token VARCHAR(255) NOT NULL,
  user_type ENUM('users', 'faculty_list', 'student_list') NOT NULL,
  expires_at DATETIME NOT NULL,
  used BOOLEAN DEFAULT FALSE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_token (token),
  INDEX idx_email (email),
  INDEX idx_expires_at (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 10. ACADEMIC YEAR TABLE
-- ====================
CREATE TABLE IF NOT EXISTS academic_years (
  id INT AUTO_INCREMENT PRIMARY KEY,
  year_code VARCHAR(50) UNIQUE NOT NULL COMMENT 'e.g., 2023-2024',
  year_name VARCHAR(100) NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  semester INT DEFAULT 1,
  is_current BOOLEAN DEFAULT FALSE,
  evaluation_start DATE,
  evaluation_end DATE,
  status ENUM('upcoming', 'active', 'completed', 'cancelled') DEFAULT 'upcoming',
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_year_code (year_code),
  INDEX idx_status (status),
  INDEX idx_is_current (is_current)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 11. FACULTY SUBJECT ASSIGNMENT
-- ====================
CREATE TABLE IF NOT EXISTS faculty_subjects (
  id INT AUTO_INCREMENT PRIMARY KEY,
  faculty_id INT NOT NULL,
  subject_id INT NOT NULL,
  class_id INT,
  academic_year_id INT,
  semester INT DEFAULT 1,
  schedule VARCHAR(200),
  room VARCHAR(50),
  is_active BOOLEAN DEFAULT TRUE,
  date_assigned DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (faculty_id) REFERENCES faculty_list(id) ON DELETE CASCADE,
  FOREIGN KEY (subject_id) REFERENCES subject_list(id) ON DELETE CASCADE,
  FOREIGN KEY (class_id) REFERENCES class_list(id) ON DELETE SET NULL,
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL,
  
  UNIQUE KEY unique_assignment (faculty_id, subject_id, class_id, academic_year_id, semester),
  INDEX idx_faculty_id (faculty_id),
  INDEX idx_subject_id (subject_id),
  INDEX idx_academic_year_id (academic_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 12. REPORTS TABLE
-- ====================
CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  report_type ENUM('faculty', 'student', 'subject', 'department', 'overall') NOT NULL,
  academic_year_id INT,
  semester INT,
  report_data JSON,
  generated_by INT COMMENT 'User ID who generated the report',
  file_path VARCHAR(500),
  file_format ENUM('pdf', 'excel', 'csv') DEFAULT 'pdf',
  date_generated DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (academic_year_id) REFERENCES academic_years(id) ON DELETE SET NULL,
  FOREIGN KEY (generated_by) REFERENCES users(id) ON DELETE SET NULL,
  
  INDEX idx_report_type (report_type),
  INDEX idx_date_generated (date_generated),
  INDEX idx_academic_year_id (academic_year_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 13. SYSTEM SETTINGS
-- ====================
CREATE TABLE IF NOT EXISTS system_settings (
  id INT AUTO_INCREMENT PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT,
  setting_type ENUM('string', 'number', 'boolean', 'json', 'array') DEFAULT 'string',
  category VARCHAR(100) DEFAULT 'general',
  description TEXT,
  is_editable BOOLEAN DEFAULT TRUE,
  date_created DATETIME DEFAULT CURRENT_TIMESTAMP,
  date_updated DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_setting_key (setting_key),
  INDEX idx_category (category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 14. ACTIVITY LOGS
-- ====================
CREATE TABLE IF NOT EXISTS activity_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  user_type ENUM('admin', 'faculty', 'student') NOT NULL,
  action VARCHAR(100) NOT NULL,
  description TEXT,
  ip_address VARCHAR(45),
  user_agent TEXT,
  table_name VARCHAR(100),
  record_id INT,
  old_values JSON,
  new_values JSON,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user_id (user_id),
  INDEX idx_action (action),
  INDEX idx_created_at (created_at),
  INDEX idx_table_record (table_name, record_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 15. NOTIFICATIONS
-- ====================
CREATE TABLE IF NOT EXISTS notifications (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT NOT NULL,
  user_type ENUM('admin', 'faculty', 'student') NOT NULL,
  title VARCHAR(200) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('info', 'success', 'warning', 'error', 'evaluation') DEFAULT 'info',
  is_read BOOLEAN DEFAULT FALSE,
  related_id INT COMMENT 'Related record ID (evaluation_id, etc.)',
  related_type VARCHAR(50) COMMENT 'Related record type',
  action_url VARCHAR(500),
  expires_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_user (user_id, user_type),
  INDEX idx_is_read (is_read),
  INDEX idx_created_at (created_at),
  INDEX idx_type (type)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 16. EMAIL TEMPLATES
-- ====================
CREATE TABLE IF NOT EXISTS email_templates (
  id INT AUTO_INCREMENT PRIMARY KEY,
  template_name VARCHAR(100) UNIQUE NOT NULL,
  subject VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  variables TEXT COMMENT 'JSON array of variable names',
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_template_name (template_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- 17. DEPARTMENTS
-- ====================
CREATE TABLE IF NOT EXISTS departments (
  id INT AUTO_INCREMENT PRIMARY KEY,
  department_code VARCHAR(50) UNIQUE NOT NULL,
  department_name VARCHAR(200) NOT NULL,
  description TEXT,
  head_faculty_id INT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (head_faculty_id) REFERENCES faculty_list(id) ON DELETE SET NULL,
  INDEX idx_department_code (department_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ====================
-- INSERT DEFAULT DATA
-- ====================

-- Insert default admin user (password: admin123)
INSERT INTO users (firstname, lastname, email, password, user_type) 
VALUES ('Admin', 'User', 'admin@fes.edu', '$2a$10$7K7zR2WvVJ5WJ2Q2v2W2vO2v2W2v2W2v2W2v2W2v2W2v2W2v2W2v2', 1);

-- Insert default criteria
INSERT INTO criteria_list (criteria_code, criteria_name, description, max_score, weight, order_by) VALUES
('CR001', 'Knowledge of Subject', 'Depth and accuracy of subject knowledge', 5, 1.0, 1),
('CR002', 'Teaching Skills', 'Effectiveness of teaching methods and techniques', 5, 1.0, 2),
('CR003', 'Communication Skills', 'Clarity and effectiveness of communication', 5, 1.0, 3),
('CR004', 'Punctuality & Regularity', 'Timeliness and consistency in classes', 5, 1.0, 4),
('CR005', 'Student Interaction', 'Approachability and responsiveness to students', 5, 1.0, 5),
('CR006', 'Course Materials', 'Quality and relevance of teaching materials', 5, 0.8, 6),
('CR007', 'Assessment Methods', 'Fairness and effectiveness of evaluation methods', 5, 0.8, 7);

-- Insert default academic year
INSERT INTO academic_years (year_code, year_name, start_date, end_date, semester, is_current, evaluation_start, evaluation_end, status) 
VALUES ('2024-2025', 'Academic Year 2024-2025', '2024-06-01', '2025-05-31', 1, TRUE, '2024-11-01', '2024-12-15', 'active');

-- Insert default classes
INSERT INTO class_list (curriculum, level, section, description, academic_year) VALUES
('BSIT', '1', 'A', 'Bachelor of Science in Information Technology - 1st Year Section A', '2024-2025'),
('BSIT', '1', 'B', 'Bachelor of Science in Information Technology - 1st Year Section B', '2024-2025'),
('BSIT', '2', 'A', 'Bachelor of Science in Information Technology - 2nd Year Section A', '2024-2025'),
('BSCS', '1', 'A', 'Bachelor of Science in Computer Science - 1st Year Section A', '2024-2025'),
('BSED', '1', 'A', 'Bachelor of Science in Education - 1st Year Section A', '2024-2025');

-- Insert default subjects
INSERT INTO subject_list (code, subject, description, units, subject_type) VALUES
('IT101', 'Introduction to Computing', 'Basic concepts of computing and computer systems', 3.0, 'Lecture'),
('IT102', 'Computer Programming 1', 'Introduction to programming using Python', 3.0, 'Lecture/Lab'),
('IT103', 'Data Structures and Algorithms', 'Fundamental data structures and algorithms', 3.0, 'Lecture'),
('CS101', 'Discrete Mathematics', 'Mathematical foundations for computer science', 3.0, 'Lecture'),
('ENG101', 'Communication Skills 1', 'Development of English communication skills', 3.0, 'Lecture'),
('MATH101', 'College Algebra', 'Fundamental concepts of algebra', 3.0, 'Lecture'),
('PE101', 'Physical Education 1', 'Fundamentals of physical fitness', 2.0, 'Laboratory'),
('NSTP1', 'National Service Training Program 1', 'Civic welfare training service', 3.0, 'Lecture/Lab');

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, setting_type, category, description) VALUES
('system_name', 'Faculty Evaluation System', 'string', 'general', 'Name of the system'),
('system_email', 'noreply@fes.edu', 'string', 'email', 'System email address'),
('evaluation_min_rating', '1', 'number', 'evaluation', 'Minimum rating value'),
('evaluation_max_rating', '5', 'number', 'evaluation', 'Maximum rating value'),
('evaluation_enabled', 'true', 'boolean', 'evaluation', 'Enable/disable evaluation system'),
('allow_anonymous', 'false', 'boolean', 'evaluation', 'Allow anonymous evaluations'),
('max_evaluations_per_student', '10', 'number', 'evaluation', 'Maximum evaluations per student per semester'),
('email_notifications', 'true', 'boolean', 'email', 'Enable email notifications'),
('password_reset_expiry', '24', 'number', 'security', 'Password reset link expiry in hours'),
('maintenance_mode', 'false', 'boolean', 'general', 'System maintenance mode');

-- Insert default departments
INSERT INTO departments (department_code, department_name, description) VALUES
('CCS', 'College of Computer Studies', 'Computer Science and Information Technology programs'),
('COE', 'College of Engineering', 'Engineering programs'),
('CBA', 'College of Business Administration', 'Business and Accountancy programs'),
('CAS', 'College of Arts and Sciences', 'Liberal Arts and Sciences programs'),
('CTE', 'College of Teacher Education', 'Education and Teaching programs');

-- ====================
-- CREATE STORED PROCEDURES
-- ====================

-- Procedure to calculate faculty average rating
DELIMITER //
CREATE PROCEDURE CalculateFacultyRating(
    IN p_faculty_id INT,
    IN p_academic_year VARCHAR(50),
    IN p_semester INT
)
BEGIN
    SELECT 
        f.id,
        CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
        f.department,
        COUNT(e.id) as total_evaluations,
        AVG(e.average_rating) as average_rating,
        AVG(e.percentage_score) as average_percentage,
        MIN(e.date_taken) as first_evaluation,
        MAX(e.date_taken) as last_evaluation
    FROM faculty_list f
    LEFT JOIN evaluation_list e ON f.id = e.faculty_id
    WHERE f.id = p_faculty_id
      AND (p_academic_year IS NULL OR e.academic_year = p_academic_year)
      AND (p_semester IS NULL OR e.semester = p_semester)
      AND e.status = 'submitted'
    GROUP BY f.id;
END //
DELIMITER ;

-- Procedure to generate evaluation report
DELIMITER //
CREATE PROCEDURE GenerateEvaluationReport(
    IN p_start_date DATE,
    IN p_end_date DATE,
    IN p_department VARCHAR(100)
)
BEGIN
    SELECT 
        a.year_name as academic_year,
        f.department,
        CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
        s.subject,
        c.curriculum,
        c.level,
        c.section,
        COUNT(DISTINCT e.student_id) as total_students,
        COUNT(e.id) as total_evaluations,
        AVG(e.average_rating) as average_rating,
        AVG(e.percentage_score) as average_percentage
    FROM evaluation_list e
    JOIN faculty_list f ON e.faculty_id = f.id
    JOIN subject_list s ON e.subject_id = s.id
    JOIN class_list c ON e.class_id = c.id
    JOIN academic_years a ON e.academic_year = a.year_code
    WHERE e.date_taken BETWEEN p_start_date AND p_end_date
      AND (p_department IS NULL OR f.department = p_department)
      AND e.status = 'submitted'
    GROUP BY e.faculty_id, e.subject_id, e.academic_year, e.semester
    ORDER BY average_percentage DESC;
END //
DELIMITER ;

-- ====================
-- CREATE VIEWS
-- ====================

-- View for faculty summary
CREATE OR REPLACE VIEW vw_faculty_summary AS
SELECT 
    f.id,
    f.school_id,
    CONCAT(f.firstname, ' ', f.lastname) as full_name,
    f.email,
    f.department,
    f.designation,
    COUNT(DISTINCT e.id) as total_evaluations,
    AVG(e.average_rating) as overall_rating,
    AVG(e.percentage_score) as overall_percentage,
    MAX(e.date_taken) as last_evaluated
FROM faculty_list f
LEFT JOIN evaluation_list e ON f.id = e.faculty_id AND e.status = 'submitted'
GROUP BY f.id;

-- View for student evaluation status
CREATE OR REPLACE VIEW vw_student_evaluation_status AS
SELECT 
    s.id,
    s.school_id,
    CONCAT(s.firstname, ' ', s.lastname) as student_name,
    c.curriculum,
    c.level,
    c.section,
    COUNT(DISTINCT e.id) as evaluations_submitted,
    (SELECT COUNT(*) FROM faculty_subjects WHERE class_id = s.class_id) as total_faculties,
    CASE 
        WHEN COUNT(DISTINCT e.id) = (SELECT COUNT(*) FROM faculty_subjects WHERE class_id = s.class_id) 
        THEN 'Completed'
        ELSE 'Pending'
    END as status
FROM student_list s
JOIN class_list c ON s.class_id = c.id
LEFT JOIN evaluation_list e ON s.id = e.student_id 
    AND e.academic_year = (SELECT year_code FROM academic_years WHERE is_current = TRUE)
GROUP BY s.id;

-- View for department performance
CREATE OR REPLACE VIEW vw_department_performance AS
SELECT 
    d.department_name,
    COUNT(DISTINCT f.id) as faculty_count,
    COUNT(DISTINCT e.id) as evaluation_count,
    AVG(e.average_rating) as avg_rating,
    AVG(e.percentage_score) as avg_percentage,
    MIN(e.percentage_score) as min_percentage,
    MAX(e.percentage_score) as max_percentage
FROM departments d
LEFT JOIN faculty_list f ON d.department_name = f.department
LEFT JOIN evaluation_list e ON f.id = e.faculty_id AND e.status = 'submitted'
GROUP BY d.department_name
ORDER BY avg_percentage DESC;

-- ====================
-- CREATE TRIGGERS
-- ====================

-- Trigger to update faculty average rating
DELIMITER //
CREATE TRIGGER after_evaluation_insert
AFTER INSERT ON evaluation_list
FOR EACH ROW
BEGIN
    -- Update notification for faculty
    INSERT INTO notifications (user_id, user_type, title, message, type, related_id, related_type)
    VALUES (
        NEW.faculty_id,
        'faculty',
        'New Evaluation Received',
        CONCAT('You have received a new evaluation for ', 
              (SELECT subject FROM subject_list WHERE id = NEW.subject_id)),
        'evaluation',
        NEW.id,
        'evaluation'
    );
    
    -- Log the activity
    INSERT INTO activity_logs (user_id, user_type, action, description, table_name, record_id)
    VALUES (
        NEW.student_id,
        'student',
        'CREATE_EVALUATION',
        CONCAT('Submitted evaluation for faculty ID ', NEW.faculty_id),
        'evaluation_list',
        NEW.id
    );
END //
DELIMITER ;

-- Trigger for password reset token cleanup
DELIMITER //
CREATE EVENT IF NOT EXISTS cleanup_password_resets
ON SCHEDULE EVERY 1 HOUR
DO
BEGIN
    DELETE FROM password_resets 
    WHERE expires_at < NOW() OR used = TRUE;
END //
DELIMITER ;

-- ====================
-- CREATE INDEXES FOR PERFORMANCE
-- ====================

-- Additional composite indexes for better performance
CREATE INDEX idx_evaluation_composite ON evaluation_list(faculty_id, academic_year, semester, status);
CREATE INDEX idx_student_composite ON student_list(class_id, is_active);
CREATE INDEX idx_faculty_composite ON faculty_list(department, is_active);
CREATE INDEX idx_subject_composite ON subject_list(code, is_active);

-- ====================
-- GRANT PERMISSIONS (Adjust as needed)
-- ====================

-- Create application user
CREATE USER IF NOT EXISTS 'fes_app'@'localhost' IDENTIFIED BY 'StrongPassword123!';
GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON faculty_evaluation.* TO 'fes_app'@'localhost';
FLUSH PRIVILEGES;

-- ====================
-- FINAL MESSAGE
-- ====================
SELECT 'Database schema created successfully!' as message;