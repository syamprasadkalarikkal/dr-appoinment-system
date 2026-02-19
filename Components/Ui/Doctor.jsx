'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/getUserRole';

export default function Doctor() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [doctorData, setDoctorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');

  // Appointments
  const [appointments, setAppointments] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  // Time Slots
  const [timeSlots, setTimeSlots] = useState([]);
  const [showCreateSlotModal, setShowCreateSlotModal] = useState(false);
  const [slotDate, setSlotDate] = useState('');
  const [slotStartTime, setSlotStartTime] = useState('');
  const [slotEndTime, setSlotEndTime] = useState('');
  const [maxPatients, setMaxPatients] = useState(1);

  // Bulk time slot creation
  const [bulkCreateMode, setBulkCreateMode] = useState(false);
  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkEndDate, setBulkEndDate] = useState('');
  const [selectedDays, setSelectedDays] = useState([]);
  const [bulkTimeSlots, setBulkTimeSlots] = useState([
    { startTime: '09:00', endTime: '10:00' }
  ]);

  // Record Upload State
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordType, setRecordType] = useState('prescription');
  const [recordTitle, setRecordTitle] = useState('');
  const [recordDescription, setRecordDescription] = useState('');
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploading, setUploading] = useState(false);


  useEffect(() => {
    checkAuth();
  }, []);

  useEffect(() => {
    if (isAuthenticated && isApproved && doctorData) {
      fetchAppointments();
      fetchTimeSlots();
    }
  }, [isAuthenticated, isApproved, doctorData]);

  // Real-time updates
  useEffect(() => {
    if (!doctorData?.id) return;

    const channel = supabase
      .channel('doctor-dashboard')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          filter: `doctor_id=eq.${doctorData.id}`
        },
        (payload) => {
          fetchAppointments();
          fetchTimeSlots();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [doctorData?.id, selectedAppointment]);


  const checkAuth = async () => {
    try {
      const userRole = localStorage.getItem('userRole');
      const userId = localStorage.getItem('userId');

      if (userRole !== 'doctor' || !userId) {
        router.push('/Login');
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        router.push('/Login');
        return;
      }

      const userData = await getUserRole(user.id);

      if (!userData || userData.role !== 'doctor') {
        router.push('/Login');
        return;
      }

      setDoctorData(userData);
      setIsApproved(userData.is_approved === true);
      setIsAuthenticated(true);

    } catch (error) {
      console.error('Auth error:', error);
      router.push('/Login');
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointments = async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select(`
          *,
          patient:patient_id(name, email),
          time_slot:slot_id(date, start_time, end_time)
        `)
        .eq('doctor_id', doctorData.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setAppointments(data || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    }
  };

  const fetchTimeSlots = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const { data, error } = await supabase
        .from('time_slots')
        .select('*')
        .eq('doctor_id', doctorData.id)
        .gte('date', today)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;
      setTimeSlots(data || []);
    } catch (error) {
      console.error('Error fetching time slots:', error);
    }
  };

  const handleCreateTimeSlot = async () => {
    if (!slotDate || !slotStartTime || !slotEndTime) {
      alert('Please fill all fields');
      return;
    }

    // Validate that start time is before end time
    if (slotStartTime >= slotEndTime) {
      alert('End time must be after start time');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('time_slots')
        .insert([
          {
            doctor_id: doctorData.id,
            date: slotDate,
            start_time: slotStartTime + ':00',
            end_time: slotEndTime + ':00',
            max_patients: maxPatients,
            current_patients: 0,
            is_available: true
          }
        ]);

      if (error) throw error;

      alert('Time slot created successfully! Patients can now book this slot.');
      setShowCreateSlotModal(false);
      setSlotDate('');
      setSlotStartTime('');
      setSlotEndTime('');
      setMaxPatients(1);
      fetchTimeSlots(); // Refresh the list
    } catch (error) {
      console.error('Error creating time slot:', error);
      alert('Failed to create time slot. This time may already be booked.');
    } finally {
      setLoading(false);
    }
  };

  const handleBulkCreateSlots = async () => {
    if (!bulkStartDate || !bulkEndDate || selectedDays.length === 0 || bulkTimeSlots.length === 0) {
      alert('Please fill all required fields');
      return;
    }

    if (new Date(bulkStartDate) > new Date(bulkEndDate)) {
      alert('End date must be after start date');
      return;
    }

    setLoading(true);
    try {
      const slotsToCreate = [];
      const startDate = new Date(bulkStartDate);
      const endDate = new Date(bulkEndDate);

      // Iterate through each day in the range
      for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
        const dayOfWeek = date.getDay(); // 0 = Sunday, 1 = Monday, etc.

        // Check if this day is selected
        if (selectedDays.includes(dayOfWeek)) {
          const dateStr = date.toISOString().split('T')[0];

          // Add all time slots for this day
          bulkTimeSlots.forEach(slot => {
            if (slot.startTime && slot.endTime && slot.startTime < slot.endTime) {
              slotsToCreate.push({
                doctor_id: doctorData.id,
                date: dateStr,
                start_time: slot.startTime + ':00',
                end_time: slot.endTime + ':00',
                max_patients: maxPatients,
                current_patients: 0,
                is_available: true
              });
            }
          });
        }
      }

      if (slotsToCreate.length === 0) {
        alert('No valid time slots to create');
        return;
      }

      const { error } = await supabase
        .from('time_slots')
        .insert(slotsToCreate);

      if (error) throw error;

      alert(`Successfully created ${slotsToCreate.length} time slots!`);
      setBulkCreateMode(false);
      setShowCreateSlotModal(false);
      setBulkStartDate('');
      setBulkEndDate('');
      setSelectedDays([]);
      setBulkTimeSlots([{ startTime: '09:00', endTime: '10:00' }]);
      fetchTimeSlots();
    } catch (error) {
      console.error('Error creating bulk slots:', error);
      alert('Failed to create time slots. Some slots may already exist.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteTimeSlot = async (slotId, hasAppointments) => {
    if (hasAppointments) {
      alert('Cannot delete time slot with existing appointments');
      return;
    }

    if (!confirm('Are you sure you want to delete this time slot?')) {
      return;
    }

    try {
      const { error } = await supabase
        .from('time_slots')
        .delete()
        .eq('id', slotId);

      if (error) throw error;

      alert('Time slot deleted successfully');
      fetchTimeSlots();
    } catch (error) {
      console.error('Error deleting time slot:', error);
      alert('Failed to delete time slot.');
    }
  };

  const handleUpdateAppointmentStatus = async (appointmentId, newStatus) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: newStatus })
        .eq('id', appointmentId);

      if (error) throw error;

      alert(`Appointment ${newStatus} successfully`);
      fetchAppointments();
    } catch (error) {
      console.error('Error updating appointment:', error);
      alert('Failed to update appointment status');
    }
  };

  const handleAddMedicalRecord = async () => {
    if (!selectedAppointment || !recordTitle) {
      alert("Please fill in the title.");
      return;
    }

    try {
      setUploading(true);
      let documentUrl = null;
      let documentName = null;

      // 1. Upload File if selected
      if (fileToUpload) {
        const fileExt = fileToUpload.name.split('.').pop();
        const fileName = `${selectedAppointment.patient_id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(fileName, fileToUpload);

        if (uploadError) throw uploadError;

        // Get Signed URL (valid for 1 year for simplicity in this demo)
        const { data: urlData, error: urlError } = await supabase.storage
          .from('documents')
          .createSignedUrl(fileName, 60 * 60 * 24 * 365);

        if (urlError) throw urlError;
        documentUrl = urlData.signedUrl;
        documentName = fileToUpload.name;
      }

      // 2. Insert Record
      const { error: insertError } = await supabase
        .from('medical_records')
        .insert([
          {
            patient_id: selectedAppointment.patient_id,
            doctor_id: doctorData.id,
            appointment_id: selectedAppointment.id,
            record_type: recordType,
            title: recordTitle,
            description: recordDescription,
            document_url: documentUrl,
            document_name: documentName
          }
        ]);

      if (insertError) throw insertError;

      // 3. Notify Patient
      await supabase
        .from('notifications')
        .insert([
          {
            user_id: selectedAppointment.patient_id,
            type: 'new_record',
            title: 'New Medical Record Added',
            message: `Dr. ${doctorData.name} added a new ${recordType}: ${recordTitle}`,
            related_id: selectedAppointment.id
          }
        ]);

      // 4. Update Appointment Status to Completed (as per requirement)
      const { error: updateError } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', selectedAppointment.id);

      if (updateError) console.error('Error auto-completing appointment:', updateError);

      alert('Medical Record added successfully!');
      setShowRecordModal(false);
      setRecordTitle('');
      setRecordDescription('');
      setFileToUpload(null);
      setSelectedAppointment(null);

    } catch (error) {
      console.error('Error adding record:', error);
      alert('Failed to add record: ' + error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    router.push('/Login');
  };

  const formatTime = (time) => {
    const [hours, minutes] = time.split(':');
    const hour = parseInt(hours);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const formatDate = (dateStr) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  const todayAppointments = appointments.filter(apt => {
    const today = new Date().toISOString().split('T')[0];
    return apt.time_slot?.date === today &&
      (apt.status === 'scheduled' || apt.status === 'confirmed');
  });

  const upcomingAppointments = appointments.filter(apt =>
    (apt.status === 'scheduled' || apt.status === 'confirmed') &&
    new Date(apt.time_slot?.date) > new Date()
  );

  const availableSlots = timeSlots.filter(slot => slot.is_available);

  const daysOfWeek = [
    { value: 0, label: 'Sunday' },
    { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' },
    { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },
    { value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' }
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  // Pending Approval Screen
  if (!isApproved) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Doctor Portal</h1>
              <p className="text-sm text-gray-600">Welcome, Dr. {doctorData?.name}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <div className="bg-white rounded-xl shadow-lg p-8 text-center">
            <div className="mb-6">
              <div className="mx-auto w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center">
                <svg className="w-10 h-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-3">Account Pending Approval</h2>
            <p className="text-gray-600 mb-6 max-w-md mx-auto">
              Your doctor account has been successfully created and is currently under review by the administrator.
              You will be able to access all features once your account is approved.
            </p>

            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 max-w-md mx-auto">
              <h3 className="font-semibold text-blue-900 mb-2">Your Registration Details</h3>
              <div className="text-left text-sm space-y-1">
                <p className="text-blue-800"><strong>Name:</strong> {doctorData?.name}</p>
                <p className="text-blue-800"><strong>Email:</strong> {doctorData?.email}</p>
                <p className="text-blue-800"><strong>Doctor ID:</strong> {doctorData?.doctor_id}</p>
                <p className="text-blue-800"><strong>Specialization:</strong> {doctorData?.specialization}</p>
                <p className="text-blue-800"><strong>Status:</strong> <span className="text-yellow-600 font-semibold">Pending Approval</span></p>
              </div>
            </div>

            <div className="mt-6 p-4 bg-gray-50 rounded-lg">
              <p className="text-sm text-gray-700">
                <strong>What happens next?</strong>
              </p>
              <p className="text-sm text-gray-600 mt-2">
                The admin will review your application and approve your account. Once approved, you'll be able to:
              </p>
              <ul className="text-sm text-gray-600 mt-2 space-y-1 text-left max-w-md mx-auto">
                <li>✓ Create time slots for patient appointments</li>
                <li>✓ View and manage appointments</li>
                <li>✓ Add medical records for patients</li>
                <li>✓ Access full dashboard features</li>
              </ul>
            </div>
          </div>
        </main>
      </div>
    );
  }

  // Approved Doctor Dashboard
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Doctor Dashboard</h1>
              <p className="text-sm text-black">Welcome, Dr. {doctorData?.name}</p>
            </div>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Navigation */}
      <div className="bg-white border-b border-gray-200 sticky top-[73px] z-30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {[
              { id: 'dashboard', name: 'Dashboard', icon: '📊' },
              { id: 'appointments', name: 'Appointments', icon: '📅' },
              { id: 'timeslots', name: 'Time Slots', icon: '⏰', badge: availableSlots.length },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setCurrentView(tab.id)}
                className={`relative py-4 px-1 border-b-2 font-medium text-sm transition ${currentView === tab.id
                  ? 'border-green-600 text-green-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.name}
                {tab.badge > 0 && (
                  <span className="ml-2 bg-green-100 text-green-700 px-2 py-0.5 rounded-full text-xs font-semibold">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Dashboard View */}
        {currentView === 'dashboard' && (
          <div>
            <div className="bg-gradient-to-r from-green-600 to-teal-600 rounded-xl shadow-lg p-8 text-white mb-8">
              <h2 className="text-3xl font-bold mb-2">Welcome Back, Dr. {doctorData?.name}!</h2>
              <p className="text-green-100 mb-4">
                {doctorData?.specialization} • Doctor ID: {doctorData?.doctor_id}
              </p>
              <div className="flex items-center space-x-4">
                <div className="inline-block bg-white bg-opacity-20 px-4 py-2 rounded-full text-green-500">
                  <span className="text-sm font-medium">✓ Account Approved</span>
                </div>
                <div className="inline-block bg-white bg-opacity-20 px-4 py-2 rounded-full text-red-500">
                  <span className="text-sm font-medium">📧 {doctorData?.email}</span>
                </div>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Today's Appointments</p>
                    <h3 className="text-3xl font-bold text-gray-900">{todayAppointments.length}</h3>
                  </div>
                  <div className="bg-blue-100 p-3 rounded-full">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Upcoming Appointments</p>
                    <h3 className="text-3xl font-bold text-gray-900">{upcomingAppointments.length}</h3>
                  </div>
                  <div className="bg-green-100 p-3 rounded-full">
                    <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                  </div>
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 mb-1">Available Slots</p>
                    <h3 className="text-3xl font-bold text-gray-900">{availableSlots.length}</h3>
                  </div>
                  <div className="bg-purple-100 p-3 rounded-full">
                    <svg className="w-8 h-8 text-purple-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Action - Create Time Slots */}
            {timeSlots.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-8">
                <div className="flex items-start">
                  <svg className="w-6 h-6 text-yellow-600 mr-3 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-yellow-900 mb-2">No Time Slots Created</h3>
                    <p className="text-yellow-800 mb-4">
                      You haven't created any time slots yet. Patients can only book appointments if you have available time slots.
                      Create your first time slot to start accepting appointments!
                    </p>
                    <button
                      onClick={() => setShowCreateSlotModal(true)}
                      className="px-6 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition font-semibold"
                    >
                      Create Your First Time Slot
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Today's Appointments */}
            {todayAppointments.length > 0 && (
              <div className="bg-white rounded-lg shadow p-6 mb-8">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Today's Appointments</h3>
                <div className="space-y-4">
                  {todayAppointments.map(appointment => (
                    <div key={appointment.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex items-start space-x-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-lg">
                              {appointment.patient?.name?.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{appointment.patient?.name}</h4>
                            <p className="text-sm text-gray-600">{appointment.patient?.email}</p>
                            <p className="text-sm text-gray-500 mt-1">
                              {formatTime(appointment.time_slot?.start_time)} - {formatTime(appointment.time_slot?.end_time)}
                            </p>
                            {appointment.symptoms && (
                              <p className="text-sm text-gray-700 mt-2">
                                <strong>Symptoms:</strong> {appointment.symptoms}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-col space-y-2">
                          {appointment.status === 'scheduled' && (
                            <button
                              onClick={() => handleUpdateAppointmentStatus(appointment.id, 'confirmed')}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                            >
                              Confirm
                            </button>
                          )}
                          <button
                            onClick={() => handleUpdateAppointmentStatus(appointment.id, 'completed')}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                          >
                            Complete
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAppointment(appointment);
                              setShowRecordModal(true);
                            }}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"
                          >
                            Add Record
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Appointments View */}
        {currentView === 'appointments' && (
          <div>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h3 className="text-xl font-bold text-gray-900 mb-4">All Appointments ({appointments.length})</h3>
              {appointments.length > 0 ? (
                <div className="space-y-4">
                  {appointments.map(appointment => (
                    <div key={appointment.id} className="border border-gray-200 rounded-lg p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-start space-x-4">
                          <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-lg flex items-center justify-center">
                            <span className="text-white font-bold text-lg">
                              {appointment.patient?.name?.charAt(0)}
                            </span>
                          </div>
                          <div>
                            <h4 className="font-semibold text-gray-900">{appointment.patient?.name}</h4>
                            <p className="text-sm text-gray-600">{appointment.patient?.email}</p>
                          </div>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-semibold ${appointment.status === 'scheduled' ? 'bg-blue-100 text-blue-700' :
                          appointment.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                            appointment.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                              appointment.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                                'bg-yellow-100 text-yellow-700'
                          }`}>
                          {appointment.status.charAt(0).toUpperCase() + appointment.status.slice(1)}
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-4 mb-3">
                        <div className="flex items-center text-sm text-gray-600">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          {formatDate(appointment.time_slot?.date)}
                        </div>
                        <div className="flex items-center text-sm text-gray-600">
                          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          {formatTime(appointment.time_slot?.start_time)} - {formatTime(appointment.time_slot?.end_time)}
                        </div>
                      </div>

                      {appointment.symptoms && (
                        <div className="mb-3">
                          <p className="text-sm font-semibold text-gray-700">Symptoms:</p>
                          <p className="text-sm text-gray-600">{appointment.symptoms}</p>
                        </div>
                      )}

                      {appointment.notes && (
                        <div className="mb-3">
                          <p className="text-sm font-semibold text-gray-700">Notes:</p>
                          <p className="text-sm text-gray-600">{appointment.notes}</p>
                        </div>
                      )}

                      {(appointment.status === 'scheduled' || appointment.status === 'confirmed') && (
                        <div className="flex space-x-2">
                          {appointment.status === 'scheduled' && (
                            <button
                              onClick={() => handleUpdateAppointmentStatus(appointment.id, 'confirmed')}
                              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition text-sm"
                            >
                              Confirm
                            </button>
                          )}
                          <button
                            onClick={() => handleUpdateAppointmentStatus(appointment.id, 'completed')}
                            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
                          >
                            Mark Complete
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAppointment(appointment);
                              setShowRecordModal(true);
                            }}
                            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition text-sm"
                          >
                            Add Record
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  <p className="text-gray-500 mb-4">No appointments yet</p>
                  <p className="text-sm text-gray-600">Appointments will appear here when patients book your time slots</p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Time Slots View */}
        {currentView === 'timeslots' && (
          <div>
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-gray-900">My Time Slots ({timeSlots.length})</h3>
                <button
                  onClick={() => setShowCreateSlotModal(true)}
                  className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition flex items-center"
                >
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Create Time Slot
                </button>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
                <p className="text-sm text-blue-900">
                  <strong>💡 Tip:</strong> Time slots you create here will immediately be available for patients to book appointments.
                  Make sure to create slots for times when you're available to see patients.
                </p>
              </div>

              {timeSlots.length > 0 ? (
                <div className="space-y-4">
                  {timeSlots.map(slot => (
                    <div key={slot.id} className="border border-gray-200 rounded-lg p-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center space-x-4">
                          <div className="flex items-center text-gray-700">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            <span className="font-semibold">{formatDate(slot.date)}</span>
                          </div>
                          <div className="flex items-center text-gray-700">
                            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            <span>{formatTime(slot.start_time)} - {formatTime(slot.end_time)}</span>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-xs font-semibold ${slot.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                            }`}>
                            {slot.is_available ? 'Available' : 'Booked'}
                          </span>
                          <span className="text-sm text-gray-600">
                            {slot.current_patients}/{slot.max_patients} patients
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => handleDeleteTimeSlot(slot.id, slot.current_patients > 0)}
                        disabled={slot.current_patients > 0}
                        className={`px-4 py-2 rounded-lg transition text-sm ${slot.current_patients > 0
                          ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                          : 'bg-red-600 text-white hover:bg-red-700'
                          }`}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <svg className="w-16 h-16 text-gray-300 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-gray-500 mb-4">No time slots created yet</p>
                  <p className="text-sm text-gray-600 mb-6">Create time slots so patients can book appointments with you</p>
                  <button
                    onClick={() => setShowCreateSlotModal(true)}
                    className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
                  >
                    Create Your First Time Slot
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* Create Time Slot Modal */}
      {showCreateSlotModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full my-8">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h3 className="text-xl font-bold text-gray-900">
                {bulkCreateMode ? 'Bulk Create Time Slots' : 'Create Time Slot'}
              </h3>
              <button
                onClick={() => {
                  setShowCreateSlotModal(false);
                  setBulkCreateMode(false);
                }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              {/* Mode Toggle */}
              <div className="flex space-x-2 mb-6">
                <button
                  onClick={() => setBulkCreateMode(false)}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${!bulkCreateMode
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  Single Slot
                </button>
                <button
                  onClick={() => setBulkCreateMode(true)}
                  className={`flex-1 py-2 px-4 rounded-lg font-medium transition ${bulkCreateMode
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                >
                  Bulk Create
                </button>
              </div>

              {!bulkCreateMode ? (
                /* Single Slot Creation */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Date</label>
                    <input
                      type="date"
                      value={slotDate}
                      onChange={(e) => setSlotDate(e.target.value)}
                      min={new Date().toISOString().split('T')[0]}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Start Time</label>
                      <input
                        type="time"
                        value={slotStartTime}
                        onChange={(e) => setSlotStartTime(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">End Time</label>
                      <input
                        type="time"
                        value={slotEndTime}
                        onChange={(e) => setSlotEndTime(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Max Patients per Slot</label>
                    <input
                      type="number"
                      value={maxPatients}
                      onChange={(e) => setMaxPatients(parseInt(e.target.value))}
                      min="1"
                      max="10"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => setShowCreateSlotModal(false)}
                      className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateTimeSlot}
                      disabled={loading}
                      className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold disabled:bg-gray-300"
                    >
                      {loading ? 'Creating...' : 'Create Slot'}
                    </button>
                  </div>
                </div>
              ) : (
                /* Bulk Creation */
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">Start Date</label>
                      <input
                        type="date"
                        value={bulkStartDate}
                        onChange={(e) => setBulkStartDate(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-900 mb-2">End Date</label>
                      <input
                        type="date"
                        value={bulkEndDate}
                        onChange={(e) => setBulkEndDate(e.target.value)}
                        min={bulkStartDate || new Date().toISOString().split('T')[0]}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Select Days</label>
                    <div className="grid grid-cols-4 gap-2">
                      {daysOfWeek.map(day => (
                        <button
                          key={day.value}
                          onClick={() => {
                            setSelectedDays(prev =>
                              prev.includes(day.value)
                                ? prev.filter(d => d !== day.value)
                                : [...prev, day.value]
                            );
                          }}
                          className={`py-2 px-3 rounded-lg text-sm font-medium transition ${selectedDays.includes(day.value)
                            ? 'bg-green-600 text-white'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                        >
                          {day.label.substring(0, 3)}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Time Slots</label>
                    <div className="space-y-2">
                      {bulkTimeSlots.map((slot, index) => (
                        <div key={index} className="flex items-center space-x-2">
                          <input
                            type="time"
                            value={slot.startTime}
                            onChange={(e) => {
                              const updated = [...bulkTimeSlots];
                              updated[index].startTime = e.target.value;
                              setBulkTimeSlots(updated);
                            }}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          <span className="text-gray-500">to</span>
                          <input
                            type="time"
                            value={slot.endTime}
                            onChange={(e) => {
                              const updated = [...bulkTimeSlots];
                              updated[index].endTime = e.target.value;
                              setBulkTimeSlots(updated);
                            }}
                            className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                          />
                          {bulkTimeSlots.length > 1 && (
                            <button
                              onClick={() => setBulkTimeSlots(bulkTimeSlots.filter((_, i) => i !== index))}
                              className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
                            >
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={() => setBulkTimeSlots([...bulkTimeSlots, { startTime: '', endTime: '' }])}
                      className="mt-2 text-sm text-green-600 hover:text-green-700 font-semibold"
                    >
                      + Add Another Time Slot
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-gray-900 mb-2">Max Patients per Slot</label>
                    <input
                      type="number"
                      value={maxPatients}
                      onChange={(e) => setMaxPatients(parseInt(e.target.value))}
                      min="1"
                      max="10"
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </div>

                  <div className="flex space-x-3 pt-4">
                    <button
                      onClick={() => {
                        setShowCreateSlotModal(false);
                        setBulkCreateMode(false);
                      }}
                      className="flex-1 px-6 py-3 border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition font-semibold"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleBulkCreateSlots}
                      disabled={loading}
                      className="flex-1 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold disabled:bg-gray-300"
                    >
                      {loading ? 'Creating...' : 'Create Slots'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Add Medical Record Modal */}
      {showRecordModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex justify-between items-center">
              <h3 className="text-xl font-bold text-gray-900">Add Medical Record</h3>
              <button
                onClick={() => {
                  setShowRecordModal(false);
                  setSelectedAppointment(null);
                  setRecordTitle('');
                  setRecordDescription('');
                  setFileToUpload(null);
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Patient Info */}
              <div className="bg-blue-50 p-3 rounded-lg text-sm text-blue-800 mb-4">
                Patient: <span className="font-bold">{selectedAppointment.patient?.name}</span>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Record Type</label>
                <select
                  value={recordType}
                  onChange={(e) => setRecordType(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="prescription">Prescription</option>
                  <option value="lab_report">Lab Report</option>
                  <option value="scan">Scan/X-Ray</option>
                  <option value="diagnosis">Diagnosis</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
                <input
                  type="text"
                  value={recordTitle}
                  onChange={(e) => setRecordTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="e.g. Antibiotics Prescription"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={recordDescription}
                  onChange={(e) => setRecordDescription(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                  placeholder="Details..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Attachment (Optional)</label>
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:bg-gray-50 transition cursor-pointer relative">
                  <input
                    type="file"
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    onChange={(e) => setFileToUpload(e.target.files[0])}
                  />
                  {fileToUpload ? (
                    <div className="flex items-center justify-center text-blue-600">
                      <span className="mr-2">📎</span>
                      <span className="truncate max-w-[200px]">{fileToUpload.name}</span>
                    </div>
                  ) : (
                    <div className="text-gray-500 text-sm">
                      <span className="block text-2xl mb-1">📄</span>
                      Click to upload a file (PDF, IMG)
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-4">
                <button
                  onClick={handleAddMedicalRecord}
                  disabled={uploading}
                  className={`w-full py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition ${uploading ? 'opacity-70 cursor-wait' : ''}`}
                >
                  {uploading ? 'Saving Record...' : 'Save Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}