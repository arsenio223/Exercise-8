import db from '../../../lib/db';
import crypto from 'crypto';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      message: 'Method not allowed' 
    });
  }

  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ 
        success: false,
        message: 'Email is required' 
      });
    }

    // Check in all tables
    let user = null;
    let userType = null;

    // Check users table
    let [rows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length > 0) {
      user = rows[0];
      userType = 'users';
    }

    // Check faculty table
    if (!user) {
      [rows] = await db.query('SELECT * FROM faculty_list WHERE email = ?', [email]);
      if (rows.length > 0) {
        user = rows[0];
        userType = 'faculty_list';
      }
    }

    // Check student table
    if (!user) {
      [rows] = await db.query('SELECT * FROM student_list WHERE email = ?', [email]);
      if (rows.length > 0) {
        user = rows[0];
        userType = 'student_list';
      }
    }

    if (!user) {
      return res.status(404).json({ 
        success: false,
        message: 'Email not found' 
      });
    }

    // Generate reset token - 32 bytes = 64 hex characters
    const resetToken = crypto.randomBytes(32).toString('hex');
    console.log('=== GENERATED TOKEN DEBUG ===');
    console.log('Raw token (64 chars):', resetToken);
    console.log('Raw token length:', resetToken.length);
    
    // Hash the token for database storage
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    console.log('Hashed token (64 chars):', resetTokenHash);
    console.log('Hashed token length:', resetTokenHash.length);
    
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour from now

    // Store reset token in database
    await db.query(
      `INSERT INTO password_resets (email, token, expires_at, user_type, used) 
       VALUES (?, ?, ?, ?, 0)`,
      [email, resetTokenHash, resetTokenExpiry, userType]
    );

    // Create reset URL
    const resetUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    console.log('=== FOR USER ===');
    console.log('Reset URL for', email, ':', resetUrl);
    console.log('=== END DEBUG ===');

    // Return success (no email sending)
    res.status(200).json({ 
      success: true,
      message: 'Password reset initiated. Check console for reset link.',
      debug_info: {
        email: email,
        reset_url: resetUrl
      }
    });

  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error' 
    });
  }
}