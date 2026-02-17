'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import Notifications from '@/Components/common/Notifications';

export default function Admin() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');

  // Data
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [approvedDoctors, setApprovedDoctors] = useState([]);
  const [allPatients, setAllPatients] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [recentAppointments, setRecentAppointments] = useState([]);
  const [stats, setStats] = useState({
    totalInvoice: 0,
    totalPatients: 0,
    totalAppointments: 0,
    totalBedrooms: 0,
    invoiceChange: 0,
    patientsChange: 0,
    appointmentsChange: 0,
    bedroomsChange: 0
  });

  // Chart data
  const [patientChartData, setPatientChartData] = useState([]);
  const [revenueChartData, setRevenueChartData] = useState([]);
  const [patientDemographics, setPatientDemographics] = useState({
    child: 0,
    adult: 0,
    elderly: 0
  });

  // Calendar
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData();
      generateChartData();
      setupRealTimeListeners();
    }

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [isAuthenticated]);

  const checkAuth = async () => {
    try {
      const userRole = localStorage.getItem('userRole');
      const isAdmin = localStorage.getItem('isAdmin');

      if (userRole !== 'admin' || isAdmin !== 'true') {
        router.push('/Login');
        return;
      }

      setIsAuthenticated(true);
    } catch (error) {
      console.error('Auth error:', error);
      router.push('/Login');
    } finally {
      setLoading(false);
    }
  };

  const fetchAllData = async () => {
    try {
      // Fetch pending doctors
      const { data: pending, error: pendingError } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'doctor')
        .eq('is_approved', false);

      if (pendingError) throw pendingError;
      setPendingDoctors(pending || []);

      // Fetch approved doctors
      const { data: approved, error: approvedError } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'doctor')
        .eq('is_approved', true);

      if (approvedError) throw approvedError;
      setApprovedDoctors(approved || []);

      // Fetch all patients
      const { data: patients, error: patientsError } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'patient');

      if (patientsError) throw patientsError;
      setAllPatients(patients || []);

      // Fetch all appointments
      const { data: appointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:patient_id(name, email),
          doctor:doctor_id(name, specialization),
          time_slot:slot_id(date, start_time, end_time)
        `)
        .order('created_at', { ascending: false });

      if (appointmentsError) throw appointmentsError;
      setAllAppointments(appointments || []);

      // Get today's appointments
      const today = new Date().toISOString().split('T')[0];
      const todayAppts = appointments?.filter(apt => apt.time_slot?.date === today) || [];
      setRecentAppointments(todayAppts.slice(0, 5));

      // Calculate patient demographics (mock data for demo)
      const totalPatientsCount = patients?.length || 0;
      setPatientDemographics({
        child: Math.floor(totalPatientsCount * 0.25),
        adult: Math.floor(totalPatientsCount * 0.55),
        elderly: Math.floor(totalPatientsCount * 0.20)
      });

      // Calculate stats with mock changes
      setStats({
        totalInvoice: appointments?.length ? appointments.length * 50.99 : 0,
        totalPatients: totalPatientsCount,
        totalAppointments: appointments?.length || 0,
        totalBedrooms: 315, // Mock data
        invoiceChange: 2.14,
        patientsChange: 33.78,
        appointmentsChange: -1.56,
        bedroomsChange: 1.66
      });
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const setupRealTimeListeners = () => {
    try {
      const sub = supabase
        .from('users')
        .on('UPDATE', (payload) => {
          // Refresh pending doctors list when a doctor is approved
          if (payload.new.role === 'doctor' && payload.new.is_approved) {
            fetchAllData();
          }
        })
        .subscribe();

      setSubscription(sub);
    } catch (err) {
      console.error('Error setting up real-time listeners:', err);
    }
  };

  const generateChartData = () => {
    // Generate patient overview data for last 7 days
    const days = ['4 Jul', '5 Jul', '6 Jul', '7 Jul', '8 Jul', '9 Jul', '10 Jul', '11 Jul'];
    const chartData = days.map(day => ({
      day,
      child: Math.floor(Math.random() * 100) + 40,
      adult: Math.floor(Math.random() * 130) + 80,
      elderly: Math.floor(Math.random() * 60) + 20
    }));
    setPatientChartData(chartData);

    // Generate revenue data
    const revenueDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const revenueData = revenueDays.map((day, index) => ({
      day,
      income: 0.8 + Math.sin(index * 0.8) * 0.3 + Math.random() * 0.1,
      expense: 0.4 + Math.cos(index * 0.7) * 0.2 + Math.random() * 0.1
    }));
    setRevenueChartData(revenueData);
  };

  const handleApproveDoctor = async (doctorId) => {
    try {
      const { error } = await supabase
        .from('users')
        .update({ is_approved: true })
        .eq('id', doctorId);

      if (error) throw error;

      // Create notification for doctor
      await supabase
        .from('notifications')
        .insert([
          {
            user_id: doctorId,
            type: 'account_approved',
            title: 'Account Approved',
            message: 'Your doctor account has been approved! You can now start accepting appointments.'
          }
        ]);

      alert('Doctor approved successfully!');
      fetchAllData();
    } catch (error) {
      console.error('Error approving doctor:', error);
      alert('Failed to approve doctor');
    }
  };

  const handleRejectDoctor = async (doctorId) => {
    if (!confirm('Are you sure you want to reject this doctor application?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('users')
        .delete()
        .eq('id', doctorId);

      if (error) throw error;

      alert('Doctor application rejected');
      fetchAllData();
    } catch (error) {
      console.error('Error rejecting doctor:', error);
      alert('Failed to reject doctor');
    }
  };

  const handleLogout = () => {
    localStorage.clear();
    router.push('/Login');
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric' 
    });
  };

  const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const getDatesInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const dates = [];

    const startDay = firstDay.getDay();
    for (let i = 0; i < startDay; i++) {
      dates.push(null);
    }

    for (let date = 1; date <= lastDay.getDate(); date++) {
      dates.push(new Date(year, month, date));
    }

    return dates;
  };

  const getAppointmentsForDate = (date) => {
    if (!date) return [];
    const dateStr = date.toISOString().split('T')[0];
    return allAppointments.filter(apt => apt.time_slot?.date === dateStr);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <h1 className="text-xl font-bold text-gray-900">WellNest</h1>
            </div>

            <div className="flex-1 max-w-md mx-8">
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search anything"
                  className="w-full px-4 py-2 pl-10 bg-gray-100 border-0 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 text-sm"
                />
                <svg className="w-5 h-5 text-gray-400 absolute left-3 top-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <button className="p-2 hover:bg-gray-100 rounded-lg">
                <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </button>
              <Notifications isAdmin={isAuthenticated} />
              <div className="flex items-center space-x-3">
                <img src="/api/placeholder/40/40" alt="Admin" className="w-10 h-10 rounded-full" />
                <div>
                  <p className="text-sm font-semibold text-gray-900">Admin</p>
                  <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-gray-700">Logout</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-screen p-4">
          <nav className="space-y-1">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition ${
                currentView === 'dashboard'
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="font-medium">Dashboard</span>
            </button>

            <button
              onClick={() => setCurrentView('appointments')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition ${
                currentView === 'appointments'
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span className="font-medium">Appointments</span>
            </button>

            <button
              onClick={() => setCurrentView('patients')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition ${
                currentView === 'patients'
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <span className="font-medium">Patients</span>
            </button>

            <button
              onClick={() => setCurrentView('doctors')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition ${
                currentView === 'doctors'
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span className="font-medium">Doctors</span>
            </button>

            <button
              onClick={() => setCurrentView('pending')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition ${
                currentView === 'pending'
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="font-medium">Doctor Approvals</span>
              {pendingDoctors.length > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingDoctors.length}
                </span>
              )}
            </button>

            <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-50 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
              <span className="font-medium">Departments</span>
            </button>

            <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-50 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="font-medium">Doctors' Schedule</span>
            </button>

            <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-50 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="font-medium">Payments</span>
            </button>

            <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-50 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
              <span className="font-medium">Inventory</span>
            </button>

            <button className="w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-gray-600 hover:bg-gray-50 transition">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
              </svg>
              <span className="font-medium">Messages</span>
              <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                9
              </span>
            </button>
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-6">
          {currentView === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2 text-gray-600 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>Total Invoice</span>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <h3 className="text-3xl font-bold text-gray-900">
                        {Math.floor(stats.totalInvoice).toLocaleString()}
                      </h3>
                      <p className="text-xs text-gray-500 mt-1">56 more than yesterday</p>
                    </div>
                    <div className="flex items-center space-x-1 text-teal-600 bg-teal-50 px-2 py-1 rounded text-xs font-semibold">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      <span>{stats.invoiceChange}%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2 text-gray-600 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                      </svg>
                      <span>Total Patients</span>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <h3 className="text-3xl font-bold text-gray-900">{stats.totalPatients}</h3>
                      <p className="text-xs text-gray-500 mt-1">45 more than yesterday</p>
                    </div>
                    <div className="flex items-center space-x-1 text-teal-600 bg-teal-50 px-2 py-1 rounded text-xs font-semibold">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      <span>{stats.patientsChange}%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2 text-gray-600 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Appointments</span>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <h3 className="text-3xl font-bold text-gray-900">{stats.totalAppointments}</h3>
                      <p className="text-xs text-gray-500 mt-1">18 less than yesterday</p>
                    </div>
                    <div className="flex items-center space-x-1 text-red-600 bg-red-50 px-2 py-1 rounded text-xs font-semibold">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                      </svg>
                      <span>{Math.abs(stats.appointmentsChange)}%</span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-2 text-gray-600 text-sm">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      <span>Bedroom</span>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>
                  <div className="flex items-end justify-between">
                    <div>
                      <h3 className="text-3xl font-bold text-gray-900">{stats.totalBedrooms}</h3>
                      <p className="text-xs text-gray-500 mt-1">56 more than yesterday</p>
                    </div>
                    <div className="flex items-center space-x-1 text-teal-600 bg-teal-50 px-2 py-1 rounded text-xs font-semibold">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
                      </svg>
                      <span>{stats.bedroomsChange}%</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Patient Overview Chart */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Patient Overview</h3>
                      <p className="text-xs text-gray-500">by Age Stages</p>
                    </div>
                    <select className="px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg">
                      <option>Last 8 Days</option>
                      <option>Last 30 Days</option>
                      <option>Last 90 Days</option>
                    </select>
                  </div>

                  <div className="flex items-center space-x-6 mb-6">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-gray-800"></div>
                      <span className="text-xs text-gray-600">Child</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-teal-400"></div>
                      <span className="text-xs text-gray-600">Adult</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-gray-300"></div>
                      <span className="text-xs text-gray-600">Elderly</span>
                    </div>
                  </div>

                  {/* Simple Bar Chart */}
                  <div className="h-64 flex items-end justify-between space-x-4">
                    {patientChartData.map((data, index) => (
                      <div key={index} className="flex-1 flex flex-col items-center space-y-2">
                        <div className="w-full flex flex-col items-center space-y-1">
                          <div className="w-full bg-gray-800 rounded-t" style={{ height: `${data.adult}px` }}></div>
                          <div className="w-full bg-teal-400 rounded" style={{ height: `${data.child}px` }}></div>
                          <div className="w-full bg-gray-300 rounded-b" style={{ height: `${data.elderly}px` }}></div>
                        </div>
                        <span className="text-xs text-gray-500">{data.day}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Revenue Chart */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-900">Revenue</h3>
                    <div className="flex items-center space-x-2">
                      <button className="px-3 py-1.5 bg-gray-800 text-white text-xs rounded-lg">Week</button>
                      <button className="px-3 py-1.5 text-gray-600 text-xs rounded-lg hover:bg-gray-100">Month</button>
                      <button className="px-3 py-1.5 text-gray-600 text-xs rounded-lg hover:bg-gray-100">Year</button>
                    </div>
                  </div>

                  <div className="flex items-center space-x-6 mb-6">
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-gray-800"></div>
                      <span className="text-xs text-gray-600">Income</span>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="w-3 h-3 rounded-full bg-teal-400"></div>
                      <span className="text-xs text-gray-600">Expense</span>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-3xl font-bold text-gray-900">$1,495</div>
                  </div>

                  {/* Simple Line Chart */}
                  <div className="h-48 relative">
                    <svg className="w-full h-full">
                      {/* Grid lines */}
                      {[0, 1, 2, 3].map(i => (
                        <line
                          key={i}
                          x1="0"
                          y1={i * 48}
                          x2="100%"
                          y2={i * 48}
                          stroke="#f3f4f6"
                          strokeWidth="1"
                        />
                      ))}
                      
                      {/* Income line */}
                      <polyline
                        points={revenueChartData.map((d, i) => {
                          const x = (i / (revenueChartData.length - 1)) * 100;
                          const y = (1 - d.income) * 100;
                          return `${x}%,${y}%`;
                        }).join(' ')}
                        fill="none"
                        stroke="#1f2937"
                        strokeWidth="2"
                      />
                      
                      {/* Expense line */}
                      <polyline
                        points={revenueChartData.map((d, i) => {
                          const x = (i / (revenueChartData.length - 1)) * 100;
                          const y = (1 - d.expense) * 100;
                          return `${x}%,${y}%`;
                        }).join(' ')}
                        fill="none"
                        stroke="#2dd4bf"
                        strokeWidth="2"
                      />
                    </svg>
                    
                    {/* X-axis labels */}
                    <div className="flex justify-between mt-2">
                      {revenueChartData.map((d, i) => (
                        <span key={i} className="text-xs text-gray-500">{d.day}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Patient Demographics */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-6">
                    <div>
                      <h3 className="text-lg font-bold text-gray-900">Patient Overview</h3>
                      <p className="text-xs text-gray-500">by Departments</p>
                    </div>
                    <button className="text-gray-400 hover:text-gray-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>

                  <div className="flex items-center justify-center mb-6">
                    <div className="relative w-48 h-48">
                      {/* Simple pie chart representation */}
                      <svg viewBox="0 0 100 100" className="transform -rotate-90">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="#e5e7eb" strokeWidth="20" />
                        <circle
                          cx="50"
                          cy="50"
                          r="40"
                          fill="none"
                          stroke="#1e293b"
                          strokeWidth="20"
                          strokeDasharray={`${(patientDemographics.child / stats.totalPatients) * 251} 251`}
                          strokeDashoffset="0"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <div className="text-3xl font-bold text-gray-900">
                          {stats.totalPatients.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">This Week</div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <div className="w-3 h-3 rounded-full bg-gray-800"></div>
                        <span className="text-sm text-gray-600">Overall</span>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">{stats.totalPatients}</span>
                    </div>
                  </div>
                </div>

                {/* Doctors' Schedule */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-900">Doctors' Schedule</h3>
                    <button className="text-gray-400 hover:text-gray-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-4">
                    {approvedDoctors.slice(0, 2).map(doctor => (
                      <div key={doctor.id} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <img
                            src="/api/placeholder/40/40"
                            alt={doctor.name}
                            className="w-10 h-10 rounded-full"
                          />
                          <div>
                            <h4 className="text-sm font-semibold text-gray-900">Dr. {doctor.name}</h4>
                            <p className="text-xs text-gray-500">{doctor.specialization}</p>
                          </div>
                        </div>
                        <span className="px-3 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-full">
                          Available
                        </span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Reports */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-bold text-gray-900">Report</h3>
                    <button className="text-gray-400 hover:text-gray-600">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                      </svg>
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div className="flex items-start space-x-3 p-3 bg-blue-50 rounded-lg">
                      <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-gray-900">Room Cleaning Needed</h4>
                        <p className="text-xs text-gray-500">3 minutes ago</p>
                      </div>
                      <button>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>

                    <div className="flex items-start space-x-3 p-3 bg-gray-50 rounded-lg">
                      <div className="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                        <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="flex-1">
                        <h4 className="text-sm font-semibold text-gray-900">Equipment Maintenance</h4>
                        <p className="text-xs text-gray-500">3 minutes ago</p>
                      </div>
                      <button>
                        <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Pending Approvals View */}
          {currentView === 'pending' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">Pending Doctor Approvals</h3>
              {pendingDoctors.length > 0 ? (
                <div className="space-y-4">
                  {pendingDoctors.map(doctor => (
                    <div key={doctor.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div className="w-16 h-16 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center">
                            <span className="text-white font-bold text-2xl">
                              {doctor.name?.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg">Dr. {doctor.name}</h4>
                            <p className="text-gray-600">{doctor.specialization}</p>
                            <div className="mt-2 space-y-1 text-sm text-gray-600">
                              <p><strong>Email:</strong> {doctor.email}</p>
                              <p><strong>Doctor ID:</strong> {doctor.doctor_id}</p>
                              <p><strong>Applied:</strong> {formatDate(doctor.created_at)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleApproveDoctor(doctor.id)}
                            className="px-6 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-semibold"
                          >
                            ✓ Approve
                          </button>
                          <button
                            onClick={() => handleRejectDoctor(doctor.id)}
                            className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition font-semibold"
                          >
                            ✗ Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-12">No pending approvals</p>
              )}
            </div>
          )}

          {/* Doctors View */}
          {currentView === 'doctors' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">All Doctors ({approvedDoctors.length})</h3>
              {approvedDoctors.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {approvedDoctors.map(doctor => (
                    <div key={doctor.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start space-x-3 mb-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center">
                          <span className="text-white font-bold text-lg">
                            {doctor.name?.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900">Dr. {doctor.name}</h4>
                          <p className="text-sm text-gray-600">{doctor.specialization}</p>
                        </div>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600">
                        <p><strong>Email:</strong> {doctor.email}</p>
                        <p><strong>ID:</strong> {doctor.doctor_id}</p>
                        <p><strong>Joined:</strong> {formatDate(doctor.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-12">No approved doctors yet</p>
              )}
            </div>
          )}

          {/* Patients View */}
          {currentView === 'patients' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">All Patients ({allPatients.length})</h3>
              {allPatients.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allPatients.map(patient => (
                    <div key={patient.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start space-x-3 mb-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                          <span className="text-white font-bold text-lg">
                            {patient.name?.charAt(0)}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900">{patient.name}</h4>
                          <p className="text-sm text-gray-600">{patient.email}</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        <strong>Joined:</strong> {formatDate(patient.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-12">No patients registered yet</p>
              )}
            </div>
          )}

          {/* Appointments View */}
          {currentView === 'appointments' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">
                All Appointments ({allAppointments.length})
              </h3>
              {allAppointments.length > 0 ? (
                <div className="space-y-4">
                  {allAppointments.map(appointment => (
                    <div key={appointment.id} className="border border-gray-200 rounded-xl p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <div className="flex items-center space-x-4 mb-2">
                            <h4 className="font-semibold text-gray-900">
                              {appointment.patient?.name} → Dr. {appointment.doctor?.name}
                            </h4>
                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${
                              appointment.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                              appointment.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                              appointment.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                              appointment.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                              'bg-yellow-100 text-yellow-700'
                            }`}>
                              {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                            </span>
                          </div>
                          <p className="text-sm text-gray-600 mb-2">{appointment.doctor?.specialization}</p>
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <span>📅 {formatDate(appointment.time_slot?.date)}</span>
                            <span>🕐 {formatTime(appointment.time_slot?.start_time)}</span>
                          </div>
                          {appointment.symptoms && (
                            <p className="text-sm text-gray-700 mt-2">
                              <strong>Symptoms:</strong> {appointment.symptoms}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-12">No appointments yet</p>
              )}
            </div>
          )}
        </main>

        {/* Right Sidebar - Calendar */}
        <aside className="w-80 bg-white border-l border-gray-200 p-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">
                {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h3>
              <div className="flex items-center space-x-1">
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                  </svg>
                </button>
                <button
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="text-center text-xs text-gray-500 font-medium py-1">
                  {day}
                </div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {getDatesInMonth().map((date, index) => {
                const isSelected = date && selectedDate && date.toDateString() === selectedDate.toDateString();
                const isToday = date && date.toDateString() === new Date().toDateString();
                const hasAppointments = date && getAppointmentsForDate(date).length > 0;

                return (
                  <button
                    key={index}
                    onClick={() => date && setSelectedDate(date)}
                    className={`aspect-square rounded-lg flex items-center justify-center text-sm relative ${
                      !date ? 'invisible' : ''
                    } ${
                      isToday ? 'bg-gray-800 text-white font-bold' : ''
                    } ${
                      isSelected && !isToday ? 'bg-teal-600 text-white font-bold' : ''
                    } ${
                      !isSelected && !isToday && date ? 'hover:bg-gray-100' : ''
                    }`}
                  >
                    {date && (
                      <>
                        {date.getDate()}
                        {hasAppointments && !isToday && !isSelected && (
                          <div className="absolute bottom-1 w-1 h-1 bg-teal-600 rounded-full"></div>
                        )}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Today's Schedule */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900">
                {selectedDate.toLocaleDateString('en-US', { weekday: 'long', day: 'numeric', month: 'long' })}
              </h3>
              <button className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center text-white">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </button>
            </div>

            <div className="space-y-3">
              {getAppointmentsForDate(selectedDate).length > 0 ? (
                getAppointmentsForDate(selectedDate).slice(0, 5).map((apt, index) => (
                  <div
                    key={apt.id}
                    className="p-3 rounded-lg"
                    style={{ backgroundColor: index === 0 ? '#99f6e4' : '#e0f2fe' }}
                  >
                    <div className="flex items-start justify-between mb-1">
                      <h4 className="font-semibold text-gray-900 text-sm">
                        {apt.patient?.name} - {apt.doctor?.specialization}
                      </h4>
                    </div>
                    <p className="text-xs text-gray-600">
                      {formatTime(apt.time_slot?.start_time)} - {formatTime(apt.time_slot?.end_time)}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-gray-500 text-center py-8">No appointments scheduled</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}