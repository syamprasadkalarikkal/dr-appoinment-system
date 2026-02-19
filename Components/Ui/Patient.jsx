'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/getUserRole';

export default function PatientDashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);

  // View management
  const [currentView, setCurrentView] = useState('dashboard');
  const [selectedDoctor, setSelectedDoctor] = useState(null);

  // Data
  const [doctors, setDoctors] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [selectedSpecialty, setSelectedSpecialty] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('upcoming');
  const [medicalRecords, setMedicalRecords] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]); // Requests from doctor
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState(null); // The specific request being responded to
  const [fileToUpload, setFileToUpload] = useState(null); // File state
  const [uploading, setUploading] = useState(false);

  // Booking state
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedTime, setSelectedTime] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [timeSlots, setTimeSlots] = useState([]);
  const [symptoms, setSymptoms] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedTimeOfDay, setSelectedTimeOfDay] = useState('afternoon');
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [availableDates, setAvailableDates] = useState([]);
  const [showBookingModal, setShowBookingModal] = useState(false);

  const specialties = [
    { id: 'all', name: 'All Specialties', color: 'blue' },
    { id: 'neurology', name: 'Neurology', color: 'purple' },
    { id: 'cardiology', name: 'Cardiology', color: 'red' },
    { id: 'orthopedics', name: 'Orthopedics', color: 'amber' },
    { id: 'pathology', name: 'Pathology', color: 'green' },
    { id: 'pediatrics', name: 'Pediatrics', color: 'pink' },
    { id: 'dermatology', name: 'Dermatology', color: 'cyan' },
    { id: 'ophthalmology', name: 'Ophthalmology', color: 'indigo' },
  ];

  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated) {
      fetchDoctors();
      if (patientData?.id) {
        fetchAppointments();
        fetchMedicalRecords();
        fetchNotifications();
        fetchPendingRequests();
      }
    }
  }, [isAuthenticated, patientData?.id]);

  const fetchPendingRequests = async () => {
    if (!patientData?.id) return;
    // Fetch requests that are NOT reviewed (pending or uploaded)
    // Actually, patient might want to see all, but for "Action items" we focus on 'pending'
    const { data, error } = await supabase
      .from('record_requests')
      .select(`
            *,
            doctor:doctor_id(name, specialization)
        `)
      .eq('patient_id', patientData.id)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) console.error(error);
    else setPendingRequests(data);
  };

  const fetchNotifications = async () => {
    if (!patientData?.id) return;
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', patientData.id)
      .eq('type', 'record_request') // Only interested in requests for this feature
      .order('created_at', { ascending: false });

    if (error) console.error('Error fetching notifications:', error);
    else setNotifications(data);
  };

  const fetchMedicalRecords = async () => {
    if (!patientData?.id) return;
    const { data, error } = await supabase
      .from('medical_records')
      .select(`
        *,
        doctor:doctor_id(name, specialization)
      `)
      .eq('patient_id', patientData.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching medical records:', error);
    } else {
      setMedicalRecords(data);
    }
  };

  // Real-time updates for Appointment and Medical Records
  useEffect(() => {
    if (!patientData?.id) return;

    const channel = supabase
      .channel('patient-updates')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `patient_id=eq.${patientData.id}`
        },
        (payload) => {
          fetchAppointments();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'medical_records',
          filter: `patient_id=eq.${patientData.id}`
        },
        (payload) => {
          fetchMedicalRecords();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${patientData.id}`
        },
        (payload) => {
          fetchNotifications();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'record_requests',
          filter: `patient_id=eq.${patientData.id}`
        },
        (payload) => {
          fetchPendingRequests();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [patientData?.id]);

  const handleFileUpload = async () => {
    if (!selectedRequest || !fileToUpload) {
      alert("Please select a file.");
      return;
    }

    try {
      setUploading(true);
      // Upload file to Supabase Storage
      const fileExt = fileToUpload.name.split('.').pop();
      const fileName = `${patientData.id}/${Date.now()}.${fileExt}`;
      const filePath = fileName;

      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(filePath, fileToUpload);

      if (uploadError) throw uploadError;

      // Get Public URL (or signed URL, but public is easier if bucket is public, else signed)
      // Since we made bucket private, we likely need a signed URL for Doctor to view, 
      // OR we can make the bucket public for read if security allows.
      // Let's store the path and use it to get URL.

      // Actually, to make it viewable easily in the dashboard, getting a public URL is best if bucket is public.
      // If private, we'd need to generate signed URLs on the fly.
      // Let's assume for this step the bucket is PRIVATE and we will generate a signed URL to store (valid for 1 year or similar, or just store path).
      // Storing path is better, but to keep it simple for the UI "href", let's generate a signed URL valid for 1 year or similar, or just make bucket public.
      // UPDATE: User instructions said "Private". So we will store the Path, and Doctor UI will need to generate signed URL. 
      // BUT, `record_requests` table has `document_url`. Let's store the full Signed URL for simplicity now.

      const { data: urlData, error: urlError } = await supabase.storage
        .from('documents')
        .createSignedUrl(filePath, 60 * 60 * 24 * 365); // 1 year

      if (urlError) throw urlError;

      const documentUrl = urlData.signedUrl;

      // Update Request Status
      const { error: updateError } = await supabase
        .from('record_requests')
        .update({
          status: 'uploaded',
          document_url: documentUrl,
          document_name: fileToUpload.name
        })
        .eq('id', selectedRequest.id);

      if (updateError) throw updateError;

      alert("Document uploaded successfully!");
      setShowUploadModal(false);
      setFileToUpload(null);
      setSelectedRequest(null);
      fetchPendingRequests();
    } catch (error) {
      console.error("Error uploading:", error);
      alert("Failed to upload document");
    } finally {
      setUploading(false);
    }
  };

  // Real-time updates for Time Slots (when viewing a doctor)
  useEffect(() => {
    if (!selectedDoctor?.id) return;

    const channel = supabase
      .channel('patient-timeslots')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'time_slots',
          filter: `doctor_id=eq.${selectedDoctor.id}`
        },
        (payload) => {
          fetchAvailableDates();
          if (selectedDate) {
            fetchTimeSlots();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedDoctor?.id, selectedDate]);


  useEffect(() => {
    if (selectedDoctor && showBookingModal) {
      fetchAvailableDates();
    }
  }, [selectedDoctor, currentMonth, showBookingModal]);

  useEffect(() => {
    if (selectedDate && showBookingModal) {
      fetchTimeSlots();
    }
  }, [selectedDate, selectedTimeOfDay, showBookingModal]);

  const checkAuth = async () => {
    try {
      const userRole = localStorage.getItem('userRole');
      const userId = localStorage.getItem('userId');

      if (userRole !== 'patient' || !userId) {
        router.push('/Login');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/Login');
        return;
      }

      const userData = await getUserRole(user.id);

      if (!userData || userData.role !== 'patient') {
        router.push('/Login');
        return;
      }

      setPatientData(userData);
      setIsAuthenticated(true);

    } catch (error) {
      console.error('Auth error:', error);
      router.push('/Login');
    } finally {
      setLoading(false);
    }
  };

  const fetchDoctors = async () => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('role', 'doctor')
        .eq('is_approved', true);

      if (error) throw error;
      setDoctors(data || []);
    } catch (error) {
      console.error('Error fetching doctors:', error);
    }
  };

  const fetchAppointments = async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          doctor:doctor_id(name, specialization, email),
          time_slot:slot_id(date, start_time, end_time)
        `)
        .eq('patient_id', patientData?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  };

  const fetchAvailableDates = async () => {
    try {
      const startOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      const endOfMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 0);

      const { data, error } = await supabase
        .from('time_slots')
        .select('date')
        .eq('doctor_id', selectedDoctor.id)
        .eq('is_available', true)
        .gte('date', startOfMonth.toISOString().split('T')[0])
        .lte('date', endOfMonth.toISOString().split('T')[0]);

      if (error) throw error;

      const dates = [...new Set(data.map(slot => slot.date))];
      setAvailableDates(dates);

      if (dates.length > 0 && !selectedDate) {
        setSelectedDate(dates[0]);
      }
    } catch (error) {
      console.error('Error fetching available dates:', error);
    }
  };

  const fetchTimeSlots = async () => {
    try {
      setLoading(true);

      let timeFilter = {};
      if (selectedTimeOfDay === 'morning') {
        timeFilter = { gte: '06:00:00', lt: '12:00:00' };
      } else if (selectedTimeOfDay === 'afternoon') {
        timeFilter = { gte: '12:00:00', lt: '17:00:00' };
      } else {
        timeFilter = { gte: '17:00:00', lt: '22:00:00' };
      }

      const { data, error } = await supabase
        .from('time_slots')
        .select('*')
        .eq('doctor_id', selectedDoctor.id)
        .eq('date', selectedDate)
        .eq('is_available', true)
        .gte('start_time', timeFilter.gte)
        .lt('start_time', timeFilter.lt)
        .order('start_time');

      if (error) throw error;
      setTimeSlots(data || []);
    } catch (error) {
      console.error('Error fetching time slots:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleBookAppointment = async () => {
    if (!selectedSlot) {
      alert('Please select a time slot');
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await supabase
        .rpc('book_appointment', {
          p_slot_id: selectedSlot.id,
          p_patient_id: patientData.id,
          p_doctor_id: selectedDoctor.id,
          p_symptoms: symptoms || null,
          p_notes: notes || null
        });

      if (error) throw error;
      if (!data.success) throw new Error(data.error);

      const appointmentId = data.id;

      await supabase
        .from('notifications')
        .insert([
          {
            user_id: selectedDoctor.id,
            type: 'new_appointment',
            title: 'New Appointment Booked',
            message: `You have a new appointment scheduled for ${selectedDate} at ${selectedSlot.start_time}`,
            related_id: appointmentId
          }
        ]);

      alert('Appointment booked successfully!');

      // Reset booking state
      setShowBookingModal(false);
      setSelectedDoctor(null);
      setSelectedDate(null);
      setSelectedTime(null);
      setSelectedSlot(null);
      setSymptoms('');
      setNotes('');

      // Refresh appointments
      fetchAppointments();
      setCurrentView('appointments');

    } catch (error) {
      console.error('Error booking appointment:', error);
      alert('Failed to book appointment. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    router.push('/Login');
  };

  const filteredDoctors = doctors.filter(doctor => {
    const matchesSpecialty = selectedSpecialty === 'all' ||
      doctor.specialization?.toLowerCase() === selectedSpecialty;
    const matchesSearch = doctor.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      doctor.specialization?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesSpecialty && matchesSearch;
  });

  const upcomingAppointments = appointments.filter(apt =>
    (apt.status === 'scheduled' || apt.status === 'confirmed') &&
    (new Date(apt.time_slot?.date) >= new Date().setHours(0, 0, 0, 0))
  );

  const pastAppointments = appointments.filter(apt =>
    apt.status === 'completed' ||
    (new Date(apt.time_slot?.date) < new Date().setHours(0, 0, 0, 0) && apt.status !== 'cancelled')
  );

  const cancelledAppointments = appointments.filter(apt =>
    apt.status === 'cancelled' || apt.status === 'rejected'
  );

  // Helper to get current appointments to display based on active tab
  const getDisplayAppointments = () => {
    switch (activeTab) {
      case 'past': return pastAppointments;
      case 'cancelled': return cancelledAppointments;
      default: return upcomingAppointments;
    }
  };

  const displayAppointments = getDisplayAppointments();

  const todayAppointments = upcomingAppointments.filter(apt => {
    const today = new Date().toDateString();
    const aptDate = new Date(apt.time_slot?.date).toDateString();
    return today === aptDate;
  });

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

  const isDateAvailable = (date) => {
    if (!date) return false;
    const dateStr = date.toISOString().split('T')[0];
    return availableDates.includes(dateStr);
  };

  if (loading && !isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 text-lg">Loading your dashboard...</p>
        </div>
        {/* Upload Document Modal */}
        {showUploadModal && selectedRequest && (
          <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl max-w-md w-full p-6">
              <h3 className="text-xl font-bold text-gray-900 mb-2">Upload {selectedRequest.request_type}</h3>
              {selectedRequest.instructions && (
                <div className="bg-gray-50 p-3 rounded-lg mb-4 text-sm text-gray-700 italic border border-gray-200">
                  "{selectedRequest.instructions}"
                </div>
              )}

              <div className="space-y-4">
                <div className="border-2 border-dashed border-blue-200 rounded-xl p-8 text-center hover:bg-blue-50 transition cursor-pointer relative">
                  <input
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => setFileToUpload(e.target.files[0])}
                  />
                  {fileToUpload ? (
                    <div>
                      <span className="text-3xl mb-2 block">📄</span>
                      <p className="font-semibold text-blue-600 truncate">{fileToUpload.name}</p>
                      <p className="text-xs text-gray-500">{(fileToUpload.size / 1024).toFixed(2)} KB</p>
                    </div>
                  ) : (
                    <div>
                      <span className="text-3xl mb-2 block">☁️</span>
                      <p className="font-semibold text-gray-700">Click to Select File</p>
                      <p className="text-xs text-gray-500">PDF, JPG, PNG (Max 5MB)</p>
                    </div>
                  )}
                </div>

                <div className="flex space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setShowUploadModal(false);
                      setFileToUpload(null);
                    }}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleFileUpload}
                    disabled={!fileToUpload || uploading}
                    className={`flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {uploading ? 'Uploading...' : 'Confirm Upload'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}  </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50/30">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-72 bg-white border-r border-gray-200 shadow-sm z-40">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
              <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">HealthCare</h1>
              <p className="text-xs text-gray-500">Patient Portal</p>
            </div>
          </div>
        </div>

        <nav className="p-4">
          <div className="space-y-1">
            <button
              onClick={() => setCurrentView('dashboard')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${currentView === 'dashboard'
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
                }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span>Dashboard</span>
            </button>

            <button
              onClick={() => setCurrentView('appointments')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${currentView === 'appointments'
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
                }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              <span>Appointments</span>
              {upcomingAppointments.length > 0 && (
                <span className="ml-auto bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">
                  {upcomingAppointments.length}
                </span>
              )}
            </button>

            <button
              onClick={() => setCurrentView('doctors')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${currentView === 'doctors'
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
                }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>Find Doctors</span>
            </button>

            <button
              onClick={() => setCurrentView('records')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${currentView === 'records'
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
                }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <span>Medical Records</span>
            </button>

            <button
              onClick={() => setCurrentView('profile')}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-lg transition ${currentView === 'profile'
                ? 'bg-blue-50 text-blue-700 font-semibold'
                : 'text-gray-700 hover:bg-gray-50'
                }`}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Profile</span>
            </button>
          </div>
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200">
          <div className="flex items-center space-x-3 mb-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center">
              <span className="text-white font-semibold text-sm">
                {patientData?.name?.charAt(0) || 'P'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{patientData?.name}</p>
              <p className="text-xs text-gray-500 truncate">{patientData?.email}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-red-50 text-red-700 rounded-lg hover:bg-red-100 transition font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="ml-72 min-h-screen">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30 shadow-sm">
          <div className="px-8 py-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">
                  {currentView === 'dashboard' && 'Dashboard'}
                  {currentView === 'appointments' && 'My Appointments'}
                  {currentView === 'doctors' && 'Find Doctors'}
                  {currentView === 'records' && 'Medical Records'}
                  {currentView === 'profile' && 'My Profile'}
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  {currentView === 'dashboard' && `Welcome back, ${patientData?.name}`}
                  {currentView === 'appointments' && 'Manage your appointments'}
                  {currentView === 'doctors' && 'Browse and book appointments with doctors'}
                  {currentView === 'records' && 'View your medical history'}
                  {currentView === 'profile' && 'Manage your personal information'}
                </p>
              </div>
              <div className="flex items-center space-x-3">
                <button className="p-2 hover:bg-gray-100 rounded-lg transition relative">
                  <svg className="w-6 h-6 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {upcomingAppointments.length > 0 && (
                    <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full"></span>
                  )}
                </button>
                <div className="text-sm text-gray-600">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Dashboard View */}
        {currentView === 'dashboard' && (
          <div className="p-8">
            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Upcoming Appointments</p>
                    <h3 className="text-3xl font-bold text-gray-900">{upcomingAppointments.length}</h3>
                    <p className="text-xs text-green-600 mt-2">Next: {upcomingAppointments[0]?.time_slot?.date || 'None scheduled'}</p>
                  </div>
                  <div className="bg-blue-100 p-4 rounded-xl">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Total Appointments</p>
                    <h3 className="text-3xl font-bold text-gray-900">{appointments.length}</h3>
                    <p className="text-xs text-gray-500 mt-2">{pastAppointments.length} completed</p>
                  </div>
                  <div className="bg-green-100 p-4 rounded-xl">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Available Doctors</p>
                    <h3 className="text-3xl font-bold text-gray-900">{doctors.length}</h3>
                    <p className="text-xs text-gray-500 mt-2">Across {specialties.length - 1} specialties</p>
                  </div>
                  <div className="bg-purple-100 p-4 rounded-xl">
                    <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl p-6 border border-gray-200 shadow-sm hover:shadow-md transition">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Medical Records</p>
                    <h3 className="text-3xl font-bold text-gray-900">0</h3>
                    <p className="text-xs text-gray-500 mt-2">Documents & Reports</p>
                  </div>
                  <div className="bg-orange-100 p-4 rounded-xl">
                    <svg className="w-8 h-8 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Today's Appointments */}
              <div className="lg:col-span-2">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
                  <div className="p-6 border-b border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-bold text-gray-900">Today's Appointments</h3>
                      <button
                        onClick={() => setCurrentView('appointments')}
                        className="text-sm text-blue-600 hover:text-blue-700 font-semibold"
                      >
                        View All →
                      </button>
                    </div>
                  </div>
                  <div className="p-6">
                    {todayAppointments.length > 0 ? (
                      <div className="space-y-4">
                        {todayAppointments.map(appointment => (
                          <div key={appointment.id} className="flex items-center space-x-4 p-4 bg-blue-50 rounded-lg border border-blue-100">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0">
                              <span className="text-white font-bold">
                                {appointment.doctor?.name?.charAt(0)}
                              </span>
                            </div>
                            <div className="flex-1">
                              <h4 className="font-semibold text-gray-900">Dr. {appointment.doctor?.name}</h4>
                              <p className="text-sm text-gray-600">{appointment.doctor?.specialization}</p>
                              <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                                <span className="flex items-center">
                                  <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {formatTime(appointment.time_slot?.start_time)}
                                </span>
                                <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full font-medium">
                                  Confirmed
                                </span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-12">
                        <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <p className="text-gray-500 mb-4">No appointments scheduled for today</p>
                        <button
                          onClick={() => setCurrentView('doctors')}
                          className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                        >
                          Book Appointment
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4 bg-orange-50 p-3 rounded-lg border border-orange-100 flex items-center">
                  <span className="mr-2">⚠️</span> Action Required: Pending Document Requests
                </h3>
                {pendingRequests.length === 0 ? (
                  <p className="text-gray-500 text-sm">No pending requests.</p>
                ) : (
                  <div className="space-y-4">
                    {pendingRequests.map(req => (
                      <div key={req.id} className="flex items-center justify-between p-4 border border-blue-100 bg-blue-50 rounded-lg">
                        <div>
                          <h4 className="font-bold text-blue-900">{req.request_type}</h4>
                          <p className="text-sm text-blue-700">Requested by Dr. {req.doctor?.name}</p>
                          {req.instructions && (
                            <p className="text-xs text-blue-600 mt-1 italic">"{req.instructions}"</p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setSelectedRequest(req);
                            setShowUploadModal(true);
                          }}
                          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 shadow-sm"
                        >
                          Upload Document
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick Actions */}
              <div className="space-y-6">
                <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl p-6 text-white shadow-lg">
                  <h3 className="text-xl font-bold mb-2">Need a Doctor?</h3>
                  <p className="text-blue-100 text-sm mb-6">
                    Browse our network of qualified healthcare professionals and book an appointment today.
                  </p>
                  <button
                    onClick={() => setCurrentView('doctors')}
                    className="w-full bg-white text-blue-600 px-6 py-3 rounded-lg hover:bg-blue-50 transition font-semibold shadow-md"
                  >
                    Find Doctors
                  </button>
                </div>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Health Tips</h3>
                  <div className="space-y-3">
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">💧</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Stay Hydrated</p>
                        <p className="text-xs text-gray-600">Drink 8 glasses of water daily</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">🏃</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Exercise Daily</p>
                        <p className="text-xs text-gray-600">30 minutes of physical activity</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                        <span className="text-lg">😴</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Sleep Well</p>
                        <p className="text-xs text-gray-600">Get 7-9 hours of quality sleep</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Appointments View */}
        {currentView === 'appointments' && (
          <div className="p-8">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="border-b border-gray-200">
                <div className="flex space-x-8 px-6">
                  <button
                    onClick={() => setActiveTab('upcoming')}
                    className={`py-4 border-b-2 font-semibold transition ${activeTab === 'upcoming'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    Upcoming ({upcomingAppointments.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('past')}
                    className={`py-4 border-b-2 font-semibold transition ${activeTab === 'past'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    Past ({pastAppointments.length})
                  </button>
                  <button
                    onClick={() => setActiveTab('cancelled')}
                    className={`py-4 border-b-2 font-semibold transition ${activeTab === 'cancelled'
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700'
                      }`}
                  >
                    Cancelled ({cancelledAppointments.length})
                  </button>
                </div>
              </div>

              <div className="p-6">
                {displayAppointments.length > 0 ? (
                  <div className="space-y-4">
                    {displayAppointments.map(appointment => (
                      <div key={appointment.id} className="flex items-center justify-between p-6 border border-gray-200 rounded-xl hover:shadow-md transition">
                        <div className="flex items-center space-x-4">
                          <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                            <span className="text-white font-bold text-xl">
                              {appointment.doctor?.name?.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-bold text-gray-900 text-lg">Dr. {appointment.doctor?.name}</h4>
                            <p className="text-gray-600">{appointment.doctor?.specialization}</p>
                            <div className="flex items-center space-x-4 mt-2">
                              <span className="flex items-center text-sm text-gray-500">
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                                </svg>
                                {new Date(appointment.time_slot?.date).toLocaleDateString('en-US', {
                                  weekday: 'short',
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric'
                                })}
                              </span>
                              <span className="flex items-center text-sm text-gray-500">
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                {formatTime(appointment.time_slot?.start_time)} - {formatTime(appointment.time_slot?.end_time)}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-3">
                          <span className="px-4 py-2 bg-green-100 text-green-700 rounded-lg font-semibold text-sm">
                            {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                          </span>
                          {/* Check for record request - visual indicator if pending */}
                          {pendingRequests.some(r => r.appointment_id === appointment.id) && (
                            <span className="px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs font-bold animate-pulse">
                              Action Required
                            </span>
                          )}
                          <button className="p-2 hover:bg-gray-100 rounded-lg transition">
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-16">
                    <svg className="w-20 h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <h3 className="text-xl font-bold text-gray-900 mb-2">
                      No {activeTab.charAt(0).toUpperCase() + activeTab.slice(1)} Appointments
                    </h3>
                    <p className="text-gray-500 mb-6">Book an appointment with a doctor to get started</p>
                    <button
                      onClick={() => setCurrentView('doctors')}
                      className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold"
                    >
                      Browse Doctors
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Find Doctors View */}
        {currentView === 'doctors' && (
          <div className="p-8">
            {/* Search and Filters */}
            <div className="mb-6">
              <div className="relative mb-6">
                <input
                  type="text"
                  placeholder="Search doctors by name or specialization..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-6 py-4 pl-14 pr-6 rounded-xl border-2 border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-lg"
                />
                <svg className="w-6 h-6 text-gray-400 absolute left-5 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              <div>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Specialty</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                  {specialties.map(specialty => (
                    <button
                      key={specialty.id}
                      onClick={() => setSelectedSpecialty(specialty.id)}
                      className={`p-4 rounded-xl border-2 transition text-center ${selectedSpecialty === specialty.id
                        ? 'border-blue-600 bg-blue-50 shadow-md'
                        : 'border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm'
                        }`}
                    >
                      <div className="text-3xl mb-2">{specialty.icon}</div>
                      <div className={`text-xs font-semibold ${selectedSpecialty === specialty.id ? 'text-blue-700' : 'text-gray-700'
                        }`}>
                        {specialty.name}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Doctors Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDoctors.map(doctor => (
                <div key={doctor.id} className="bg-white rounded-xl border border-gray-200 shadow-sm hover:shadow-lg transition overflow-hidden">
                  <div className="p-6">
                    <div className="flex items-start space-x-4 mb-4">
                      <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center flex-shrink-0">
                        <span className="text-white font-bold text-2xl">
                          {doctor.name?.charAt(0)}
                        </span>
                      </div>
                      <div className="flex-1">
                        <h4 className="font-bold text-gray-900 text-lg">Dr. {doctor.name}</h4>
                        <p className="text-gray-600 text-sm">{doctor.specialization}</p>
                        <div className="flex items-center mt-2">
                          <div className="flex text-yellow-400">
                            {'⭐'.repeat(5)}
                          </div>
                          <span className="text-xs text-gray-500 ml-2">4.5 (128 reviews)</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2 mb-4 text-sm text-gray-600">
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        <span>15+ years experience</span>
                      </div>
                      <div className="flex items-center">
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>Consultation: $50.99</span>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setSelectedDoctor(doctor);
                        setShowBookingModal(true);
                      }}
                      className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition font-semibold"
                    >
                      Book Appointment
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {filteredDoctors.length === 0 && (
              <div className="text-center py-16">
                <svg className="w-20 h-20 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                <h3 className="text-xl font-bold text-gray-900 mb-2">No Doctors Found</h3>
                <p className="text-gray-500">Try adjusting your search or filters</p>
              </div>
            )}
          </div>
        )}

        {/* Profile View */}
        {currentView === 'profile' && (
          <div className="p-8">
            <div className="max-w-4xl">
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-8 py-12">
                  <div className="flex items-center space-x-6">
                    <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center shadow-lg">
                      <span className="text-blue-600 font-bold text-4xl">
                        {patientData?.name?.charAt(0)}
                      </span>
                    </div>
                    <div className="text-white">
                      <h2 className="text-3xl font-bold">{patientData?.name}</h2>
                      <p className="text-blue-100 mt-1">{patientData?.email}</p>
                    </div>
                  </div>
                </div>

                <div className="p-8">
                  <h3 className="text-xl font-bold text-gray-900 mb-6">Personal Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Phone Number</label>
                      <p className="mt-1 text-gray-900">{patientData?.phone}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Age</label>
                      <p className="mt-1 text-gray-900">{patientData?.age} years</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Gender</label>
                      <p className="mt-1 text-gray-900 capitalize">{patientData?.gender}</p>
                    </div>
                    <div>
                      <label className="text-sm font-semibold text-gray-700">Blood Group</label>
                      <p className="mt-1 text-gray-900">{patientData?.blood_group}</p>
                    </div>
                    <div className="md:col-span-2">
                      <label className="text-sm font-semibold text-gray-700">Address</label>
                      <p className="mt-1 text-gray-900">{patientData?.address}</p>
                    </div>
                  </div>

                  <div className="mt-8 pt-8 border-t border-gray-200">
                    <button className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold">
                      Edit Profile
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Medical Records View */}
        {currentView === 'records' && (
          <div className="p-8">
            <h3 className="text-2xl font-bold text-gray-900 mb-6">Medical Records ({medicalRecords.length})</h3>
            {medicalRecords.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {medicalRecords.map(record => (
                  <div key={record.id} className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 hover:shadow-md transition">
                    <div className="flex items-start justify-between mb-4">
                      <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                          <span className="text-2xl">
                            {record.record_type === 'prescription' ? '💊' :
                              record.record_type === 'lab_report' ? '🔬' : '📄'}
                          </span>
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900">{record.title}</h4>
                          <p className="text-xs text-gray-500">
                            {new Date(record.created_at).toLocaleDateString()} • Dr. {record.doctor?.name}
                          </p>
                        </div>
                      </div>
                      <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded-full capitalize">
                        {record.record_type.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-gray-600 text-sm mb-4 line-clamp-3">{record.description}</p>
                    <div className="pt-4 border-t border-gray-100 flex justify-between items-center">
                      <span className="text-xs text-gray-500">
                        Visit: {record.appointment?.time_slot?.date || 'N/A'}
                      </span>
                      <div className="flex gap-2">
                        {record.document_url && (
                          <a
                            href={record.document_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-600 hover:text-blue-700 text-sm font-semibold flex items-center"
                          >
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                            View Document
                          </a>
                        )}
                        <button className="text-gray-500 hover:text-gray-700 text-sm font-semibold">
                          Details
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-12 text-center">
                <svg className="w-24 h-24 text-gray-300 mx-auto mb-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">No Medical Records</h3>
                <p className="text-gray-500 mb-6">Your medical records and documents will appear here</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Booking Modal */}
      {showBookingModal && selectedDoctor && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-gray-900">Book Appointment</h2>
              <button
                onClick={() => {
                  setShowBookingModal(false);
                  setSelectedDoctor(null);
                  setSelectedDate(null);
                  setSelectedSlot(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg transition"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {/* Doctor Info */}
              <div className="flex items-center space-x-4 mb-6 p-4 bg-blue-50 rounded-xl">
                <div className="w-16 h-16 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">{selectedDoctor.name?.charAt(0)}</span>
                </div>
                <div>
                  <h3 className="font-bold text-gray-900 text-lg">Dr. {selectedDoctor.name}</h3>
                  <p className="text-gray-600">{selectedDoctor.specialization}</p>
                  <div className="flex items-center mt-1 text-sm text-gray-500">
                    <span>⭐ 4.5 (128 reviews)</span>
                    <span className="mx-2">•</span>
                    <span>$50.99 / consultation</span>
                  </div>
                </div>
              </div>

              {/* Calendar */}
              <div className="mb-6">
                <h3 className="font-bold text-gray-900 mb-3">Select Date</h3>
                <div className="border border-gray-200 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1))}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                      </svg>
                    </button>
                    <span className="font-semibold text-gray-900">
                      {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                    </span>
                    <button
                      onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1))}
                      className="p-2 hover:bg-gray-100 rounded-lg"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </div>

                  <div className="grid grid-cols-7 gap-2 mb-2">
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <div key={day} className="text-center text-xs font-semibold text-gray-600 py-2">
                        {day}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-2">
                    {getDatesInMonth().map((date, index) => {
                      const isAvailable = isDateAvailable(date);
                      const isSelected = date && selectedDate === date.toISOString().split('T')[0];
                      const isToday = date && date.toDateString() === new Date().toDateString();

                      return (
                        <button
                          key={index}
                          onClick={() => date && isAvailable && setSelectedDate(date.toISOString().split('T')[0])}
                          disabled={!date || !isAvailable}
                          className={`aspect-square rounded-lg flex items-center justify-center text-sm font-medium transition ${!date ? 'invisible' : ''
                            } ${isSelected ? 'bg-blue-600 text-white' : ''
                            } ${!isSelected && isAvailable ? 'bg-blue-50 text-blue-700 hover:bg-blue-100' : ''
                            } ${!isSelected && !isAvailable && date ? 'text-gray-300 cursor-not-allowed' : ''
                            } ${isToday && !isSelected ? 'ring-2 ring-blue-600' : ''
                            }`}
                        >
                          {date && date.getDate()}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Time Slots */}
              {selectedDate && (
                <>
                  <div className="mb-6">
                    <h3 className="font-bold text-gray-900 mb-3">Select Time</h3>
                    <div className="flex space-x-3 mb-4">
                      {['morning', 'afternoon', 'evening'].map(period => (
                        <button
                          key={period}
                          onClick={() => setSelectedTimeOfDay(period)}
                          className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${selectedTimeOfDay === period
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          {period.charAt(0).toUpperCase() + period.slice(1)}
                        </button>
                      ))}
                    </div>

                    {timeSlots.length > 0 ? (
                      <div className="grid grid-cols-4 gap-3">
                        {timeSlots.map(slot => {
                          const isSelected = selectedSlot?.id === slot.id;
                          return (
                            <button
                              key={slot.id}
                              onClick={() => setSelectedSlot(slot)}
                              className={`py-3 rounded-lg font-medium transition ${isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100'
                                }`}
                            >
                              {formatTime(slot.start_time)}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-center py-8">
                        No available slots for {selectedTimeOfDay}
                      </p>
                    )}
                  </div>

                  {selectedSlot && (
                    <div className="space-y-4 mb-6">
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Symptoms (Optional)
                        </label>
                        <textarea
                          value={symptoms}
                          onChange={(e) => setSymptoms(e.target.value)}
                          placeholder="Describe your symptoms..."
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={3}
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-gray-900 mb-2">
                          Additional Notes (Optional)
                        </label>
                        <textarea
                          value={notes}
                          onChange={(e) => setNotes(e.target.value)}
                          placeholder="Any additional information..."
                          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                          rows={2}
                        />
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex space-x-3">
                <button
                  onClick={() => {
                    setShowBookingModal(false);
                    setSelectedDoctor(null);
                    setSelectedDate(null);
                    setSelectedSlot(null);
                  }}
                  className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold"
                >
                  Cancel
                </button>
                <button
                  onClick={handleBookAppointment}
                  disabled={!selectedSlot || loading}
                  className={`flex-1 px-6 py-3 rounded-lg font-semibold transition ${selectedSlot && !loading
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    }`}
                >
                  {loading ? 'Booking...' : 'Confirm Booking'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Document Modal */}
      {showUploadModal && selectedRequest && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-2">Upload {selectedRequest.request_type}</h3>
            {selectedRequest.instructions && (
              <div className="bg-gray-50 p-3 rounded-lg mb-4 text-sm text-gray-700 italic border border-gray-200">
                "{selectedRequest.instructions}"
              </div>
            )}

            <div className="space-y-4">
              <div className="border-2 border-dashed border-blue-200 rounded-xl p-8 text-center hover:bg-blue-50 transition cursor-pointer relative">
                <input
                  type="file"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => setFileToUpload(e.target.files[0])}
                />
                {fileToUpload ? (
                  <div>
                    <span className="text-3xl mb-2 block">📄</span>
                    <p className="font-semibold text-blue-600 truncate">{fileToUpload.name}</p>
                    <p className="text-xs text-gray-500">{(fileToUpload.size / 1024).toFixed(2)} KB</p>
                  </div>
                ) : (
                  <div>
                    <span className="text-3xl mb-2 block">☁️</span>
                    <p className="font-semibold text-gray-700">Click to Select File</p>
                    <p className="text-xs text-gray-500">PDF, JPG, PNG (Max 5MB)</p>
                  </div>
                )}
              </div>

              <div className="flex space-x-3 pt-4">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setFileToUpload(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleFileUpload}
                  disabled={!fileToUpload || uploading}
                  className={`flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-bold ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {uploading ? 'Uploading...' : 'Confirm Upload'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}