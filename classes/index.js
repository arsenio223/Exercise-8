// pages/api/classes/index.js - COMPLETE VERSION (NO AUTH REQUIRED)
import { query } from '@/lib/db';
// REMOVED: import { verifyToken } from '@/lib/auth';

export default async function handler(req, res) {
  console.log('📚 PUBLIC Classes GET API called:', {
    method: req.method,
    url: req.url
  });
  
  // Handle OPTIONS request
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization');
    return res.status(200).end();
  }
  
  if (req.method === 'GET') {
    try {
      console.log('🔍 Fetching classes from database (PUBLIC ACCESS)...');
      
      // Get all active classes - PUBLIC ACCESS
      const classes = await query(`
        SELECT 
          id,
          curriculum,
          level,
          section,
          description,
          academic_year,
          semester,
          is_active
        FROM class_list 
        WHERE is_active = TRUE
        ORDER BY curriculum, level, section
      `);

      console.log(`✅ Found ${classes.length} active classes`);
      
      // Debug: Log all classes
      classes.forEach((cls, index) => {
        console.log(`   ${index + 1}. ID: ${cls.id} - ${cls.curriculum} - Year ${cls.level} - Section ${cls.section} (${cls.description})`);
      });
      
      res.status(200).json(classes);
      
    } catch (error) {
      console.error('❌ Error fetching classes:', error);
      
      // Return empty array so we can see the error
      res.status(200).json([]);
    }
  } else {
    res.status(405).json({ 
      success: false, 
      message: `Method ${req.method} not allowed. Use GET.` 
    });
  }
}