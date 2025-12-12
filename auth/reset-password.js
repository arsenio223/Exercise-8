import db from '../../../lib/db';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ 
      success: false,
      message: 'Method not allowed' 
    });
  }

  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ 
        success: false,
        message: 'Token and password are required' 
      });
    }

    console.log('=== RESET PASSWORD DEBUG ===');
    console.log('Received token:', token);
    console.log('Received token length:', token.length);
    console.log('Expected length: 64 characters');

    // Hash the token to compare with database
    const resetTokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    console.log('Hashed token:', resetTokenHash);
    console.log('Looking in database for this hash...');

    // Find valid reset token
    const [resetTokens] = await db.query(
      `SELECT * FROM password_resets 
       WHERE token = ? AND expires_at > NOW() AND used = 0`,
      [resetTokenHash]
    );

    console.log('Database query result:', resetTokens.length, 'tokens found');
    
    if (resetTokens.length === 0) {
      // Check if token exists but expired or used
      const [allTokenRecords] = await db.query(
        'SELECT * FROM password_resets WHERE token = ?',
        [resetTokenHash]
      );
      
      if (allTokenRecords.length > 0) {
        const record = allTokenRecords[0];
        console.log('Token exists but:');
        console.log('- Used status:', record.used);
        console.log('- Expires at:', record.expires_at);
        console.log('- Current time:', new Date());
        
        if (record.used === 1) {
          return res.status(400).json({ 
            success: false,
            message: 'This reset link has already been used' 
          });
        } else {
          return res.status(400).json({ 
            success: false,
            message: 'Reset link has expired. Please request a new one.' 
          });
        }
      }
      
      return res.status(400).json({ 
        success: false,
        message: 'Invalid reset token. Please check the link.' 
      });
    }

    const resetToken = resetTokens[0];
    console.log('Found valid token for:', resetToken.email);
    console.log('User type:', resetToken.user_type);

    // Validate password
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false,
        message: 'Password must be at least 6 characters' 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 10);
    console.log('Password hashed successfully');

    // Update password in appropriate table
    let updateQuery;
    let updateParams;
    
    switch (resetToken.user_type) {
      case 'users':
        updateQuery = 'UPDATE users SET password = ? WHERE email = ?';
        updateParams = [hashedPassword, resetToken.email];
        break;
      case 'faculty_list':
        updateQuery = 'UPDATE faculty_list SET password = ? WHERE email = ?';
        updateParams = [hashedPassword, resetToken.email];
        break;
      case 'student_list':
        updateQuery = 'UPDATE student_list SET password = ? WHERE email = ?';
        updateParams = [hashedPassword, resetToken.email];
        break;
      default:
        throw new Error('Invalid user type: ' + resetToken.user_type);
    }

    // Update the password
    const [updateResult] = await db.query(updateQuery, updateParams);
    console.log('Password updated. Affected rows:', updateResult.affectedRows);

    // Mark reset token as used
    await db.query(
      'UPDATE password_resets SET used = 1 WHERE id = ?',
      [resetToken.id]
    );
    console.log('Token marked as used');

    res.status(200).json({ 
      success: true,
      message: 'Password reset successful. You can now login with your new password.' 
    });

    console.log('=== RESET COMPLETE ===');

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ 
      success: false,
      message: 'Internal server error: ' + error.message 
    });
  }
}