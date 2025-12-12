import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Layout from '@/components/Layout';

export default function AdminDashboard() {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState({
    faculties: 0,
    students: 0,
    evaluations: 0,
    classes: 0
  });
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userData = localStorage.getItem('user');
    
    if (!token || !userData) {
      router.push('/login');
      return;
    }

    const parsedUser = JSON.parse(userData);
    const userType = parsedUser.userType || parsedUser.user_type;
    
    if (userType !== 'admin' && userType !== 1) {
      router.push('/unauthorized');
      return;
    }

    setUser(parsedUser);
    fetchDashboardData();
  }, []);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      
      const [facultyRes, studentRes, evalRes, classRes] = await Promise.all([
        fetch('/api/faculty', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/students', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/evaluations', {
          headers: { Authorization: `Bearer ${token}` }
        }),
        fetch('/api/classes?countOnly=true', {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      const facultyData = await facultyRes.json();
      const studentData = await studentRes.json();
      const evalData = await evalRes.json();
      const classData = await classRes.json();

      setStats({
        faculties: facultyData.success ? facultyData.count : 0,
        students: studentData.success ? studentData.count : 0,
        evaluations: evalData.success ? evalData.count : 0,
        classes: classData.success ? classData.count : 0
      });
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <Layout user={user}>
      <div className="p-6">
        <h1 className="text-3xl font-bold text-gray-800 mb-8">Admin Dashboard</h1>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-blue-100">
                <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-600">Total Faculty</h3>
                <p className="text-2xl font-semibold text-gray-800">{stats.faculties}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-green-100">
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-1.205a21.4 21.4 0 00-2.427-5.07M15.75 9.75h.008v.008h-.008V9.75zm-7.5 0h.008v.008h-.008V9.75z" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-600">Total Students</h3>
                <p className="text-2xl font-semibold text-gray-800">{stats.students}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-purple-100">
                <svg className="w-6 h-6 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-600">Total Evaluations</h3>
                <p className="text-2xl font-semibold text-gray-800">{stats.evaluations}</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <div className="flex items-center">
              <div className="p-3 rounded-lg bg-orange-100">
                <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <div className="ml-4">
                <h3 className="text-sm font-medium text-gray-600">Total Classes</h3>
                <p className="text-2xl font-semibold text-gray-800">{stats.classes}</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h3>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/admin/faculty/new')}
                className="w-full text-left px-4 py-3 bg-blue-50 hover:bg-blue-100 rounded-lg transition"
              >
                Add New Faculty
              </button>
              <button
                onClick={() => router.push('/admin/students/new')}
                className="w-full text-left px-4 py-3 bg-green-50 hover:bg-green-100 rounded-lg transition"
              >
                Add New Student
              </button>
              <button
                onClick={() => router.push('/admin/evaluations')}
                className="w-full text-left px-4 py-3 bg-purple-50 hover:bg-purple-100 rounded-lg transition"
              >
                View Evaluations
              </button>
            </div>
          </div>

          <div className="md:col-span-2 bg-white rounded-xl shadow p-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Activities</h3>
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p>No recent activities</p>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}