// pages/api/classes/create.js
import { query } from '@/lib/db';
import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  console.log('📝 Class CREATE API called:', {
    method: req.method,
    url: req.url
  });
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
    return res.status(200).end();
  }
  
  if (req.method === 'POST') {
    try {
      // Check authorization
      const token = req.headers.authorization?.split(' ')[1];
      const decoded = verifyToken(token);
      
      if (!decoded) {
        console.log('❌ Invalid or missing token');
        return res.status(401).json({ 
          success: false, 
          message: 'Unauthorized' 
        });
      }

      const { curriculum, level, section, description, academic_year, semester } = req.body;
      console.log('📋 Class data received:', { curriculum, level, section, description, academic_year, semester });
      
      // Validate required fields
      if (!curriculum || !level || !section || !academic_year) {
        return res.status(400).json({ 
          success: false, 
          message: 'Missing required fields: curriculum, level, section, academic_year' 
        });
      }

      // Check if class already exists
      const existingClass = await query(
        `SELECT id FROM class_list 
         WHERE curriculum = ? AND level = ? AND section = ? AND academic_year = ? AND is_active = TRUE`,
        [curriculum, level, section, academic_year]
      );

      if (existingClass.length > 0) {
        return res.status(400).json({ 
          success: false, 
          message: 'Class already exists' 
        });
      }

      // Insert new class - using date_created column (auto sets current_timestamp)
      const result = await query(
        `INSERT INTO class_list (curriculum, level, section, description, academic_year, semester, is_active) 
         VALUES (?, ?, ?, ?, ?, ?, TRUE)`,
        [curriculum, level, section, description || null, academic_year, semester || 1]
      );

      console.log('✅ Class created with ID:', result.insertId);

      // Get the created class
      const newClass = await query(
        `SELECT id, curriculum, level, section, description, academic_year, semester
         FROM class_list WHERE id = ?`,
        [result.insertId]
      );

      res.status(201).json({ 
        success: true, 
        message: 'Class created successfully',
        data: newClass[0]
      });
      
    } catch (error) {
      console.error('❌ Error creating class:', error);
      res.status(500).json({ 
        success: false, 
        message: 'Error creating class: ' + error.message
      });
    }
  } else {
    res.status(405).json({ 
      success: false, 
      message: `Method ${req.method} not allowed. Use POST.` 
    });
  }
}