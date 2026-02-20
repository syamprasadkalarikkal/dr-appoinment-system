'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import {
  requestNotificationPermission,
  sendBrowserNotification,
} from '@/lib/browserNotification';
import {
  approveDoctor,
  rejectDoctor,
  permanentlyDeleteDoctor,
  fetchAdminNotifications,
  markNotificationAsRead as markReadService,
  markAllNotificationsAsRead,
} from '@/lib/adminDoctorService';

/* ─────────────────────────────────────────────
   Inline Notification Bell (replaces the old
   <Notifications /> component so everything is
   self-contained and correct)
───────────────────────────────────────────── */
function NotificationBell({ notifications, onMarkRead, onMarkAllRead }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = notifications.filter((n) => !n.is_read).length;

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative p-2 hover:bg-gray-100 rounded-lg"
      >
        <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unread > 0 && (
          <span className="absolute top-1 right-1 w-4 h-4 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-2xl border border-gray-100 z-50">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="font-bold text-gray-900">Notifications</h3>
            {unread > 0 && (
              <button
                onClick={onMarkAllRead}
                className="text-xs text-teal-600 hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-8">No notifications</p>
            ) : (
              notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition cursor-pointer ${
                    !n.is_read ? 'bg-teal-50' : ''
                  }`}
                  onClick={() => !n.is_read && onMarkRead(n.id)}
                >
                  <div className="flex items-start space-x-3">
                    <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center flex-shrink-0">
                      <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900">{n.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5 line-clamp-2">{n.message}</p>
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(n.created_at).toLocaleString()}
                      </p>
                    </div>
                    {!n.is_read && (
                      <div className="w-2 h-2 bg-teal-500 rounded-full mt-1 flex-shrink-0" />
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Main Admin Component
───────────────────────────────────────────── */
export default function Admin() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [actionLoading, setActionLoading] = useState(null); // doctorId being acted on

  // Data
  const [pendingDoctors, setPendingDoctors] = useState([]);
  const [approvedDoctors, setApprovedDoctors] = useState([]);
  const [allPatients, setAllPatients] = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [stats, setStats] = useState({
    totalInvoice: 0,
    totalPatients: 0,
    totalAppointments: 0,
    totalDoctors: 0,
    invoiceChange: 2.14,
    patientsChange: 33.78,
    appointmentsChange: -1.56,
    doctorsChange: 1.66,
  });

  // Chart data
  const [patientChartData, setPatientChartData] = useState([]);
  const [revenueChartData, setRevenueChartData] = useState([]);
  const [patientDemographics, setPatientDemographics] = useState({ child: 0, adult: 0, elderly: 0 });

  // Calendar
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  // ── Channel refs so we can clean up ──
  const doctorChannelRef = useRef(null);
  const notifChannelRef = useRef(null);

  /* ── Auth ── */
  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchAllData();
      fetchNotifications();
      generateChartData();
      setupRealTimeListeners();
      requestNotificationPermission(); // ask for OS-level permission
    }
    return () => {
      doctorChannelRef.current?.unsubscribe();
      notifChannelRef.current?.unsubscribe();
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
      router.push('/Login');
    } finally {
      setLoading(false);
    }
  };

  /* ── Fetch helpers ── */
  const fetchAllData = async () => {
    try {
      // Pending doctors
      const { data: pending } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'doctor')
        .eq('is_approved', false)
        .order('created_at', { ascending: false });
      setPendingDoctors(pending || []);

      // Approved doctors
      const { data: approved } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'doctor')
        .eq('is_approved', true)
        .order('created_at', { ascending: false });
      setApprovedDoctors(approved || []);

      // Patients
      const { data: patients } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'patient')
        .order('created_at', { ascending: false });
      setAllPatients(patients || []);

      // Appointments with joins
      const { data: appointments } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:patient_id(name, email),
          doctor:doctor_id(name, specialization),
          time_slot:slot_id(date, start_time, end_time)
        `)
        .order('created_at', { ascending: false });
      setAllAppointments(appointments || []);

      // Demographics (rough split)
      const total = patients?.length || 0;
      setPatientDemographics({
        child: Math.floor(total * 0.25),
        adult: Math.floor(total * 0.55),
        elderly: Math.floor(total * 0.20),
      });

      // Stats
      setStats((prev) => ({
        ...prev,
        totalInvoice: (appointments?.length || 0) * 50.99,
        totalPatients: total,
        totalAppointments: appointments?.length || 0,
        totalDoctors: (approved?.length || 0) + (pending?.length || 0),
      }));
    } catch (error) {
      console.error('Error fetching data:', error);
    }
  };

  const fetchNotifications = async () => {
    const data = await fetchAdminNotifications(30);
    setNotifications(data);
  };

  /* ── Real-time with modern channel API ── */
  const setupRealTimeListeners = () => {
    // Listen for new doctor registrations → INSERT on users table
    doctorChannelRef.current = supabase
      .channel('admin-doctor-signups')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'users', filter: 'role=eq.doctor' },
        async (payload) => {
          const newDoc = payload.new;
          // Refresh the pending list
          fetchAllData();

          // Insert a notification record into the notifications table
          await supabase.from('notifications').insert([
            {
              type: 'doctor_approval',
              title: 'New Doctor Registration',
              message: `${newDoc.name} (${newDoc.specialization || 'Specialist'}) has signed up and is pending approval.`,
              doctor_id: newDoc.id,
              doctor_email: newDoc.email,
              doctor_name: newDoc.name,
              doctor_specialization: newDoc.specialization,
              is_read: false,
              created_at: new Date().toISOString(),
            },
          ]);
        }
      )
      .subscribe();

    // Listen for new notifications → INSERT on notifications table
    notifChannelRef.current = supabase
      .channel('admin-notifications')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'type=eq.doctor_approval' },
        (payload) => {
          const n = payload.new;
          setNotifications((prev) => [n, ...prev]);

          // OS-level browser notification
          sendBrowserNotification('New Doctor Registration 🏥', {
            body: n.message,
            tag: `doctor-${n.doctor_id}`,
          });
        }
      )
      .subscribe();
  };

  /* ── Approve / Reject / Delete ── */
  const handleApproveDoctor = async (doctorId) => {
    setActionLoading(doctorId + '-approve');
    const result = await approveDoctor(doctorId);
    if (!result.success) {
      alert(`Failed to approve doctor: ${result.error}`);
    } else {
      fetchAllData();
      fetchNotifications();
    }
    setActionLoading(null);
  };

  const handleRejectDoctor = async (doctorId) => {
    if (!confirm('Reject this doctor application?\n\nTheir account will remain but they will not be able to log in.')) return;
    setActionLoading(doctorId + '-reject');
    const result = await rejectDoctor(doctorId);
    if (!result.success) {
      alert(`Failed to reject doctor: ${result.error}`);
    } else {
      fetchAllData();
      fetchNotifications();
    }
    setActionLoading(null);
  };

  const handleDeleteDoctor = async (doctorId, doctorName) => {
    if (
      !confirm(
        `⚠️ Permanently delete Dr. ${doctorName}?\n\nThis will:\n• Remove their profile from the database\n• Delete their login account\n• Cancel all their pending appointments\n\nThis action CANNOT be undone.`
      )
    )
      return;

    setActionLoading(doctorId + '-delete');
    const result = await permanentlyDeleteDoctor(doctorId);

    if (!result.success) {
      if (result.partialSuccess) {
        alert(
          `⚠️ Partial deletion: The doctor's profile was removed but their auth account could not be deleted automatically.\n\nPlease remove user "${doctorId}" manually from your Supabase Authentication dashboard.\n\nError: ${result.error}`
        );
      } else {
        alert(`Failed to delete doctor: ${result.error}`);
      }
    } else {
      alert(`✅ ${result.message}`);
      fetchAllData();
    }
    setActionLoading(null);
  };

  /* ── Notification actions ── */
  const handleMarkRead = async (id) => {
    await markReadService(id).catch(console.error);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
  };

  const handleMarkAllRead = async () => {
    await markAllNotificationsAsRead().catch(console.error);
    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
  };

  /* ── Logout ── */
  const handleLogout = () => {
    localStorage.clear();
    router.push('/Login');
  };

  /* ── Helpers ── */
  const formatDate = (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const formatTime = (time) => {
    if (!time) return '';
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    return `${hour % 12 || 12}:${minutes} ${hour >= 12 ? 'PM' : 'AM'}`;
  };

  const getDatesInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();
    const dates = Array(firstDay).fill(null);
    for (let d = 1; d <= lastDate; d++) dates.push(new Date(year, month, d));
    return dates;
  };

  const getAppointmentsForDate = (date) => {
    if (!date) return [];
    const ds = date.toISOString().split('T')[0];
    return allAppointments.filter((a) => a.time_slot?.date === ds);
  };

  const generateChartData = () => {
    const days = ['4 Jul', '5 Jul', '6 Jul', '7 Jul', '8 Jul', '9 Jul', '10 Jul', '11 Jul'];
    setPatientChartData(
      days.map((day) => ({
        day,
        child: Math.floor(Math.random() * 100) + 40,
        adult: Math.floor(Math.random() * 130) + 80,
        elderly: Math.floor(Math.random() * 60) + 20,
      }))
    );
    const revDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    setRevenueChartData(
      revDays.map((day, i) => ({
        day,
        income: 0.8 + Math.sin(i * 0.8) * 0.3 + Math.random() * 0.1,
        expense: 0.4 + Math.cos(i * 0.7) * 0.2 + Math.random() * 0.1,
      }))
    );
  };

  /* ── Loading / guard ── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600" />
      </div>
    );
  }
  if (!isAuthenticated) return null;

  /* ── Reusable stat card ── */
  const StatCard = ({ icon, label, value, change, color }) => (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2 text-gray-600 text-sm">
          {icon}
          <span>{label}</span>
        </div>
      </div>
      <div className="flex items-end justify-between">
        <div>
          <h3 className="text-3xl font-bold text-gray-900">{value}</h3>
        </div>
        <div
          className={`flex items-center space-x-1 px-2 py-1 rounded text-xs font-semibold ${
            change >= 0 ? 'bg-teal-50 text-teal-600' : 'bg-red-50 text-red-600'
          }`}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={change >= 0 ? 'M5 10l7-7m0 0l7 7m-7-7v18' : 'M19 14l-7 7m0 0l-7-7m7 7V3'}
            />
          </svg>
          <span>{Math.abs(change)}%</span>
        </div>
      </div>
    </div>
  );

  /* ─────────────────────────────────────────
     RENDER
  ───────────────────────────────────────── */
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <div className="flex items-center">
              <img
                src="/amrt-logo.png"
                alt="AMRT – Advanced Medical Reservation Technology"
                className="h-20 w-auto object-contain"
                style={{ maxWidth: 220 }}
              />
            </div>

            {/* Search */}
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

            {/* Actions */}
            <div className="flex items-center space-x-3">
              <NotificationBell
                notifications={notifications}
                onMarkRead={handleMarkRead}
                onMarkAllRead={handleMarkAllRead}
              />
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-purple-500 rounded-full flex items-center justify-center">
                  <span className="text-white font-bold text-sm">A</span>
                </div>
                <div>
                  <p className="text-sm font-semibold text-gray-900">Admin</p>
                  <button onClick={handleLogout} className="text-xs text-gray-500 hover:text-red-600 transition">
                    Logout
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="flex max-w-[1600px] mx-auto">
        {/* ── Sidebar ── */}
        <aside className="w-64 bg-white border-r border-gray-200 min-h-[calc(100vh-65px)] p-4 sticky top-[65px] self-start">
          <nav className="space-y-1">
            {[
              { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { id: 'appointments', label: 'Appointments', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
              { id: 'patients', label: 'Patients', icon: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
              { id: 'doctors', label: 'Doctors', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
            ].map(({ id, label, icon }) => (
              <button
                key={id}
                onClick={() => setCurrentView(id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition ${
                  currentView === id ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
                </svg>
                <span className="font-medium">{label}</span>
              </button>
            ))}

            {/* Doctor Approvals — with live badge */}
            <button
              onClick={() => setCurrentView('pending')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition ${
                currentView === 'pending' ? 'bg-teal-50 text-teal-700 font-semibold' : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <span className="font-medium">Doctor Approvals</span>
              {pendingDoctors.length > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingDoctors.length}
                </span>
              )}
            </button>
          </nav>
        </aside>

        {/* ── Main Content ── */}
        <main className="flex-1 p-6 overflow-auto">

          {/* ═══ DASHBOARD ═══ */}
          {currentView === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <StatCard
                  label="Total Invoice"
                  value={`$${Math.floor(stats.totalInvoice).toLocaleString()}`}
                  change={stats.invoiceChange}
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>}
                />
                <StatCard
                  label="Total Patients"
                  value={stats.totalPatients.toLocaleString()}
                  change={stats.patientsChange}
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                />
                <StatCard
                  label="Appointments"
                  value={stats.totalAppointments.toLocaleString()}
                  change={stats.appointmentsChange}
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
                />
                <StatCard
                  label="Total Doctors"
                  value={stats.totalDoctors.toLocaleString()}
                  change={stats.doctorsChange}
                  icon={<svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>}
                />
              </div>

              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Patient Chart */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Patient Overview</h3>
                  <div className="flex items-center space-x-6 mb-4 text-xs text-gray-600">
                    <span className="flex items-center space-x-1"><span className="w-3 h-3 rounded-full bg-gray-800 inline-block" /> Adult</span>
                    <span className="flex items-center space-x-1"><span className="w-3 h-3 rounded-full bg-teal-400 inline-block" /> Child</span>
                    <span className="flex items-center space-x-1"><span className="w-3 h-3 rounded-full bg-gray-300 inline-block" /> Elderly</span>
                  </div>
                  <div className="h-56 flex items-end justify-between space-x-2">
                    {patientChartData.map((d, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center space-y-0.5">
                        <div className="w-full bg-gray-800 rounded-t" style={{ height: `${d.adult * 0.35}px` }} />
                        <div className="w-full bg-teal-400" style={{ height: `${d.child * 0.35}px` }} />
                        <div className="w-full bg-gray-300 rounded-b" style={{ height: `${d.elderly * 0.35}px` }} />
                        <span className="text-[10px] text-gray-500 mt-1">{d.day}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Revenue Chart */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Revenue</h3>
                    <div className="flex items-center space-x-2 text-xs text-gray-600">
                      <span className="flex items-center space-x-1"><span className="w-3 h-3 rounded-full bg-gray-800 inline-block" /> Income</span>
                      <span className="flex items-center space-x-1"><span className="w-3 h-3 rounded-full bg-teal-400 inline-block" /> Expense</span>
                    </div>
                  </div>
                  <div className="h-56 relative">
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                      {[0, 25, 50, 75, 100].map((y) => (
                        <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="#f3f4f6" strokeWidth="0.5" />
                      ))}
                      <polyline
                        points={revenueChartData.map((d, i) => `${(i / (revenueChartData.length - 1)) * 100},${(1 - d.income) * 100}`).join(' ')}
                        fill="none" stroke="#1f2937" strokeWidth="2" vectorEffect="non-scaling-stroke"
                      />
                      <polyline
                        points={revenueChartData.map((d, i) => `${(i / (revenueChartData.length - 1)) * 100},${(1 - d.expense) * 100}`).join(' ')}
                        fill="none" stroke="#2dd4bf" strokeWidth="2" vectorEffect="non-scaling-stroke"
                      />
                    </svg>
                    <div className="flex justify-between mt-1">
                      {revenueChartData.map((d, i) => (
                        <span key={i} className="text-[10px] text-gray-500">{d.day}</span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Bottom row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Appointments */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Recent Appointments</h3>
                  {allAppointments.slice(0, 5).length > 0 ? (
                    <div className="space-y-3">
                      {allAppointments.slice(0, 5).map((apt) => (
                        <div key={apt.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                          <div>
                            <p className="text-sm font-semibold text-gray-900">
                              {apt.patient?.name} → Dr. {apt.doctor?.name}
                            </p>
                            <p className="text-xs text-gray-500">{apt.doctor?.specialization}</p>
                          </div>
                          <span className={`px-2 py-1 rounded-full text-[10px] font-bold ${
                            apt.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                            apt.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                            apt.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                            'bg-red-100 text-red-700'
                          }`}>
                            {apt.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm text-center py-8">No appointments yet</p>
                  )}
                </div>

                {/* Active Doctors */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Active Doctors</h3>
                  {approvedDoctors.slice(0, 5).length > 0 ? (
                    <div className="space-y-3">
                      {approvedDoctors.slice(0, 5).map((doc) => (
                        <div key={doc.id} className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center">
                              <span className="text-white font-bold text-sm">{doc.name?.charAt(0)}</span>
                            </div>
                            <div>
                              <p className="text-sm font-semibold text-gray-900">Dr. {doc.name}</p>
                              <p className="text-xs text-gray-500">{doc.specialization}</p>
                            </div>
                          </div>
                          <span className="px-2 py-1 bg-teal-50 text-teal-700 text-xs font-semibold rounded-full">Active</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm text-center py-8">No approved doctors yet</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ═══ PENDING APPROVALS ═══ */}
          {currentView === 'pending' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">
                  Pending Doctor Approvals
                  {pendingDoctors.length > 0 && (
                    <span className="ml-2 bg-red-100 text-red-700 text-sm font-bold px-2 py-0.5 rounded-full">
                      {pendingDoctors.length}
                    </span>
                  )}
                </h3>
              </div>
              {pendingDoctors.length > 0 ? (
                <div className="space-y-4">
                  {pendingDoctors.map((doctor) => (
                    <div key={doctor.id} className="border border-gray-200 rounded-xl p-5 hover:border-teal-300 transition">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div className="w-14 h-14 bg-gradient-to-br from-teal-500 to-teal-600 rounded-xl flex items-center justify-center flex-shrink-0">
                            <span className="text-white font-bold text-2xl">{doctor.name?.charAt(0)}</span>
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg">Dr. {doctor.name}</h4>
                            <p className="text-teal-600 font-medium">{doctor.specialization}</p>
                            <div className="mt-2 space-y-1 text-sm text-gray-600">
                              <p><span className="font-semibold">Email:</span> {doctor.email}</p>
                              {doctor.doctor_id && (
                                <p><span className="font-semibold">Doctor ID:</span> {doctor.doctor_id}</p>
                              )}
                              <p><span className="font-semibold">Applied:</span> {formatDate(doctor.created_at)}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col space-y-2 min-w-[120px]">
                          <button
                            onClick={() => handleApproveDoctor(doctor.id)}
                            disabled={!!actionLoading}
                            className="px-5 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition font-semibold text-sm disabled:opacity-50 flex items-center justify-center space-x-1"
                          >
                            {actionLoading === doctor.id + '-approve' ? (
                              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                              </svg>
                            ) : (
                              <><span>✓</span><span>Approve</span></>
                            )}
                          </button>
                          <button
                            onClick={() => handleRejectDoctor(doctor.id)}
                            disabled={!!actionLoading}
                            className="px-5 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition font-semibold text-sm disabled:opacity-50"
                          >
                            ✗ Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16">
                  <svg className="w-16 h-16 text-gray-200 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                  </svg>
                  <p className="text-gray-400 font-medium">All caught up! No pending approvals.</p>
                </div>
              )}
            </div>
          )}

          {/* ═══ DOCTORS ═══ */}
          {currentView === 'doctors' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">
                All Approved Doctors ({approvedDoctors.length})
              </h3>
              {approvedDoctors.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {approvedDoctors.map((doctor) => (
                    <div key={doctor.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition">
                      <div className="flex items-start space-x-3 mb-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-teal-500 to-teal-600 rounded-lg flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-lg">{doctor.name?.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="font-bold text-gray-900 truncate">Dr. {doctor.name}</h4>
                          <p className="text-sm text-teal-600">{doctor.specialization}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-[10px] font-bold rounded-full">Approved</span>
                      </div>
                      <div className="space-y-1 text-sm text-gray-600 mb-4">
                        <p><span className="font-semibold">Email:</span> {doctor.email}</p>
                        {doctor.doctor_id && <p><span className="font-semibold">ID:</span> {doctor.doctor_id}</p>}
                        <p><span className="font-semibold">Joined:</span> {formatDate(doctor.created_at)}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteDoctor(doctor.id, doctor.name)}
                        disabled={actionLoading === doctor.id + '-delete'}
                        className="w-full py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 transition text-sm font-semibold disabled:opacity-50 flex items-center justify-center space-x-1"
                      >
                        {actionLoading === doctor.id + '-delete' ? (
                          <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                          </svg>
                        ) : (
                          <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg><span>Delete Doctor</span></>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-16">No approved doctors yet</p>
              )}
            </div>
          )}

          {/* ═══ PATIENTS ═══ */}
          {currentView === 'patients' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">All Patients ({allPatients.length})</h3>
              {allPatients.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {allPatients.map((patient) => (
                    <div key={patient.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-md transition">
                      <div className="flex items-start space-x-3 mb-3">
                        <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                          <span className="text-white font-bold text-lg">{patient.name?.charAt(0)}</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900">{patient.name}</h4>
                          <p className="text-sm text-gray-500">{patient.email}</p>
                        </div>
                      </div>
                      <p className="text-sm text-gray-600">
                        <span className="font-semibold">Joined:</span> {formatDate(patient.created_at)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-16">No patients registered yet</p>
              )}
            </div>
          )}

          {/* ═══ APPOINTMENTS ═══ */}
          {currentView === 'appointments' && (
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-6">
                All Appointments ({allAppointments.length})
              </h3>
              {allAppointments.length > 0 ? (
                <div className="space-y-4">
                  {allAppointments.map((appointment) => (
                    <div key={appointment.id} className="border border-gray-200 rounded-xl p-4 hover:shadow-sm transition">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center space-x-3 mb-1">
                            <h4 className="font-semibold text-gray-900">
                              {appointment.patient?.name} → Dr. {appointment.doctor?.name}
                            </h4>
                            <span className={`px-3 py-0.5 rounded-full text-xs font-bold ${
                              appointment.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                              appointment.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                              appointment.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                              'bg-red-100 text-red-700'
                            }`}>
                              {appointment.status}
                            </span>
                          </div>
                          <p className="text-sm text-gray-500 mb-2">{appointment.doctor?.specialization}</p>
                          <div className="flex items-center space-x-4 text-sm text-gray-600">
                            <span>📅 {formatDate(appointment.time_slot?.date)}</span>
                            <span>🕐 {formatTime(appointment.time_slot?.start_time)}</span>
                          </div>
                          {appointment.symptoms && (
                            <p className="text-sm text-gray-700 mt-2">
                              <span className="font-semibold">Symptoms:</span> {appointment.symptoms}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-400 text-center py-16">No appointments yet</p>
              )}
            </div>
          )}
        </main>

        {/* ── Right Sidebar — Calendar ── */}
        <aside className="w-72 bg-white border-l border-gray-200 p-5 sticky top-[65px] self-start min-h-[calc(100vh-65px)]">
          {/* Calendar header */}
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-gray-900">
              {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <div className="flex space-x-1">
              {['M15 19l-7-7 7-7', 'M9 5l7 7-7 7'].map((d, i) => (
                <button
                  key={i}
                  onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + (i === 0 ? -1 : 1)))}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} />
                  </svg>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} className="text-center text-[10px] text-gray-400 font-medium py-1">{d}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1 mb-6">
            {getDatesInMonth().map((date, i) => {
              const isSelected = date && selectedDate && date.toDateString() === selectedDate.toDateString();
              const isToday = date && date.toDateString() === new Date().toDateString();
              const hasAppts = date && getAppointmentsForDate(date).length > 0;
              return (
                <button
                  key={i}
                  onClick={() => date && setSelectedDate(date)}
                  className={`aspect-square rounded-lg flex items-center justify-center text-xs relative ${
                    !date ? 'invisible' : ''
                  } ${isToday ? 'bg-gray-800 text-white font-bold' : ''} ${
                    isSelected && !isToday ? 'bg-teal-600 text-white font-bold' : ''
                  } ${!isSelected && !isToday && date ? 'hover:bg-gray-100' : ''}`}
                >
                  {date && (
                    <>
                      {date.getDate()}
                      {hasAppts && !isToday && !isSelected && (
                        <div className="absolute bottom-0.5 w-1 h-1 bg-teal-500 rounded-full" />
                      )}
                    </>
                  )}
                </button>
              );
            })}
          </div>

          {/* Day schedule */}
          <div>
            <h3 className="font-bold text-gray-900 mb-3">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric', month: 'short' })}
            </h3>
            <div className="space-y-2">
              {getAppointmentsForDate(selectedDate).slice(0, 4).map((apt, i) => (
                <div key={apt.id} className="p-3 rounded-lg" style={{ backgroundColor: i % 2 === 0 ? '#ccfbf1' : '#e0f2fe' }}>
                  <p className="text-sm font-semibold text-gray-900 truncate">
                    {apt.patient?.name} — {apt.doctor?.specialization}
                  </p>
                  <p className="text-xs text-gray-600">
                    {formatTime(apt.time_slot?.start_time)} – {formatTime(apt.time_slot?.end_time)}
                  </p>
                </div>
              ))}
              {getAppointmentsForDate(selectedDate).length === 0 && (
                <p className="text-sm text-gray-400 text-center py-6">No appointments</p>
              )}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}