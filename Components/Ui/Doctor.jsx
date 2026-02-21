'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/getUserRole';

const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={2}
    strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d={d} />
  </svg>
);

const StatusBadge = ({ status }) => {
  const map = {
    scheduled: 'bg-blue-100 text-blue-700',
    confirmed: 'bg-green-100 text-green-700',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-700',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${map[status] ?? 'bg-yellow-100 text-yellow-700'}`}>
      {status?.charAt(0).toUpperCase() + status?.slice(1)}
    </span>
  );
};

function getRoomId(id1, id2) {
  return 'chat_' + [id1, id2].sort().join('_');
}

/* ================================================================
   DOCTOR CHAT PANEL — individual conversation
================================================================ */
function DoctorChatPanel({ doctorData, patient, onBack }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);
  const roomId = getRoomId(doctorData.id, patient.id);

  useEffect(() => {
    loadMessages();
    const channel = supabase.channel(`room:${roomId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `room_id=eq.${roomId}` }, (payload) => {
        setMessages(prev => prev.find(m => m.id === payload.new.id) ? prev : [...prev, payload.new]);
        if (payload.new.receiver_id === doctorData.id) {
          supabase.from('messages').update({ is_read: true }).eq('id', payload.new.id);
        }
      }).subscribe();
    channelRef.current = channel;
    return () => supabase.removeChannel(channel);
  }, [roomId]);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const loadMessages = async () => {
    setLoading(true);
    const { data } = await supabase.from('messages').select('*').eq('room_id', roomId).order('created_at', { ascending: true });
    setMessages(data || []);
    setLoading(false);
    await supabase.from('messages').update({ is_read: true }).eq('room_id', roomId).eq('receiver_id', doctorData.id).eq('is_read', false);
  };

  const [sendError, setSendError] = useState('');

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput('');
    setSendError('');
    setSending(true);
    const optimistic = { id: `tmp-${Date.now()}`, room_id: roomId, sender_id: doctorData.id, receiver_id: patient.id, content, created_at: new Date().toISOString(), is_read: false };
    setMessages(prev => [...prev, optimistic]);
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, sender_id: doctorData.id, receiver_id: patient.id, content }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to send');
      setMessages(prev => prev.map(m => m.id === optimistic.id ? json.message : m));
    } catch (e) {
      setMessages(prev => prev.filter(m => m.id !== optimistic.id));
      setInput(content);
      setSendError(e.message || 'Could not send message. Please try again.');
    } finally { setSending(false); }
  };


  const fmtTime = (ts) => new Date(ts).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

  return (
    <div className="flex flex-col" style={{ height: 'calc(100vh - 65px)' }}>
      {/* sub-header */}
      <div className="flex items-center space-x-3 px-5 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <button onClick={onBack} className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition flex-shrink-0">
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
        </button>
        {patient.avatar_url
          ? <img src={patient.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-teal-200 flex-shrink-0" />
          : <div className="w-9 h-9 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-sm">{patient.name?.charAt(0)}</span></div>}
        <div>
          <p className="text-sm font-bold text-gray-900">{patient.name}</p>
          <p className="text-xs text-gray-400">{patient.email}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mb-3">
              <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">Start the conversation</p>
            <p className="text-xs text-gray-400 mt-1">Send a message to {patient.name?.split(' ')[0]}</p>
          </div>
        ) : (
          <>
            {messages.map(msg => {
              const isMine = msg.sender_id === doctorData.id;
              return (
                <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                  {!isMine && (
                    patient.avatar_url
                      ? <img src={patient.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover mr-2 flex-shrink-0 self-end mb-1 ring-1 ring-gray-200" />
                      : <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 self-end mb-1">
                        {patient.name?.charAt(0)}
                      </div>
                  )}
                  <div className={`max-w-[70%] flex flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                    <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${isMine ? 'bg-teal-700 text-white rounded-br-sm' : 'bg-white text-gray-800 border border-gray-100 shadow-sm rounded-bl-sm'}`}>
                      {msg.content}
                    </div>
                    <p className="text-[10px] mt-1 text-gray-400">
                      {fmtTime(msg.created_at)}{isMine && <span className="ml-1">{msg.is_read ? ' ✓✓' : ' ✓'}</span>}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Error toast */}
      {sendError && (
        <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex-shrink-0">
          <p className="text-xs text-red-600">{sendError}</p>
        </div>
      )}
      {/* Input */}

      <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0">
        <div className="flex items-center space-x-2">
          <input type="text" value={input} onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
            placeholder={`Message ${patient.name?.split(' ')[0]}…`}
            className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
          <button onClick={sendMessage} disabled={!input.trim() || sending}
            className="w-10 h-10 bg-teal-700 text-white rounded-xl flex items-center justify-center hover:bg-teal-800 transition disabled:opacity-40 flex-shrink-0">
            {sending
              ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
              : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   MESSAGES VIEW  — list all patient conversations
================================================================ */
function DoctorMessagesView({ doctorData, onReadMessages }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activePatient, setActivePatient] = useState(null);

  useEffect(() => {
    fetchConversations();
    const ch = supabase.channel('doc-msg-watch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${doctorData.id}` }, () => fetchConversations())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, []);

  const fetchConversations = async () => {
    setLoading(true);
    const [{ data: msgs }, { data: appts }] = await Promise.all([
      supabase.from('messages').select('*').or(`sender_id.eq.${doctorData.id},receiver_id.eq.${doctorData.id}`).order('created_at', { ascending: false }),
      // Only patients with confirmed/completed appointments can chat
      supabase.from('appointments').select('patient:patient_id(id,name,email,avatar_url), status').eq('doctor_id', doctorData.id).in('status', ['confirmed', 'completed']),
    ]);

    const patientMap = {};
    (appts || []).forEach(r => { if (r.patient) patientMap[r.patient.id] = r.patient; });

    const convMap = {};
    (msgs || []).forEach(msg => {
      const otherId = msg.sender_id === doctorData.id ? msg.receiver_id : msg.sender_id;
      if (!patientMap[otherId]) return;
      if (!convMap[otherId]) convMap[otherId] = { patient: patientMap[otherId], lastMsg: msg, unread: 0 };
      if (msg.receiver_id === doctorData.id && !msg.is_read) convMap[otherId].unread++;
    });
    setConversations(Object.values(convMap));
    setLoading(false);
  };

  const fmtTime = (ts) => {
    const d = new Date(ts);
    return d.toDateString() === new Date().toDateString()
      ? d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
      : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (activePatient) return <DoctorChatPanel doctorData={doctorData} patient={activePatient} onBack={() => { setActivePatient(null); fetchConversations(); }} />;

  return (
    <div style={{ height: 'calc(100vh - 65px)', overflowY: 'auto' }}>
      <div className="px-7 py-5 border-b border-gray-100">
        <h2 className="text-base font-bold text-gray-900">Patient Messages</h2>
        <p className="text-xs text-gray-400 mt-0.5">Real-time WebSocket chat with your patients</p>
      </div>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" />
        </div>
      ) : conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 bg-teal-100 rounded-full flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">No messages yet</p>
          <p className="text-xs text-gray-400 mt-1">Patients will message you through the patient portal</p>
        </div>
      ) : (
        <div className="divide-y divide-gray-50">
          {conversations.map(({ patient, lastMsg, unread }) => (
            <button key={patient.id} onClick={() => {
              // Clear badge immediately in local state
              setConversations(prev => prev.map(c =>
                c.patient.id === patient.id ? { ...c, unread: 0 } : c
              ));
              setActivePatient(patient);
              if (onReadMessages) onReadMessages();
            }}
              className="w-full flex items-center space-x-3 px-7 py-4 hover:bg-gray-50 transition text-left">
              {patient.avatar_url
                ? <img src={patient.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0 ring-2 ring-gray-100" />
                : <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold">{patient.name?.charAt(0)}</span></div>}
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className={`text-sm ${unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-700'}`}>{patient.name}</p>
                  <p className="text-xs text-gray-400 flex-shrink-0 ml-2">{fmtTime(lastMsg.created_at)}</p>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className={`text-xs truncate pr-2 ${unread > 0 ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                    {lastMsg.sender_id === doctorData.id ? 'You: ' : ''}{lastMsg.content}
                  </p>
                  {unread > 0 && (
                    <span className="min-w-[18px] h-[18px] bg-teal-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 flex-shrink-0">{unread}</span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================
   PROFILE COMPLETION WIZARD
================================================================ */
function ProfileCompletion({ doctorData, onComplete }) {
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [avatarPreview, setAvatarPreview] = useState(doctorData?.avatar_url || null);
  const [certFile, setCertFile] = useState(null);
  const [certLabel, setCertLabel] = useState('');
  const [locationSearch, setLocationSearch] = useState('');
  const [clinicLat, setClinicLat] = useState('');
  const [clinicLng, setClinicLng] = useState('');
  const [clinicAddress, setClinicAddress] = useState('');
  const [clinicPlaceName, setClinicPlaceName] = useState('');
  const [locating, setLocating] = useState(false);
  const [mapUrl, setMapUrl] = useState('');
  const [experienceYears, setExperienceYears] = useState('');
  const [experienceDetails, setExperienceDetails] = useState('');
  const [languages, setLanguages] = useState('');
  const [consultationFee, setConsultationFee] = useState('');
  const inp = 'w-full px-4 py-2.5 border border-gray-300 rounded-xl text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500';

  const handleAvatarChange = (e) => { const f = e.target.files[0]; if (!f) return; setAvatarFile(f); const r = new FileReader(); r.onload = ev => setAvatarPreview(ev.target.result); r.readAsDataURL(f); };

  const getCurrentLocation = () => {
    if (!navigator.geolocation) { setError('Geolocation not supported.'); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      const lat = pos.coords.latitude.toFixed(6); const lng = pos.coords.longitude.toFixed(6);
      setClinicLat(lat); setClinicLng(lng);
      setMapUrl(`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`);
      try { const res = await fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json`); const data = await res.json(); setClinicAddress(data.display_name || `${lat}, ${lng}`); setClinicPlaceName(data.name || data.address?.suburb || data.address?.city || ''); } catch { setClinicAddress(`${lat}, ${lng}`); }
      setLocating(false);
    }, (err) => { setError('Could not get location: ' + err.message); setLocating(false); });
  };

  const searchLocation = async () => {
    if (!locationSearch.trim()) return; setError('');
    try { const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(locationSearch)}&format=json&limit=1`); const data = await res.json(); if (!data.length) { setError('Location not found.'); return; } const place = data[0]; const lat = parseFloat(place.lat).toFixed(6); const lng = parseFloat(place.lon).toFixed(6); setClinicLat(lat); setClinicLng(lng); setClinicAddress(place.display_name); setClinicPlaceName(place.name || locationSearch); setMapUrl(`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`); } catch { setError('Search failed.'); }
  };

  const nextStep = () => {
    setError('');
    if (step === 1 && !avatarFile && !avatarPreview) { setError('Please upload a profile photo.'); return; }
    if (step === 2 && !certFile) { setError('Please upload your certificate.'); return; }
    if (step === 3 && (!clinicLat || !clinicLng)) { setError('Please set your clinic location.'); return; }
    setStep(s => s + 1);
  };

  const handleSave = async () => {
    setError(''); if (!experienceYears) { setError('Please enter years of experience.'); return; }
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error('Not authenticated'); const uid = user.id;
      let avatarUrl = doctorData?.avatar_url || null; let certUrl = null; let certNameFinal = certFile?.name || null;
      if (avatarFile) { const ext = avatarFile.name.split('.').pop().toLowerCase(); const path = `${uid}/avatar.${ext}`; const { error: upErr } = await supabase.storage.from('avatars').upload(path, avatarFile, { upsert: true, contentType: avatarFile.type }); if (upErr) throw new Error(`Avatar upload failed: ${upErr.message}`); const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path); avatarUrl = pub.publicUrl; }
      if (certFile) { const ext = certFile.name.split('.').pop().toLowerCase(); const path = `${uid}/certificate.${ext}`; const { error: certErr } = await supabase.storage.from('certificates').upload(path, certFile, { upsert: true, contentType: certFile.type }); if (certErr) throw new Error(`Certificate upload failed: ${certErr.message}`); const { data: signed, error: signErr } = await supabase.storage.from('certificates').createSignedUrl(path, 60 * 60 * 24 * 365 * 5); if (signErr) throw new Error('Could not create certificate URL'); certUrl = signed.signedUrl; if (certLabel) certNameFinal = certLabel; }
      const updatePayload = { avatar_url: avatarUrl, certificate_url: certUrl, certificate_name: certNameFinal, clinic_lat: clinicLat ? parseFloat(clinicLat) : null, clinic_lng: clinicLng ? parseFloat(clinicLng) : null, clinic_address: clinicAddress || null, clinic_place_name: clinicPlaceName || null, experience_years: parseInt(experienceYears) || null, experience_details: experienceDetails || null, languages: languages || null, consultation_fee: consultationFee ? parseFloat(consultationFee) : null, profile_completed: true, updated_at: new Date().toISOString() };
      const { error: dbErr } = await supabase.from('users').update(updatePayload).eq('id', uid); if (dbErr) throw new Error(`Profile save failed: ${dbErr.message}`);
      onComplete({ ...doctorData, ...updatePayload });
    } catch (e) { setError(e.message); } finally { setSaving(false); }
  };

  const steps = [{ num: 1, label: 'Photo', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' }, { num: 2, label: 'Certificate', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' }, { num: 3, label: 'Location', icon: 'M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z' }, { num: 4, label: 'Experience', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' }];

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-gray-50">
      <header className="bg-white border-b border-gray-200"><div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between"><img src="/amrt-logo.png" alt="AMRT" className="h-14 w-auto object-contain" /><div className="text-right"><p className="text-sm font-semibold text-gray-900">Dr. {doctorData?.name}</p><p className="text-xs text-teal-600">Complete your profile to get started</p></div></div></header>
      <main className="max-w-3xl mx-auto px-4 py-10">
        <div className="text-center mb-8"><div className="inline-flex items-center space-x-2 bg-green-100 text-green-700 px-4 py-1.5 rounded-full text-sm font-semibold mb-4"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg><span>Account Approved!</span></div><h1 className="text-3xl font-bold text-gray-900 mb-2">Complete Your Profile</h1><p className="text-gray-600 text-sm">This is required before you can access your dashboard.</p></div>
        <div className="flex items-center justify-center mb-8">{steps.map((s, i) => (<div key={s.num} className="flex items-center"><div className="flex flex-col items-center"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-all ${step > s.num ? 'bg-teal-600 text-white' : step === s.num ? 'bg-teal-600 text-white ring-4 ring-teal-200' : 'bg-gray-200 text-gray-500'}`}>{step > s.num ? <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" /></svg> : s.num}</div><span className={`mt-1 text-[10px] font-medium ${step === s.num ? 'text-teal-700' : 'text-gray-500'}`}>{s.label}</span></div>{i < steps.length - 1 && <div className={`w-14 h-0.5 mx-2 mb-4 ${step > s.num ? 'bg-teal-500' : 'bg-gray-200'}`} />}</div>))}</div>
        {error && <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4"><p className="text-sm text-red-700">{error}</p></div>}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="bg-gradient-to-r from-teal-600 to-teal-500 px-6 py-4"><div className="flex items-center space-x-3"><div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><Icon d={steps[step - 1].icon} className="w-5 h-5 text-white" /></div><div><h2 className="text-lg font-bold text-white">Step {step}: {steps[step - 1].label}</h2><p className="text-teal-200 text-xs">{step === 1 && 'Upload a clear professional photo'}{step === 2 && 'Upload your medical degree or license'}{step === 3 && 'Set your clinic or practice location'}{step === 4 && 'Tell patients about your background and fees'}</p></div></div></div>
          <div className="p-6 space-y-5">
            {step === 1 && (<div className="flex flex-col items-center space-y-5"><div className="relative">{avatarPreview ? <img src={avatarPreview} alt="Preview" className="w-36 h-36 rounded-full object-cover ring-4 ring-teal-200 shadow-lg" /> : <div className="w-36 h-36 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center ring-4 ring-teal-200 shadow-lg"><span className="text-white font-bold text-5xl">{doctorData?.name?.charAt(0)}</span></div>}<label className="absolute bottom-1 right-1 w-10 h-10 bg-teal-600 rounded-full flex items-center justify-center cursor-pointer hover:bg-teal-700 transition shadow-md"><Icon d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" className="w-5 h-5 text-white" /><input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} /></label></div><label className="cursor-pointer"><span className="inline-flex items-center space-x-2 px-6 py-3 bg-teal-50 border-2 border-dashed border-teal-300 rounded-xl text-teal-700 font-semibold text-sm hover:bg-teal-100 transition"><Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" className="w-5 h-5" /><span>{avatarFile ? avatarFile.name : 'Choose Profile Photo'}</span></span><input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden" onChange={handleAvatarChange} /></label><p className="text-xs text-gray-500">JPG, PNG or WebP · Max 5MB</p></div>)}
            {step === 2 && (<div className="space-y-4"><div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-800"><p className="font-semibold mb-1">📋 Accepted documents</p><p>Medical degree, Specialist certificate, Medical council registration, or Practice license</p></div><label className="block cursor-pointer"><div className={`border-2 border-dashed rounded-xl p-8 text-center transition ${certFile ? 'border-teal-400 bg-teal-50' : 'border-gray-300 hover:border-teal-400 hover:bg-gray-50'}`}><input type="file" accept=".pdf,image/jpeg,image/jpg,image/png" className="hidden" onChange={(e) => { const f = e.target.files[0]; if (f) { setCertFile(f); setCertLabel(f.name); } }} />{certFile ? <div className="flex flex-col items-center space-y-2"><div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center"><Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-7 h-7 text-teal-600" /></div><p className="font-semibold text-teal-700 text-sm">{certFile.name}</p></div> : <div className="flex flex-col items-center space-y-3"><div className="w-14 h-14 bg-gray-100 rounded-full flex items-center justify-center"><Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" className="w-7 h-7 text-gray-400" /></div><div><p className="font-semibold text-gray-700">Click to upload certificate</p><p className="text-xs text-gray-500 mt-1">PDF, JPG or PNG · Max 10MB</p></div></div>}</div></label>{certFile && (<div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Certificate description</label><input type="text" value={certLabel} onChange={(e) => setCertLabel(e.target.value)} placeholder="e.g. MBBS – University of Kerala, 2018" className={inp} /></div>)}</div>)}
            {step === 3 && (<div className="space-y-4"><button onClick={getCurrentLocation} disabled={locating} className="w-full flex items-center justify-center space-x-2 py-3 bg-blue-600 text-white rounded-xl font-semibold text-sm hover:bg-blue-700 transition disabled:opacity-60">{locating ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> : <Icon d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" className="w-5 h-5" />}<span>{locating ? 'Detecting…' : '📍 Use My Current GPS Location'}</span></button><div className="flex space-x-2"><input type="text" value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && searchLocation()} placeholder="Search clinic / hospital / address…" className={`${inp} flex-1`} /><button onClick={searchLocation} className="px-5 py-2.5 bg-teal-600 text-white rounded-xl text-sm font-semibold hover:bg-teal-700 transition">Search</button></div>{mapUrl && <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm"><iframe src={mapUrl} width="100%" height="200" style={{ border: 0 }} allowFullScreen loading="lazy" title="Map" /></div>}{clinicAddress && <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 flex items-start space-x-2"><Icon d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" className="w-5 h-5 text-teal-600 flex-shrink-0 mt-0.5" /><div>{clinicPlaceName && <p className="text-sm font-semibold text-teal-900">{clinicPlaceName}</p>}<p className="text-xs text-teal-700">{clinicAddress}</p></div></div>}<div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Clinic / Hospital Name</label><input type="text" value={clinicPlaceName} onChange={(e) => setClinicPlaceName(e.target.value)} placeholder="e.g. Sunrise Medical Centre" className={inp} /></div><div className="grid grid-cols-2 gap-3"><div><label className="block text-xs font-semibold text-gray-500 mb-1">Latitude</label><input type="number" step="any" value={clinicLat} onChange={(e) => setClinicLat(e.target.value)} className={inp} /></div><div><label className="block text-xs font-semibold text-gray-500 mb-1">Longitude</label><input type="number" step="any" value={clinicLng} onChange={(e) => setClinicLng(e.target.value)} className={inp} /></div></div></div>)}
            {step === 4 && (<div className="space-y-4"><div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Years of Experience <span className="text-red-500">*</span></label><input type="number" min="0" max="60" value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)} placeholder="e.g. 8" className={inp} /></div><div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Consultation Fee (₹)</label><input type="number" min="0" value={consultationFee} onChange={(e) => setConsultationFee(e.target.value)} placeholder="e.g. 500" className={inp} /></div></div><div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Languages Spoken</label><input type="text" value={languages} onChange={(e) => setLanguages(e.target.value)} placeholder="e.g. Malayalam, English, Hindi" className={inp} /></div><div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Professional Summary</label><textarea value={experienceDetails} onChange={(e) => setExperienceDetails(e.target.value)} rows={4} placeholder="Describe specializations, hospitals worked at, achievements…" className={`${inp} resize-none`} /></div></div>)}
          </div>
          <div className="px-6 pb-6 flex space-x-3">{step > 1 && <button onClick={() => { setError(''); setStep(s => s - 1); }} className="flex-1 py-3 text-sm font-semibold border-2 border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition">← Back</button>}<button onClick={step < 4 ? nextStep : handleSave} disabled={saving} className="flex-1 py-3 text-sm font-semibold bg-teal-600 text-white rounded-xl hover:bg-teal-700 transition disabled:opacity-60 flex items-center justify-center space-x-2">{saving && <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>}<span>{saving ? 'Saving…' : step < 4 ? 'Continue →' : '✓ Complete & Enter Dashboard'}</span></button></div>
        </div>
      </main>
    </div>
  );
}

/* ================================================================
   PATIENT PROFILE MODAL
================================================================ */
function PatientProfileModal({ patient, onClose, doctorId }) {
  const [records, setRecords] = useState([]);
  const [healthDetails, setHealthDetails] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('profile');

  useEffect(() => {
    if (!patient?.id) return;
    (async () => {
      setLoading(true);
      try {
        const [{ data: recs }, { data: hd }] = await Promise.all([
          supabase.from('medical_records').select('*, doctor:doctor_id(name)').eq('patient_id', patient.id).order('created_at', { ascending: false }).limit(3),
          supabase.from('patient_health_details').select('*').eq('patient_id', patient.id).maybeSingle(),
        ]);
        setRecords(recs || []);
        setHealthDetails(hd);
      } catch (e) { console.error(e); }
      setLoading(false);
    })();
  }, [patient?.id]);

  const fmtDate = (d) => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-teal-600 to-teal-500 p-5 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            {patient.avatar_url ? <img src={patient.avatar_url} alt="" className="w-14 h-14 rounded-full object-cover ring-2 ring-white/40" /> : <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center"><span className="text-white font-bold text-2xl">{patient.name?.charAt(0)}</span></div>}
            <div>
              <h2 className="text-lg font-bold text-white">{patient.name}</h2>
              <p className="text-teal-200 text-sm">{patient.email}</p>
              <div className="flex items-center gap-3 mt-1">
                {patient.age && <span className="text-xs text-teal-100">Age: {patient.age}</span>}
                {patient.gender && <span className="text-xs text-teal-100">· {patient.gender}</span>}
                {patient.blood_group && <span className="text-xs bg-white/20 text-white px-2 py-0.5 rounded-full font-semibold">{patient.blood_group}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition"><Icon d="M6 18L18 6M6 6l12 12" className="w-4 h-4 text-white" /></button>
        </div>
        <div className="flex border-b border-gray-100 bg-white">
          {[['profile', 'Profile'], ['health', 'Health Details'], ['records', 'Recent Records']].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`flex-1 py-3 text-sm font-semibold transition border-b-2 ${activeTab === id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{label}</button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          {loading ? <div className="flex items-center justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" /></div> : (
            <>
              {activeTab === 'profile' && (<div className="grid grid-cols-2 gap-3">{[['Phone', patient.phone], ['Age', patient.age], ['Gender', patient.gender], ['Blood Group', patient.blood_group], ['Address', patient.address]].map(([label, val]) => val ? (<div key={label} className={`bg-gray-50 rounded-xl p-3 ${label === 'Address' ? 'col-span-2' : ''}`}><p className="text-xs text-gray-400 font-medium mb-0.5">{label}</p><p className="text-sm font-semibold text-gray-900">{val}</p></div>) : null)}</div>)}
              {activeTab === 'health' && (<div className="space-y-4">{healthDetails ? (<><div className="grid grid-cols-3 gap-3">{[['Height', healthDetails.height_cm ? `${healthDetails.height_cm} cm` : '—'], ['Weight', healthDetails.weight_kg ? `${healthDetails.weight_kg} kg` : '—'], ['BMI', healthDetails.bmi ? `${healthDetails.bmi}` : '—']].map(([l, v]) => (<div key={l} className="bg-blue-50 rounded-xl p-3 text-center"><p className="text-xs text-blue-400 font-medium">{l}</p><p className="text-lg font-bold text-blue-700">{v}</p></div>))}</div>{[['Allergies', healthDetails.allergies], ['Chronic Conditions', healthDetails.chronic_conditions], ['Current Medications', healthDetails.current_medications], ['Notes', healthDetails.notes]].map(([l, v]) => v ? (<div key={l} className="bg-gray-50 rounded-xl p-3"><p className="text-xs text-gray-400 font-medium mb-1">{l}</p><p className="text-sm text-gray-800">{v}</p></div>) : null)}{healthDetails.emergency_contact_name && (<div className="bg-red-50 border border-red-100 rounded-xl p-3"><p className="text-xs text-red-500 font-semibold mb-1">Emergency Contact</p><p className="text-sm font-semibold text-gray-900">{healthDetails.emergency_contact_name}</p><p className="text-xs text-gray-500">{healthDetails.emergency_contact_phone} · {healthDetails.emergency_contact_relation}</p></div>)}</>) : <div className="text-center py-10 text-gray-400 text-sm">No health details provided.</div>}</div>)}
              {activeTab === 'records' && (<div className="space-y-3"><p className="text-xs text-gray-400">Last 3 medical records</p>{records.length > 0 ? records.map(r => (<div key={r.id} className="border border-gray-200 rounded-xl p-4 hover:border-teal-200 transition"><div className="flex items-start justify-between"><div><p className="text-sm font-semibold text-gray-900">{r.title}</p><p className="text-xs text-gray-500 mt-0.5">By Dr. {r.doctor?.name} · {fmtDate(r.created_at)}</p><span className="inline-block mt-1 px-2 py-0.5 bg-teal-50 text-teal-700 text-xs rounded-md capitalize">{r.record_type?.replace('_', ' ')}</span>{r.description && <p className="text-xs text-gray-600 mt-2">{r.description}</p>}</div>{r.document_url && (<a href={r.document_url} target="_blank" rel="noreferrer" className="flex items-center space-x-1 text-xs text-teal-600 hover:text-teal-700 font-semibold px-3 py-1.5 bg-teal-50 rounded-lg"><Icon d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" className="w-3.5 h-3.5" /><span>View</span></a>)}</div></div>)) : <div className="text-center py-10 text-gray-400 text-sm">No medical records yet.</div>}</div>)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/* ================================================================
   MAIN DOCTOR DASHBOARD
================================================================ */
export default function Doctor() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isApproved, setIsApproved] = useState(false);
  const [profileCompleted, setProfileCompleted] = useState(false);
  const [doctorData, setDoctorData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState('dashboard');
  const [appointments, setAppointments] = useState([]);
  const [aptTab, setAptTab] = useState('all');
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [viewingPatient, setViewingPatient] = useState(null);
  const [allPatients, setAllPatients] = useState([]);
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
  const [slotLoading, setSlotLoading] = useState(false);
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [recordType, setRecordType] = useState('prescription');
  const [recordTitle, setRecordTitle] = useState('');
  const [recordDescription, setRecordDescription] = useState('');
  const [fileToUpload, setFileToUpload] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [newAvatarFile, setNewAvatarFile] = useState(null);
  const [newAvatarPreview, setNewAvatarPreview] = useState(null);
  const [newCertFile, setNewCertFile] = useState(null);
  const [mapUrl2, setMapUrl2] = useState('');
  const [locating2, setLocating2] = useState(false);
  const [profileSaveMsg, setProfileSaveMsg] = useState('');
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);
  const [doctorPayments, setDoctorPayments] = useState([]);
  const [checkinCode, setCheckinCode] = useState('');
  const [checkinResult, setCheckinResult] = useState(null);
  const [checkinLoading, setCheckinLoading] = useState(false);
  const [checkinError, setCheckinError] = useState('');
  const [checkinReportType, setCheckinReportType] = useState('prescription');
  const [checkinReportTitle, setCheckinReportTitle] = useState('');
  const [checkinReportDesc, setCheckinReportDesc] = useState('');
  const [checkinReportFile, setCheckinReportFile] = useState(null);
  const [checkinReportSaving, setCheckinReportSaving] = useState(false);
  const [checkinReportSuccess, setCheckinReportSuccess] = useState(false);

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => { if (isAuthenticated && isApproved && profileCompleted && doctorData) { fetchAppointments(); fetchTimeSlots(); fetchAllPatients(); fetchUnreadMsgCount(); fetchDoctorPayments(); } }, [isAuthenticated, isApproved, profileCompleted, doctorData?.id]);

  useEffect(() => {
    if (!doctorData?.id) return;
    const ch = supabase.channel('doctor-rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `doctor_id=eq.${doctorData.id}` }, () => { fetchAppointments(); fetchTimeSlots(); fetchAllPatients(); })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${doctorData.id}` }, () => fetchUnreadMsgCount())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [doctorData?.id]);

  useEffect(() => {
    if (!doctorData?.id || isApproved) return;
    const ch = supabase.channel('approval-watch').on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'users', filter: `id=eq.${doctorData.id}` }, (payload) => { if (payload.new.is_approved) { setIsApproved(true); setProfileCompleted(payload.new.profile_completed === true); setDoctorData(payload.new); } }).subscribe();
    return () => supabase.removeChannel(ch);
  }, [doctorData?.id, isApproved]);

  useEffect(() => {
    if (doctorData) {
      setProfileForm({ name: doctorData.name || '', phone: doctorData.phone || '', specialization: doctorData.specialization || '', experience_years: doctorData.experience_years || '', experience_details: doctorData.experience_details || '', languages: doctorData.languages || '', consultation_fee: doctorData.consultation_fee || '', clinic_place_name: doctorData.clinic_place_name || '', clinic_address: doctorData.clinic_address || '', clinic_lat: doctorData.clinic_lat || '', clinic_lng: doctorData.clinic_lng || '' });
      if (doctorData.clinic_lat && doctorData.clinic_lng) setMapUrl2(`https://maps.google.com/maps?q=${doctorData.clinic_lat},${doctorData.clinic_lng}&z=15&output=embed`);
    }
  }, [doctorData?.id]);

  const fetchUnreadMsgCount = async () => { if (!doctorData?.id) return; const { count } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', doctorData.id).eq('is_read', false); setUnreadMsgCount(count || 0); };
  const fetchDoctorPayments = async () => { if (!doctorData?.id) return; const { data } = await supabase.from('payments').select('*, appointment:appointment_id(appointment_code, time_slot:slot_id(date,start_time)), patient:patient_id(id,name,email,avatar_url)').eq('doctor_id', doctorData.id).order('created_at', { ascending: false }); if (data) setDoctorPayments(data); };
  const handlePatientCheckin = async () => {
    if (!checkinCode.trim()) { setCheckinError('Please enter a code'); return; }
    setCheckinLoading(true); setCheckinError(''); setCheckinResult(null);
    setCheckinReportTitle(''); setCheckinReportDesc(''); setCheckinReportFile(null); setCheckinReportSuccess(false);
    try {
      const { data: apt, error } = await supabase
        .from('appointments')
        .select('*, patient:patient_id(id,name,email,phone,age,gender,blood_group,address,avatar_url), time_slot:slot_id(date,start_time,end_time)')
        .eq('appointment_code', checkinCode.trim().toUpperCase())
        .eq('doctor_id', doctorData.id)
        .single();
      if (error || !apt) { setCheckinError('Invalid or unrecognized code. Please check and try again.'); }
      else {
        const { data: health } = await supabase.from('patient_health_details').select('*').eq('patient_id', apt.patient_id).single();
        setCheckinResult({ ...apt, healthDetails: health });
      }
    } catch { setCheckinError('Failed to look up patient.'); }
    finally { setCheckinLoading(false); }
  };

  const handleCheckinAddReport = async () => {
    if (!checkinReportTitle.trim() || !checkinResult) { alert('Please enter a title'); return; }
    setCheckinReportSaving(true);
    try {
      let documentUrl = null, documentName = null;
      if (checkinReportFile) {
        const ext = checkinReportFile.name.split('.').pop();
        const path = `${checkinResult.patient_id}/${Date.now()}.${ext}`;
        const { error: upErr } = await supabase.storage.from('documents').upload(path, checkinReportFile);
        if (upErr) throw upErr;
        const { data: urlData } = await supabase.storage.from('documents').createSignedUrl(path, 60 * 60 * 24 * 365);
        documentUrl = urlData?.signedUrl;
        documentName = checkinReportFile.name;
      }
      const { error } = await supabase.from('medical_records').insert([{
        patient_id: checkinResult.patient_id,
        doctor_id: doctorData.id,
        appointment_id: checkinResult.id,
        record_type: checkinReportType,
        title: checkinReportTitle,
        description: checkinReportDesc,
        document_url: documentUrl,
        document_name: documentName,
      }]);
      if (error) throw error;
      await supabase.from('notifications').insert([{
        user_id: checkinResult.patient_id,
        type: 'new_record',
        title: 'New Medical Record Added',
        message: `Dr. ${doctorData.name} added: ${checkinReportTitle}`,
        related_id: checkinResult.id,
      }]);
      await supabase.from('appointments').update({ status: 'completed' }).eq('id', checkinResult.id);
      setCheckinResult(prev => ({ ...prev, status: 'completed' }));
      setCheckinReportSuccess(true);
      setCheckinReportTitle(''); setCheckinReportDesc(''); setCheckinReportFile(null);
      fetchAppointments();
    } catch (e) { alert('Failed to save: ' + e.message); }
    finally { setCheckinReportSaving(false); }
  };
  const checkAuth = async () => { try { const userRole = localStorage.getItem('userRole'); const userId = localStorage.getItem('userId'); if (userRole !== 'doctor' || !userId) { router.push('/Login'); return; } const { data: { user } } = await supabase.auth.getUser(); if (!user) { router.push('/Login'); return; } const userData = await getUserRole(user.id); if (!userData || userData.role !== 'doctor') { router.push('/Login'); return; } setDoctorData(userData); setIsApproved(userData.is_approved === true); setProfileCompleted(userData.profile_completed === true); setIsAuthenticated(true); } catch { router.push('/Login'); } finally { setLoading(false); } };
  const fetchAppointments = async () => { try { const { data } = await supabase.from('appointments').select('*, patient:patient_id(id,name,email,phone,age,gender,blood_group,address,avatar_url), time_slot:slot_id(date,start_time,end_time)').eq('doctor_id', doctorData.id).order('created_at', { ascending: false }); setAppointments(data || []); } catch (e) { console.error(e); } };
  const fetchAllPatients = async () => { try { const { data } = await supabase.from('appointments').select('patient:patient_id(id,name,email,phone,age,gender,blood_group,address,avatar_url)').eq('doctor_id', doctorData.id); if (data) { const seen = new Set(); const unique = []; data.forEach(d => { if (d.patient && !seen.has(d.patient.id)) { seen.add(d.patient.id); unique.push(d.patient); } }); setAllPatients(unique); } } catch (e) { console.error(e); } };
  const fetchTimeSlots = async () => { try { const today = new Date().toISOString().split('T')[0]; await supabase.from('time_slots').update({ is_available: false }).eq('doctor_id', doctorData.id).lt('date', today).eq('is_available', true); const { data } = await supabase.from('time_slots').select('*').eq('doctor_id', doctorData.id).gte('date', today).order('date', { ascending: true }).order('start_time', { ascending: true }); setTimeSlots(data || []); } catch (e) { console.error(e); } };
  const handleCreateTimeSlot = async () => { if (!slotDate || !slotStartTime || !slotEndTime) { alert('Please fill all fields'); return; } if (slotStartTime >= slotEndTime) { alert('End time must be after start time'); return; } setSlotLoading(true); try { const { error } = await supabase.from('time_slots').insert([{ doctor_id: doctorData.id, date: slotDate, start_time: slotStartTime + ':00', end_time: slotEndTime + ':00', max_patients: maxPatients, current_patients: 0, is_available: true }]); if (error) throw error; alert('Time slot created!'); setShowCreateSlotModal(false); setSlotDate(''); setSlotStartTime(''); setSlotEndTime(''); setMaxPatients(1); fetchTimeSlots(); } catch { alert('Failed to create time slot.'); } finally { setSlotLoading(false); } };
  const handleBulkCreateSlots = async () => { if (!bulkStartDate || !bulkEndDate || !selectedDays.length || !bulkTimeSlots.length) { alert('Fill all required fields'); return; } if (new Date(bulkStartDate) > new Date(bulkEndDate)) { alert('End date must be after start date'); return; } setSlotLoading(true); try { const slotsToCreate = []; for (let d = new Date(bulkStartDate); d <= new Date(bulkEndDate); d.setDate(d.getDate() + 1)) { if (selectedDays.includes(d.getDay())) { const ds = d.toISOString().split('T')[0]; bulkTimeSlots.forEach(s => { if (s.startTime && s.endTime && s.startTime < s.endTime) slotsToCreate.push({ doctor_id: doctorData.id, date: ds, start_time: s.startTime + ':00', end_time: s.endTime + ':00', max_patients: maxPatients, current_patients: 0, is_available: true }); }); } } if (!slotsToCreate.length) { alert('No valid slots to create'); return; } const { error } = await supabase.from('time_slots').insert(slotsToCreate); if (error) throw error; alert(`Created ${slotsToCreate.length} time slots!`); setBulkCreateMode(false); setShowCreateSlotModal(false); setBulkStartDate(''); setBulkEndDate(''); setSelectedDays([]); setBulkTimeSlots([{ startTime: '09:00', endTime: '10:00' }]); fetchTimeSlots(); } catch { alert('Failed to create slots.'); } finally { setSlotLoading(false); } };
  const handleDeleteTimeSlot = async (slotId, hasApts) => { if (hasApts) { alert('Cannot delete a slot with existing appointments'); return; } if (!confirm('Delete this time slot?')) return; try { const { error } = await supabase.from('time_slots').delete().eq('id', slotId); if (error) throw error; fetchTimeSlots(); } catch { alert('Failed to delete slot.'); } };
  const computeTokens = (slotApts, startTime, endTime) => { const [sh, sm] = (startTime || '00:00').split(':').map(Number); const [eh, em] = (endTime || '01:00').split(':').map(Number); const total = (eh * 60 + em) - (sh * 60 + sm); const per = Math.max(Math.floor(total / Math.max(slotApts.length, 1)), 1); return slotApts.map((apt, i) => { const mins = sh * 60 + sm + per * i; const rh = Math.floor(mins / 60) % 24; const rm = mins % 60; return { id: apt.id, tokenNumber: i + 1, reportTime: `${rh % 12 || 12}:${String(rm).padStart(2, '0')} ${rh >= 12 ? 'PM' : 'AM'}` }; }); };
  const sendStatusEmail = async (apt, status, token, reportTime) => { const isConfirmed = status === 'confirmed'; const dateStr = apt.time_slot?.date ? new Date(apt.time_slot.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) : '—'; const html = `<div style="font-family:sans-serif;max-width:540px;margin:0 auto;"><div style="background:${isConfirmed ? '#0f766e' : '#dc2626'};padding:28px 32px;"><h1 style="color:#fff;font-size:20px;margin:0;">${isConfirmed ? 'Appointment Confirmed ✓' : 'Appointment Rejected'}</h1></div><div style="padding:28px 32px;"><p>Hi ${apt.patient?.name},</p><p>Date: ${dateStr}${isConfirmed && token ? ` · Token #${token} · Report at ${reportTime}` : ''}</p></div></div>`; try { await fetch('/api/send-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ to: apt.patient?.email, subject: `Appointment ${isConfirmed ? 'Confirmed' : 'Rejected'} — AMRT`, html }) }); } catch { } };
  const handleUpdateAppointmentStatus = async (appointmentId, newStatus) => { try { if (newStatus === 'confirmed') { const apt = appointments.find(a => a.id === appointmentId); if (!apt) return; await supabase.from('appointments').update({ status: 'confirmed' }).eq('id', appointmentId); const { data: slotApts } = await supabase.from('appointments').select('id,created_at,patient_id,patient:patient_id(name,email)').eq('slot_id', apt.slot_id).eq('status', 'confirmed').order('created_at', { ascending: true }); const tokens = computeTokens(slotApts || [], apt.time_slot?.start_time, apt.time_slot?.end_time); for (const t of tokens) await supabase.from('appointments').update({ token_number: t.tokenNumber, report_time: t.reportTime }).eq('id', t.id); const myToken = tokens.find(t => t.id === appointmentId); const dateStr = apt.time_slot?.date ? new Date(apt.time_slot.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''; try { await supabase.from('notifications').insert([{ user_id: apt.patient_id, type: 'appointment_confirmed', title: 'Appointment Confirmed 🎉', message: `Dr. ${doctorData.name} confirmed your appointment on ${dateStr}. Token #${myToken?.tokenNumber}`, related_id: appointmentId, is_read: false }]); } catch { } await sendStatusEmail(apt, 'confirmed', myToken?.tokenNumber, myToken?.reportTime); } else if (newStatus === 'cancelled') { const apt = appointments.find(a => a.id === appointmentId); await supabase.from('appointments').update({ status: 'cancelled', token_number: null, report_time: null }).eq('id', appointmentId); if (apt) { try { await supabase.from('notifications').insert([{ user_id: apt.patient_id, type: 'appointment_rejected', title: 'Appointment Rejected', message: `Dr. ${doctorData.name} rejected your appointment.`, related_id: appointmentId, is_read: false }]); } catch { } await sendStatusEmail(apt, 'cancelled', null, null); } } else { await supabase.from('appointments').update({ status: newStatus }).eq('id', appointmentId); } fetchAppointments(); } catch (e) { alert('Failed to update: ' + e.message); } };
  const handleAddMedicalRecord = async () => { if (!recordTitle) { alert('Please enter a title'); return; } setUploading(true); try { let documentUrl = null, documentName = null; if (fileToUpload) { const ext = fileToUpload.name.split('.').pop(); const path = `${selectedAppointment.patient_id}/${Date.now()}.${ext}`; const { error: upErr } = await supabase.storage.from('documents').upload(path, fileToUpload); if (upErr) throw upErr; const { data: urlData } = await supabase.storage.from('documents').createSignedUrl(path, 60 * 60 * 24 * 365); documentUrl = urlData?.signedUrl; documentName = fileToUpload.name; } const { error } = await supabase.from('medical_records').insert([{ patient_id: selectedAppointment.patient_id, doctor_id: doctorData.id, appointment_id: selectedAppointment.id, record_type: recordType, title: recordTitle, description: recordDescription, document_url: documentUrl, document_name: documentName }]); if (error) throw error; try { await supabase.from('notifications').insert([{ user_id: selectedAppointment.patient_id, type: 'new_record', title: 'New Medical Record', message: `Dr. ${doctorData.name} added: ${recordTitle}`, related_id: selectedAppointment.id }]); } catch { } await supabase.from('appointments').update({ status: 'completed' }).eq('id', selectedAppointment.id); alert('Record saved!'); setShowRecordModal(false); setRecordTitle(''); setRecordDescription(''); setFileToUpload(null); setSelectedAppointment(null); fetchAppointments(); } catch (e) { alert('Failed: ' + e.message); } finally { setUploading(false); } };
  const searchLocation2 = async () => { if (!profileForm.clinic_place_name?.trim()) return; setLocating2(true); try { const res = await fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(profileForm.clinic_place_name)}&format=json&limit=1`); const data = await res.json(); if (data.length) { const place = data[0]; const lat = parseFloat(place.lat).toFixed(6); const lng = parseFloat(place.lon).toFixed(6); setProfileForm(f => ({ ...f, clinic_lat: lat, clinic_lng: lng, clinic_address: place.display_name })); setMapUrl2(`https://maps.google.com/maps?q=${lat},${lng}&z=15&output=embed`); } } catch { } finally { setLocating2(false); } };
  const handleSaveProfile = async () => { setSavingProfile(true); setProfileSaveMsg(''); try { const { data: { user } } = await supabase.auth.getUser(); if (!user) throw new Error('Not authenticated'); const uid = user.id; let avatarUrl = doctorData.avatar_url; let certUrl = doctorData.certificate_url; let certName = doctorData.certificate_name; if (newAvatarFile) { const ext = newAvatarFile.name.split('.').pop().toLowerCase(); const path = `${uid}/avatar.${ext}`; const { error: upErr } = await supabase.storage.from('avatars').upload(path, newAvatarFile, { upsert: true, contentType: newAvatarFile.type }); if (upErr) throw new Error('Avatar upload failed: ' + upErr.message); const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path); avatarUrl = pub.publicUrl; } if (newCertFile) { const ext = newCertFile.name.split('.').pop().toLowerCase(); const path = `${uid}/certificate.${ext}`; const { error: cErr } = await supabase.storage.from('certificates').upload(path, newCertFile, { upsert: true, contentType: newCertFile.type }); if (cErr) throw new Error('Certificate upload failed: ' + cErr.message); const { data: signed } = await supabase.storage.from('certificates').createSignedUrl(path, 60 * 60 * 24 * 365 * 5); certUrl = signed.signedUrl; certName = newCertFile.name; } const payload = { name: profileForm.name, phone: profileForm.phone, specialization: profileForm.specialization, experience_years: profileForm.experience_years ? parseInt(profileForm.experience_years) : null, experience_details: profileForm.experience_details || null, languages: profileForm.languages || null, consultation_fee: profileForm.consultation_fee ? parseFloat(profileForm.consultation_fee) : null, clinic_place_name: profileForm.clinic_place_name || null, clinic_address: profileForm.clinic_address || null, clinic_lat: profileForm.clinic_lat ? parseFloat(profileForm.clinic_lat) : null, clinic_lng: profileForm.clinic_lng ? parseFloat(profileForm.clinic_lng) : null, avatar_url: avatarUrl, certificate_url: certUrl, certificate_name: certName, updated_at: new Date().toISOString() }; const { error } = await supabase.from('users').update(payload).eq('id', doctorData.id); if (error) throw error; setDoctorData({ ...doctorData, ...payload }); setIsEditingProfile(false); setNewAvatarFile(null); setNewAvatarPreview(null); setNewCertFile(null); setProfileSaveMsg('Profile updated successfully!'); } catch (e) { setProfileSaveMsg('Error: ' + e.message); } finally { setSavingProfile(false); } };
  const handleLogout = async () => { await supabase.auth.signOut(); localStorage.clear(); router.push('/Login'); };
  const formatTime = (t) => { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; };
  const formatDate = (d) => { if (!d) return ''; return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); };
  const todayStr = new Date().toISOString().split('T')[0];
  const todayAppointments = appointments.filter(a => a.time_slot?.date === todayStr && (a.status === 'scheduled' || a.status === 'confirmed'));
  const upcomingAppointments = appointments.filter(a => (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.time_slot?.date) >= new Date().setHours(0, 0, 0, 0));
  const availableSlots = timeSlots.filter(s => s.is_available);
  const daysOfWeek = [{ value: 0, label: 'Sunday' }, { value: 1, label: 'Monday' }, { value: 2, label: 'Tuesday' }, { value: 3, label: 'Wednesday' }, { value: 4, label: 'Thursday' }, { value: 5, label: 'Friday' }, { value: 6, label: 'Saturday' }];
  const inp = 'w-full px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500';
  const filteredApts = aptTab === 'all' ? appointments : aptTab === 'pending' ? appointments.filter(a => a.status === 'scheduled') : aptTab === 'confirmed' ? appointments.filter(a => a.status === 'confirmed') : aptTab === 'completed' ? appointments.filter(a => a.status === 'completed') : appointments.filter(a => a.status === 'cancelled');

  if (loading) return (<div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="flex flex-col items-center"><img src="/amrt-logo.png" alt="AMRT" className="w-48 h-auto object-contain mb-6" /><div className="animate-spin rounded-full h-9 w-9 border-b-2 border-teal-600" /><p className="mt-3 text-sm text-gray-500">Loading…</p></div></div>);
  if (!isAuthenticated) return null;
  if (!isApproved) return (<div className="min-h-screen bg-gray-50"><header className="bg-white border-b border-gray-200"><div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between"><img src="/amrt-logo.png" alt="AMRT" className="w-40 h-auto object-contain" /><button onClick={handleLogout} className="text-sm text-red-500 px-3 py-2 rounded-lg hover:bg-red-50 transition">Sign out</button></div></header><main className="max-w-2xl mx-auto px-4 py-16"><div className="bg-white rounded-xl shadow-sm p-8 text-center"><div className="w-20 h-20 bg-yellow-100 rounded-full flex items-center justify-center mx-auto mb-5"><Icon d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" className="w-10 h-10 text-yellow-600" /></div><h2 className="text-2xl font-bold text-gray-900 mb-3">Account Pending Approval</h2><p className="text-gray-600 text-sm leading-relaxed mb-6">Your account is under review. This page updates automatically when approved.</p><div className="flex items-center justify-center space-x-2"><div className="w-2.5 h-2.5 bg-yellow-400 rounded-full animate-pulse" /><span className="text-sm text-yellow-700 font-medium">Listening for approval…</span></div></div></main></div>);
  if (isApproved && !profileCompleted) return <ProfileCompletion doctorData={doctorData} onComplete={(updated) => { setDoctorData(updated); setProfileCompleted(true); }} />;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-gray-100 z-40 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100"><img src="/amrt-logo.png" alt="AMRT" className="h-10 w-auto object-contain" onError={e => { e.target.style.display = 'none'; }} /></div>
        <div className="px-4 py-4 border-b border-gray-100"><div className="flex items-center space-x-3">{doctorData?.avatar_url ? <img src={doctorData.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-teal-200" /> : <div className="w-10 h-10 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center"><span className="text-white font-bold">{doctorData?.name?.charAt(0)}</span></div>}<div className="min-w-0"><p className="text-sm font-bold text-gray-900 truncate">Dr. {doctorData?.name}</p><p className="text-xs text-gray-400 truncate">{doctorData?.specialization}</p></div></div></div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {[
            { id: 'dashboard', label: 'Dashboard', icon: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
            { id: 'appointments', label: 'Appointments', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', badge: upcomingAppointments.length },
            { id: 'patients', label: 'My Patients', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', badge: allPatients.length },
            { id: 'timeslots', label: 'Time Slots', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', badge: availableSlots.length },
            { id: 'payments', label: 'Payments', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
            { id: 'checkin', label: 'Patient Check-In', icon: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4' },
            { id: 'messages', label: 'Messages', icon: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z', badge: unreadMsgCount },
            { id: 'profile', label: 'My Profile', icon: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
          ].map(tab => (
            <button key={tab.id} onClick={() => { setCurrentView(tab.id); setIsEditingProfile(false); setProfileSaveMsg(''); if (tab.id === 'messages') setUnreadMsgCount(0); }}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-sm ${currentView === tab.id ? 'bg-teal-700 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
              <div className="flex items-center space-x-2.5"><Icon d={tab.icon} className="w-4 h-4 flex-shrink-0" /><span className="font-medium">{tab.label}</span></div>
              {tab.badge > 0 && <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${currentView === tab.id ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'}`}>{tab.badge}</span>}
            </button>
          ))}
        </nav>
        <div className="px-3 pb-4"><button onClick={handleLogout} className="w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-sm text-red-500 hover:bg-red-50 transition"><Icon d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-4 h-4" /><span className="font-medium">Sign Out</span></button></div>
      </aside>

      {/* Main */}
      <main className={`ml-60 ${currentView === 'checkin' ? 'h-screen flex flex-col overflow-hidden' : 'min-h-screen'}`}>
        <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div className="px-7 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-gray-900">
                {currentView === 'dashboard' && `Welcome, Dr. ${doctorData?.name?.split(' ')[0]}`}
                {currentView === 'appointments' && 'Appointments'}
                {currentView === 'patients' && 'My Patients'}
                {currentView === 'timeslots' && 'Time Slots'}
                {currentView === 'payments' && 'Payment Tracking'}
                {currentView === 'checkin' && 'Patient Check-In'}
                {currentView === 'messages' && 'Patient Messages'}
                {currentView === 'profile' && 'My Profile'}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <span className="flex items-center space-x-1.5 bg-green-50 text-green-700 text-xs font-semibold px-3 py-1.5 rounded-full border border-green-200">
              <span className="w-2 h-2 bg-green-500 rounded-full" /><span>Active</span>
            </span>
          </div>
        </header>

        {/* ═══════ MESSAGES ═══════ */}
        {currentView === 'messages' && doctorData && <DoctorMessagesView doctorData={doctorData} onReadMessages={() => setUnreadMsgCount(0)} />}

        {/* ═══════ OTHER VIEWS (non-fullscreen) ═══════ */}
        {currentView !== 'messages' && currentView !== 'checkin' && (
          <div className="p-7">
            {/* ═══════ DASHBOARD ═══════ */}
            {currentView === 'dashboard' && (() => {
              const completedApts = appointments.filter(a => a.status === 'completed');
              const cancelledApts = appointments.filter(a => a.status === 'cancelled');
              const scheduledApts = appointments.filter(a => a.status === 'scheduled');
              const totalRevenue = completedApts.length * (doctorData?.consultation_fee || 0);
              const thisMonthStr = new Date().toISOString().slice(0, 7);
              const thisMonthApts = appointments.filter(a => a.time_slot?.date?.startsWith(thisMonthStr));
              const thisMonthRevenue = thisMonthApts.filter(a => a.status === 'completed').length * (doctorData?.consultation_fee || 0);
              const completionRate = appointments.length > 0 ? Math.round((completedApts.length / appointments.length) * 100) : 0;
              const recentPatients = [...allPatients].slice(0, 5);
              return (
                <div className="space-y-6">

                  {/* ── Hero banner ── */}
                  <div className="relative bg-gradient-to-br from-teal-700 via-teal-600 to-teal-500 rounded-2xl p-6 text-white overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/4" />
                    <div className="absolute bottom-0 right-16 w-32 h-32 bg-white/5 rounded-full translate-y-1/2" />
                    <div className="relative flex items-start justify-between gap-4">
                      <div className="flex items-center space-x-4">
                        {doctorData?.avatar_url
                          ? <img src={doctorData.avatar_url} alt="" className="w-16 h-16 rounded-2xl object-cover ring-2 ring-white/30 shadow-lg flex-shrink-0" />
                          : <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-2xl">{doctorData?.name?.charAt(0)}</span></div>}
                        <div>
                          <p className="text-teal-200 text-xs font-semibold uppercase tracking-wider mb-0.5">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}</p>
                          <h2 className="text-xl font-bold">Dr. {doctorData?.name}</h2>
                          <p className="text-teal-100 text-sm mt-0.5">{doctorData?.specialization}</p>
                          <div className="flex flex-wrap items-center gap-3 mt-2">
                            {doctorData?.clinic_place_name && (
                              <span className="inline-flex items-center gap-1 text-teal-200 text-xs">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                {doctorData.clinic_place_name}
                              </span>
                            )}
                            {doctorData?.experience_years && (
                              <span className="inline-flex items-center gap-1 text-teal-200 text-xs">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" /></svg>
                                {doctorData.experience_years} yrs exp
                              </span>
                            )}
                            {doctorData?.consultation_fee && (
                              <span className="inline-flex items-center gap-1 text-teal-200 text-xs">
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                ₹{doctorData.consultation_fee}/consult
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="text-teal-200 text-xs">Doctor ID</p>
                        <p className="text-white font-bold text-sm">{doctorData?.doctor_id || '—'}</p>
                        <span className="inline-flex items-center gap-1 mt-2 bg-white/20 text-white text-[10px] font-semibold px-2 py-1 rounded-full">
                          <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /> Active
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* ── Main stats row ── */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: "Today's Appointments", value: todayAppointments.length, sub: `${scheduledApts.filter(a => a.time_slot?.date === todayStr).length} pending`, icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', color: 'bg-blue-50 text-blue-600', border: 'border-l-blue-500' },
                      { label: 'Total Patients', value: allPatients.length, sub: `${thisMonthApts.length > 0 ? thisMonthApts.filter((v, i, a) => a.findIndex(t => t.patient_id === v.patient_id) === i).length : 0} this month`, icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', color: 'bg-teal-50 text-teal-600', border: 'border-l-teal-500' },
                      { label: 'Completed', value: completedApts.length, sub: `${completionRate}% completion rate`, icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z', color: 'bg-green-50 text-green-600', border: 'border-l-green-500' },
                      { label: 'Total Revenue', value: `₹${totalRevenue.toLocaleString('en-IN')}`, sub: `₹${thisMonthRevenue.toLocaleString('en-IN')} this month`, icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', color: 'bg-amber-50 text-amber-600', border: 'border-l-amber-500' },
                    ].map(s => (
                      <div key={s.label} className={`bg-white rounded-xl p-5 border border-gray-100 border-l-4 ${s.border} hover:shadow-sm transition-shadow`}>
                        <div className="flex items-start justify-between mb-3">
                          <div className={`w-9 h-9 ${s.color} rounded-xl flex items-center justify-center`}>
                            <Icon d={s.icon} className="w-4.5 h-4.5" />
                          </div>
                        </div>
                        <h3 className="text-2xl font-bold text-gray-900">{s.value}</h3>
                        <p className="text-xs font-semibold text-gray-600 mt-0.5">{s.label}</p>
                        <p className="text-[11px] text-gray-400 mt-0.5">{s.sub}</p>
                      </div>
                    ))}
                  </div>

                  {/* ── Secondary stats ── */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-sm transition-shadow">
                      <p className="text-2xl font-bold text-purple-700">{upcomingAppointments.length}</p>
                      <p className="text-xs font-semibold text-gray-600 mt-1">Upcoming</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Confirmed + Pending</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-sm transition-shadow">
                      <p className="text-2xl font-bold text-orange-600">{availableSlots.length}</p>
                      <p className="text-xs font-semibold text-gray-600 mt-1">Open Slots</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Available for booking</p>
                    </div>
                    <div className="bg-white rounded-xl border border-gray-100 p-4 text-center hover:shadow-sm transition-shadow">
                      <p className="text-2xl font-bold text-red-500">{cancelledApts.length}</p>
                      <p className="text-xs font-semibold text-gray-600 mt-1">Cancelled</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Total cancellations</p>
                    </div>
                  </div>

                  {/* ── Today's appointments table + Recent patients ── */}
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

                    {/* Today's appointments — 2/3 width */}
                    <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                        <div>
                          <h2 className="text-sm font-bold text-gray-900">Today's Appointments</h2>
                          <p className="text-[11px] text-gray-400 mt-0.5">{new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</p>
                        </div>
                        <button onClick={() => setCurrentView('appointments')} className="text-xs text-teal-600 font-semibold hover:text-teal-700 transition">View all →</button>
                      </div>
                      {todayAppointments.length === 0 ? (
                        <div className="py-12 text-center">
                          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <Icon d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" className="w-5 h-5 text-gray-400" />
                          </div>
                          <p className="text-sm font-semibold text-gray-500">No appointments today</p>
                          <p className="text-xs text-gray-400 mt-0.5">Enjoy your day off!</p>
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 border-b border-gray-100">
                                {['Patient', 'Time', 'Token', 'Status', 'Actions'].map(h => (
                                  <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                              {todayAppointments.map(apt => (
                                <tr key={apt.id} className="hover:bg-gray-50 transition-colors">
                                  <td className="px-4 py-3">
                                    <button onClick={() => setViewingPatient(apt.patient)} className="flex items-center gap-2 hover:text-teal-700 transition text-left">
                                      {apt.patient?.avatar_url
                                        ? <img src={apt.patient.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-1 ring-teal-100" />
                                        : <div className="w-8 h-8 bg-gradient-to-br from-teal-600 to-teal-400 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-[10px]">{apt.patient?.name?.charAt(0)}</span></div>}
                                      <div>
                                        <span className="font-semibold text-gray-900 block">{apt.patient?.name}</span>
                                        <span className="text-gray-400 text-[10px]">{apt.patient?.age ? `${apt.patient.age}y` : ''}{apt.patient?.gender ? ` · ${apt.patient.gender}` : ''}</span>
                                      </div>
                                    </button>
                                  </td>
                                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap font-medium">{formatTime(apt.time_slot?.start_time)}</td>
                                  <td className="px-4 py-3">{apt.token_number ? <span className="bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold px-2 py-0.5 rounded-full">#{apt.token_number}</span> : <span className="text-gray-300">—</span>}</td>
                                  <td className="px-4 py-3"><StatusBadge status={apt.status} /></td>
                                  <td className="px-4 py-3">
                                    <div className="flex items-center gap-1.5">
                                      {apt.status === 'scheduled' && <>
                                        <button onClick={() => handleUpdateAppointmentStatus(apt.id, 'confirmed')} className="px-2.5 py-1 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition">Confirm</button>
                                        <button onClick={() => handleUpdateAppointmentStatus(apt.id, 'cancelled')} className="px-2.5 py-1 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition">Reject</button>
                                      </>}
                                      {apt.status === 'confirmed' && <button onClick={() => handleUpdateAppointmentStatus(apt.id, 'completed')} className="px-2.5 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition">Complete</button>}
                                      {(apt.status === 'scheduled' || apt.status === 'confirmed') && <button onClick={() => { setSelectedAppointment(apt); setShowRecordModal(true); }} className="px-2.5 py-1 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 transition">Record</button>}
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>

                    {/* Recent patients — 1/3 width */}
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                        <h2 className="text-sm font-bold text-gray-900">Recent Patients</h2>
                        <button onClick={() => setCurrentView('patients')} className="text-xs text-teal-600 font-semibold hover:text-teal-700 transition">All →</button>
                      </div>
                      {recentPatients.length === 0 ? (
                        <div className="py-10 text-center">
                          <p className="text-xs text-gray-400">No patients yet</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-gray-50">
                          {recentPatients.map(pat => (
                            <button key={pat.id} onClick={() => setViewingPatient(pat)}
                              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition text-left">
                              {pat.avatar_url
                                ? <img src={pat.avatar_url} alt="" className="w-9 h-9 rounded-full object-cover flex-shrink-0 ring-1 ring-teal-100" />
                                : <div className="w-9 h-9 bg-gradient-to-br from-teal-600 to-teal-400 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-xs">{pat.name?.charAt(0)}</span></div>}
                              <div className="min-w-0">
                                <p className="text-xs font-semibold text-gray-900 truncate">{pat.name}</p>
                                <p className="text-[11px] text-gray-400 truncate">{pat.age ? `${pat.age}y` : ''}{pat.gender ? ` · ${pat.gender}` : ''}{pat.blood_group ? ` · ${pat.blood_group}` : ''}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* ── No time slots warning ── */}
                  {timeSlots.length === 0 && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5 flex items-start space-x-3">
                      <Icon d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" className="w-5 h-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-semibold text-yellow-900 mb-1">No Time Slots Created</p>
                        <p className="text-sm text-yellow-800 mb-3">Create time slots so patients can book appointments with you.</p>
                        <button onClick={() => setShowCreateSlotModal(true)} className="px-4 py-2 bg-yellow-600 text-white text-sm font-semibold rounded-lg hover:bg-yellow-700 transition">Create Your First Time Slot</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* ═══════ APPOINTMENTS ═══════ */}
            {currentView === 'appointments' && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="border-b border-gray-100 px-5 flex items-center justify-between">
                  <div className="flex">{[['all', 'All', appointments.length], ['pending', 'Pending', appointments.filter(a => a.status === 'scheduled').length], ['confirmed', 'Confirmed', appointments.filter(a => a.status === 'confirmed').length], ['completed', 'Completed', appointments.filter(a => a.status === 'completed').length], ['cancelled', 'Cancelled', appointments.filter(a => a.status === 'cancelled').length]].map(([id, label, count]) => (<button key={id} onClick={() => setAptTab(id)} className={`px-4 py-3.5 text-xs font-semibold border-b-2 transition mr-1 ${aptTab === id ? 'border-teal-600 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{label} <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full ${aptTab === id ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-500'}`}>{count}</span></button>))}</div>
                </div>
                {filteredApts.length > 0 ? (
                  <div className="overflow-x-auto"><table className="w-full text-xs">
                    <thead><tr className="bg-gray-50 border-b border-gray-100">{['Patient', 'Date', 'Time', 'Token / Report', 'Symptoms', 'Status', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-50">{filteredApts.map(apt => (<tr key={apt.id} className="hover:bg-gray-50 transition-colors"><td className="px-4 py-3"><button onClick={() => setViewingPatient(apt.patient)} className="flex items-center gap-2 hover:text-teal-700 transition text-left">{apt.patient?.avatar_url ? <img src={apt.patient.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" /> : <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-[10px]">{apt.patient?.name?.charAt(0)}</span></div>}<div><p className="font-semibold text-gray-900 whitespace-nowrap">{apt.patient?.name}</p><p className="text-gray-400 text-[10px]">{apt.patient?.email}</p></div></button></td><td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(apt.time_slot?.date)}</td><td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatTime(apt.time_slot?.start_time)}</td><td className="px-4 py-3">{apt.token_number ? <div className="flex flex-col gap-1"><span className="bg-teal-50 text-teal-700 border border-teal-200 text-xs font-bold px-2 py-0.5 rounded-full whitespace-nowrap w-fit">#{apt.token_number}</span>{apt.report_time && <span className="bg-blue-50 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap w-fit">{apt.report_time}</span>}</div> : <span className="text-gray-300">—</span>}</td><td className="px-4 py-3 max-w-[140px]"><span className="text-gray-500 line-clamp-2">{apt.symptoms || '—'}</span></td><td className="px-4 py-3"><StatusBadge status={apt.status} /></td><td className="px-4 py-3"><div className="flex items-center gap-1.5 flex-wrap">{apt.status === 'scheduled' && <><button onClick={() => handleUpdateAppointmentStatus(apt.id, 'confirmed')} className="px-2.5 py-1 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 transition whitespace-nowrap">Confirm</button><button onClick={() => handleUpdateAppointmentStatus(apt.id, 'cancelled')} className="px-2.5 py-1 bg-red-500 text-white text-xs font-semibold rounded-lg hover:bg-red-600 transition whitespace-nowrap">Reject</button></>}{apt.status === 'confirmed' && <button onClick={() => handleUpdateAppointmentStatus(apt.id, 'completed')} className="px-2.5 py-1 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition whitespace-nowrap">Complete</button>}{(apt.status === 'scheduled' || apt.status === 'confirmed') && <button onClick={() => { setSelectedAppointment(apt); setShowRecordModal(true); }} className="px-2.5 py-1 bg-purple-600 text-white text-xs font-semibold rounded-lg hover:bg-purple-700 transition whitespace-nowrap">Add Record</button>}<button onClick={() => setViewingPatient(apt.patient)} className="px-2.5 py-1 bg-gray-100 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-200 transition whitespace-nowrap">View Patient</button></div></td></tr>))}</tbody>
                  </table></div>
                ) : (<div className="text-center py-16"><p className="text-sm font-semibold text-gray-500">No {aptTab === 'all' ? '' : aptTab} appointments</p></div>)}
              </div>
            )}

            {/* ═══════ MY PATIENTS ═══════ */}
            {currentView === 'patients' && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between"><h2 className="text-sm font-bold text-gray-900">All Patients ({allPatients.length})</h2></div>
                {allPatients.length > 0 ? (
                  <div className="overflow-x-auto"><table className="w-full text-xs">
                    <thead><tr className="bg-gray-50 border-b border-gray-100">{['Patient', 'Contact', 'Age / Gender', 'Blood Group', 'Address', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-gray-50">{allPatients.map(pt => (<tr key={pt.id} className="hover:bg-gray-50 transition-colors"><td className="px-4 py-3"><div className="flex items-center gap-2">{pt.avatar_url ? <img src={pt.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <div className="w-8 h-8 bg-gradient-to-br from-teal-500 to-teal-600 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-xs">{pt.name?.charAt(0)}</span></div>}<div><p className="font-semibold text-gray-900 whitespace-nowrap">{pt.name}</p><p className="text-gray-400 text-[10px]">{pt.email}</p></div></div></td><td className="px-4 py-3 text-gray-500">{pt.phone || '—'}</td><td className="px-4 py-3 text-gray-500">{pt.age ? `${pt.age} yrs` : '—'}{pt.gender ? ` · ${pt.gender}` : ''}</td><td className="px-4 py-3">{pt.blood_group ? <span className="px-2 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-semibold">{pt.blood_group}</span> : <span className="text-gray-300">—</span>}</td><td className="px-4 py-3 text-gray-500 max-w-[180px]"><span className="line-clamp-1">{pt.address || '—'}</span></td><td className="px-4 py-3"><button onClick={() => setViewingPatient(pt)} className="px-3 py-1.5 bg-teal-50 text-teal-700 text-xs font-semibold rounded-lg hover:bg-teal-100 transition">View Profile</button></td></tr>))}</tbody>
                  </table></div>
                ) : (<div className="text-center py-16"><p className="text-sm font-semibold text-gray-500">No patients yet</p><p className="text-xs text-gray-400 mt-1">Patients will appear here once they book appointments</p></div>)}
              </div>
            )}

            {/* ═══════ TIME SLOTS ═══════ */}
            {currentView === 'timeslots' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <div><h2 className="text-sm font-bold text-gray-900">Time Slots</h2><p className="text-xs text-gray-400 mt-0.5">{availableSlots.length} available slots</p></div>
                  <button onClick={() => setShowCreateSlotModal(true)} className="flex items-center space-x-2 px-4 py-2 bg-teal-700 text-white text-sm font-semibold rounded-xl hover:bg-teal-800 transition"><Icon d="M12 4v16m8-8H4" className="w-4 h-4" /><span>Create Slot</span></button>
                </div>
                {timeSlots.length > 0 ? (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto"><table className="w-full text-xs">
                      <thead><tr className="bg-gray-50 border-b border-gray-100">{['Date', 'Start', 'End', 'Max', 'Booked', 'Available', 'Actions'].map(h => <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-gray-50">{timeSlots.map(slot => { const slotApts = appointments.filter(a => a.slot_id === slot.id && a.status !== 'cancelled'); return (<tr key={slot.id} className="hover:bg-gray-50 transition-colors"><td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatDate(slot.date)}</td><td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatTime(slot.start_time)}</td><td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatTime(slot.end_time)}</td><td className="px-4 py-3 text-gray-500">{slot.max_patients}</td><td className="px-4 py-3">{slotApts.length > 0 ? <span className="text-blue-600 font-semibold">{slotApts.length}</span> : <span className="text-gray-300">0</span>}</td><td className="px-4 py-3">{slot.is_available ? <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[11px] font-semibold">Yes</span> : <span className="px-2 py-0.5 bg-red-50 text-red-600 border border-red-200 rounded-full text-[11px] font-semibold">No</span>}</td><td className="px-4 py-3"><button onClick={() => handleDeleteTimeSlot(slot.id, slotApts.length > 0)} className="px-2.5 py-1 text-red-500 text-xs font-semibold rounded-lg hover:bg-red-50 transition">Delete</button></td></tr>); })}</tbody>
                    </table></div>
                  </div>
                ) : (<div className="bg-white rounded-xl border border-gray-100 p-16 text-center"><p className="text-sm font-semibold text-gray-500 mb-1">No time slots yet</p><p className="text-xs text-gray-400 mb-5">Create time slots so patients can book appointments</p><button onClick={() => setShowCreateSlotModal(true)} className="px-5 py-2.5 bg-teal-700 text-white text-sm font-semibold rounded-xl hover:bg-teal-800 transition">Create First Slot</button></div>)}
              </div>
            )}

            {/* ═══════ PROFILE ═══════ */}
            {currentView === 'profile' && (
              <div className="p-7">
                {/* Breadcrumb */}
                <div className="flex items-center space-x-1.5 text-xs text-gray-400 mb-5">
                  <button onClick={() => setCurrentView('dashboard')} className="hover:text-gray-600 transition">Dashboard</button>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  <span className="text-gray-700 font-medium">My Profile</span>
                </div>

                <div className="w-full space-y-5">

                  {/* ── TOP CARD: Avatar + Info + Edit Profile ── */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="p-6 flex items-start space-x-6 border-b border-gray-50">

                      {/* Avatar with camera button */}
                      <div className="relative flex-shrink-0">
                        <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-gray-100">
                          {(newAvatarPreview || doctorData?.avatar_url) ? (
                            <img src={newAvatarPreview || doctorData.avatar_url} alt="Profile" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full bg-teal-700 flex items-center justify-center">
                              <span className="text-white font-bold text-3xl">{doctorData?.name?.charAt(0) || 'D'}</span>
                            </div>
                          )}
                        </div>
                        <label
                          title="Update profile photo"
                          className="absolute bottom-0.5 right-0.5 w-7 h-7 bg-teal-700 hover:bg-teal-800 rounded-full border-2 border-white flex items-center justify-center transition cursor-pointer">
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp" className="hidden"
                            onChange={e => { const f = e.target.files[0]; if (f) { setNewAvatarFile(f); const r = new FileReader(); r.onload = ev => setNewAvatarPreview(ev.target.result); r.readAsDataURL(f); } }} />
                        </label>
                      </div>

                      {/* Name / email / key stats */}
                      <div className="flex-1 min-w-0">
                        <h2 className="text-xl font-bold text-gray-900">Dr. {doctorData?.name}</h2>
                        <p className="text-sm text-gray-400 mt-0.5">{doctorData?.email}</p>
                        <div className="mt-4 grid grid-cols-3 gap-x-8 gap-y-3">
                          {[
                            { label: 'Specialization', value: doctorData?.specialization || '—' },
                            { label: 'Experience', value: doctorData?.experience_years ? `${doctorData.experience_years} yrs` : '—' },
                            { label: 'Fee', value: doctorData?.consultation_fee ? `₹${doctorData.consultation_fee}` : '—' },
                            { label: 'Status', value: 'Active', highlight: 'text-emerald-600' },
                            { label: 'Languages', value: doctorData?.languages || '—' },
                            { label: 'Doctor ID', value: doctorData?.doctor_id || '—' },
                          ].map((item, i) => (
                            <div key={i}>
                              <p className="text-xs text-gray-400">{item.label}</p>
                              <p className={`text-sm font-semibold mt-0.5 truncate ${item.highlight || 'text-gray-900'}`}>{item.value}</p>
                            </div>
                          ))}
                          {/* Location always visible */}
                          <div className="col-span-3 pt-2 border-t border-gray-50">
                            <div className="flex items-center gap-2">
                              <svg className="w-3.5 h-3.5 text-teal-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                              <p className="text-xs text-gray-400">Location</p>
                            </div>
                            {isEditingProfile ? (
                              <div className="mt-1.5 space-y-2">
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={profileForm.clinic_place_name || ''}
                                    onChange={e => setProfileForm(pf => ({ ...pf, clinic_place_name: e.target.value }))}
                                    onKeyDown={e => e.key === 'Enter' && searchLocation2()}
                                    placeholder="Search clinic or hospital name…"
                                    className="flex-1 px-3 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900"
                                  />
                                  <button onClick={searchLocation2} disabled={locating2}
                                    className="px-3 py-2 bg-teal-700 text-white rounded-xl text-xs font-semibold hover:bg-teal-800 transition disabled:opacity-60">
                                    {locating2 ? '…' : 'Search'}
                                  </button>
                                </div>
                                {profileForm.clinic_address && (
                                  <p className="text-xs text-gray-500 bg-gray-50 rounded-lg px-3 py-2">{profileForm.clinic_address}</p>
                                )}
                                {mapUrl2 && (
                                  <div className="rounded-xl overflow-hidden border border-gray-200">
                                    <iframe src={mapUrl2} width="100%" height="130" style={{ border: 0 }} allowFullScreen loading="lazy" title="Map" />
                                  </div>
                                )}
                              </div>
                            ) : doctorData?.clinic_place_name ? (
                              <div className="mt-1">
                                <p className="text-sm font-semibold text-gray-900">{doctorData.clinic_place_name}</p>
                                {doctorData.clinic_address && <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">{doctorData.clinic_address}</p>}
                              </div>
                            ) : (
                              <p className="text-sm text-gray-300 mt-0.5 italic">Not set — click Edit Profile to add your location</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Edit / Save buttons */}
                      <div className="flex-shrink-0">
                        {!isEditingProfile ? (
                          <button onClick={() => setIsEditingProfile(true)}
                            className="flex items-center space-x-1.5 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                            <span>Edit Profile</span>
                          </button>
                        ) : (
                          <div className="flex flex-col space-y-2">
                            <button onClick={handleSaveProfile} disabled={savingProfile}
                              className="px-4 py-2 bg-teal-700 text-white rounded-lg text-xs font-semibold hover:bg-teal-800 transition disabled:opacity-60">
                              {savingProfile ? 'Saving...' : 'Save Changes'}
                            </button>
                            <button onClick={() => { setIsEditingProfile(false); setNewAvatarFile(null); setNewAvatarPreview(null); setNewCertFile(null); setProfileSaveMsg(''); }}
                              className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg text-xs font-semibold hover:bg-gray-50 transition">
                              Cancel
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Save message banner */}
                    {profileSaveMsg && (
                      <div className={`px-6 py-3 text-xs font-semibold ${profileSaveMsg.startsWith('Error') ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700'}`}>
                        {profileSaveMsg}
                      </div>
                    )}

                    {/* Edit form — personal/professional fields */}
                    {isEditingProfile && (
                      <div className="p-6">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-4">Edit Professional Information</h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {[
                            { label: 'Full Name', key: 'name', type: 'text' },
                            { label: 'Phone Number', key: 'phone', type: 'tel' },
                            { label: 'Specialization', key: 'specialization', type: 'text' },
                            { label: 'Years of Experience', key: 'experience_years', type: 'number' },
                            { label: 'Consultation Fee (₹)', key: 'consultation_fee', type: 'number' },
                            { label: 'Languages Spoken', key: 'languages', type: 'text' },
                          ].map(f => (
                            <div key={f.key}>
                              <label className="block text-xs text-gray-400 mb-1.5 font-medium">{f.label}</label>
                              <input type={f.type} value={profileForm[f.key] || ''} onChange={e => setProfileForm(pf => ({ ...pf, [f.key]: e.target.value }))}
                                className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900" />
                            </div>
                          ))}
                          <div className="md:col-span-3">
                            <label className="block text-xs text-gray-400 mb-1.5 font-medium">Professional Summary</label>
                            <textarea value={profileForm.experience_details || ''} onChange={e => setProfileForm(pf => ({ ...pf, experience_details: e.target.value }))} rows={3}
                              className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900 resize-none" />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* ── CLINIC & CREDENTIALS CARD ── */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Clinic & Credentials</h3>
                        <p className="text-xs text-gray-400 mt-0.5">Location, map, certificate & professional summary</p>
                      </div>
                      {isEditingProfile && (
                        <span className="text-xs text-teal-600 font-semibold">Editing…</span>
                      )}
                    </div>

                    <div className="p-6 space-y-6">

                      {/* Professional Summary (view mode only — edit is in top card) */}
                      {!isEditingProfile && doctorData?.experience_details && (
                        <div>
                          <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Professional Summary</h4>
                          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                            <p className="text-xs leading-relaxed text-gray-700">{doctorData.experience_details}</p>
                          </div>
                        </div>
                      )}

                      {/* Clinic Location */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Clinic Location</h4>
                        {isEditingProfile ? (
                          <div className="space-y-3">
                            <div className="flex space-x-2">
                              <input type="text" value={profileForm.clinic_place_name || ''} onChange={e => setProfileForm(pf => ({ ...pf, clinic_place_name: e.target.value }))}
                                placeholder="Search clinic or hospital…"
                                className="flex-1 px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 text-gray-900" />
                              <button onClick={searchLocation2} disabled={locating2}
                                className="px-4 py-2 bg-teal-700 text-white rounded-xl text-xs font-semibold hover:bg-teal-800 transition disabled:opacity-60">
                                {locating2 ? '…' : 'Search'}
                              </button>
                            </div>
                            {mapUrl2 && (
                              <div className="rounded-xl overflow-hidden border border-gray-200">
                                <iframe src={mapUrl2} width="100%" height="160" style={{ border: 0 }} allowFullScreen loading="lazy" title="Map" />
                              </div>
                            )}
                          </div>
                        ) : doctorData?.clinic_place_name ? (
                          <>
                            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                              <p className="text-xs font-bold text-teal-500 uppercase tracking-wider mb-1">📍 Clinic</p>
                              <p className="text-sm font-semibold text-teal-900">{doctorData.clinic_place_name}</p>
                              {doctorData.clinic_address && <p className="text-xs text-teal-600 mt-0.5">{doctorData.clinic_address}</p>}
                            </div>
                            {doctorData?.clinic_lat && doctorData?.clinic_lng && (
                              <div className="mt-3 rounded-xl overflow-hidden border border-gray-200">
                                <iframe src={`https://maps.google.com/maps?q=${doctorData.clinic_lat},${doctorData.clinic_lng}&z=15&output=embed`} width="100%" height="200" style={{ border: 0 }} allowFullScreen loading="lazy" title="Clinic Map" />
                              </div>
                            )}
                          </>
                        ) : (
                          <p className="text-xs text-gray-300 py-2">No clinic location set. Click Edit Profile to add one.</p>
                        )}
                      </div>

                      {/* Medical Certificate */}
                      <div>
                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Medical Certificate</h4>
                        {isEditingProfile ? (
                          <label className="cursor-pointer flex items-center space-x-3 px-4 py-3 border-2 border-dashed border-gray-200 rounded-xl hover:border-teal-400 hover:bg-teal-50 transition">
                            <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                            <span className="text-sm text-gray-600">{newCertFile ? newCertFile.name : (doctorData?.certificate_name || 'Click to upload new certificate')}</span>
                            <input type="file" accept=".pdf,image/jpeg,image/jpg,image/png" className="hidden" onChange={e => { if (e.target.files[0]) setNewCertFile(e.target.files[0]); }} />
                          </label>
                        ) : doctorData?.certificate_url ? (
                          <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl p-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                                <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                              </div>
                              <div>
                                <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">Verified Certificate</p>
                                <p className="text-sm font-semibold text-blue-900">{doctorData.certificate_name || 'Medical Certificate'}</p>
                              </div>
                            </div>
                            <a href={doctorData.certificate_url} target="_blank" rel="noreferrer"
                              className="flex items-center space-x-1 px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              <span>View</span>
                            </a>
                          </div>
                        ) : (
                          <p className="text-xs text-gray-300 py-2">No certificate uploaded. Click Edit Profile to add one.</p>
                        )}
                      </div>

                    </div>
                  </div>

                  {/* ── QUICK STATS ROW ── */}
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { label: 'Total Appointments', value: appointments.length },
                      { label: 'Total Patients', value: allPatients.length },
                      { label: 'Time Slots Created', value: timeSlots.length },
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
          </div>
        )}

        {/* ═══════ PAYMENTS ═══════ */}
        {currentView !== 'messages' && currentView === 'payments' && (
          <div className="p-7 space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-4 gap-4">
              {[
                { label: 'Patients Paid', value: `₹${doctorPayments.reduce((s, p) => s + (p.total_amount || 0), 0).toLocaleString('en-IN')}`, color: 'border-l-blue-500' },
                { label: 'Platform Cut (5%)', value: `−₹${doctorPayments.reduce((s, p) => s + (p.platform_fee || 0), 0).toLocaleString('en-IN')}`, color: 'border-l-red-400' },
                { label: 'You Receive (95%)', value: `₹${doctorPayments.reduce((s, p) => s + (p.total_amount || 0) - (p.platform_fee || 0), 0).toLocaleString('en-IN')}`, color: 'border-l-teal-500' },
                { label: 'Transactions', value: doctorPayments.length, color: 'border-l-green-500' },
              ].map(s => (
                <div key={s.label} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${s.color} p-5`}>
                  <p className="text-xs font-semibold text-gray-500">{s.label}</p>
                  <h3 className="text-2xl font-bold text-gray-900 mt-1">{s.value}</h3>
                </div>
              ))}
            </div>

            {doctorPayments.length > 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50">
                  <h3 className="text-sm font-bold text-gray-900">Payment Records</h3>
                  <p className="text-[11px] text-gray-400 mt-0.5">5% platform fee deducted per appointment</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['#', 'Patient', 'Apt. Code', 'Date', 'Patient Paid', 'Platform (5%)', 'You Receive', 'Status'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {doctorPayments.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-300 font-medium">{idx + 1}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {p.patient?.avatar_url
                                ? <img src={p.patient.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                                : <div className="w-6 h-6 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white text-[9px] font-bold">{p.patient?.name?.charAt(0)}</span></div>}
                              <span className="font-semibold text-gray-800 whitespace-nowrap">{p.patient?.name || '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md text-[11px]">
                              {p.appointment?.appointment_code || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{p.appointment?.time_slot?.date ? new Date(p.appointment.time_slot.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</td>
                          <td className="px-4 py-3 font-bold text-blue-700">₹{p.total_amount}</td>
                          <td className="px-4 py-3 text-red-500 font-semibold">−₹{p.platform_fee}</td>
                          <td className="px-4 py-3 font-bold text-teal-700">₹{((p.total_amount || 0) - (p.platform_fee || 0)).toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[10px] font-bold uppercase">{p.status}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
                <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-3">
                  <Icon d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" className="w-7 h-7 text-teal-400" />
                </div>
                <p className="text-sm font-bold text-gray-800">No payments yet</p>
                <p className="text-xs text-gray-400 mt-1">Payments appear when patients book and pay for appointments</p>
              </div>
            )}
          </div>
        )}

        {/* ═══════ PATIENT CHECK-IN ═══════ */}
        {currentView === 'checkin' && (
          <div className="flex flex-1 overflow-hidden">

            {/* ── LEFT PANEL: Search + Patient Info ── */}
            <div className="w-[420px] flex-shrink-0 flex flex-col border-r border-gray-100 bg-white overflow-hidden">

              {/* Search header */}
              <div className="bg-white border-b border-gray-100 px-5 py-4 flex-shrink-0">
                <div className="flex items-center gap-2.5 mb-3">
                  <div className="w-7 h-7 bg-teal-50 border border-teal-100 rounded-lg flex items-center justify-center">
                    <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" className="w-3.5 h-3.5 text-teal-600" />
                  </div>
                  <div>
                    <h2 className="text-gray-900 font-bold text-sm">Patient Look-up</h2>
                    <p className="text-gray-400 text-[10px]">Enter appointment code to load patient record</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={checkinCode}
                    onChange={e => { setCheckinCode(e.target.value.toUpperCase()); setCheckinError(''); }}
                    onKeyDown={e => e.key === 'Enter' && handlePatientCheckin()}
                    placeholder="APT-XXXXXXXX"
                    className="flex-1 px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono font-bold text-gray-900 placeholder:text-gray-300 placeholder:font-normal placeholder:font-sans focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition"
                  />
                  <button
                    onClick={handlePatientCheckin}
                    disabled={checkinLoading || !checkinCode.trim()}
                    className="px-4 py-2.5 bg-teal-700 text-white rounded-xl text-sm font-bold hover:bg-teal-800 transition disabled:opacity-50 flex items-center gap-1.5 flex-shrink-0">
                    {checkinLoading
                      ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <Icon d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="w-4 h-4" />}
                    {checkinLoading ? '' : 'Search'}
                  </button>
                </div>
                {checkinError && (
                  <div className="mt-2.5 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700 font-medium flex items-center gap-1.5">
                    <Icon d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" className="w-3.5 h-3.5 flex-shrink-0 text-red-500" />
                    {checkinError}
                  </div>
                )}
              </div>

              {/* Patient details scroll area */}
              <div className="flex-1 overflow-y-auto">
                {!checkinResult ? (
                  <div className="flex flex-col items-center justify-center h-full text-center px-8 py-12">
                    <div className="w-16 h-16 bg-teal-50 rounded-2xl flex items-center justify-center mb-4">
                      <Icon d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" className="w-7 h-7 text-teal-400" />
                    </div>
                    <p className="text-sm font-bold text-gray-700">No patient loaded</p>
                    <p className="text-xs text-gray-400 mt-1 leading-relaxed">Enter the appointment code from the patient's confirmation email or notification</p>
                  </div>
                ) : (() => {
                  const apt = checkinResult;
                  const p = apt.patient;
                  const h = apt.healthDetails;
                  return (
                    <div className="p-4 space-y-3">

                      {/* Patient avatar + name */}
                      <div className="flex items-center gap-3 bg-teal-50 rounded-xl p-3 border border-teal-100">
                        {p?.avatar_url
                          ? <img src={p.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 ring-2 ring-teal-200" />
                          : <div className="w-12 h-12 bg-teal-700 rounded-xl flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-xl">{p?.name?.charAt(0)}</span></div>}
                        <div className="flex-1 min-w-0">
                          <p className="font-bold text-gray-900 text-sm truncate">{p?.name}</p>
                          <p className="text-xs text-teal-600 truncate">{p?.email}</p>
                          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                            {p?.age && <span className="text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-semibold">Age {p.age}</span>}
                            {p?.gender && <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full capitalize">{p.gender}</span>}
                            {p?.blood_group && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">{p.blood_group}</span>}
                          </div>
                        </div>
                        <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase flex-shrink-0 ${apt.status === 'confirmed' ? 'bg-green-100 text-green-700' : apt.status === 'completed' ? 'bg-teal-100 text-teal-700' : 'bg-gray-100 text-gray-600'}`}>
                          {apt.status}
                        </span>
                      </div>

                      {/* Appointment details */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <p className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">Date & Time</p>
                          <p className="text-xs font-bold text-gray-900">{apt.time_slot?.date ? new Date(apt.time_slot.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : '—'}</p>
                          <p className="text-xs text-teal-600 font-semibold">{formatTime(apt.time_slot?.start_time)}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <p className="text-[10px] text-gray-400 font-semibold uppercase mb-0.5">Contact</p>
                          <p className="text-xs font-bold text-gray-900">{p?.phone || '—'}</p>
                          <p className="text-[10px] text-gray-400 truncate">{p?.email}</p>
                        </div>
                      </div>

                      {/* Apt code */}
                      <div className="flex items-center justify-between bg-teal-700 rounded-xl px-3 py-2.5">
                        <p className="text-teal-200 text-[10px] font-semibold uppercase">Appointment Code</p>
                        <p className="text-white font-mono font-bold text-sm tracking-widest">{apt.appointment_code}</p>
                      </div>

                      {/* Symptoms & notes */}
                      {apt.symptoms && (
                        <div className="bg-amber-50 rounded-xl p-3 border border-amber-100">
                          <p className="text-[10px] text-amber-600 font-bold uppercase mb-1">Symptoms</p>
                          <p className="text-xs text-amber-900">{apt.symptoms}</p>
                        </div>
                      )}
                      {apt.notes && (
                        <div className="bg-blue-50 rounded-xl p-3 border border-blue-100">
                          <p className="text-[10px] text-blue-600 font-bold uppercase mb-1">Notes</p>
                          <p className="text-xs text-blue-900">{apt.notes}</p>
                        </div>
                      )}

                      {/* Health details */}
                      {h && (
                        <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                          <div className="px-3 py-2.5 bg-gray-50 border-b border-gray-100">
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Health Details</p>
                          </div>
                          <div className="p-3 space-y-2">
                            <div className="grid grid-cols-3 gap-2">
                              {[['Height', h.height_cm ? `${h.height_cm} cm` : '—'], ['Weight', h.weight_kg ? `${h.weight_kg} kg` : '—'], ['BMI', h.bmi || '—']].map(([l, v]) => (
                                <div key={l} className="bg-teal-50 rounded-lg p-2 text-center">
                                  <p className="text-[9px] text-teal-500 font-semibold">{l}</p>
                                  <p className="text-sm font-bold text-teal-800">{v}</p>
                                </div>
                              ))}
                            </div>
                            {[['Allergies', h.allergies], ['Chronic Conditions', h.chronic_conditions], ['Current Medications', h.current_medications]].map(([l, v]) => v ? (
                              <div key={l} className="bg-gray-50 rounded-lg p-2.5">
                                <p className="text-[9px] text-gray-400 font-semibold uppercase mb-0.5">{l}</p>
                                <p className="text-xs text-gray-800">{v}</p>
                              </div>
                            ) : null)}
                            {h.emergency_contact_name && (
                              <div className="bg-red-50 rounded-lg p-2.5 border border-red-100">
                                <div className="flex items-center gap-1.5 mb-1">
                                  <svg className="w-3 h-3 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                                  <p className="text-[9px] text-red-500 font-bold uppercase tracking-wider">Emergency Contact</p>
                                </div>
                                <p className="text-xs font-semibold text-gray-900">{h.emergency_contact_name} · {h.emergency_contact_phone}</p>
                                <p className="text-[10px] text-gray-400">{h.emergency_contact_relation}</p>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Address */}
                      {p?.address && (
                        <div className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                          <p className="text-[10px] text-gray-400 font-bold uppercase mb-0.5">Address</p>
                          <p className="text-xs text-gray-700">{p.address}</p>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* ── RIGHT PANEL: Add Report + Actions ── */}
            <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
              {!checkinResult ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-12">
                  <div className="w-20 h-20 bg-teal-100 rounded-3xl flex items-center justify-center mb-5">
                    <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-9 h-9 text-teal-500" />
                  </div>
                  <h3 className="text-base font-bold text-gray-700 mb-2">Ready for Check-In</h3>
                  <p className="text-sm text-gray-400 leading-relaxed max-w-xs">Search a patient by their appointment code on the left to add a medical report and manage the visit</p>
                </div>
              ) : (() => {
                const apt = checkinResult;
                const p = apt.patient;
                return (
                  <div className="flex-1 overflow-y-auto p-5 space-y-4">

                    {/* Top action bar */}
                    <div className="flex items-center justify-between">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Visit — {p?.name}</h3>
                        <p className="text-xs text-gray-400">{apt.time_slot?.date ? new Date(apt.time_slot.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''} · {formatTime(apt.time_slot?.start_time)}</p>
                      </div>
                      {apt.status === 'confirmed' && (
                        <button
                          onClick={async () => {
                            await supabase.from('appointments').update({ status: 'completed' }).eq('id', apt.id);
                            setCheckinResult(prev => ({ ...prev, status: 'completed' }));
                            fetchAppointments();
                          }}
                          className="px-4 py-2 bg-green-600 text-white rounded-xl text-xs font-bold hover:bg-green-700 transition flex items-center gap-1.5">
                          <Icon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-3.5 h-3.5" />
                          Mark Completed
                        </button>
                      )}
                      {apt.status === 'completed' && (
                        <span className="px-3 py-1.5 bg-teal-100 text-teal-700 rounded-xl text-xs font-bold flex items-center gap-1.5">
                          <Icon d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-3.5 h-3.5" />
                          Visit Completed
                        </span>
                      )}
                    </div>

                    {/* Success banner */}
                    {checkinReportSuccess && (
                      <div className="bg-teal-50 border border-teal-200 rounded-xl px-4 py-3 flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-teal-600 rounded-full flex items-center justify-center flex-shrink-0">
                          <Icon d="M5 13l4 4L19 7" className="w-3.5 h-3.5 text-white" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-teal-800">Report saved successfully!</p>
                          <p className="text-xs text-teal-600">Patient has been notified and appointment marked as completed.</p>
                        </div>
                        <button onClick={() => setCheckinReportSuccess(false)} className="ml-auto text-teal-400 hover:text-teal-600">
                          <Icon d="M6 18L18 6M6 6l12 12" className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {/* ADD REPORT FORM */}
                    <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                      <div className="px-5 py-3.5 border-b border-gray-100 flex items-center gap-2.5">
                        <div className="w-7 h-7 bg-teal-50 rounded-lg border border-teal-100 flex items-center justify-center flex-shrink-0">
                          <Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-3.5 h-3.5 text-teal-600" />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-gray-900">Medical Report</h4>
                          <p className="text-[10px] text-gray-400">Complete the fields and save to close this visit</p>
                        </div>
                      </div>
                      <div className="p-5 space-y-4">

                        {/* Record type pills */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Report Type</label>
                          <div className="flex flex-wrap gap-2">
                            {[['prescription', 'Prescription'], ['lab_report', 'Lab Report'], ['scan', 'Imaging / Scan'], ['diagnosis', 'Diagnosis'], ['other', 'Other']].map(([val, label]) => (
                              <button
                                key={val}
                                onClick={() => setCheckinReportType(val)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition border ${checkinReportType === val ? 'bg-teal-700 text-white border-teal-700' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-teal-300 hover:text-teal-700'}`}>
                                {label}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Title */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                            Title <span className="text-red-400 normal-case font-normal">*required</span>
                          </label>
                          <input
                            type="text"
                            value={checkinReportTitle}
                            onChange={e => setCheckinReportTitle(e.target.value)}
                            placeholder="e.g. Amoxicillin 500mg course, CBC Report..."
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-gray-50 text-gray-900"
                          />
                        </div>

                        {/* Description */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Clinical Notes</label>
                          <textarea
                            value={checkinReportDesc}
                            onChange={e => setCheckinReportDesc(e.target.value)}
                            placeholder="Dosage, instructions, observations, diagnosis details..."
                            rows={4}
                            className="w-full px-3.5 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent bg-gray-50 text-gray-900 resize-none"
                          />
                        </div>

                        {/* File upload */}
                        <div>
                          <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">Attachment <span className="text-gray-300 normal-case font-normal">(optional)</span></label>
                          <label className="relative block cursor-pointer group">
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" onChange={e => setCheckinReportFile(e.target.files[0])} />
                            <div className={`flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-dashed transition ${checkinReportFile ? 'border-teal-400 bg-teal-50' : 'border-gray-200 bg-gray-50 group-hover:border-teal-300 group-hover:bg-teal-50/50'}`}>
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${checkinReportFile ? 'bg-teal-700' : 'bg-gray-200'}`}>
                                <Icon d={checkinReportFile ? "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" : "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"} className={`w-4 h-4 ${checkinReportFile ? 'text-white' : 'text-gray-400'}`} />
                              </div>
                              <div className="flex-1 min-w-0">
                                {checkinReportFile
                                  ? <><p className="text-sm font-semibold text-teal-800 truncate">{checkinReportFile.name}</p><p className="text-xs text-teal-600">{(checkinReportFile.size / 1024).toFixed(1)} KB · Click to change</p></>
                                  : <><p className="text-sm font-medium text-gray-600">Click to attach file</p><p className="text-xs text-gray-400">PDF, JPG, PNG — max 5 MB</p></>}
                              </div>
                              {checkinReportFile && (
                                <button
                                  onClick={e => { e.preventDefault(); e.stopPropagation(); setCheckinReportFile(null); }}
                                  className="w-6 h-6 bg-red-100 hover:bg-red-200 rounded-full flex items-center justify-center flex-shrink-0 transition">
                                  <Icon d="M6 18L18 6M6 6l12 12" className="w-3 h-3 text-red-500" />
                                </button>
                              )}
                            </div>
                          </label>
                        </div>

                        {/* Save button */}
                        <button
                          onClick={handleCheckinAddReport}
                          disabled={checkinReportSaving || !checkinReportTitle.trim()}
                          className="w-full py-3 bg-teal-700 text-white rounded-xl text-sm font-bold hover:bg-teal-800 transition disabled:opacity-50 flex items-center justify-center gap-2">
                          {checkinReportSaving
                            ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</>
                            : <><Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-4 h-4" />Save Report & Complete Visit</>}
                        </button>

                        <p className="text-[11px] text-gray-400 text-center">Saving the report will automatically mark this appointment as completed and notify the patient.</p>
                      </div>
                    </div>

                  </div>
                );
              })()}
            </div>
          </div>
        )}

      </main>

      {/* CREATE SLOT MODAL */}
      {showCreateSlotModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white"><h3 className="text-lg font-bold text-gray-900">{bulkCreateMode ? 'Bulk Create Time Slots' : 'Create Time Slot'}</h3><button onClick={() => { setShowCreateSlotModal(false); setBulkCreateMode(false); }} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg></button></div>
            <div className="px-6 py-5">
              <div className="flex space-x-2 mb-6">{[['Single Slot', false], ['Bulk Create', true]].map(([label, val]) => (<button key={label} onClick={() => setBulkCreateMode(val)} className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition ${bulkCreateMode === val ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{label}</button>))}</div>
              {!bulkCreateMode ? (
                <div className="space-y-4">
                  <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Date</label><input type="date" value={slotDate} onChange={e => setSlotDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className={inp} /></div>
                  <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Time</label><input type="time" value={slotStartTime} onChange={e => setSlotStartTime(e.target.value)} className={inp} /></div><div><label className="block text-sm font-semibold text-gray-700 mb-1.5">End Time</label><input type="time" value={slotEndTime} onChange={e => setSlotEndTime(e.target.value)} className={inp} /></div></div>
                  <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Max Patients</label><input type="number" value={maxPatients} onChange={e => setMaxPatients(parseInt(e.target.value))} min="1" max="10" className={inp} /></div>
                  <div className="flex space-x-3 pt-2"><button onClick={() => setShowCreateSlotModal(false)} className="flex-1 py-2.5 text-sm font-semibold border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">Cancel</button><button onClick={handleCreateTimeSlot} disabled={slotLoading} className="flex-1 py-2.5 text-sm font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50">{slotLoading ? 'Creating…' : 'Create Slot'}</button></div>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 gap-4"><div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Start Date</label><input type="date" value={bulkStartDate} onChange={e => setBulkStartDate(e.target.value)} min={new Date().toISOString().split('T')[0]} className={inp} /></div><div><label className="block text-sm font-semibold text-gray-700 mb-1.5">End Date</label><input type="date" value={bulkEndDate} onChange={e => setBulkEndDate(e.target.value)} min={bulkStartDate || new Date().toISOString().split('T')[0]} className={inp} /></div></div>
                  <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Select Days</label><div className="grid grid-cols-4 gap-2 mt-1">{daysOfWeek.map(day => (<button key={day.value} onClick={() => setSelectedDays(prev => prev.includes(day.value) ? prev.filter(d => d !== day.value) : [...prev, day.value])} className={`py-2 text-xs font-semibold rounded-lg transition ${selectedDays.includes(day.value) ? 'bg-teal-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>{day.label.slice(0, 3)}</button>))}</div></div>
                  <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Time Slots</label><div className="space-y-2 mt-1">{bulkTimeSlots.map((slot, idx) => (<div key={idx} className="flex items-center space-x-2"><input type="time" value={slot.startTime} onChange={e => { const u = [...bulkTimeSlots]; u[idx].startTime = e.target.value; setBulkTimeSlots(u); }} className={`${inp} flex-1`} /><span className="text-gray-400">–</span><input type="time" value={slot.endTime} onChange={e => { const u = [...bulkTimeSlots]; u[idx].endTime = e.target.value; setBulkTimeSlots(u); }} className={`${inp} flex-1`} />{bulkTimeSlots.length > 1 && <button onClick={() => setBulkTimeSlots(bulkTimeSlots.filter((_, i) => i !== idx))} className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg"><Icon d="M6 18L18 6M6 6l12 12" className="w-4 h-4" /></button>}</div>))}<button onClick={() => setBulkTimeSlots([...bulkTimeSlots, { startTime: '', endTime: '' }])} className="mt-1 text-sm text-teal-600 font-semibold flex items-center space-x-1"><Icon d="M12 4v16m8-8H4" className="w-4 h-4" /><span>Add Another</span></button></div></div>
                  <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Max Patients per Slot</label><input type="number" value={maxPatients} onChange={e => setMaxPatients(parseInt(e.target.value))} min="1" max="10" className={inp} /></div>
                  <div className="flex space-x-3 pt-2"><button onClick={() => { setShowCreateSlotModal(false); setBulkCreateMode(false); }} className="flex-1 py-2.5 text-sm font-semibold border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">Cancel</button><button onClick={handleBulkCreateSlots} disabled={slotLoading} className="flex-1 py-2.5 text-sm font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50">{slotLoading ? 'Creating…' : 'Generate Schedule'}</button></div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MEDICAL RECORD MODAL */}
      {showRecordModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white"><h3 className="text-lg font-bold text-gray-900">Add Medical Record</h3><button onClick={() => { setShowRecordModal(false); setSelectedAppointment(null); setRecordTitle(''); setRecordDescription(''); setFileToUpload(null); }} className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition"><svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M6 18L18 6M6 6l12 12" /></svg></button></div>
            <div className="px-6 py-5 space-y-4">
              <div className="bg-blue-50 border border-blue-100 rounded-lg p-3 flex items-center space-x-3">{selectedAppointment.patient?.avatar_url ? <img src={selectedAppointment.patient.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" /> : <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">{selectedAppointment.patient?.name?.charAt(0)}</div>}<div><p className="text-sm font-semibold text-blue-900">{selectedAppointment.patient?.name}</p><p className="text-xs text-blue-600">{selectedAppointment.patient?.email}</p></div></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Record Type</label><select value={recordType} onChange={e => setRecordType(e.target.value)} className={inp}><option value="prescription">Prescription</option><option value="lab_report">Lab Report</option><option value="scan">Scan / X-Ray</option><option value="diagnosis">Diagnosis</option><option value="other">Other</option></select></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Title *</label><input type="text" value={recordTitle} onChange={e => setRecordTitle(e.target.value)} placeholder="e.g. Antibiotics Prescription" className={inp} /></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Description</label><textarea value={recordDescription} onChange={e => setRecordDescription(e.target.value)} rows={3} placeholder="Clinical notes…" className={`${inp} resize-none`} /></div>
              <div><label className="block text-sm font-semibold text-gray-700 mb-1.5">Attachment</label><label className="relative block cursor-pointer"><input type="file" className="absolute inset-0 opacity-0 w-full h-full cursor-pointer" onChange={e => setFileToUpload(e.target.files[0])} /><div className={`flex flex-col items-center justify-center py-6 rounded-lg border-2 border-dashed transition ${fileToUpload ? 'border-teal-400 bg-teal-50' : 'border-gray-300 hover:bg-gray-50'}`}>{fileToUpload ? <div className="flex items-center space-x-2 text-teal-700"><Icon d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-5 h-5" /><span className="text-sm font-medium">{fileToUpload.name}</span></div> : <><Icon d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" className="w-8 h-8 text-gray-400 mb-2" /><p className="text-sm text-gray-500">Click to upload PDF or image</p></>}</div></label></div>
              <div className="flex space-x-3 pt-2"><button onClick={() => { setShowRecordModal(false); setSelectedAppointment(null); setRecordTitle(''); setRecordDescription(''); setFileToUpload(null); }} className="flex-1 py-2.5 text-sm font-semibold border-2 border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition">Cancel</button><button onClick={handleAddMedicalRecord} disabled={uploading} className="flex-1 py-2.5 text-sm font-semibold bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition disabled:opacity-50">{uploading ? 'Saving…' : 'Save Record'}</button></div>
            </div>
          </div>
        </div>
      )}

      {/* PATIENT PROFILE MODAL */}
      {viewingPatient && <PatientProfileModal patient={viewingPatient} doctorId={doctorData?.id} onClose={() => setViewingPatient(null)} />}
    </div>
  );
}