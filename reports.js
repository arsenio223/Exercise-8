import { query } from '../../lib/db';
import { verifyToken } from '../../lib/auth';

export default async function handler(req, res) {
  // Verify authentication
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = verifyToken(token);
  
  if (!decoded) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    const { type, academic_year, semester, department, start_date, end_date } = req.query;

    let reportData = {};

    switch (type) {
      case 'overview':
        reportData = await getOverviewReport(academic_year, semester, department);
        break;
      case 'faculty':
        reportData = await getFacultyReport(academic_year, semester, department);
        break;
      case 'department':
        reportData = await getDepartmentReport(academic_year, semester);
        break;
      case 'detailed':
        reportData = await getDetailedReport(academic_year, semester, department, start_date, end_date);
        break;
      default:
        reportData = await getOverviewReport(academic_year, semester, department);
    }

    res.status(200).json(reportData);
  } catch (error) {
    console.error('Report generation error:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
}

async function getOverviewReport(academicYear, semester, department) {
  const conditions = [];
  const params = [];

  if (academicYear) {
    conditions.push('e.academic_year = ?');
    params.push(academicYear);
  }
  if (semester) {
    conditions.push('e.semester = ?');
    params.push(semester);
  }
  if (department) {
    conditions.push('f.department = ?');
    params.push(department);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const [
    statistics,
    departmentPerformance,
    topFaculty,
    recentEvaluations,
    ratingDistribution
  ] = await Promise.all([
    // Statistics
    query(`
      SELECT 
        COUNT(DISTINCT s.id) as totalStudents,
        COUNT(DISTINCT f.id) as totalFaculty,
        COUNT(DISTINCT e.id) as totalEvaluations,
        AVG(e.percentage_score) as averageRating,
        COUNT(DISTINCT CASE WHEN f.is_active THEN f.id END) as activeFaculty,
        ROUND((COUNT(DISTINCT e.id) / (COUNT(DISTINCT s.id) * 5) * 100), 2) as completionRate
      FROM student_list s
      LEFT JOIN faculty_list f ON f.is_active = TRUE
      LEFT JOIN evaluation_list e ON e.status = 'submitted'
      ${whereClause}
    `, params),

    // Department Performance
    query(`
      SELECT 
        d.department_name,
        COUNT(DISTINCT f.id) as faculty_count,
        COUNT(DISTINCT e.id) as evaluation_count,
        AVG(e.percentage_score) as avg_score,
        MIN(e.percentage_score) as min_score,
        MAX(e.percentage_score) as max_score
      FROM departments d
      LEFT JOIN faculty_list f ON d.department_name = f.department AND f.is_active = TRUE
      LEFT JOIN evaluation_list e ON f.id = e.faculty_id AND e.status = 'submitted'
      ${department ? 'WHERE d.department_name = ?' : ''}
      GROUP BY d.department_name
      ORDER BY avg_score DESC
    `, department ? [department] : []),

    // Top Faculty
    query(`
      SELECT 
        f.id,
        CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
        f.department,
        f.designation,
        COUNT(e.id) as total_evaluations,
        AVG(e.percentage_score) as avg_score,
        AVG(e.average_rating) as avg_rating
      FROM faculty_list f
      JOIN evaluation_list e ON f.id = e.faculty_id
      WHERE e.status = 'submitted'
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      GROUP BY f.id
      HAVING COUNT(e.id) >= 3
      ORDER BY avg_score DESC
      LIMIT 10
    `, params),

    // Recent Evaluations
    query(`
      SELECT 
        e.*,
        CONCAT(s.firstname, ' ', s.lastname) as student_name,
        CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
        sub.subject,
        c.curriculum,
        c.level,
        c.section
      FROM evaluation_list e
      JOIN student_list s ON e.student_id = s.id
      JOIN faculty_list f ON e.faculty_id = f.id
      JOIN subject_list sub ON e.subject_id = sub.id
      LEFT JOIN class_list c ON e.class_id = c.id
      WHERE e.status = 'submitted'
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      ORDER BY e.date_taken DESC
      LIMIT 20
    `, params),

    // Rating Distribution
    query(`
      SELECT 
        CASE 
          WHEN percentage_score >= 90 THEN 'Excellent (90-100)'
          WHEN percentage_score >= 80 THEN 'Very Good (80-89)'
          WHEN percentage_score >= 70 THEN 'Good (70-79)'
          WHEN percentage_score >= 60 THEN 'Fair (60-69)'
          ELSE 'Needs Improvement (<60)'
        END as rating_range,
        COUNT(*) as count,
        ROUND((COUNT(*) / (SELECT COUNT(*) FROM evaluation_list WHERE status = 'submitted' ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}) * 100), 2) as percentage
      FROM evaluation_list e
      JOIN faculty_list f ON e.faculty_id = f.id
      WHERE e.status = 'submitted'
      ${conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : ''}
      GROUP BY rating_range
      ORDER BY rating_range
    `, params)
  ]);

  return {
    statistics: statistics[0] || {},
    departmentPerformance: departmentPerformance || [],
    topFaculty: topFaculty || [],
    recentEvaluations: recentEvaluations || [],
    ratingDistribution: ratingDistribution || []
  };
}

async function getFacultyReport(academicYear, semester, department) {
  // Implement faculty-specific report
  const queryStr = `
    SELECT 
      f.id,
      f.school_id,
      CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
      f.department,
      f.designation,
      f.email,
      COUNT(DISTINCT e.id) as total_evaluations,
      AVG(e.percentage_score) as avg_score,
      AVG(e.average_rating) as avg_rating,
      MIN(e.percentage_score) as min_score,
      MAX(e.percentage_score) as max_score,
      STDDEV(e.percentage_score) as std_deviation,
      GROUP_CONCAT(DISTINCT sub.subject SEPARATOR ', ') as subjects_taught
    FROM faculty_list f
    LEFT JOIN evaluation_list e ON f.id = e.faculty_id AND e.status = 'submitted'
    LEFT JOIN subject_list sub ON e.subject_id = sub.id
    WHERE f.is_active = TRUE
    ${academicYear ? 'AND e.academic_year = ?' : ''}
    ${semester ? 'AND e.semester = ?' : ''}
    ${department ? 'AND f.department = ?' : ''}
    GROUP BY f.id
    ORDER BY avg_score DESC
  `;

  const params = [];
  if (academicYear) params.push(academicYear);
  if (semester) params.push(semester);
  if (department) params.push(department);

  const facultyData = await query(queryStr, params);

  // Get criteria breakdown for each faculty
  const facultyWithDetails = await Promise.all(
    facultyData.map(async (faculty) => {
      const criteriaBreakdown = await query(`
        SELECT 
          cl.criteria_name,
          AVG(ec.rating) as avg_rating,
          COUNT(ec.id) as rating_count
        FROM evaluation_criteria ec
        JOIN criteria_list cl ON ec.criteria_id = cl.id
        JOIN evaluation_list e ON ec.evaluation_id = e.id
        WHERE e.faculty_id = ? AND e.status = 'submitted'
        ${academicYear ? 'AND e.academic_year = ?' : ''}
        ${semester ? 'AND e.semester = ?' : ''}
        GROUP BY cl.id
        ORDER BY cl.order_by
      `, [faculty.id, ...(academicYear ? [academicYear] : []), ...(semester ? [semester] : [])]);

      return {
        ...faculty,
        criteria_breakdown: criteriaBreakdown,
        performance_trend: await getFacultyTrend(faculty.id, academicYear)
      };
    })
  );

  return {
    faculty: facultyWithDetails,
    summary: {
      totalFaculty: facultyData.length,
      averageScore: facultyData.reduce((acc, f) => acc + (f.avg_score || 0), 0) / facultyData.length,
      highestScore: Math.max(...facultyData.map(f => f.avg_score || 0)),
      lowestScore: Math.min(...facultyData.map(f => f.avg_score || 0))
    }
  };
}

async function getFacultyTrend(facultyId, academicYear) {
  const trendData = await query(`
    SELECT 
      DATE_FORMAT(date_taken, '%Y-%m') as month,
      COUNT(*) as evaluation_count,
      AVG(percentage_score) as avg_score
    FROM evaluation_list
    WHERE faculty_id = ? 
      AND status = 'submitted'
      ${academicYear ? 'AND academic_year = ?' : 'AND date_taken >= DATE_SUB(NOW(), INTERVAL 6 MONTH)'}
    GROUP BY DATE_FORMAT(date_taken, '%Y-%m')
    ORDER BY month
  `, academicYear ? [facultyId, academicYear] : [facultyId]);

  return trendData;
}

async function getDepartmentReport(academicYear, semester) {
  const departmentData = await query(`
    SELECT 
      d.department_name,
      d.department_code,
      COUNT(DISTINCT f.id) as faculty_count,
      COUNT(DISTINCT e.id) as evaluation_count,
      AVG(e.percentage_score) as avg_score,
      AVG(e.average_rating) as avg_rating,
      MIN(e.percentage_score) as min_score,
      MAX(e.percentage_score) as max_score,
      GROUP_CONCAT(DISTINCT CONCAT(f.firstname, ' ', f.lastname) SEPARATOR ', ') as faculty_names
    FROM departments d
    LEFT JOIN faculty_list f ON d.department_name = f.department AND f.is_active = TRUE
    LEFT JOIN evaluation_list e ON f.id = e.faculty_id AND e.status = 'submitted'
    WHERE 1=1
    ${academicYear ? 'AND e.academic_year = ?' : ''}
    ${semester ? 'AND e.semester = ?' : ''}
    GROUP BY d.id
    ORDER BY avg_score DESC
  `, [academicYear, semester].filter(Boolean));

  // Get criteria breakdown by department
  const departmentsWithDetails = await Promise.all(
    departmentData.map(async (dept) => {
      const criteriaBreakdown = await query(`
        SELECT 
          cl.criteria_name,
          AVG(ec.rating) as avg_rating,
          COUNT(ec.id) as rating_count
        FROM evaluation_criteria ec
        JOIN criteria_list cl ON ec.criteria_id = cl.id
        JOIN evaluation_list e ON ec.evaluation_id = e.id
        JOIN faculty_list f ON e.faculty_id = f.id
        WHERE f.department = ? AND e.status = 'submitted'
        ${academicYear ? 'AND e.academic_year = ?' : ''}
        ${semester ? 'AND e.semester = ?' : ''}
        GROUP BY cl.id
        ORDER BY cl.order_by
      `, [dept.department_name, ...(academicYear ? [academicYear] : []), ...(semester ? [semester] : [])]);

      return {
        ...dept,
        criteria_breakdown: criteriaBreakdown
      };
    })
  );

  return {
    departments: departmentsWithDetails,
    summary: {
      totalDepartments: departmentData.length,
      overallAverage: departmentData.reduce((acc, d) => acc + (d.avg_score || 0), 0) / departmentData.length,
      totalEvaluations: departmentData.reduce((acc, d) => acc + (d.evaluation_count || 0), 0),
      totalFaculty: departmentData.reduce((acc, d) => acc + (d.faculty_count || 0), 0)
    }
  };
}

async function getDetailedReport(academicYear, semester, department, startDate, endDate) {
  const conditions = [];
  const params = [];

  if (academicYear) {
    conditions.push('e.academic_year = ?');
    params.push(academicYear);
  }
  if (semester) {
    conditions.push('e.semester = ?');
    params.push(semester);
  }
  if (department) {
    conditions.push('f.department = ?');
    params.push(department);
  }
  if (startDate) {
    conditions.push('e.date_taken >= ?');
    params.push(startDate);
  }
  if (endDate) {
    conditions.push('e.date_taken <= ?');
    params.push(endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const detailedData = await query(`
    SELECT 
      e.*,
      CONCAT(s.firstname, ' ', s.lastname) as student_name,
      s.school_id as student_id,
      CONCAT(f.firstname, ' ', f.lastname) as faculty_name,
      f.department,
      f.designation,
      sub.subject,
      sub.code as subject_code,
      c.curriculum,
      c.level,
      c.section,
      a.year_name as academic_year_name,
      GROUP_CONCAT(
        CONCAT(cl.criteria_name, ': ', ec.rating, '/5')
        ORDER BY cl.order_by SEPARATOR '; '
      ) as criteria_ratings
    FROM evaluation_list e
    JOIN student_list s ON e.student_id = s.id
    JOIN faculty_list f ON e.faculty_id = f.id
    JOIN subject_list sub ON e.subject_id = sub.id
    LEFT JOIN class_list c ON e.class_id = c.id
    LEFT JOIN academic_years a ON e.academic_year = a.year_code
    LEFT JOIN evaluation_criteria ec ON e.id = ec.evaluation_id
    LEFT JOIN criteria_list cl ON ec.criteria_id = cl.id
    ${whereClause}
    GROUP BY e.id
    ORDER BY e.date_taken DESC
  `, params);

  return {
    evaluations: detailedData,
    filters: {
      academic_year: academicYear,
      semester: semester,
      department: department,
      start_date: startDate,
      end_date: endDate
    },
    summary: {
      totalEvaluations: detailedData.length,
      averageScore: detailedData.reduce((acc, e) => acc + (e.percentage_score || 0), 0) / detailedData.length,
      dateRange: {
        start: detailedData.length > 0 ? detailedData[detailedData.length - 1].date_taken : null,
        end: detailedData.length > 0 ? detailedData[0].date_taken : null
      }
    }
  };
}