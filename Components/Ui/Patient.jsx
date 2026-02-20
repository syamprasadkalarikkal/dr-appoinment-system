'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/getUserRole';

export default function PatientDashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);

  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedDoctor, setSelectedDoctor] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('upcoming');
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploading, setUploading] = useState(false);

  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [symptoms, setSymptoms] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState('morning');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availableDates, setAvailableDates] = useState([]);
  const [showBookingModal, setShowBookingModal] = useState(false);

  // Profile state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const avatarInputRef = useRef(null);
  const notifRef      = useRef(null);
  const profileRef    = useRef(null);

  // Patient health details state (separate table)
  const [healthDetails, setHealthDetails] = useState(null);
  const [isEditingHealth, setIsEditingHealth] = useState(false);
  const [healthForm, setHealthForm] = useState({});
  const [savingHealth, setSavingHealth] = useState(false);

  const specialties = [
    { id: 'all', name: 'All' },
    { id: 'neurology', name: 'Neurology' },
    { id: 'cardiology', name: 'Cardiology' },
    { id: 'orthopedics', name: 'Orthopedics' },
    { id: 'pathology', name: 'Pathology' },
    { id: 'pediatrics', name: 'Pediatrics' },
    { id: 'dermatology', name: 'Dermatology' },
    { id: 'ophthalmology', name: 'Ophthalmology' },
  ];

  useEffect(() => { checkAuth(); }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDoctors();
      if (patientData?.id) {
        fetchAppointments();
        fetchMedicalRecords();
        fetchNotifications();
        fetchPendingRequests();
        fetchHealthDetails();
      }
    }
  }, [isAuthenticated, patientData?.id]);

  useEffect(() => {
    if (patientData) {
      setProfileForm({
        name: patientData.name || '',
        phone: patientData.phone || '',
        age: patientData.age || '',
        gender: patientData.gender || '',
        blood_group: patientData.blood_group || '',
        address: patientData.address || '',
        email: patientData.email || '',
      });
    }
  }, [patientData]);

  useEffect(() => {
    if (healthDetails) {
      setHealthForm({
        height_cm: healthDetails.height_cm || '',
        weight_kg: healthDetails.weight_kg || '',
        bmi: healthDetails.bmi || '',
        allergies: healthDetails.allergies || '',
        chronic_conditions: healthDetails.chronic_conditions || '',
        current_medications: healthDetails.current_medications || '',
        emergency_contact_name: healthDetails.emergency_contact_name || '',
        emergency_contact_phone: healthDetails.emergency_contact_phone || '',
        emergency_contact_relation: healthDetails.emergency_contact_relation || '',
        notes: healthDetails.notes || '',
      });
    }
  }, [healthDetails]);

  // ── Data Fetchers ─────────────────────────────────────────────
  const fetchPendingRequests = async () => {
    if (!patientData?.id) return;
    const { data } = await supabase
      .from('record_requests')
      .select('*, doctor:doctor_id(name, specialization)')
      .eq('patient_id', patientData.id).eq('status', 'pending')
      .order('created_at', { ascending: false });
    if (data) setPendingRequests(data);
  };

  const fetchNotifications = async () => {
    if (!patientData?.id) return;
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', patientData.id)
      .eq('is_read', false)
      .order('created_at', { ascending: false });
    if (data) setNotifications(data);
  };

  const markRead = async (id) => {
    await supabase.from('notifications').update({ is_read: true }).eq('id', id);
    setNotifications(prev => prev.filter(n => n.id !== id));
  };

  const markAllRead = async () => {
    if (!patientData?.id || !notifications.length) return;
    const ids = notifications.map(n => n.id);
    await supabase.from('notifications').update({ is_read: true }).in('id', ids);
    setNotifications([]);
  };

  const fetchMedicalRecords = async () => {
    if (!patientData?.id) return;
    const { data } = await supabase.from('medical_records')
      .select('*, doctor:doctor_id(name, specialization)')
      .eq('patient_id', patientData.id).order('created_at', { ascending: false });
    if (data) setMedicalRecords(data);
  };

  const fetchHealthDetails = async () => {
    if (!patientData?.id) return;
    const { data } = await supabase.from('patient_health_details')
      .select('*').eq('patient_id', patientData.id).maybeSingle();
    if (data) setHealthDetails(data);
  };

  const handleSaveHealthDetails = async () => {
    if (!patientData?.id) return;
    setSavingHealth(true);
    try {
      // Calculate BMI automatically if height and weight provided
      let bmi = healthForm.bmi;
      if (healthForm.height_cm && healthForm.weight_kg) {
        const h = parseFloat(healthForm.height_cm) / 100;
        const w = parseFloat(healthForm.weight_kg);
        bmi = h > 0 ? (w / (h * h)).toFixed(1) : bmi;
      }

      const payload = {
        patient_id: patientData.id,
        height_cm: healthForm.height_cm ? parseFloat(healthForm.height_cm) : null,
        weight_kg: healthForm.weight_kg ? parseFloat(healthForm.weight_kg) : null,
        bmi: bmi ? parseFloat(bmi) : null,
        allergies: healthForm.allergies || null,
        chronic_conditions: healthForm.chronic_conditions || null,
        current_medications: healthForm.current_medications || null,
        emergency_contact_name: healthForm.emergency_contact_name || null,
        emergency_contact_phone: healthForm.emergency_contact_phone || null,
        emergency_contact_relation: healthForm.emergency_contact_relation || null,
        notes: healthForm.notes || null,
        updated_at: new Date().toISOString(),
      };

      if (healthDetails?.id) {
        const { error } = await supabase.from('patient_health_details')
          .update(payload).eq('id', healthDetails.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('patient_health_details')
          .insert([payload]).select().single();
        if (error) throw error;
        setHealthDetails(data);
      }

      setHealthDetails({ ...healthDetails, ...payload, bmi });
      setIsEditingHealth(false);
    } catch (err) {
      console.error('Health details save error:', err);
      alert('Failed to save health details. Please try again.');
    } finally { setSavingHealth(false); }
  };

  // Real-time
  useEffect(() => {
    if (!patientData?.id) return;
    const ch = supabase.channel('patient-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `patient_id=eq.${patientData.id}` }, () => fetchAppointments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records', filter: `patient_id=eq.${patientData.id}` }, () => fetchMedicalRecords())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${patientData.id}` }, () => { fetchNotifications(); fetchAppointments(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'record_requests', filter: `patient_id=eq.${patientData.id}` }, () => fetchPendingRequests())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_health_details', filter: `patient_id=eq.${patientData.id}` }, () => fetchHealthDetails())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [patientData?.id]);

  // Click-outside — close both dropdowns
  useEffect(() => {
    const handle = (e) => {
      if (notifRef.current   && !notifRef.current.contains(e.target))   setShowNotifications(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfileMenu(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // ── Profile Image Upload ──────────────────────────────────────
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !patientData?.id) return;
    if (!['image/jpeg','image/jpg','image/png','image/webp'].includes(file.type)) { alert('Please select a JPEG, PNG, or WebP image.'); return; }
    if (file.size > 2 * 1024 * 1024) { alert('Image must be smaller than 2 MB.'); return; }
    try {
      setAvatarUploading(true);
      const ext = file.name.split('.').pop();
      const filePath = `avatars/${patientData.id}.${ext}`;
      const { error: upErr } = await supabase.storage.from('profile-images').upload(filePath, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('profile-images').getPublicUrl(filePath);
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`;
      const { error: dbErr } = await supabase.from('users').update({ avatar_url: publicUrl }).eq('id', patientData.id);
      if (dbErr) throw dbErr;
      setPatientData({ ...patientData, avatar_url: publicUrl });
    } catch (err) {
      console.error('Avatar upload error:', err);
      alert('Failed to upload profile photo. Please try again.');
    } finally {
      setAvatarUploading(false);
      if (avatarInputRef.current) avatarInputRef.current.value = '';
    }
  };

  // ── Document Upload ───────────────────────────────────────────
  const handleFileUpload = async () => {
    if (!selectedRequest || !fileToUpload) { alert('Please select a file.'); return; }
    try {
      setUploading(true);
      const ext = fileToUpload.name.split('.').pop();
      const filePath = `${patientData.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('documents').upload(filePath, fileToUpload);
      if (upErr) throw upErr;
      const { data: urlData, error: urlErr } = await supabase.storage.from('documents').createSignedUrl(filePath, 60 * 60 * 24 * 365);
      if (urlErr) throw urlErr;
      const { error: dbErr } = await supabase.from('record_requests')
        .update({ status: 'uploaded', document_url: urlData.signedUrl, document_name: fileToUpload.name })
        .eq('id', selectedRequest.id);
      if (dbErr) throw dbErr;
      alert('Document uploaded successfully.');
      setShowUploadModal(false); setFileToUpload(null); setSelectedRequest(null);
      fetchPendingRequests();
    } catch (err) {
      console.error('Upload error:', err);
      alert('Failed to upload document.');
    } finally { setUploading(false); }
  };

  // ── Profile Save ──────────────────────────────────────────────
  const handleSaveProfile = async () => {
    if (!patientData?.id) return;
    setSavingProfile(true);
    try {
      const { error } = await supabase.from('users').update({
        name: profileForm.name, phone: profileForm.phone,
        age: profileForm.age ? parseInt(profileForm.age) : null,
        gender: profileForm.gender, blood_group: profileForm.blood_group, address: profileForm.address,
      }).eq('id', patientData.id);
      if (error) throw error;
      setPatientData({ ...patientData, ...profileForm });
      setIsEditingProfile(false);
    } catch (err) {
      console.error('Profile save error:', err);
      alert('Failed to update profile.');
    } finally { setSavingProfile(false); }
  };

  // ── Booking ───────────────────────────────────────────────────
  useEffect(() => {
    if (!selectedDoctor?.id) return;
    const ch = supabase.channel('pt-timeslots')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'time_slots', filter: `doctor_id=eq.${selectedDoctor.id}` }, () => { fetchAvailableDates(); if (selectedDate) fetchTimeSlots(); })
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [selectedDoctor?.id, selectedDate]);

  useEffect(() => { if (selectedDoctor && showBookingModal) fetchAvailableDates(); }, [selectedDoctor, currentMonth, showBookingModal]);
  useEffect(() => { if (selectedDate && showBookingModal) fetchTimeSlots(); }, [selectedDate, selectedTimeOfDay, showBookingModal]);

  const checkAuth = async () => {
    try {
      const userRole = localStorage.getItem('userRole');
      const userId = localStorage.getItem('userId');
      if (userRole !== 'patient' || !userId) { router.push('/Login'); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/Login'); return; }
      const userData = await getUserRole(user.id);
      if (!userData || userData.role !== 'patient') { router.push('/Login'); return; }
      setPatientData(userData); setIsAuthenticated(true);
    } catch (err) { router.push('/Login'); }
    finally { setLoading(false); }
  };

  const fetchDoctors = async () => {
    const { data } = await supabase.from('users').select('*').eq('role', 'doctor').eq('is_approved', true);
    if (data) setDoctors(data);
  };

  const fetchAppointments = async () => {
    const { data } = await supabase
      .from('appointments')
      .select('*, doctor:doctor_id(name, specialization, email), time_slot:slot_id(date, start_time, end_time)')
      .eq('patient_id', patientData?.id)
      .order('created_at', { ascending: false });
    if (data) setAppointments(data);
  };

  const fetchAvailableDates = async () => {
    const s = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
    const e = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);
    const { data } = await supabase.from('time_slots').select('date')
      .eq('doctor_id', selectedDoctor.id).eq('is_available', true)
      .gte('date', s.toISOString().split('T')[0]).lte('date', e.toISOString().split('T')[0]);
    if (data) {
      const dates = [...new Set(data.map(sl => sl.date))];
      setAvailableDates(dates);
      if (dates.length > 0 && !selectedDate) setSelectedDate(dates[0]);
    }
  };

  const fetchTimeSlots = async () => {
    try {
      setLoading(true);
      const ranges = { morning: ['06:00:00','12:00:00'], afternoon: ['12:00:00','17:00:00'], evening: ['17:00:00','22:00:00'] };
      const [gte, lt] = ranges[selectedTimeOfDay];
      const { data } = await supabase.from('time_slots').select('*')
        .eq('doctor_id', selectedDoctor.id).eq('date', selectedDate).eq('is_available', true)
        .gte('start_time', gte).lt('start_time', lt).order('start_time');
      setTimeSlots(data || []);
    } finally { setLoading(false); }
  };

  const handleBookAppointment = async () => {
    if (!selectedSlot) { alert('Please select a time slot'); return; }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('book_appointment', {
        p_slot_id: selectedSlot.id, p_patient_id: patientData.id,
        p_doctor_id: selectedDoctor.id, p_symptoms: symptoms || null, p_notes: notes || null
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      await supabase.from('notifications').insert([{
        user_id: selectedDoctor.id, type: 'new_appointment',
        title: 'New Appointment Booked',
        message: `Appointment on ${selectedDate} at ${selectedSlot.start_time}`,
        related_id: data.id
      }]);
      setShowBookingModal(false); setSelectedDoctor(null); setSelectedDate(null); setSelectedSlot(null);
      setSymptoms(''); setNotes('');
      fetchAppointments(); setCurrentView('appointments');
    } catch (err) {
      console.error('Booking error:', err);
      alert('Failed to book appointment. Please try again.');
    } finally { setLoading(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    router.push('/Login');
  };

  // ── Derived ───────────────────────────────────────────────────
  const filteredDoctors = doctors.filter(d => {
    const sm = selectedSpecialty === 'all' || d.specialization?.toLowerCase() === selectedSpecialty;
    const qm = d.name?.toLowerCase().includes(searchQuery.toLowerCase()) || d.specialization?.toLowerCase().includes(searchQuery.toLowerCase());
    return sm && qm;
  });

  const upcomingAppointments = appointments.filter(a =>
    (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.time_slot?.date) >= new Date().setHours(0,0,0,0));
  const pastAppointments = appointments.filter(a =>
    a.status === 'completed' || (new Date(a.time_slot?.date) < new Date().setHours(0,0,0,0) && a.status !== 'cancelled'));
  const cancelledAppointments = appointments.filter(a => a.status === 'cancelled' || a.status === 'rejected');
  const displayAppointments = activeTab === 'past' ? pastAppointments : activeTab === 'cancelled' ? cancelledAppointments : upcomingAppointments;
  const todayAppointments = upcomingAppointments.filter(a => new Date(a.time_slot?.date).toDateString() === new Date().toDateString());

  const formatTime = (t) => {
    if (!t) return '';
    const [h, m] = t.split(':'); const hr = parseInt(h);
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  };

  const formatDate = (d, opts = {}) =>
    d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', ...opts }) : 'N/A';

  const getDatesInMonth = () => {
    const y = currentMonth.getFullYear(), mo = currentMonth.getMonth();
    const first = new Date(y, mo, 1), last = new Date(y, mo + 1, 0);
    const arr = [];
    for (let i = 0; i < first.getDay(); i++) arr.push(null);
    for (let d = 1; d <= last.getDate(); d++) arr.push(new Date(y, mo, d));
    return arr;
  };

  const isDateAvailable = (date) => date && availableDates.includes(date.toISOString().split('T')[0]);

  const statusCls = (s) => {
    switch (s?.toLowerCase()) {
      case 'confirmed': case 'scheduled': return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'completed': return 'bg-sky-50 text-sky-700 border-sky-200';
      case 'cancelled': case 'rejected': return 'bg-red-50 text-red-600 border-red-200';
      default: return 'bg-gray-50 text-gray-600 border-gray-200';
    }
  };

  const getBmiCategory = (bmi) => {
    if (!bmi) return null;
    const b = parseFloat(bmi);
    if (b < 18.5) return { label: 'Underweight', cls: 'text-blue-600' };
    if (b < 25) return { label: 'Normal', cls: 'text-emerald-600' };
    if (b < 30) return { label: 'Overweight', cls: 'text-amber-600' };
    return { label: 'Obese', cls: 'text-red-600' };
  };

  // ── Avatar component ──────────────────────────────────────────
  const AvatarImg = ({ size = 'sm' }) => {
    const cls = { sm: 'w-8 h-8 text-xs', md: 'w-10 h-10 text-sm' }[size];
    return patientData?.avatar_url ? (
      <img src={patientData.avatar_url} alt="Avatar" className={`${cls} rounded-full object-cover ring-2 ring-white`} />
    ) : (
      <div className={`${cls} rounded-full bg-teal-700 flex items-center justify-center font-bold text-white ring-2 ring-white`}>
        {patientData?.name?.charAt(0) || 'P'}
      </div>
    );
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: 'appointments', label: 'Appointments', badge: upcomingAppointments.length, d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
    { id: 'doctors', label: 'Find Doctors', d: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
    { id: 'records', label: 'Medical Records', d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'profile', label: 'Profile', d: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
  ];

  if (loading && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3"></div>
          <p className="text-xs text-gray-500">Loading...</p>
        </div>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  // ═══════════════════════════════════════════════════════════════
  return (
    <div className="min-h-screen bg-gray-50">
      <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />

      {/* ── Sidebar ── */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-gray-100 z-40 flex flex-col">
        {/* Logo */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center">
          <img src="/amrt-logo.png" alt="AMRT" className="h-7 w-auto object-contain"
            onError={e => { e.target.style.display = 'none'; }} />
        </div>

        {/* Nav items */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-sm ${
                currentView === item.id ? 'bg-teal-700 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}>
              <div className="flex items-center space-x-2.5">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.d} />
                </svg>
                <span className="font-medium">{item.label}</span>
              </div>
              {item.badge > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${currentView === item.id ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'}`}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>


      </aside>

      {/* ── Main ── */}
      <main className="ml-60 min-h-screen">
        {/* Header — includes profile pic */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div className="px-7 py-3.5 flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-gray-900">
                {currentView === 'dashboard' && `Welcome back, ${patientData?.name?.split(' ')[0]}`}
                {currentView === 'appointments' && 'My Appointments'}
                {currentView === 'doctors' && 'Find Doctors'}
                {currentView === 'records' && 'Medical Records'}
                {currentView === 'profile' && 'My Profile'}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {/* ── Notification Bell ── */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => { setShowNotifications(v => !v); setShowProfileMenu(false); }}
                  className="relative w-9 h-9 bg-gray-50 hover:bg-gray-100 rounded-xl flex items-center justify-center transition">
                  <svg className="w-[18px] h-[18px] text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                  </svg>
                  {(notifications.length + pendingRequests.length) > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                      {notifications.length + pendingRequests.length}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-96 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
                    {/* Header */}
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">Notifications</span>
                        {(notifications.length + pendingRequests.length) > 0 && (
                          <span className="bg-red-100 text-red-600 text-[11px] font-bold px-1.5 py-0.5 rounded-full">
                            {notifications.length + pendingRequests.length}
                          </span>
                        )}
                      </div>
                      {notifications.length > 1 && (
                        <button onClick={markAllRead} className="text-[11px] text-teal-600 hover:text-teal-700 font-semibold transition">
                          Mark all read
                        </button>
                      )}
                    </div>

                    <div className="max-h-[400px] overflow-y-auto divide-y divide-gray-50">
                      {notifications.length === 0 && pendingRequests.length === 0 ? (
                        <div className="py-10 text-center">
                          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"/>
                            </svg>
                          </div>
                          <p className="text-sm font-semibold text-gray-500">All caught up!</p>
                          <p className="text-xs text-gray-400 mt-0.5">No new notifications</p>
                        </div>
                      ) : (
                        <>
                          {/* System / appointment notifications */}
                          {notifications.map(notif => {
                            const isConfirmed = notif.type === 'appointment_confirmed';
                            const isRejected  = notif.type === 'appointment_rejected' || notif.type === 'appointment_cancelled';
                            const isRecord    = notif.type === 'new_record';
                            const cfg = isConfirmed
                              ? { accent: 'border-l-teal-400',  iconBg: 'bg-teal-50',  iconTxt: 'text-teal-600',  d: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',  label: 'teal'  }
                              : isRejected
                              ? { accent: 'border-l-red-400',   iconBg: 'bg-red-50',   iconTxt: 'text-red-500',   d: 'M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z', label: 'red' }
                              : { accent: 'border-l-violet-400',iconBg: 'bg-violet-50',iconTxt: 'text-violet-600',d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', label: 'violet' };
                            return (
                              <div key={notif.id} className={`px-4 py-3.5 border-l-4 ${cfg.accent} hover:bg-gray-50 transition group`}>
                                <div className="flex items-start gap-3">
                                  <div className={`w-8 h-8 ${cfg.iconBg} rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5`}>
                                    <svg className={`w-4 h-4 ${cfg.iconTxt}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={cfg.d}/>
                                    </svg>
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-gray-900">{notif.title}</p>
                                    <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">{notif.message}</p>
                                    <p className="text-[11px] text-gray-400 mt-1.5">
                                      {new Date(notif.created_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'})}
                                    </p>
                                  </div>
                                  {/* ✓ Mark read button */}
                                  <button
                                    onClick={() => markRead(notif.id)}
                                    title="Mark as read"
                                    className="flex-shrink-0 opacity-0 group-hover:opacity-100 w-6 h-6 rounded-full bg-gray-100 hover:bg-teal-100 text-gray-400 hover:text-teal-600 flex items-center justify-center transition mt-0.5">
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7"/>
                                    </svg>
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                          {/* Pending doc requests */}
                          {pendingRequests.map(req => (
                            <div key={req.id}
                              className="px-4 py-3.5 border-l-4 border-l-amber-400 hover:bg-amber-50 cursor-pointer transition"
                              onClick={() => { setSelectedRequest(req); setShowUploadModal(true); setShowNotifications(false); }}>
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-gray-900">Document Requested</p>
                                  <p className="text-xs text-gray-600 mt-0.5">{req.request_type} · Dr. {req.doctor?.name}</p>
                                  <p className="text-[11px] text-amber-600 font-semibold mt-1.5">Tap to upload →</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Profile pill ── */}
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => { setShowProfileMenu(v => !v); setShowNotifications(false); }}
                  className="flex items-center space-x-2 bg-gray-50 hover:bg-gray-100 px-2.5 py-1.5 rounded-xl transition">
                  <AvatarImg size="sm" />
                  <div className="hidden sm:block text-left">
                    <p className="text-xs font-semibold text-gray-900 leading-tight">{patientData?.name}</p>
                    <p className="text-xs text-gray-400 leading-tight">Patient</p>
                  </div>
                  <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
                  </svg>
                </button>
                {showProfileMenu && (
                  <div className="absolute right-0 mt-1.5 w-48 bg-white rounded-xl shadow-xl border border-gray-100 z-50 overflow-hidden">
                    <button onClick={() => { setCurrentView('profile'); setShowProfileMenu(false); }}
                      className="w-full flex items-center space-x-2.5 px-4 py-3 text-xs font-semibold text-gray-700 hover:bg-gray-50 transition">
                      <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/>
                      </svg>
                      <span>My Profile</span>
                    </button>
                    <div className="border-t border-gray-100"/>
                    <button onClick={handleLogout}
                      className="w-full flex items-center space-x-2.5 px-4 py-3 text-xs font-semibold text-red-500 hover:bg-red-50 transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/>
                      </svg>
                      <span>Sign Out</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ══════════ DASHBOARD ══════════ */}
        {currentView === 'dashboard' && (
          <div className="p-7 space-y-5">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: 'Upcoming', value: upcomingAppointments.length, sub: upcomingAppointments[0]?.time_slot?.date ? `Next: ${formatDate(upcomingAppointments[0].time_slot.date, {month:'short',day:'numeric'})}` : 'None scheduled', cl: 'border-l-teal-500' },
                { label: 'Total Appointments', value: appointments.length, sub: `${pastAppointments.length} completed`, cl: 'border-l-sky-500' },
                { label: 'Available Doctors', value: doctors.length, sub: `${specialties.length - 1} specialties`, cl: 'border-l-violet-400' },
                { label: 'Medical Records', value: medicalRecords.length, sub: 'Documents & reports', cl: 'border-l-amber-400' },
              ].map((s, i) => (
                <div key={i} className={`bg-white rounded-xl p-5 border border-gray-100 border-l-4 ${s.cl}`}>
                  <h3 className="text-2xl font-bold text-gray-900">{s.value}</h3>
                  <p className="text-xs font-semibold text-gray-600 mt-1">{s.label}</p>
                  <p className="text-xs text-gray-400 mt-0.5">{s.sub}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100">
                <div className="px-5 py-4 flex items-center justify-between border-b border-gray-50">
                  <h2 className="text-sm font-bold text-gray-900">Today's Appointments</h2>
                  <button onClick={() => setCurrentView('appointments')} className="text-xs text-teal-600 font-semibold hover:text-teal-700">View all</button>
                </div>
                <div className="p-5">
                  {todayAppointments.length > 0 ? (
                    <div className="space-y-3">
                      {todayAppointments.map(apt => (
                        <div key={apt.id} className="p-4 bg-teal-50 rounded-xl border border-teal-100">
                          <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-teal-700 rounded-xl flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-sm">{apt.doctor?.name?.charAt(0)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-gray-900">Dr. {apt.doctor?.name}</p>
                              <p className="text-xs text-gray-500">{apt.doctor?.specialization}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-sm font-bold text-teal-700">{formatTime(apt.time_slot?.start_time)}</p>
                              <span className={`text-xs font-medium ${apt.status === 'confirmed' ? 'text-emerald-600' : 'text-amber-600'}`}>
                                {apt.status === 'confirmed' ? 'Confirmed' : 'Pending'}
                              </span>
                            </div>
                          </div>
                          {/* Token + Report time row */}
                          {apt.token_number && apt.status === 'confirmed' && (
                            <div className="mt-3 pt-3 border-t border-teal-100 flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 bg-white border border-teal-200 text-teal-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                                Token #{apt.token_number}
                              </span>
                              {apt.report_time && (
                                <span className="inline-flex items-center gap-1.5 bg-white border border-blue-200 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                  Report at {apt.report_time}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                        <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      </div>
                      <p className="text-sm text-gray-500 mb-3">No appointments today</p>
                      <button onClick={() => setCurrentView('doctors')} className="px-4 py-2 bg-teal-700 text-white rounded-lg text-xs font-semibold hover:bg-teal-800 transition">
                        Book Appointment
                      </button>
                    </div>
                  )}
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ══════════ APPOINTMENTS ══════════ */}
        {currentView === 'appointments' && (
          <div className="p-7">
            <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
              <div className="border-b border-gray-100 px-5 flex items-center">
                {[{id:'upcoming',label:'Upcoming',count:upcomingAppointments.length},{id:'past',label:'Completed',count:pastAppointments.length},{id:'cancelled',label:'Cancelled',count:cancelledAppointments.length}].map(tab => (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    className={`px-4 py-3.5 text-xs font-semibold border-b-2 transition mr-1 ${activeTab === tab.id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>
                    {tab.label}
                    <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>{tab.count}</span>
                  </button>
                ))}
                <div className="ml-auto py-2.5">
                  <button onClick={() => setCurrentView('doctors')}
                    className="flex items-center space-x-1.5 px-4 py-2 bg-teal-700 text-white rounded-lg text-xs font-semibold hover:bg-teal-800 transition">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                    <span>New Appointment</span>
                  </button>
                </div>
              </div>
              <div className="p-5">
                {displayAppointments.length > 0 ? (
                  <div className="space-y-2.5">
                    {displayAppointments.map(apt => (
                      <div key={apt.id} className="p-4 border border-gray-100 rounded-xl hover:border-gray-200 hover:shadow-sm transition-all">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start space-x-3.5 flex-1 min-w-0">
                            <div className="w-11 h-11 bg-teal-700 rounded-xl flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold text-sm">{apt.doctor?.name?.charAt(0)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-sm font-bold text-gray-900">Dr. {apt.doctor?.name}</h4>
                              <p className="text-xs text-gray-500">{apt.doctor?.specialization}</p>
                              <div className="flex items-center space-x-2 mt-0.5">
                                <span className="text-xs text-gray-400">{apt.time_slot?.date ? formatDate(apt.time_slot.date, {weekday:'short',month:'short',day:'numeric'}) : 'N/A'}</span>
                                <span className="text-gray-200">·</span>
                                <span className="text-xs text-gray-400">
                                  {formatTime(apt.time_slot?.start_time)}{apt.time_slot?.end_time ? ` – ${formatTime(apt.time_slot.end_time)}` : ''}
                                </span>
                              </div>
                              {/* Token + Report time — only for confirmed */}
                              {apt.token_number && apt.status === 'confirmed' && (
                                <div className="flex items-center gap-2 mt-2 flex-wrap">
                                  <span className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"/></svg>
                                    Token #{apt.token_number}
                                  </span>
                                  {apt.report_time && (
                                    <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                                      Report at {apt.report_time}
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            {pendingRequests.some(r => r.appointment_id === apt.id) && (
                              <button
                                onClick={() => { const req = pendingRequests.find(r => r.appointment_id === apt.id); setSelectedRequest(req); setShowUploadModal(true); }}
                                className="px-2.5 py-1 bg-amber-500 text-white rounded-lg text-xs font-bold">Upload</button>
                            )}
                            <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize border ${statusCls(apt.status)}`}>{apt.status}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <p className="text-sm font-semibold text-gray-900 mb-1">No appointments found</p>
                    <p className="text-xs text-gray-400 mb-4">{activeTab === 'upcoming' ? 'Book your first appointment.' : 'Nothing to display.'}</p>
                    {activeTab === 'upcoming' && (
                      <button onClick={() => setCurrentView('doctors')} className="px-5 py-2 bg-teal-700 text-white rounded-lg text-sm font-semibold hover:bg-teal-800 transition">Find a Doctor</button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ══════════ FIND DOCTORS ══════════ */}
        {currentView === 'doctors' && (
          <div className="p-7 space-y-5">
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <div className="relative">
                <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name or specialty..."
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              </div>
              <div className="flex flex-wrap gap-2">
                {specialties.map(spec => (
                  <button key={spec.id} onClick={() => setSelectedSpecialty(spec.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedSpecialty === spec.id ? 'bg-teal-700 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100'}`}>
                    {spec.name}
                  </button>
                ))}
              </div>
            </div>
            {filteredDoctors.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDoctors.map(doctor => (
                  <div key={doctor.id} className="bg-white rounded-xl border border-gray-100 hover:shadow-md transition-all overflow-hidden">
                    <div className="h-1 bg-teal-700"></div>
                    <div className="p-5">
                      <div className="flex items-start space-x-3.5 mb-4">
                        <div className="w-12 h-12 bg-teal-700 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-xl">{doctor.name?.charAt(0)}</span>
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-sm">Dr. {doctor.name}</h4>
                          <p className="text-xs text-teal-600 font-medium mt-0.5">{doctor.specialization}</p>
                          <div className="flex items-center mt-1.5">
                            {[...Array(5)].map((_,i) => (
                              <svg key={i} className="w-3 h-3 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
                                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                              </svg>
                            ))}
                            <span className="text-xs text-gray-400 ml-1">4.5</span>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-1 mb-4">
                        <p className="text-xs text-gray-500 flex items-center">
                          <svg className="w-3.5 h-3.5 mr-1.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                          15+ years experience
                        </p>
                        <p className="text-xs text-gray-500 flex items-center">
                          <svg className="w-3.5 h-3.5 mr-1.5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
                          Consultation: $50.99
                        </p>
                      </div>
                      <button onClick={() => { setSelectedDoctor(doctor); setShowBookingModal(true); }}
                        className="w-full bg-teal-700 text-white py-2.5 rounded-xl text-sm font-semibold hover:bg-teal-800 transition">
                        Book Appointment
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                <p className="text-sm font-semibold text-gray-900 mb-1">No doctors found</p>
                <p className="text-xs text-gray-400">Adjust your search or specialty filter</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════ MEDICAL RECORDS ══════════ */}
        {currentView === 'records' && (
          <div className="p-7">
            <p className="text-xs text-gray-400 mb-5">{medicalRecords.length} record{medicalRecords.length !== 1 ? 's' : ''}</p>
            {medicalRecords.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {medicalRecords.map(record => (
                  <div key={record.id} className="bg-white rounded-xl border border-gray-100 p-5 hover:shadow-sm transition-all">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 bg-teal-50 rounded-lg flex items-center justify-center border border-teal-100">
                          <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                          </svg>
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-gray-900">{record.title}</h4>
                          <p className="text-xs text-gray-400">{formatDate(record.created_at)} · Dr. {record.doctor?.name}</p>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 bg-gray-50 text-gray-500 rounded-lg capitalize border border-gray-100">
                        {record.record_type?.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 mb-3 line-clamp-2">{record.description}</p>
                    <div className="flex items-center justify-between pt-3 border-t border-gray-50">
                      <span className="text-xs text-gray-400">Visit: {formatDate(record.appointment?.time_slot?.date)}</span>
                      {record.document_url && (
                        <a href={record.document_url} target="_blank" rel="noreferrer" className="flex items-center text-xs text-teal-600 hover:text-teal-700 font-semibold">
                          <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/>
                          </svg>
                          View
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                <p className="text-sm font-semibold text-gray-900 mb-1">No medical records</p>
                <p className="text-xs text-gray-400">Records will appear here after consultations.</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════ PROFILE ══════════ */}
        {currentView === 'profile' && (
          <div className="p-7">
            {/* Breadcrumb */}
            <div className="flex items-center space-x-1.5 text-xs text-gray-400 mb-5">
              <button onClick={() => setCurrentView('dashboard')} className="hover:text-gray-600 transition">Dashboard</button>
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
              <span className="text-gray-700 font-medium">My Profile</span>
            </div>

            <div className="w-full space-y-5">

              {/* ── TOP CARD: Avatar + Info + Edit Profile (matches reference image) ── */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="p-6 flex items-start space-x-6 border-b border-gray-50">
                  {/* Avatar with camera button */}
                  <div className="relative flex-shrink-0">
                    <div className={`w-24 h-24 rounded-full overflow-hidden ring-4 ring-gray-100 ${avatarUploading ? 'opacity-70' : ''}`}>
                      {patientData?.avatar_url ? (
                        <img src={patientData.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-teal-700 flex items-center justify-center">
                          <span className="text-white font-bold text-3xl">{patientData?.name?.charAt(0) || 'P'}</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => avatarInputRef.current?.click()}
                      disabled={avatarUploading}
                      title="Update profile photo"
                      className="absolute bottom-0.5 right-0.5 w-7 h-7 bg-teal-700 hover:bg-teal-800 rounded-full border-2 border-white flex items-center justify-center transition disabled:opacity-60">
                      {avatarUploading ? (
                        <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                      ) : (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Name / email / meta */}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-gray-900">{patientData?.name}</h2>
                    <p className="text-sm text-gray-400 mt-0.5">{patientData?.email}</p>

                    {/* Key details inline — like reference image */}
                    <div className="mt-4 grid grid-cols-3 gap-x-8 gap-y-3">
                      {[
                        { label: 'Sex', value: patientData?.gender ? (patientData.gender.charAt(0).toUpperCase() + patientData.gender.slice(1)) : '—' },
                        { label: 'Age', value: patientData?.age ? `${patientData.age}` : '—' },
                        { label: 'Blood', value: patientData?.blood_group || '—' },
                        { label: 'Status', value: 'Active', highlight: 'text-emerald-600' },
                        { label: 'Phone', value: patientData?.phone || '—' },
                        { label: 'Appointments', value: appointments.length.toString() },
                      ].map((item, i) => (
                        <div key={i}>
                          <p className="text-xs text-gray-400">{item.label}</p>
                          <p className={`text-sm font-semibold mt-0.5 ${item.highlight || 'text-gray-900'}`}>{item.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Edit Profile button */}
                  <div className="flex-shrink-0">
                    {!isEditingProfile ? (
                      <button onClick={() => setIsEditingProfile(true)}
                        className="flex items-center space-x-1.5 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                        <span>Edit Profile</span>
                      </button>
                    ) : (
                      <div className="flex flex-col space-y-2">
                        <button onClick={handleSaveProfile} disabled={savingProfile}
                          className="px-4 py-2 bg-teal-700 text-white rounded-lg text-xs font-semibold hover:bg-teal-800 transition disabled:opacity-60">
                          {savingProfile ? 'Saving...' : 'Save Changes'}
                        </button>
                        <button onClick={() => setIsEditingProfile(false)}
                          className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 transition">
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Editable personal fields */}
                {isEditingProfile && (
                  <div className="p-6">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Edit Personal Information</h3>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {[
                        { label: 'Full Name', key: 'name', type: 'text' },
                        { label: 'Phone Number', key: 'phone', type: 'tel' },
                        { label: 'Age', key: 'age', type: 'number' },
                      ].map(f => (
                        <div key={f.key}>
                          <label className="block text-xs text-gray-400 mb-1.5 font-medium">{f.label}</label>
                          <input type={f.type} value={profileForm[f.key] || ''} onChange={e => setProfileForm({ ...profileForm, [f.key]: e.target.value })}
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900" />
                        </div>
                      ))}
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5 font-medium">Gender</label>
                        <select value={profileForm.gender || ''} onChange={e => setProfileForm({ ...profileForm, gender: e.target.value })}
                          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900">
                          <option value="">Select</option>
                          <option value="male">Male</option>
                          <option value="female">Female</option>
                          <option value="other">Other</option>
                          <option value="prefer_not_to_say">Prefer not to say</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1.5 font-medium">Blood Group</label>
                        <select value={profileForm.blood_group || ''} onChange={e => setProfileForm({ ...profileForm, blood_group: e.target.value })}
                          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900">
                          <option value="">Select</option>
                          {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-1">
                        <label className="block text-xs text-gray-400 mb-1.5 font-medium">Address</label>
                        <input type="text" value={profileForm.address || ''} onChange={e => setProfileForm({ ...profileForm, address: e.target.value })}
                          className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900" />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ── HEALTH DETAILS CARD (separate table) ── */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Health Details</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Physical measurements, conditions & emergency contact</p>
                  </div>
                  {!isEditingHealth ? (
                    <button onClick={() => setIsEditingHealth(true)}
                      className="flex items-center space-x-1.5 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"/></svg>
                      <span>{healthDetails ? 'Edit' : 'Add Details'}</span>
                    </button>
                  ) : (
                    <div className="flex space-x-2">
                      <button onClick={() => setIsEditingHealth(false)}
                        className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 transition">Cancel</button>
                      <button onClick={handleSaveHealthDetails} disabled={savingHealth}
                        className="px-4 py-2 bg-teal-700 text-white rounded-lg text-xs font-semibold hover:bg-teal-800 transition disabled:opacity-60">
                        {savingHealth ? 'Saving...' : 'Save Details'}
                      </button>
                    </div>
                  )}
                </div>

                <div className="p-6 space-y-6">
                  {/* Physical Measurements */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Physical Measurements</h4>
                    {isEditingHealth ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                          { label: 'Height (cm)', key: 'height_cm', type: 'number', placeholder: 'e.g. 170' },
                          { label: 'Weight (kg)', key: 'weight_kg', type: 'number', placeholder: 'e.g. 65' },
                          { label: 'BMI (auto-calc)', key: 'bmi', type: 'number', placeholder: 'Auto' },
                        ].map(f => (
                          <div key={f.key}>
                            <label className="block text-xs text-gray-400 mb-1.5 font-medium">{f.label}</label>
                            <input type={f.type} value={healthForm[f.key] || ''} placeholder={f.placeholder}
                              onChange={e => setHealthForm({ ...healthForm, [f.key]: e.target.value })}
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-3 gap-4">
                        {[
                          { label: 'Height', value: healthDetails?.height_cm ? `${healthDetails.height_cm} cm` : null },
                          { label: 'Weight', value: healthDetails?.weight_kg ? `${healthDetails.weight_kg} kg` : null },
                          { label: 'BMI', value: healthDetails?.bmi ? `${healthDetails.bmi}` : null, extra: getBmiCategory(healthDetails?.bmi) },
                        ].map((item, i) => (
                          <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <p className="text-xs text-gray-400 mb-1">{item.label}</p>
                            {item.value ? (
                              <>
                                <p className="text-xl font-bold text-gray-900">{item.value}</p>
                                {item.extra && <p className={`text-xs font-semibold mt-0.5 ${item.extra.cls}`}>{item.extra.label}</p>}
                              </>
                            ) : (
                              <p className="text-sm text-gray-300">Not provided</p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Medical Conditions */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Medical Information</h4>
                    {isEditingHealth ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { label: 'Allergies', key: 'allergies', placeholder: 'e.g. Penicillin, Pollen' },
                          { label: 'Chronic Conditions', key: 'chronic_conditions', placeholder: 'e.g. Diabetes, Hypertension' },
                          { label: 'Current Medications', key: 'current_medications', placeholder: 'e.g. Metformin 500mg' },
                        ].map(f => (
                          <div key={f.key}>
                            <label className="block text-xs text-gray-400 mb-1.5 font-medium">{f.label}</label>
                            <textarea value={healthForm[f.key] || ''} placeholder={f.placeholder} rows={2}
                              onChange={e => setHealthForm({ ...healthForm, [f.key]: e.target.value })}
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900 resize-none" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { label: 'Allergies', value: healthDetails?.allergies },
                          { label: 'Chronic Conditions', value: healthDetails?.chronic_conditions },
                          { label: 'Current Medications', value: healthDetails?.current_medications },
                        ].map((item, i) => (
                          <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <p className="text-xs text-gray-400 mb-1.5">{item.label}</p>
                            <p className={`text-xs leading-relaxed ${item.value ? 'text-gray-900 font-medium' : 'text-gray-300'}`}>
                              {item.value || 'None recorded'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Emergency Contact */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Emergency Contact</h4>
                    {isEditingHealth ? (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {[
                          { label: 'Contact Name', key: 'emergency_contact_name', placeholder: 'Full name', type: 'text' },
                          { label: 'Phone Number', key: 'emergency_contact_phone', placeholder: '+1 000 000 0000', type: 'tel' },
                          { label: 'Relationship', key: 'emergency_contact_relation', placeholder: 'e.g. Spouse, Parent', type: 'text' },
                        ].map(f => (
                          <div key={f.key}>
                            <label className="block text-xs text-gray-400 mb-1.5 font-medium">{f.label}</label>
                            <input type={f.type} value={healthForm[f.key] || ''} placeholder={f.placeholder}
                              onChange={e => setHealthForm({ ...healthForm, [f.key]: e.target.value })}
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900" />
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex items-center space-x-4 p-4 bg-gray-50 rounded-xl border border-gray-100">
                        {(healthDetails?.emergency_contact_name || healthDetails?.emergency_contact_phone) ? (
                          <>
                            <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                              <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                              </svg>
                            </div>
                            <div>
                              <p className="text-sm font-bold text-gray-900">{healthDetails.emergency_contact_name || '—'}</p>
                              <p className="text-xs text-gray-400">{healthDetails.emergency_contact_relation && `${healthDetails.emergency_contact_relation} · `}{healthDetails.emergency_contact_phone || '—'}</p>
                            </div>
                          </>
                        ) : (
                          <p className="text-xs text-gray-400">No emergency contact recorded. Click Edit to add one.</p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Notes */}
                  <div>
                    <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Additional Notes</h4>
                    {isEditingHealth ? (
                      <textarea value={healthForm.notes || ''} placeholder="Any additional health notes, dietary restrictions, or important medical history..."
                        rows={3} onChange={e => setHealthForm({ ...healthForm, notes: e.target.value })}
                        className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900 resize-none" />
                    ) : (
                      <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                        <p className={`text-xs leading-relaxed ${healthDetails?.notes ? 'text-gray-700' : 'text-gray-300'}`}>
                          {healthDetails?.notes || 'No additional notes.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Quick Stats Row */}
              <div className="grid grid-cols-3 gap-4">
                {[
                  { label: 'Total Appointments', value: appointments.length },
                  { label: 'Medical Records', value: medicalRecords.length },
                  { label: 'Upcoming', value: upcomingAppointments.length },
                ].map((s, i) => (
                  <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 text-center">
                    <h3 className="text-2xl font-bold text-gray-900">{s.value}</h3>
                    <p className="text-xs text-gray-400 mt-1">{s.label}</p>
                  </div>
                ))}
              </div>

            </div>
          </div>
        )}
      </main>

      {/* ══════════ BOOKING MODAL ══════════ */}
      {showBookingModal && selectedDoctor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[85vh] overflow-y-auto shadow-2xl">
            <div className="sticky top-0 bg-white border-b border-gray-100 px-5 py-3.5 flex items-center justify-between z-10 rounded-t-2xl">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 bg-teal-700 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">{selectedDoctor.name?.charAt(0)}</span>
                </div>
                <div>
                  <h2 className="text-sm font-bold text-gray-900">Book Appointment — Dr. {selectedDoctor.name}</h2>
                  <p className="text-xs text-teal-600">{selectedDoctor.specialization} · $50.99 per session</p>
                </div>
              </div>
              <button onClick={() => { setShowBookingModal(false); setSelectedDoctor(null); setSelectedDate(null); setSelectedSlot(null); }}
                className="w-7 h-7 hover:bg-gray-100 rounded-lg flex items-center justify-center transition">
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Select Date</p>
                  <div className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                    <div className="flex items-center justify-between mb-2.5">
                      <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth()-1))} className="w-6 h-6 hover:bg-white rounded-lg flex items-center justify-center">
                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7"/></svg>
                      </button>
                      <span className="text-xs font-bold text-gray-900">{currentMonth.toLocaleDateString('en-US', {month:'long',year:'numeric'})}</span>
                      <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth()+1))} className="w-6 h-6 hover:bg-white rounded-lg flex items-center justify-center">
                        <svg className="w-3 h-3 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7"/></svg>
                      </button>
                    </div>
                    <div className="grid grid-cols-7 gap-0.5 mb-1">
                      {['S','M','T','W','T','F','S'].map((d,i) => <div key={i} className="text-center text-xs font-semibold text-gray-400 py-0.5">{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-0.5">
                      {getDatesInMonth().map((date, i) => {
                        const avail = isDateAvailable(date);
                        const sel = date && selectedDate === date.toISOString().split('T')[0];
                        const today = date && date.toDateString() === new Date().toDateString();
                        return (
                          <button key={i} onClick={() => date && avail && setSelectedDate(date.toISOString().split('T')[0])} disabled={!date || !avail}
                            className={`aspect-square rounded-lg flex items-center justify-center text-xs font-medium transition ${!date?'invisible':''} ${sel?'bg-teal-700 text-white':''} ${!sel&&avail?'bg-white text-teal-700 hover:bg-teal-50 border border-teal-100':''} ${!sel&&!avail&&date?'text-gray-300 cursor-not-allowed':''} ${today&&!sel?'ring-2 ring-teal-400':''}`}>
                            {date&&date.getDate()}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Select Time</p>
                  {selectedDate ? (
                    <>
                      <div className="flex space-x-1.5 mb-2.5">
                        {[{id:'morning',label:'Morning'},{id:'afternoon',label:'Afternoon'},{id:'evening',label:'Evening'}].map(p => (
                          <button key={p.id} onClick={() => setSelectedTimeOfDay(p.id)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${selectedTimeOfDay===p.id?'bg-teal-700 text-white':'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100'}`}>
                            {p.label}
                          </button>
                        ))}
                      </div>
                      {timeSlots.length > 0 ? (
                        <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                          {timeSlots.map(slot => (
                            <button key={slot.id} onClick={() => setSelectedSlot(slot)}
                              className={`py-2 rounded-lg text-xs font-semibold transition ${selectedSlot?.id===slot.id?'bg-teal-700 text-white':'bg-gray-50 text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-100'}`}>
                              {formatTime(slot.start_time)}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-5 bg-gray-50 rounded-xl border border-gray-100">
                          <p className="text-xs text-gray-400">No slots for {selectedTimeOfDay}</p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-10 bg-gray-50 rounded-xl border border-gray-100">
                      <p className="text-xs text-gray-400">Select a date first</p>
                    </div>
                  )}
                </div>
              </div>
              {selectedSlot && (
                <div className="grid grid-cols-2 gap-3 pt-1 border-t border-gray-100">
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Symptoms <span className="text-gray-300 normal-case font-normal">(optional)</span></label>
                    <textarea value={symptoms} onChange={e=>setSymptoms(e.target.value)} placeholder="Describe your symptoms..." rows={3}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 resize-none text-gray-900" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5 block">Notes <span className="text-gray-300 normal-case font-normal">(optional)</span></label>
                    <textarea value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Any additional information..." rows={3}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 resize-none text-gray-900" />
                  </div>
                </div>
              )}
              {selectedSlot && selectedDate && (
                <div className="flex items-center space-x-2.5 p-3 bg-teal-50 rounded-xl border border-teal-100">
                  <svg className="w-4 h-4 text-teal-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs text-teal-800">
                    <span className="font-bold">Dr. {selectedDoctor.name}</span>
                    {' · '}{formatDate(selectedDate, {weekday:'long',month:'long',day:'numeric'})}
                    {' · '}{formatTime(selectedSlot.start_time)}
                  </p>
                </div>
              )}
              <div className="flex space-x-3">
                <button onClick={() => { setShowBookingModal(false); setSelectedDoctor(null); setSelectedDate(null); setSelectedSlot(null); }}
                  className="flex-1 px-5 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button onClick={handleBookAppointment} disabled={!selectedSlot || loading}
                  className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-bold transition ${selectedSlot&&!loading?'bg-teal-700 text-white hover:bg-teal-800':'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                  {loading ? 'Booking...' : 'Confirm Appointment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ UPLOAD DOC MODAL ══════════ */}
      {showUploadModal && selectedRequest && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="w-9 h-9 bg-amber-100 rounded-xl flex items-center justify-center">
                <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              </div>
              <div>
                <h3 className="text-sm font-bold text-gray-900">Upload {selectedRequest.request_type}</h3>
                <p className="text-xs text-gray-400">Requested by Dr. {selectedRequest.doctor?.name}</p>
              </div>
            </div>
            {selectedRequest.instructions && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-2.5 mb-4 text-xs text-blue-700 italic">
                "{selectedRequest.instructions}"
              </div>
            )}
            <div className="border-2 border-dashed border-gray-200 rounded-xl p-6 text-center hover:border-teal-400 hover:bg-teal-50 transition-all cursor-pointer relative mb-4">
              <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e=>setFileToUpload(e.target.files[0])} />
              {fileToUpload ? (
                <>
                  <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <svg style={{width:'18px',height:'18px'}} className="text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/>
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-900 truncate">{fileToUpload.name}</p>
                  <p className="text-xs text-gray-400">{(fileToUpload.size/1024).toFixed(1)} KB</p>
                </>
              ) : (
                <>
                  <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-700">Click to select file</p>
                  <p className="text-xs text-gray-400 mt-0.5">PDF, JPG, PNG — max 5 MB</p>
                </>
              )}
            </div>
            <div className="flex space-x-2.5">
              <button onClick={() => { setShowUploadModal(false); setFileToUpload(null); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleFileUpload} disabled={!fileToUpload || uploading}
                className={`flex-1 px-4 py-2.5 bg-teal-700 text-white rounded-xl text-xs font-bold transition ${(!fileToUpload||uploading)?'opacity-50 cursor-not-allowed':'hover:bg-teal-800'}`}>
                {uploading ? 'Uploading...' : 'Confirm Upload'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}