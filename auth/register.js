import { query } from '@/lib/db';
import bcrypt from 'bcryptjs';
import formidable from 'formidable';
import fs from 'fs';
import path from 'path';

export const config = {
  api: {
    bodyParser: false,
  },
};

// Create directory if it doesn't exist
const createUploadsDir = () => {
  const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
    console.log(`📁 Created uploads directory: ${uploadsDir}`);
  }
  return uploadsDir;
};

// Save uploaded file to uploads folder
const saveProfilePicture = (file) => {
  try {
    const uploadsDir = createUploadsDir();
    
    console.log('💾 Saving uploaded profile picture...');

    // Get file extension
    let fileExt = path.extname(file.originalFilename || 'profile.png');
    if (!['.jpg', '.jpeg', '.png', '.gif', '.webp'].includes(fileExt.toLowerCase())) {
      fileExt = '.png';
    }

    // Generate unique filename
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8);
    const filename = `profile_${timestamp}_${randomStr}${fileExt}`;
    const fullPath = path.join(uploadsDir, filename);

    console.log(`📁 Saving as: ${filename}`);

    // Check if we have a file to read
    if (!file.filepath || !fs.existsSync(file.filepath)) {
      console.error('❌ No valid file path found');
      return null;
    }

    // Read the uploaded file
    const fileData = fs.readFileSync(file.filepath);
    
    if (fileData.length === 0) {
      console.error('❌ File is empty');
      return null;
    }

    console.log(`📊 File size: ${fileData.length} bytes`);

    // Save to uploads folder
    fs.writeFileSync(fullPath, fileData);
    console.log(`✅ File saved successfully!`);

    // Clean up temp file
    try {
      if (fs.existsSync(file.filepath)) {
        fs.unlinkSync(file.filepath);
      }
    } catch (cleanupError) {
      console.log('⚠️ Could not delete temp file:', cleanupError.message);
    }

    // Return the path for database
    const dbPath = `/uploads/${filename}`;
    
    // Verify the file was saved
    if (fs.existsSync(fullPath)) {
      console.log(`✅ File verified on disk: ${fullPath}`);
      return dbPath;
    } else {
      console.error(`❌ File NOT found after saving: ${fullPath}`);
      return null;
    }

  } catch (error) {
    console.error('❌ Error saving profile picture:', error);
    return null;
  }
};

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  console.log('🚀 ===== REGISTRATION STARTED =====');

  try {
    // Parse the form with file upload
    const form = formidable({
      maxFileSize: 5 * 1024 * 1024, // 5MB
      keepExtensions: false,
    });

    const [fields, files] = await new Promise((resolve, reject) => {
      form.parse(req, (err, fields, files) => {
        if (err) {
          console.error('❌ Form parsing error:', err);
          reject(err);
          return;
        }
        console.log('✅ Form parsed successfully');
        resolve([fields, files]);
      });
    });

    // ========== EXTRACT FORM DATA ==========
    // Handle all fields as arrays or single values
    const getFieldValue = (field) => {
      if (!field) return '';
      return Array.isArray(field) ? field[0] : field;
    };

    const userType = getFieldValue(fields.userType) || 'student';
    const schoolId = getFieldValue(fields.schoolId) || '';
    const firstname = getFieldValue(fields.firstname) || '';
    const lastname = getFieldValue(fields.lastname) || '';
    const email = getFieldValue(fields.email) || '';
    const password = getFieldValue(fields.password) || '';
    const confirmPassword = getFieldValue(fields.confirmPassword) || '';
    const classId = getFieldValue(fields.classId) || '';
    const selectedAvatar = getFieldValue(fields.selectedAvatar) || ''; // FIXED: Extract correctly
    
    // Handle classesHandled as array
    let classesHandled = [];
    if (fields['classesHandled[]']) {
      classesHandled = Array.isArray(fields['classesHandled[]']) 
        ? fields['classesHandled[]'] 
        : [fields['classesHandled[]']];
    }

    console.log('📝 Registration Data:', {
      userType,
      schoolId,
      firstname,
      lastname,
      email,
      hasProfilePicture: !!files.profilePicture,
      selectedAvatar: selectedAvatar, // Log the selected avatar
      classId
    });

    // ========== VALIDATION ==========
    if (!schoolId || !firstname || !lastname || !email || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'All fields are required' 
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ 
        success: false,
        message: 'Passwords do not match' 
      });
    }

    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters' 
      });
    }

    if (userType === 'student' && !classId) {
      return res.status(400).json({ 
        success: false,
        message: 'Class selection is required for students' 
      });
    }

    // Check if email already exists
    const emailCheck = await query(
      `SELECT email FROM ${userType}_list WHERE email = ?`,
      [email]
    );
    
    if (emailCheck.length > 0) {
      return res.status(400).json({ 
        success: false,
        message: 'Email already exists' 
      });
    }

    // ========== PROCESS PROFILE PICTURE ==========
    console.log('📸 Processing profile picture...');
    
    let profilePicturePath = '/uploads/default-avatar.png'; // Default
    
    // FIRST: Check if user uploaded a file
    if (files.profilePicture && files.profilePicture[0]) {
      console.log('✅ Profile picture uploaded, processing...');
      const uploadedFile = files.profilePicture[0];
      
      const savedPath = saveProfilePicture(uploadedFile);
      
      if (savedPath) {
        profilePicturePath = savedPath;
        console.log(`✅ Uploaded profile picture saved: ${profilePicturePath}`);
      } else {
        console.log('⚠️ Could not save uploaded picture');
      }
    } 
    // SECOND: Check if user selected a default avatar
    else if (selectedAvatar) {
      console.log(`🎯 User selected avatar: "${selectedAvatar}"`);
      
      // Clean the avatar name - remove any path
      let cleanAvatar = selectedAvatar.trim();
      if (cleanAvatar.includes('/')) {
        cleanAvatar = cleanAvatar.split('/').pop();
      }
      
      // List of valid avatars that exist in uploads folder
      const validAvatars = [
        'ad.png',
        'dwight.png',
        'lebron.png',
        'russell.png',
        'default-avatar.png'
      ];
      
      // Check if it's a valid avatar
      if (validAvatars.includes(cleanAvatar)) {
        profilePicturePath = `/uploads/${cleanAvatar}`;
        console.log(`✅ Valid avatar selected: ${profilePicturePath}`);
      } else {
        console.log(`❌ Invalid avatar name: "${cleanAvatar}", using default`);
        profilePicturePath = '/uploads/default-avatar.png';
      }
    } 
    // THIRD: No picture selected or uploaded
    else {
      console.log('ℹ️ No profile picture uploaded or selected, using default avatar');
    }

    console.log(`📝 FINAL profile picture: ${profilePicturePath}`);

    // ========== CREATE USER ==========
    console.log(`👤 Creating ${userType} account...`);
    const hashedPassword = await bcrypt.hash(password, 10);
    let userId;
    let result;

    if (userType === 'student') {
      // Create student
      result = await query(
        `INSERT INTO student_list (school_id, firstname, lastname, email, password, class_id, profile_picture, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, ?, TRUE)`,
        [schoolId, firstname, lastname, email, hashedPassword, classId, profilePicturePath]
      );
      userId = result.insertId;
      console.log(`✅ Student created: ${firstname} ${lastname} (ID: ${userId})`);
      
    } else if (userType === 'faculty') {
      // Create faculty
      result = await query(
        `INSERT INTO faculty_list (school_id, firstname, lastname, email, password, profile_picture, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
        [schoolId, firstname, lastname, email, hashedPassword, profilePicturePath]
      );
      userId = result.insertId;
      console.log(`✅ Faculty created: ${firstname} ${lastname} (ID: ${userId})`);
    }

    // ========== LINK FACULTY TO CLASSES ==========
    if (userType === 'faculty' && classesHandled.length > 0) {
      console.log(`📚 Linking faculty to ${classesHandled.length} classes...`);
      
      for (const classId of classesHandled) {
        try {
          const validClassId = parseInt(classId);
          if (!isNaN(validClassId) && validClassId > 0) {
            await query(
              `INSERT INTO faculty_classes (faculty_id, class_id, status) 
               VALUES (?, ?, 'active')`,
              [userId, validClassId]
            );
            console.log(`   ✅ Linked to class ${validClassId}`);
          }
        } catch (linkError) {
          if (linkError.code === 'ER_DUP_ENTRY') {
            console.log(`   ⚠️ Already linked to class ${classId}`);
          }
        }
      }
    }

    // ========== RETURN SUCCESS ==========
    console.log('🎉 Registration completed successfully!');
    console.log('User details:', {
      userId,
      userType,
      profilePicture: profilePicturePath,
      firstname,
      lastname,
      email
    });

    res.status(201).json({
      success: true,
      message: 'Registration successful! You can now login.',
      userId: userId,
      userType: userType,
      profilePicture: profilePicturePath,
      firstname: firstname,
      lastname: lastname,
      email: email,
      schoolId: schoolId
    });

  } catch (error) {
    console.error('❌ Registration error:', error);
    
    res.status(500).json({ 
      success: false,
      message: 'Registration failed. Please try again.'
    });
  }
}