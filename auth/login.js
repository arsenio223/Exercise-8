import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export default async function handler(req, res) {
  console.log('=== LOGIN API CALLED ===');
  
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: 'Method not allowed' });
  }

  try {
    const { userType, email, password } = req.body;
    
    console.log('Login attempt:', { userType, email });
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email and password are required' 
      });
    }

    let user = null;
    let foundInTable = '';
    let actualUserType = userType;

    // ==================== USER LOOKUP LOGIC ====================
    if (userType === 'faculty') {
      // First try users table (for faculty who have user accounts)
      try {
        const usersResult = await query(
          'SELECT * FROM users WHERE email = ? AND (user_type = 2 OR user_type IS NULL) AND is_active = TRUE',
          [email]
        );
        
        if (usersResult.length > 0) {
          user = usersResult[0];
          foundInTable = 'users';
          console.log(`✅ Found faculty in users table: ${user.firstname} ${user.lastname}`);
          
          // Also get faculty details from faculty_list
          try {
            const facultyDetails = await query(
              'SELECT * FROM faculty_list WHERE email = ?',
              [email]
            );
            if (facultyDetails.length > 0) {
              user.faculty_id = facultyDetails[0].id;
              user.profile_picture = facultyDetails[0].profile_picture; // Get profile picture
              console.log(`✅ Also found in faculty_list with ID: ${user.faculty_id}`);
            }
          } catch (facultyError) {
            console.log('Note: No matching faculty_list record found');
          }
        }
      } catch (usersError) {
        console.log('No faculty found in users table, checking faculty_list...');
      }
      
      // If not found in users table, check faculty_list
      if (!user) {
        try {
          const facultyResult = await query(
            'SELECT * FROM faculty_list WHERE email = ?',
            [email]
          );
          
          if (facultyResult.length > 0) {
            user = facultyResult[0];
            foundInTable = 'faculty_list';
            console.log(`✅ Found faculty in faculty_list table: ${user.firstname} ${user.lastname}`);
            
            // Check if this faculty also exists in users table
            try {
              const userRecord = await query(
                'SELECT * FROM users WHERE email = ?',
                [email]
              );
              if (userRecord.length > 0) {
                console.log('⚠️ Warning: Faculty exists in both tables, using faculty_list record');
              }
            } catch (checkError) {
              // Ignore
            }
          }
        } catch (facultyError) {
          console.error('Error checking faculty_list:', facultyError);
        }
      }
      
    } else if (userType === 'admin') {
      // Admin must be in users table with user_type = 1
      try {
        const adminResult = await query(
          'SELECT * FROM users WHERE email = ? AND user_type = 1 AND is_active = TRUE',
          [email]
        );
        
        if (adminResult.length > 0) {
          user = adminResult[0];
          foundInTable = 'users';
          console.log(`✅ Found admin in users table: ${user.firstname} ${user.lastname}`);
        }
      } catch (adminError) {
        console.error('Error checking admin:', adminError);
      }
      
    } else if (userType === 'student') {
      // Students in student_list
      try {
        const studentResult = await query(
          'SELECT * FROM student_list WHERE email = ? AND is_active = TRUE',
          [email]
        );
        
        if (studentResult.length > 0) {
          user = studentResult[0];
          foundInTable = 'student_list';
          console.log(`✅ Found student in student_list: ${user.firstname} ${user.lastname}`);
        }
      } catch (studentError) {
        console.error('Error checking student_list:', studentError);
      }
    }

    // ==================== USER NOT FOUND ====================
    if (!user) {
      console.log(`❌ No ${userType} found with email: ${email} in any table`);
      
      // Try to find in any table for better error message
      try {
        const allTables = await query(`
          (SELECT 'users' as table_name, firstname, lastname, email FROM users WHERE email = ?)
          UNION ALL
          (SELECT 'faculty_list' as table_name, firstname, lastname, email FROM faculty_list WHERE email = ?)
          UNION ALL
          (SELECT 'student_list' as table_name, firstname, lastname, email FROM student_list WHERE email = ?)
        `, [email, email, email]);
        
        if (allTables.length > 0) {
          console.log(`ℹ️  User found in ${allTables[0].table_name} but as different type`);
          return res.status(401).json({ 
            success: false, 
            message: `Account exists but not as ${userType}. Please select correct user type.` 
          });
        }
      } catch (searchError) {
        // Ignore
      }
      
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    // ==================== PASSWORD VERIFICATION ====================
    console.log('Verifying password...');
    console.log('Stored hash (first 30 chars):', user.password.substring(0, 30));
    console.log('Hash length:', user.password.length);
    
    const isValidPassword = await bcrypt.compare(password, user.password);
    
    if (!isValidPassword) {
      console.log('❌ Password incorrect');
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid email or password' 
      });
    }

    console.log('✅ Password verified successfully!');
    // ==================== END PASSWORD VERIFICATION ====================
    
    // ==================== CREATE JWT TOKEN ====================
    // Determine the correct ID to use
    let userId = user.id;
    let userTypeForToken = userType;
    
    // Special handling for faculty from faculty_list
    if (foundInTable === 'faculty_list') {
      // Faculty from faculty_list: use faculty ID and ensure user_type is set
      userId = user.id; // faculty_list ID
      userTypeForToken = 'faculty';
      
      console.log(`🔧 Faculty login - Using faculty_list ID: ${userId}`);
      
      // Check if there's a corresponding users record
      try {
        const userRecord = await query(
          'SELECT id FROM users WHERE email = ?',
          [email]
        );
        if (userRecord.length > 0) {
          console.log(`ℹ️  Corresponding users table ID: ${userRecord[0].id}`);
          // You could use this ID instead if you prefer
        }
      } catch (checkError) {
        // Ignore
      }
    }
    
    // Get profile picture from user data
    const profilePicture = user.profile_picture || '/uploads/default-avatar.png';
    console.log(`🖼️ Profile picture from database: ${profilePicture}`);
    
    // Create JWT token payload
    const tokenPayload = {
      id: userId,
      email: user.email,
      userType: userTypeForToken,
      user_type: userTypeForToken === 'faculty' ? 2 : 
                userTypeForToken === 'admin' ? 1 : 
                userTypeForToken === 'student' ? 3 : 0,
      firstname: user.firstname,
      lastname: user.lastname,
      name: `${user.firstname} ${user.lastname}`,
      school_id: user.school_id || null,
      profile_picture: profilePicture, // ADDED: profile_picture field
      foundInTable: foundInTable, // For debugging
    };

    // Add additional IDs for faculty
    if (userTypeForToken === 'faculty' && user.faculty_id) {
      tokenPayload.faculty_id = user.faculty_id;
    }

    // Generate JWT token
    const token = jwt.sign(
      tokenPayload,
      process.env.JWT_SECRET || 'your-super-secret-jwt-key-change-in-production',
      { expiresIn: '24h' }
    );

    // ==================== PREPARE USER DATA RESPONSE ====================
    const userData = {
      id: userId,
      email: user.email,
      firstname: user.firstname,
      lastname: user.lastname,
      fullName: `${user.firstname} ${user.lastname}`,
      userType: userTypeForToken,
      user_type: userTypeForToken === 'faculty' ? 2 : 
                userTypeForToken === 'admin' ? 1 : 
                userTypeForToken === 'student' ? 3 : 0,
      school_id: user.school_id || null, // Changed from schoolId to school_id
      schoolId: user.school_id || null, // Keep both for compatibility
      profile_picture: profilePicture, // ADDED: profile_picture field
      avatar: profilePicture, // Keep avatar for compatibility
      foundInTable: foundInTable, // For debugging
    };

    // Add type-specific data
    if (userTypeForToken === 'faculty') {
      userData.department = user.department || 'Not assigned';
      userData.designation = user.designation || 'Faculty';
      
      // Ensure we have faculty ID for API calls
      if (foundInTable === 'faculty_list') {
        userData.faculty_id = user.id;
      } else if (user.faculty_id) {
        userData.faculty_id = user.faculty_id;
      }
      
      console.log(`👨‍🏫 Faculty login data:`, {
        id: userData.id,
        faculty_id: userData.faculty_id,
        department: userData.department,
        profile_picture: userData.profile_picture,
        fromTable: foundInTable
      });
    }
    
    if (userTypeForToken === 'student') {
      userData.classId = user.class_id;
      userData.yearLevel = user.year_level;
      
      // Fetch class info if available
      if (user.class_id) {
        try {
          const [classInfo] = await query(
            'SELECT * FROM class_list WHERE id = ?',
            [user.class_id]
          );
          
          if (classInfo) {
            userData.class = {
              id: classInfo.id,
              curriculum: classInfo.curriculum,
              level: classInfo.level,
              section: classInfo.section,
              academicYear: classInfo.academic_year
            };
          }
        } catch (error) {
          console.log('Note: Could not fetch class info:', error.message);
        }
      }
      
      console.log(`👨‍🎓 Student login data:`, {
        id: userData.id,
        classId: userData.classId,
        profile_picture: userData.profile_picture,
        fromTable: foundInTable
      });
    }
    
    if (userTypeForToken === 'admin') {
      userData.userTypeId = user.user_type || 1;
    }

    console.log(`✅ Login successful for: ${userData.fullName} (${userTypeForToken})`);
    console.log(`📋 Token payload:`, {
      id: tokenPayload.id,
      userType: tokenPayload.userType,
      user_type: tokenPayload.user_type,
      profile_picture: tokenPayload.profile_picture,
      fromTable: foundInTable
    });

    // ==================== RETURN RESPONSE ====================
    res.status(200).json({
      success: true,
      message: 'Login successful',
      token: token,
      user: userData
    });

  } catch (error) {
    console.error('🔥 Server error in login:', error);
    
    // Specific error handling
    if (error.message.includes('data must be a string') || error.message.includes('Illegal arguments')) {
      console.error('❌ BCRYPT ERROR: Password or hash format is invalid');
      return res.status(500).json({
        success: false,
        message: 'Password verification error'
      });
    }
    
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
}