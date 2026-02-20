'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/getUserRole';

/* ── Inline SVG icon helper ── */
const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d={d} />
  </svg>
);

/* ── Status badge — matches Admin colour scheme ── */
const StatusBadge = ({ status }) => {
  const map = {
    scheduled: 'bg-blue-100 text-blue-700',
    confirmed:  'bg-green-100 text-green-700',
    completed:  'bg-gray-100 text-gray-600',
    cancelled:  'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${map[status] ?? 'bg-yellow-100 text-yellow-700'}`}>
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
};

export default function Doctor() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [doctorData, setDoctorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');

  const [appointments, setAppointments] = useState([]);
  const [selectedAppointment, setSelectedAppointment] = useState(null);

  const [timeSlots, setTimeSlots] = useState([]);
  const [showCreateSlotModal, setShowCreateSlotModal] = useState(false);
  const [slotDate, setSlotDate] = useState('');
  const [slotStartTime, setSlotStartTime] = useState('');
  const [slotEndTime, setSlotEndTime] = useState('');
  const [maxPatients, setMaxPatients] = useState(1);

  const [bulkCreateMode, setBulkCreateMode] = useState(false);
  const [bulkStartDate, setBulkStartDate] = useState('');
  const [bulkEndDate, setBulkEndDate] = useState('');
  const [selectedDays, setSelectedDays] = useState([]);
  const [bulkTimeSlots, setBulkTimeSlots] = useState([{ startTime: '09:00', endTime: '10:00' }]);

  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordType, setRecordType] = useState('prescription');
  const [recordTitle, setRecordTitle] = useState('');
  const [recordDescription, setRecordDescription] = useState('');
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploading, setUploading] = useState(false);

  useEffect(() => { checkAuth(); }, []);

  useEffect(() => {
    if (isAuthenticated && isApproved && doctorData) {
      fetchAppointments();
      fetchTimeSlots();
    }
  }, [isAuthenticated, isApproved, doctorData]);

  useEffect(() => {
    if (!doctorData?.id) return;
    const channel = supabase
      .channel('doctor-dashboard')
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorData.id}` },
        () => { fetchAppointments(); fetchTimeSlots(); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [doctorData?.id, selectedAppointment]);

  /* ── Auth ── */
  const checkAuth = async () => {
    try {
      const userRole = localStorage.getItem('userRole');
      const userId   = localStorage.getItem('userId');
      if (userRole !== 'doctor' || !userId) { router.push('/Login'); return; }
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push('/Login'); return; }
      const userData = await getUserRole(user.id);
      if (!userData || userData.role !== 'doctor') { router.push('/Login'); return; }
      setDoctorData(userData);
      setIsApproved(userData.is_approved === true);
      setIsAuthenticated(true);
    } catch { router.push('/Login'); }
    finally { setLoading(false); }
  };

  /* ── Data fetchers ── */
  const fetchAppointments = async () => {
    try {
      const { data, error } = await supabase
        .from('appointments')
        .select('*, patient:patient_id(name, email), time_slot:slot_id(date, start_time, end_time)')
        .eq('doctor_id', doctorData.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      setAppointments(data || []);
    } catch (e) { console.error(e); }
  };

  const fetchTimeSlots = async () => {
    try {
      const today = new Date().toISOString().split('T')[0];
      // Auto-mark past slots as unavailable
      await supabase.from('time_slots')
        .update({ is_available: false })
        .eq('doctor_id', doctorData.id)
        .lt('date', today)
        .eq('is_available', true);
      const { data, error } = await supabase
        .from('time_slots').select('*')
        .eq('doctor_id', doctorData.id).gte('date', today)
        .order('date', { ascending: true }).order('start_time', { ascending: true });
      if (error) throw error;
      setTimeSlots(data || []);
    } catch (e) { console.error(e); }
  };

  /* ── Handlers (logic 100% unchanged) ── */
  const handleCreateTimeSlot = async () => {
    if (!slotDate || !slotStartTime || !slotEndTime) { alert('Please fill all fields'); return; }
    if (slotStartTime >= slotEndTime) { alert('End time must be after start time'); return; }
    setLoading(true);
    try {
      const { error } = await supabase.from('time_slots').insert([{
        doctor_id: doctorData.id, date: slotDate,
        start_time: slotStartTime + ':00', end_time: slotEndTime + ':00',
        max_patients: maxPatients, current_patients: 0, is_available: true,
      }]);
      if (error) throw error;
      alert('Time slot created successfully! Patients can now book this slot.');
      setShowCreateSlotModal(false); setSlotDate(''); setSlotStartTime(''); setSlotEndTime(''); setMaxPatients(1);
      fetchTimeSlots();
    } catch { alert('Failed to create time slot. This time may already be booked.'); }
    finally { setLoading(false); }
  };

  const handleBulkCreateSlots = async () => {
    if (!bulkStartDate || !bulkEndDate || !selectedDays.length || !bulkTimeSlots.length) { alert('Please fill all required fields'); return; }
    if (new Date(bulkStartDate) > new Date(bulkEndDate)) { alert('End date must be after start date'); return; }
    setLoading(true);
    try {
      const slotsToCreate = [];
      for (let d = new Date(bulkStartDate); d <= new Date(bulkEndDate); d.setDate(d.getDate() + 1)) {
        if (selectedDays.includes(d.getDay())) {
          const dateStr = d.toISOString().split('T')[0];
          bulkTimeSlots.forEach(s => {
            if (s.startTime && s.endTime && s.startTime < s.endTime)
              slotsToCreate.push({ doctor_id: doctorData.id, date: dateStr, start_time: s.startTime + ':00', end_time: s.endTime + ':00', max_patients: maxPatients, current_patients: 0, is_available: true });
          });
        }
      }
      if (!slotsToCreate.length) { alert('No valid time slots to create'); return; }
      const { error } = await supabase.from('time_slots').insert(slotsToCreate);
      if (error) throw error;
      alert(`Successfully created ${slotsToCreate.length} time slots!`);
      setBulkCreateMode(false); setShowCreateSlotModal(false); setBulkStartDate(''); setBulkEndDate(''); setSelectedDays([]); setBulkTimeSlots([{ startTime: '09:00', endTime: '10:00' }]);
      fetchTimeSlots();
    } catch { alert('Failed to create time slots. Some slots may already exist.'); }
    finally { setLoading(false); }
  };

  const handleDeleteTimeSlot = async (slotId, hasAppointments) => {
    if (hasAppointments) { alert('Cannot delete time slot with existing appointments'); return; }
    if (!confirm('Are you sure you want to delete this time slot?')) return;
    try {
      const { error } = await supabase.from('time_slots').delete().eq('id', slotId);
      if (error) throw error;
      fetchTimeSlots();
    } catch { alert('Failed to delete time slot.'); }
  };

  /* ── Token helper ── */
  const computeTokens = (slotAppointments, startTime, endTime) => {
    // slotAppointments: confirmed apts in this slot sorted by created_at
    const [sh, sm] = (startTime || '00:00').split(':').map(Number);
    const [eh, em] = (endTime   || '01:00').split(':').map(Number);
    const totalMins   = (eh * 60 + em) - (sh * 60 + sm);
    const perPatient  = Math.max(Math.floor(totalMins / Math.max(slotAppointments.length, 1)), 1);
    return slotAppointments.map((apt, i) => {
      const mins   = sh * 60 + sm + perPatient * i;
      const rh     = Math.floor(mins / 60) % 24;
      const rm     = mins % 60;
      const period = rh >= 12 ? 'PM' : 'AM';
      const dh     = rh % 12 || 12;
      return {
        id:          apt.id,
        tokenNumber: i + 1,
        reportTime:  `${dh}:${String(rm).padStart(2, '0')} ${period}`,
      };
    });
  };

  /* ── Email helper ── */
  const sendStatusEmail = async (apt, newStatus, tokenNumber, reportTime) => {
    const isConfirmed = newStatus === 'confirmed';
    const dateStr = apt.time_slot?.date
      ? new Date(apt.time_slot.date).toLocaleDateString('en-US',{ weekday:'long', year:'numeric', month:'long', day:'numeric' })
      : '—';
    const accent     = isConfirmed ? '#0f766e' : '#dc2626';
    const iconText   = isConfirmed ? '✓ Confirmed' : '✕ Rejected';
    const iconColor  = isConfirmed ? '#059669'    : '#dc2626';
    const cardBg     = isConfirmed ? '#f0fdfa'    : '#fff1f2';
    const cardBorder = isConfirmed ? '#99f6e4'    : '#fecaca';
    const tokenRows  = isConfirmed && tokenNumber ? `
      <tr><td style="color:#6b7280;font-size:13px;padding:6px 0;width:42%;">Token Number</td><td style="color:#0f766e;font-size:15px;font-weight:800;">#${tokenNumber}</td></tr>
      <tr><td style="color:#6b7280;font-size:13px;padding:6px 0;">Your Report Time</td><td style="color:#1d4ed8;font-size:14px;font-weight:700;">${reportTime}</td></tr>` : '';
    const note = isConfirmed
      ? `<p style="color:#6b7280;font-size:13px;line-height:1.7;margin:20px 0 0;">Please arrive <strong>5 minutes before</strong> your report time. Bring a valid ID and any previous medical records.</p>`
      : `<p style="color:#6b7280;font-size:13px;line-height:1.7;margin:20px 0 0;">We apologise for the inconvenience. Please log in to your patient dashboard to book another available slot.</p>`;
    const html = `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
      <div style="background:${accent};padding:28px 32px;">
        <h1 style="color:#fff;font-size:20px;margin:0;font-weight:700;">${isConfirmed ? 'Appointment Confirmed ✓' : 'Appointment Rejected'}</h1>
        <p style="color:rgba(255,255,255,0.8);font-size:13px;margin:6px 0 0;">AMRT Healthcare Notification</p>
      </div>
      <div style="padding:28px 32px;">
        <p style="color:#374151;font-size:15px;margin:0 0 18px;">Hi <strong>${apt.patient?.name}</strong>,</p>
        <div style="background:${cardBg};border:1px solid ${cardBorder};border-radius:10px;padding:20px 24px;">
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="color:#6b7280;font-size:13px;padding:6px 0;width:42%;">Doctor</td><td style="color:#111827;font-size:13px;font-weight:600;">Dr. ${doctorData.name}</td></tr>
            <tr><td style="color:#6b7280;font-size:13px;padding:6px 0;">Specialization</td><td style="color:#111827;font-size:13px;font-weight:600;">${doctorData.specialization || '—'}</td></tr>
            <tr><td style="color:#6b7280;font-size:13px;padding:6px 0;">Date</td><td style="color:#111827;font-size:13px;font-weight:600;">${dateStr}</td></tr>
            <tr><td style="color:#6b7280;font-size:13px;padding:6px 0;">Slot Time</td><td style="color:#111827;font-size:13px;font-weight:600;">${formatTime(apt.time_slot?.start_time)} – ${formatTime(apt.time_slot?.end_time)}</td></tr>
            ${tokenRows}
            <tr><td style="color:#6b7280;font-size:13px;padding:6px 0;">Status</td><td style="color:${iconColor};font-size:13px;font-weight:700;">${iconText}</td></tr>
          </table>
        </div>
        ${note}
      </div>
      <div style="background:#f9fafb;border-top:1px solid #e5e7eb;padding:16px 32px;text-align:center;">
        <p style="color:#9ca3af;font-size:12px;margin:0;">AMRT Healthcare · Automated notification · Do not reply</p>
      </div>
    </div>`;
    try {
      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: apt.patient?.email,
          subject: `${isConfirmed ? 'Appointment Confirmed' : 'Appointment Rejected'} — AMRT Healthcare`,
          html,
        }),
      });
    } catch (e) { console.warn('Email non-fatal:', e); }
  };

  const handleUpdateAppointmentStatus = async (appointmentId, newStatus) => {
    try {
      if (newStatus === 'confirmed') {
        const apt = appointments.find(a => a.id === appointmentId);
        if (!apt) return;

        // 1. Confirm this appointment
        await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', appointmentId);

        // 2. Get all confirmed apts in the same slot (including just-confirmed)
        const { data: slotApts } = await supabase
          .from('appointments')
          .select('id, created_at, patient_id, patient:patient_id(name, email)')
          .eq('slot_id', apt.slot_id)
          .eq('status', 'confirmed')
          .order('created_at', { ascending: true });

        const tokens = computeTokens(
          slotApts || [],
          apt.time_slot?.start_time,
          apt.time_slot?.end_time
        );

        // 3. Write token_number + report_time for ALL confirmed patients in this slot
        for (const t of tokens) {
          await supabase.from('appointments')
            .update({ token_number: t.tokenNumber, report_time: t.reportTime })
            .eq('id', t.id);
        }

        // 4. Notification + email for the newly confirmed patient
        const myToken = tokens.find(t => t.id === appointmentId);
        const dateStr = apt.time_slot?.date
          ? new Date(apt.time_slot.date).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})
          : '';
        await supabase.from('notifications').insert([{
          user_id:    apt.patient_id,
          type:       'appointment_confirmed',
          title:      'Appointment Confirmed 🎉',
          message:    `Dr. ${doctorData.name} confirmed your appointment on ${dateStr}. Token #${myToken?.tokenNumber} — report at ${myToken?.reportTime}.`,
          related_id: appointmentId,
          is_read:    false,
        }]);
        await sendStatusEmail(apt, 'confirmed', myToken?.tokenNumber, myToken?.reportTime);

      } else if (newStatus === 'cancelled') {
        const apt = appointments.find(a => a.id === appointmentId);
        await supabase.from('appointments')
          .update({ status: 'cancelled', token_number: null, report_time: null })
          .eq('id', appointmentId);

        if (apt) {
          const dateStr = apt.time_slot?.date
            ? new Date(apt.time_slot.date).toLocaleDateString('en-US',{weekday:'long',month:'long',day:'numeric'})
            : '';
          await supabase.from('notifications').insert([{
            user_id:    apt.patient_id,
            type:       'appointment_rejected',
            title:      'Appointment Rejected',
            message:    `Dr. ${doctorData.name} has rejected your appointment on ${dateStr}. Please book another available slot.`,
            related_id: appointmentId,
            is_read:    false,
          }]);
          await sendStatusEmail(apt, 'cancelled', null, null);

          // Re-compute tokens for remaining confirmed patients in slot (shift up)
          const { data: remaining } = await supabase
            .from('appointments')
            .select('id, created_at')
            .eq('slot_id', apt.slot_id)
            .eq('status', 'confirmed')
            .order('created_at', { ascending: true });
          if (remaining?.length) {
            const tokens = computeTokens(remaining, apt.time_slot?.start_time, apt.time_slot?.end_time);
            for (const t of tokens) {
              await supabase.from('appointments')
                .update({ token_number: t.tokenNumber, report_time: t.reportTime })
                .eq('id', t.id);
            }
          }
        }
      } else {
        await supabase.from('appointments').update({ status: newStatus }).eq('id', appointmentId);
      }

      fetchAppointments();
    } catch (e) { console.error(e); alert('Failed to update appointment status'); }
  };

  const handleAddMedicalRecord = async () => {
    if (!selectedAppointment || !recordTitle) { alert('Please fill in the title.'); return; }
    try {
      setUploading(true);
      let documentUrl = null, documentName = null;
      if (fileToUpload) {
        const fileExt = fileToUpload.name.split('.').pop();
        const fileName = `${selectedAppointment.patient_id}/${Date.now()}.${fileExt}`;
        const { error: uploadError } = await supabase.storage.from('documents').upload(fileName, fileToUpload);
        if (uploadError) throw uploadError;
        const { data: urlData, error: urlError } = await supabase.storage.from('documents').createSignedUrl(fileName, 60 * 60 * 24 * 365);
        if (urlError) throw urlError;
        documentUrl = urlData.signedUrl; documentName = fileToUpload.name;
      }
      const { error: insertError } = await supabase.from('medical_records').insert([{
        patient_id: selectedAppointment.patient_id, doctor_id: doctorData.id,
        appointment_id: selectedAppointment.id, record_type: recordType,
        title: recordTitle, description: recordDescription,
        document_url: documentUrl, document_name: documentName,
      }]);
      if (insertError) throw insertError;
      await supabase.from('notifications').insert([{
        user_id: selectedAppointment.patient_id, type: 'new_record',
        title: 'New Medical Record Added',
        message: `Dr. ${doctorData.name} added a new ${recordType}: ${recordTitle}`,
        related_id: selectedAppointment.id,
      }]);
      const { error: updateError } = await supabase.from('appointments').update({ status: 'completed' }).eq('id', selectedAppointment.id);
      if (updateError) console.error('Error auto-completing appointment:', updateError);
      alert('Medical Record added successfully!');
      setShowRecordModal(false); setRecordTitle(''); setRecordDescription(''); setFileToUpload(null); setSelectedAppointment(null);
    } catch (e) { alert('Failed to add record: ' + e.message); }
    finally { setUploading(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    router.push('/Login');
  };

  /* ── Format helpers ── */
  const formatTime = (time) => {
    if (!time) return '';
    const [h, m] = time.split(':');
    const hr = parseInt(h);
    return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`;
  };
  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  /* ── Derived lists ── */
  const todayAppointments = appointments.filter(apt => {
    const today = new Date().toISOString().split('T')[0];
    return apt.time_slot?.date === today && (apt.status === 'scheduled' || apt.status === 'confirmed');
  });
  const upcomingAppointments = appointments.filter(apt =>
    (apt.status === 'scheduled' || apt.status === 'confirmed') && new Date(apt.time_slot?.date) > new Date()
  );
  const availableSlots = timeSlots.filter(s => s.is_available);

  const daysOfWeek = [
    { value: 0, label: 'Sunday' },  { value: 1, label: 'Monday' },
    { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' },
    { value: 4, label: 'Thursday' },{ value: 5, label: 'Friday' },
    { value: 6, label: 'Saturday' },
  ];

  /* ── Shared input class (identical to Admin inputs) ── */
  const inputCls = 'w-full px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500';

  /* ════════════════════════════════════════
     LOADING
  ════════════════════════════════════════ */
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="flex flex-col items-center">
        {/* Logo — natural colours, correct size */}
        <img src="/amrt-logo.png" alt="AMRT" className="w-48 h-auto object-contain mb-6" />
        <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-teal-600" />
        <p className="mt-3 text-sm text-gray-500">Loading…</p>
      </div>
    </div>
  );

  if (!isAuthenticated) return null;

  /* ════════════════════════════════════════
     PENDING APPROVAL
  ════════════════════════════════════════ */
  if (!isApproved) return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <img src="/amrt-logo.png" alt="AMRT" className="w-40 h-auto object-contain" />
          <button onClick={handleLogout}
            className="flex items-center space-x-2 text-sm text-gray-500 hover:text-red-600 px-3 py-2 rounded-lg hover:bg-red-50 transition">
            <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-4 h-4" />
            <span>Sign out</span>
          </button>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-16">
        <div className="bg-white rounded-xl shadow-sm p-8 text-center">
          <div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" className="w-10 h-10 text-yellow-600" />
          </div>
          <span className="inline-block bg-yellow-100 text-yellow-700 text-xs font-semibold px-3 py-1 rounded-full mb-4">
            Awaiting Review
          </span>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Account Pending Approval</h2>
          <p className="text-gray-600 text-sm leading-relaxed mb-8 max-w-md mx-auto">
            Your doctor account has been created and is under review by the administrator.
            You will have full access once your account is approved.
          </p>

          {/* Registration details */}
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-left mb-5">
            <h3 className="text-sm font-semibold text-blue-900 mb-3">Your Registration Details</h3>
            <div className="space-y-2">
              {[
                ['Name',           `Dr. ${doctorData?.name}`],
                ['Email',          doctorData?.email],
                ['Doctor ID',      doctorData?.doctor_id],
                ['Specialization', doctorData?.specialization],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between text-sm">
                  <span className="text-blue-700 font-medium">{label}</span>
                  <span className="text-blue-900">{val}</span>
                </div>
              ))}
              <div className="flex items-center justify-between text-sm pt-2 border-t border-blue-200">
                <span className="text-blue-700 font-medium">Status</span>
                <span className="bg-yellow-100 text-yellow-700 text-xs font-semibold px-2.5 py-1 rounded-full">Pending Approval</span>
              </div>
            </div>
          </div>

          {/* What's next */}
          <div className="bg-gray-50 rounded-xl p-5 text-left">
            <p className="text-sm font-semibold text-gray-700 mb-3">Once approved you will be able to:</p>
            <div className="space-y-2">
              {[
                'Create time slots for patient appointments',
                'View and manage your appointments',
                'Add medical records for patients',
                'Access your full doctor dashboard',
              ].map(item => (
                <div key={item} className="flex items-center space-x-2">
                  <div className="w-5 h-5 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                    <Icon d="M5 13l4 4L19 7" className="w-3 h-3 text-teal-600" />
                  </div>
                  <span className="text-sm text-gray-600">{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );

  /* ════════════════════════════════════════
     MAIN APPROVED DASHBOARD
  ════════════════════════════════════════ */
  return (
    <div className="min-h-screen bg-gray-50">

      {/* ── Header — same structure as Admin ── */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-40">
        <div className="px-6 py-3">
          <div className="flex items-center justify-between">
            {/* Logo — natural colours, correct size */}
            <img src="/amrt-logo.png" alt="AMRT" className="w-44 h-20 object-contain" style={{ maxHeight: 56 }} />

            {/* Doctor profile + logout */}
            <div className="flex items-center space-x-4">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-semibold text-gray-900">Dr. {doctorData?.name}</p>
                <p className="text-xs text-gray-500">{doctorData?.specialization}</p>
              </div>
              <div className="w-9 h-9 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center">
                <span className="text-white font-bold text-sm">{doctorData?.name?.charAt(0)}</span>
              </div>
              <button onClick={handleLogout}
                className="flex items-center space-x-1.5 text-sm text-gray-500 hover:text-red-600 hover:bg-red-50 px-3 py-2 rounded-lg transition">
                <Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-4 h-4" />
                <span className="hidden sm:inline">Logout</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ── Tab Navigation — same style as Admin sidebar tabs ── */}
      <div className="bg-white border-b border-gray-200 sticky top-[61px] z-30">
        <div className="px-6">
          <div className="flex space-x-1">
            {[
              { id: 'dashboard',    label: 'Dashboard',    icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
              { id: 'appointments', label: 'Appointments', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', badge: upcomingAppointments.length },
              { id: 'timeslots',    label: 'Time Slots',   icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', badge: availableSlots.length },
            ].map(tab => (
              <button key={tab.id} onClick={() => setCurrentView(tab.id)}
                className={`flex items-center space-x-2 py-4 px-3 border-b-2 text-sm font-medium transition ${
                  currentView === tab.id
                    ? 'border-teal-600 text-teal-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}>
                <Icon d={tab.icon} className="w-4 h-4" />
                <span>{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="bg-teal-100 text-teal-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Main content ── */}
      <main className="px-6 py-6">

        {/* ═══ DASHBOARD ═══ */}
        {currentView === 'dashboard' && (
          <div className="space-y-6">

            {/* Welcome banner — same gradient as Admin's teal buttons */}
            <div className="bg-gradient-to-r from-teal-600 to-teal-500 rounded-xl shadow-sm p-6 text-white">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-bold mb-1">Welcome back, Dr. {doctorData?.name}!</h2>
                  <p className="text-teal-100 text-sm">{doctorData?.specialization} · ID: {doctorData?.doctor_id}</p>
                </div>
                <span className="hidden sm:flex items-center space-x-1.5 bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 bg-green-300 rounded-full" />
                  <span>Active & Approved</span>
                </span>
              </div>
            </div>

            {/* Stat cards — identical structure to Admin stat cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {[
                { label: "Today's Appointments", value: todayAppointments.length,     icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', bg: 'bg-blue-100',   ico: 'text-blue-600' },
                { label: 'Upcoming Appointments', value: upcomingAppointments.length,  icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', bg: 'bg-green-100',  ico: 'text-green-600' },
                { label: 'Available Slots',        value: availableSlots.length,        icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', bg: 'bg-purple-100', ico: 'text-purple-600' },
              ].map(s => (
                <div key={s.label} className="bg-white rounded-xl shadow-sm p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-600 mb-1">{s.label}</p>
                      <h3 className="text-3xl font-bold text-gray-900">{s.value}</h3>
                    </div>
                    <div className={`${s.bg} p-3 rounded-full`}>
                      <Icon d={s.icon} className={`w-7 h-7 ${s.ico}`} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* No slots warning */}
            {timeSlots.length === 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 flex items-start space-x-3">
                <Icon d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-yellow-900 mb-1">No Time Slots Created</p>
                  <p className="text-sm text-yellow-800 mb-3">
                    Patients can't book appointments until you create time slots. Set up your schedule to start accepting bookings.
                  </p>
                  <button onClick={() => setShowCreateSlotModal(true)}
                    className="px-4 py-2 bg-yellow-600 text-white text-sm font-semibold rounded-lg hover:bg-yellow-700 transition">
                    Create Your First Time Slot
                  </button>
                </div>
              </div>
            )}

            {/* Today's appointments */}
            {todayAppointments.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Today's Appointments</h3>
                <div className="space-y-4">
                  {todayAppointments.map(apt => (
                    <AppointmentRow key={apt.id} apt={apt} formatTime={formatTime}
                      onConfirm={apt.status === 'scheduled' ? () => handleUpdateAppointmentStatus(apt.id, 'confirmed') : null}
                      onReject={apt.status === 'scheduled' ? () => handleUpdateAppointmentStatus(apt.id, 'cancelled') : null}
                      onComplete={apt.status === 'confirmed' ? () => handleUpdateAppointmentStatus(apt.id, 'completed') : null}
                      onRecord={() => { setSelectedAppointment(apt); setShowRecordModal(true); }} />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ═══ APPOINTMENTS ═══ */}
        {currentView === 'appointments' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h3 className="text-xl font-bold text-gray-900 mb-6">All Appointments ({appointments.length})</h3>
            {appointments.length > 0 ? (
              <div className="space-y-4">
                {appointments.map(apt => (
                  <AppointmentRow key={apt.id} apt={apt} formatTime={formatTime} formatDate={formatDate} showDate
                    onConfirm={apt.status === 'scheduled' ? () => handleUpdateAppointmentStatus(apt.id, 'confirmed') : null}
                    onReject={apt.status === 'scheduled' ? () => handleUpdateAppointmentStatus(apt.id, 'cancelled') : null}
                    onComplete={(apt.status === 'scheduled' || apt.status === 'confirmed') ? () => handleUpdateAppointmentStatus(apt.id, 'completed') : null}
                    onRecord={(apt.status === 'scheduled' || apt.status === 'confirmed') ? () => { setSelectedAppointment(apt); setShowRecordModal(true); } : null} />
                ))}
              </div>
            ) : (
              <EmptyState
                icon="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
                title="No Appointments Yet"
                sub="Appointments will appear here once patients book your available time slots." />
            )}
          </div>
        )}

        {/* ═══ TIME SLOTS ═══ */}
        {currentView === 'timeslots' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            {/* Header row */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-900">My Time Slots ({timeSlots.length})</h3>
              <button onClick={() => setShowCreateSlotModal(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition">
                <Icon d="M12 4v16m8-8H4" className="w-4 h-4" />
                <span>Create Time Slot</span>
              </button>
            </div>

            {/* Tip banner */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3 mb-6 flex items-start space-x-2">
              <span className="text-blue-500 mt-0.5 flex-shrink-0">💡</span>
              <p className="text-sm text-blue-900">
                <strong>Tip:</strong> Slots you create are immediately available for patients to book.
                Use <strong>Bulk Create</strong> to generate a recurring weekly schedule at once.
              </p>
            </div>

            {timeSlots.length > 0 ? (
              <div className="space-y-3">
                {timeSlots.map(slot => (
                  <div key={slot.id}
                    className="border border-gray-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3 hover:border-teal-300 transition">
                    <div className="flex flex-wrap items-center gap-4">
                      <div className="flex items-center space-x-2 text-gray-700">
                        <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" className="w-4 h-4 text-gray-400" />
                        <span className="font-semibold text-sm">{formatDate(slot.date)}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-gray-600">
                        <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 text-gray-400" />
                        <span className="text-sm">{formatTime(slot.start_time)} – {formatTime(slot.end_time)}</span>
                      </div>
                      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${slot.is_available ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {slot.is_available ? 'Available' : 'Booked'}
                      </span>
                      <span className="text-sm text-gray-500">{slot.current_patients}/{slot.max_patients} patients</span>
                    </div>
                    <button
                      onClick={() => handleDeleteTimeSlot(slot.id, slot.current_patients > 0)}
                      disabled={slot.current_patients > 0}
                      className={`px-4 py-2 rounded-lg text-sm font-semibold transition ${
                        slot.current_patients > 0
                          ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          : 'bg-red-50 text-red-600 hover:bg-red-100'
                      }`}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                title="No Time Slots Yet"
                sub="Create time slots so patients can book appointments with you."
                action={
                  <button onClick={() => setShowCreateSlotModal(true)}
                    className="mt-4 px-6 py-2 bg-teal-600 text-white text-sm font-semibold rounded-lg hover:bg-teal-700 transition">
                    Create Your First Time Slot
                  </button>
                } />
            )}
          </div>
        )}
      </main>

      {/* ════════════════════════════════════════
          CREATE SLOT MODAL
      ════════════════════════════════════════ */}
      {showCreateSlotModal && (
        <Modal title={bulkCreateMode ? 'Bulk Create Time Slots' : 'Create Time Slot'}
          onClose={() => { setShowCreateSlotModal(false); setBulkCreateMode(false); }}>

          {/* Mode toggle */}
          <div className="flex space-x-2 mb-6">
            {[['Single Slot', false], ['Bulk Create', true]].map(([label, val]) => (
              <button key={label} onClick={() => setBulkCreateMode(val)}
                className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${
                  bulkCreateMode === val ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}>
                {label}
              </button>
            ))}
          </div>

          {!bulkCreateMode ? (
            /* ── Single slot ── */
            <div className="space-y-4">
              <FieldGroup label="Date">
                <input type="date" value={slotDate} onChange={e => setSlotDate(e.target.value)}
                  min={new Date().toISOString().split('T')[0]} className={inputCls} />
              </FieldGroup>
              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label="Start Time">
                  <input type="time" value={slotStartTime} onChange={e => setSlotStartTime(e.target.value)} className={inputCls} />
                </FieldGroup>
                <FieldGroup label="End Time">
                  <input type="time" value={slotEndTime} onChange={e => setSlotEndTime(e.target.value)} className={inputCls} />
                </FieldGroup>
              </div>
              <FieldGroup label="Max Patients per Slot">
                <input type="number" value={maxPatients} onChange={e => setMaxPatients(parseInt(e.target.value))} min="1" max="10" className={inputCls} />
              </FieldGroup>
              <ModalActions onCancel={() => setShowCreateSlotModal(false)}
                onConfirm={handleCreateTimeSlot}
                confirmLabel={loading ? 'Creating…' : 'Create Slot'} loading={loading} />
            </div>
          ) : (
            /* ── Bulk create ── */
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-4">
                <FieldGroup label="Start Date">
                  <input type="date" value={bulkStartDate} onChange={e => setBulkStartDate(e.target.value)}
                    min={new Date().toISOString().split('T')[0]} className={inputCls} />
                </FieldGroup>
                <FieldGroup label="End Date">
                  <input type="date" value={bulkEndDate} onChange={e => setBulkEndDate(e.target.value)}
                    min={bulkStartDate || new Date().toISOString().split('T')[0]} className={inputCls} />
                </FieldGroup>
              </div>

              <FieldGroup label="Select Days">
                <div className="grid grid-cols-4 gap-2 mt-1">
                  {daysOfWeek.map(day => (
                    <button key={day.value}
                      onClick={() => setSelectedDays(prev =>
                        prev.includes(day.value) ? prev.filter(d => d !== day.value) : [...prev, day.value])}
                      className={`py-2 text-xs font-semibold rounded-lg transition ${
                        selectedDays.includes(day.value) ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}>
                      {day.label.slice(0, 3)}
                    </button>
                  ))}
                </div>
              </FieldGroup>

              <FieldGroup label="Time Slots">
                <div className="space-y-2 mt-1">
                  {bulkTimeSlots.map((slot, idx) => (
                    <div key={idx} className="flex items-center space-x-2">
                      <input type="time" value={slot.startTime}
                        onChange={e => { const u = [...bulkTimeSlots]; u[idx].startTime = e.target.value; setBulkTimeSlots(u); }}
                        className={`${inputCls} flex-1`} />
                      <span className="text-gray-400 text-sm">–</span>
                      <input type="time" value={slot.endTime}
                        onChange={e => { const u = [...bulkTimeSlots]; u[idx].endTime = e.target.value; setBulkTimeSlots(u); }}
                        className={`${inputCls} flex-1`} />
                      {bulkTimeSlots.length > 1 && (
                        <button onClick={() => setBulkTimeSlots(bulkTimeSlots.filter((_, i) => i !== idx))}
                          className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition">
                          <Icon d="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setBulkTimeSlots([...bulkTimeSlots, { startTime: '', endTime: '' }])}
                    className="mt-1 text-sm text-teal-600 hover:text-teal-700 font-semibold flex items-center space-x-1">
                    <Icon d="M12 4v16m8-8H4" className="w-4 h-4" />
                    <span>Add Another Time Slot</span>
                  </button>
                </div>
              </FieldGroup>

              <FieldGroup label="Max Patients per Slot">
                <input type="number" value={maxPatients} onChange={e => setMaxPatients(parseInt(e.target.value))} min="1" max="10" className={inputCls} />
              </FieldGroup>

              <ModalActions
                onCancel={() => { setShowCreateSlotModal(false); setBulkCreateMode(false); }}
                onConfirm={handleBulkCreateSlots}
                confirmLabel={loading ? 'Creating…' : 'Generate Schedule'} loading={loading} />
            </div>
          )}
        </Modal>
      )}

      {/* ════════════════════════════════════════
          ADD MEDICAL RECORD MODAL
      ════════════════════════════════════════ */}
      {showRecordModal && selectedAppointment && (
        <Modal title="Add Medical Record"
          onClose={() => { setShowRecordModal(false); setSelectedAppointment(null); setRecordTitle(''); setRecordDescription(''); setFileToUpload(null); }}>

          {/* Patient info banner */}
          <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center space-x-3 mb-5">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0">
              {selectedAppointment.patient?.name?.charAt(0)}
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-900">{selectedAppointment.patient?.name}</p>
              <p className="text-xs text-blue-600">{selectedAppointment.patient?.email}</p>
            </div>
          </div>

          <div className="space-y-4">
            <FieldGroup label="Record Type">
              <select value={recordType} onChange={e => setRecordType(e.target.value)} className={inputCls}>
                <option value="prescription">Prescription</option>
                <option value="lab_report">Lab Report</option>
                <option value="scan">Scan / X-Ray</option>
                <option value="diagnosis">Diagnosis</option>
                <option value="other">Other</option>
              </select>
            </FieldGroup>

            <FieldGroup label="Title *">
              <input type="text" value={recordTitle} onChange={e => setRecordTitle(e.target.value)}
                placeholder="e.g. Antibiotics Prescription" className={inputCls} />
            </FieldGroup>

            <FieldGroup label="Description">
              <textarea value={recordDescription} onChange={e => setRecordDescription(e.target.value)}
                rows={3} placeholder="Clinical notes, dosage, instructions…"
                className={`${inputCls} resize-none`} />
            </FieldGroup>

            <FieldGroup label="Attachment (Optional)">
              <label className="relative block cursor-pointer">
                <input type="file" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                  onChange={e => setFileToUpload(e.target.files[0])} />
                <div className={`flex flex-col items-center justify-center py-6 rounded-lg border-2 border-dashed transition ${
                  fileToUpload ? 'border-teal-400 bg-teal-50' : 'border-gray-300 hover:bg-gray-50'
                }`}>
                  {fileToUpload ? (
                    <div className="flex items-center space-x-2 text-teal-700">
                      <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-5 h-5" />
                      <span className="text-sm font-medium truncate max-w-[220px]">{fileToUpload.name}</span>
                    </div>
                  ) : (
                    <>
                      <Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" className="w-8 h-8 text-gray-400 mb-2" />
                      <p className="text-sm text-gray-500">Click to upload PDF or image</p>
                    </>
                  )}
                </div>
              </label>
            </FieldGroup>

            <ModalActions
              onCancel={() => { setShowRecordModal(false); setSelectedAppointment(null); setRecordTitle(''); setRecordDescription(''); setFileToUpload(null); }}
              onConfirm={handleAddMedicalRecord}
              confirmLabel={uploading ? 'Saving…' : 'Save Record'} loading={uploading} />
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────
   Shared sub-components
───────────────────────────────────────────── */

function AppointmentRow({ apt, formatTime, formatDate, showDate, onConfirm, onReject, onComplete, onRecord }) {
  return (
    <div className="border border-gray-200 rounded-xl p-4 hover:border-teal-300 transition">
      <div className="flex items-start justify-between gap-4">
        {/* Left */}
        <div className="flex items-start space-x-3 flex-1 min-w-0">
          <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold">{apt.patient?.name?.charAt(0)}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-gray-900 text-sm">{apt.patient?.name}</p>
            <p className="text-xs text-gray-500 truncate">{apt.patient?.email}</p>
            <div className="flex flex-wrap items-center gap-3 mt-1.5">
              {showDate && formatDate && (
                <span className="flex items-center space-x-1 text-xs text-gray-500">
                  <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" className="w-3.5 h-3.5 text-gray-400" />
                  <span>{formatDate(apt.time_slot?.date)}</span>
                </span>
              )}
              <span className="flex items-center space-x-1 text-xs text-gray-500">
                <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" className="w-3.5 h-3.5 text-gray-400" />
                <span>{formatTime(apt.time_slot?.start_time)} – {formatTime(apt.time_slot?.end_time)}</span>
              </span>
            </div>
            {/* Token badges for confirmed */}
            {apt.token_number && apt.status === 'confirmed' && (
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold px-2.5 py-1 rounded-full">
                  <Icon d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" className="w-3 h-3"/>
                  Token #{apt.token_number}
                </span>
                {apt.report_time && (
                  <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                    <Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" className="w-3 h-3"/>
                    Report at {apt.report_time}
                  </span>
                )}
              </div>
            )}
            {apt.symptoms && (
              <p className="text-xs text-gray-600 mt-1.5 bg-gray-50 px-2 py-1 rounded-md">
                <span className="font-medium text-gray-500">Symptoms: </span>{apt.symptoms}
              </p>
            )}
            {apt.notes && (
              <p className="text-xs text-gray-600 mt-1 bg-gray-50 px-2 py-1 rounded-md">
                <span className="font-medium text-gray-500">Notes: </span>{apt.notes}
              </p>
            )}
          </div>
        </div>

        {/* Right: status + actions */}
        <div className="flex flex-col items-end space-y-2 flex-shrink-0">
          <StatusBadge status={apt.status} />
          <div className="flex flex-col space-y-1.5">
            {onConfirm && (
              <button onClick={onConfirm}
                className="px-4 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition">
                Confirm
              </button>
            )}
            {onReject && (
              <button onClick={onReject}
                className="px-4 py-1.5 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition">
                Reject
              </button>
            )}
            {onComplete && (
              <button onClick={onComplete}
                className="px-4 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition">
                Mark Complete
              </button>
            )}
            {onRecord && (
              <button onClick={onRecord}
                className="px-4 py-1.5 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 transition">
                Add Record
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, sub, action }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
        <Icon d={icon} className="w-8 h-8 text-gray-400" />
      </div>
      <p className="font-semibold text-gray-700 mb-1">{title}</p>
      <p className="text-sm text-gray-400 max-w-xs">{sub}</p>
      {action}
    </div>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white">
          <h3 className="text-lg font-bold text-gray-900">{title}</h3>
          <button onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
            <Icon d="M6 18L18 6M6 6l12 12" className="w-5 h-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  );
}

function FieldGroup({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function ModalActions({ onCancel, onConfirm, confirmLabel, loading }) {
  return (
    <div className="flex space-x-3 pt-2">
      <button onClick={onCancel}
        className="flex-1 py-2.5 text-sm font-semibold border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">
        Cancel
      </button>
      <button onClick={onConfirm} disabled={loading}
        className="flex-1 py-2.5 text-sm font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50">
        {confirmLabel}
      </button>
    </div>
  );
}