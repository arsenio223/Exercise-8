import { supabase } from '@/lib/supabase';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const token = req.headers.authorization?.replace('Bearer ', '');
    const { faculty_id } = req.query;

    if (!faculty_id) {
      return res.status(400).json({ message: 'Faculty ID is required' });
    }

    // Verify admin access
    // Add your auth verification logic here

    // Fetch classes for this faculty with subject information
    const { data: facultyClasses, error: classError } = await supabase
      .from('faculty_classes')
      .select(`
        *,
        class:class_id(id, class_code, class_name, section),
        subject:subject_id(id, subject_code, subject_name)
      `)
      .eq('faculty_id', faculty_id);

    if (classError) {
      throw classError;
    }

    // Get evaluation form IDs for current academic year
    const { data: evalForms, error: formError } = await supabase
      .from('evaluation_forms')
      .select('id')
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1);

    if (formError) {
      throw formError;
    }

    // Get student counts per class
    const formattedClasses = await Promise.all(
      facultyClasses.map(async (facultyClass) => {
        let studentCount = 0;
        
        if (facultyClass.class && evalForms.length > 0) {
          // Count students who have evaluations for this class
          const { count, error: countError } = await supabase
            .from('evaluation_responses')
            .select('*', { count: 'exact', head: true })
            .eq('faculty_id', faculty_id)
            .eq('class_id', facultyClass.class_id)
            .eq('evaluation_form_id', evalForms[0].id);

          if (!countError) {
            studentCount = count || 0;
          }
        }

        return {
          id: facultyClass.id,
          class_id: facultyClass.class_id,
          class_name: facultyClass.class?.class_name || 'Unknown Class',
          class_code: facultyClass.class?.class_code,
          section: facultyClass.class?.section,
          subject_id: facultyClass.subject_id,
          subject_name: facultyClass.subject?.subject_name || 'Unknown Subject',
          subject_code: facultyClass.subject?.subject_code,
          student_count: studentCount
        };
      })
    );

    res.status(200).json({ 
      success: true, 
      data: formattedClasses 
    });

  } catch (error) {
    console.error('Error fetching classes:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Internal server error' 
    });
  }
}