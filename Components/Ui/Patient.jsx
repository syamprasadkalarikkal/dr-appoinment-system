'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabaseClient';
import { getUserRole } from '@/lib/getUserRole';

/* ──────────────────────────────────────────────────────────────
   UTILITY: Haversine distance (km) between two lat/lng points
────────────────────────────────────────────────────────────── */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLng = (lng2 - lng1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getRoomId(id1, id2) {
  return 'chat_' + [id1, id2].sort().join('_');
}

/* ══════════════════════════════════════════════════
   DOCTOR DETAIL MODAL — full profile + certificate + map + chat
══════════════════════════════════════════════════ */
function DoctorDetailModal({ doctor, onClose, onBook, onChat }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[92vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-700 to-teal-500 p-5 flex items-start justify-between">
          <div className="flex items-center space-x-4">
            {doctor.avatar_url
              ? <img src={doctor.avatar_url} alt="" className="w-16 h-16 rounded-xl object-cover ring-2 ring-white/30" />
              : <div className="w-16 h-16 bg-white/20 rounded-xl flex items-center justify-center"><span className="text-white font-bold text-2xl">{doctor.name?.charAt(0)}</span></div>}
            <div>
              <h2 className="text-lg font-bold text-white">Dr. {doctor.name}</h2>
              <p className="text-teal-100 text-sm font-medium">{doctor.specialization}</p>
              {doctor.experience_years && <p className="text-teal-200 text-xs mt-1">{doctor.experience_years} years experience</p>}
              {doctor._distance != null && (
                <span className="inline-flex items-center gap-1 mt-1 bg-white/20 text-white text-xs font-semibold px-2 py-0.5 rounded-full">
                  {doctor._distance.toFixed(1)} km away
                </span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* Stats */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-teal-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-teal-700">{doctor.experience_years || '—'}</p>
              <p className="text-xs text-teal-500 font-medium">Yrs Exp</p>
            </div>
            <div className="bg-amber-50 rounded-xl p-3 text-center">
              <p className="text-lg font-bold text-amber-700">{doctor.consultation_fee ? `₹${doctor.consultation_fee}` : '—'}</p>
              <p className="text-xs text-amber-500 font-medium">Fee</p>
            </div>
            <div className="bg-blue-50 rounded-xl p-3 text-center">
              <p className="text-sm font-bold text-blue-700 leading-tight">{doctor.languages || '—'}</p>
              <p className="text-xs text-blue-500 font-medium mt-0.5">Languages</p>
            </div>
          </div>

          {/* About */}
          {doctor.experience_details && (
            <div className="bg-gray-50 rounded-xl p-4">
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">About</p>
              <p className="text-sm text-gray-700 leading-relaxed">{doctor.experience_details}</p>
            </div>
          )}

          {/* Clinic location info */}
          {doctor.clinic_place_name && (
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
              <p className="text-xs font-bold text-teal-500 uppercase tracking-wider mb-1">Clinic</p>
              <p className="text-sm font-semibold text-teal-900">{doctor.clinic_place_name}</p>
              {doctor.clinic_address && <p className="text-xs text-teal-600 mt-0.5 line-clamp-2">{doctor.clinic_address}</p>}
            </div>
          )}

          {/* Map */}
          {doctor.clinic_lat && doctor.clinic_lng && (
            <div className="rounded-xl overflow-hidden border border-gray-200 shadow-sm">
              <div className="bg-gray-50 px-3 py-1.5 text-xs text-gray-500 font-medium flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                Clinic Location
              </div>
              <iframe
                src={`https://maps.google.com/maps?q=${doctor.clinic_lat},${doctor.clinic_lng}&z=15&output=embed`}
                width="100%" height="200" style={{ border: 0 }} allowFullScreen loading="lazy" title="Clinic Map" />
            </div>
          )}

          {/* Certificate */}
          {doctor.certificate_url && (
            <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl p-4">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <div>
                  <p className="text-[10px] font-bold text-blue-500 uppercase tracking-wider">Medical Certificate</p>
                  <p className="text-sm font-semibold text-blue-900">{doctor.certificate_name || 'Verified Certificate'}</p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-green-600 font-semibold mt-0.5">
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    Verified
                  </span>
                </div>
              </div>
              <a href={doctor.certificate_url} target="_blank" rel="noreferrer"
                className="flex items-center space-x-1 px-3 py-2 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0zM2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                <span>View Certificate</span>
              </a>
            </div>
          )}

          {/* Doctor ID badge */}
          {doctor.doctor_id && (
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-3">
              <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2" /></svg>
              <p className="text-xs text-gray-500">Doctor ID: <span className="font-semibold text-gray-700">{doctor.doctor_id}</span></p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="p-5 border-t border-gray-100 grid grid-cols-2 gap-3">
          <button onClick={() => onChat(doctor)}
            className="py-3 border-2 border-teal-700 text-teal-700 font-bold rounded-xl hover:bg-teal-50 transition text-sm flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Chat Now
          </button>
          <button onClick={() => { onClose(); onBook(doctor); }}
            className="py-3 bg-teal-700 text-white font-bold rounded-xl hover:bg-teal-800 transition text-sm">
            Book Appointment
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   REAL-TIME CHAT PANEL  (appointment-gated)
══════════════════════════════════════════════════ */
function ChatPanel({ patientData, chatDoctor, onClose }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [chatAllowed, setChatAllowed] = useState(null); // null = checking
  const [doctorOnline, setDoctorOnline] = useState(false);
  const [otherTyping, setOtherTyping] = useState(false);
  const messagesEndRef = useRef(null);
  const channelRef = useRef(null);
  const wsRef = useRef(null);
  const typingTimerRef = useRef(null);
  const roomId = getRoomId(patientData.id, chatDoctor.id);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  /* ── Check if a confirmed appointment exists ── */
  useEffect(() => {
    const checkAppointment = async () => {
      const { data } = await supabase
        .from('appointments')
        .select('id, status')
        .eq('patient_id', patientData.id)
        .eq('doctor_id', chatDoctor.id)
        .in('status', ['confirmed', 'completed'])
        .limit(1);
      setChatAllowed(data && data.length > 0);
    };
    checkAppointment();
  }, [chatDoctor.id, patientData.id]);

  /* ── Load messages + subscribe once access is confirmed ── */
  useEffect(() => {
    if (chatAllowed !== true) return;
    loadMessages();
    subscribeToMessages();

    /* Optional: connect to the standalone WS server for presence/typing */
    const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;
      ws.onopen = () => {
        ws.send(JSON.stringify({
          type: 'join', userId: patientData.id, role: 'patient',
          doctorId: chatDoctor.id, patientId: patientData.id,
        }));
      };
      ws.onmessage = (e) => {
        const msg = JSON.parse(e.data);
        if (msg.type === 'presence' && msg.userId === chatDoctor.id) {
          setDoctorOnline(msg.status === 'online');
        }
        if (msg.type === 'typing' && msg.userId === chatDoctor.id) {
          setOtherTyping(msg.isTyping);
        }
      };
      ws.onerror = () => { }; // WS optional — Supabase realtime is the primary
    } catch (_) { }

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [chatAllowed, roomId]);

  useEffect(() => { scrollToBottom(); }, [messages]);

  const loadMessages = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('room_id', roomId)
      .order('created_at', { ascending: true });
    setMessages(data || []);
    setLoading(false);
    await supabase.from('messages')
      .update({ is_read: true })
      .eq('room_id', roomId)
      .eq('receiver_id', patientData.id)
      .eq('is_read', false);
  };

  const subscribeToMessages = () => {
    const channel = supabase.channel(`room:${roomId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `room_id=eq.${roomId}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.find(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        if (payload.new.receiver_id === patientData.id) {
          supabase.from('messages').update({ is_read: true }).eq('id', payload.new.id);
        }
      })
      .subscribe();
    channelRef.current = channel;
  };

  const [sendError, setSendError] = useState('');

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    const content = input.trim();
    setInput('');
    setSendError('');
    setSending(true);
    const optimistic = { id: `temp-${Date.now()}`, room_id: roomId, sender_id: patientData.id, receiver_id: chatDoctor.id, content, created_at: new Date().toISOString(), is_read: false };
    setMessages(prev => [...prev, optimistic]);
    // Stop typing indicator
    if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: 'typing', isTyping: false }));
    try {
      const res = await fetch('/api/chat/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: roomId, sender_id: patientData.id, receiver_id: chatDoctor.id, content }),
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


  const handleInputChange = (e) => {
    setInput(e.target.value);
    if (wsRef.current?.readyState === 1) {
      wsRef.current.send(JSON.stringify({ type: 'typing', isTyping: true }));
      clearTimeout(typingTimerRef.current);
      typingTimerRef.current = setTimeout(() => {
        if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: 'typing', isTyping: false }));
      }, 2000);
    }
  };

  const formatMsgTime = (ts) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  /* ── Loading check ── */
  if (chatAllowed === null) return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="bg-white rounded-2xl p-8 flex flex-col items-center gap-3 shadow-2xl">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-teal-600" />
        <p className="text-sm text-gray-500">Checking access…</p>
      </div>
    </div>
  );

  /* ── Blocked state: no confirmed appointment ── */
  if (chatAllowed === false) return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-7 text-center">
        <div className="w-14 h-14 bg-amber-50 border-2 border-amber-200 rounded-full flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
        </div>
        <h3 className="text-base font-bold text-gray-900 mb-2">Chat Not Available</h3>
        <p className="text-sm text-gray-500 mb-5 leading-relaxed">
          Chat with <span className="font-semibold text-gray-700">Dr. {chatDoctor.name}</span> will be unlocked once they <span className="font-semibold text-teal-700">confirm your appointment</span>. Book an appointment first.
        </p>
        <button onClick={onClose} className="w-full py-2.5 bg-teal-700 text-white text-sm font-bold rounded-xl hover:bg-teal-800 transition">
          Got it
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-md h-[90vh] sm:h-[600px] rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-teal-700 to-teal-600 px-4 py-3.5 flex items-center space-x-3 flex-shrink-0">
          {chatDoctor.avatar_url
            ? <img src={chatDoctor.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover ring-2 ring-white/30" />
            : <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold">{chatDoctor.name?.charAt(0)}</span></div>}
          <div className="flex-1 min-w-0">
            <p className="font-bold text-white text-sm">Dr. {chatDoctor.name}</p>
            <p className="text-teal-200 text-xs truncate">{chatDoctor.specialization}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`w-2 h-2 rounded-full ${doctorOnline ? 'bg-green-400' : 'bg-gray-400'}`}></span>
            <span className="text-teal-200 text-xs">{doctorOnline ? 'Online' : 'Offline'}</span>
          </div>
          <button onClick={onClose} className="ml-2 w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition flex-shrink-0">
            <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
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
              <p className="text-xs text-gray-400 mt-1">Send a message to Dr. {chatDoctor.name?.split(' ')[0]}</p>
            </div>
          ) : (
            <>
              {messages.map((msg) => {
                const isMine = msg.sender_id === patientData.id;
                return (
                  <div key={msg.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
                    {!isMine && (
                      chatDoctor.avatar_url
                        ? <img src={chatDoctor.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover mr-2 flex-shrink-0 self-end mb-1 ring-1 ring-gray-200" />
                        : <div className="w-7 h-7 rounded-full bg-teal-700 flex items-center justify-center text-white text-xs font-bold mr-2 flex-shrink-0 self-end mb-1">
                          {chatDoctor.name?.charAt(0)}
                        </div>
                    )}
                    <div className={`max-w-[72%] ${isMine ? 'items-end' : 'items-start'} flex flex-col`}>
                      <div className={`px-3.5 py-2 rounded-2xl text-sm leading-relaxed ${isMine
                        ? 'bg-teal-700 text-white rounded-br-sm'
                        : 'bg-white text-gray-800 border border-gray-100 shadow-sm rounded-bl-sm'
                        }`}>
                        {msg.content}
                      </div>
                      <p className={`text-[10px] mt-1 ${isMine ? 'text-gray-400 text-right' : 'text-gray-400'}`}>
                        {formatMsgTime(msg.created_at)}
                        {isMine && <span className="ml-1">{msg.is_read ? '✓✓' : '✓'}</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>

        {/* Typing indicator */}
        {otherTyping && (
          <div className="px-4 pb-1 flex items-center gap-2 flex-shrink-0">
            {chatDoctor.avatar_url
              ? <img src={chatDoctor.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 ring-1 ring-gray-200" />
              : <div className="w-7 h-7 rounded-full bg-teal-700 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                {chatDoctor.name?.charAt(0)}
              </div>}
            <div className="bg-white border border-gray-100 shadow-sm rounded-2xl rounded-bl-sm px-3.5 py-2 flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
              <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
            </div>
          </div>
        )}
        {/* Error toast */}
        {sendError && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-100 flex-shrink-0">
            <p className="text-xs text-red-600">{sendError}</p>
          </div>
        )}
        {/* Input */}

        <div className="px-4 py-3 bg-white border-t border-gray-100 flex-shrink-0">
          <div className="flex items-center space-x-2">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              placeholder={`Message Dr. ${chatDoctor.name?.split(' ')[0]}…`}
              className="flex-1 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent"
            />
            <button onClick={sendMessage} disabled={!input.trim() || sending}
              className="w-10 h-10 bg-teal-700 text-white rounded-xl flex items-center justify-center hover:bg-teal-800 transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0">
              {sending
                ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MY DOCTORS VIEW — clean cards: photo · name · dept · icons
══════════════════════════════════════════════════ */
function MyDoctorsView({ patientData, onChat, onDetails }) {
  const [myDoctors, setMyDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchMyDoctors(); }, []);

  const fetchMyDoctors = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('appointments')
      .select('doctor_id, status, time_slot:slot_id(date), doctor:doctor_id(id,name,specialization,avatar_url,experience_years,consultation_fee,clinic_place_name,clinic_address,clinic_lat,clinic_lng,languages,experience_details,certificate_url,certificate_name,doctor_id)')
      .eq('patient_id', patientData.id)
      .in('status', ['confirmed', 'completed'])
      .order('created_at', { ascending: false });

    if (data) {
      const seen = new Set();
      const unique = [];
      data.forEach(apt => {
        if (apt.doctor && !seen.has(apt.doctor_id)) {
          seen.add(apt.doctor_id);
          unique.push({ ...apt.doctor, lastVisit: apt.time_slot?.date });
        }
      });
      setMyDoctors(unique);
    }
    setLoading(false);
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" />
    </div>
  );

  return (
    <div className="p-7">
      {myDoctors.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 py-16 text-center">
          <div className="w-14 h-14 bg-teal-50 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg className="w-7 h-7 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
          </div>
          <p className="text-sm font-semibold text-gray-700">No doctors yet</p>
          <p className="text-xs text-gray-400 mt-1">Doctors who confirm your appointments will appear here</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
          {myDoctors.map(doc => (
            <div key={doc.id} className="bg-white rounded-2xl border border-gray-100 hover:shadow-md hover:border-teal-100 transition-all flex flex-col items-center pt-6 pb-4 px-4 gap-3 group">

              {/* Profile photo */}
              <div className="relative">
                {doc.avatar_url
                  ? <img src={doc.avatar_url} alt="" className="w-20 h-20 rounded-full object-cover ring-4 ring-teal-50 shadow-sm group-hover:ring-teal-200 transition" />
                  : <div className="w-20 h-20 bg-gradient-to-br from-teal-500 to-teal-700 rounded-full flex items-center justify-center ring-4 ring-teal-50 shadow-sm group-hover:ring-teal-200 transition">
                    <span className="text-white font-bold text-2xl">{doc.name?.charAt(0)}</span>
                  </div>}
                {/* Verified dot */}
                <span className="absolute bottom-0.5 right-0.5 w-5 h-5 bg-green-500 border-2 border-white rounded-full flex items-center justify-center">
                  <svg className="w-2.5 h-2.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                </span>
              </div>

              {/* Name & department */}
              <div className="text-center min-w-0 w-full">
                <p className="text-sm font-bold text-gray-900 truncate">Dr. {doc.name}</p>
                <p className="text-xs text-teal-600 font-medium truncate mt-0.5">{doc.specialization}</p>
              </div>

              {/* Action icon buttons */}
              <div className="flex items-center gap-2 mt-1">
                {/* Details / user icon */}
                <button
                  onClick={() => onDetails(doc)}
                  title="View details"
                  className="w-9 h-9 rounded-xl bg-gray-50 hover:bg-teal-50 border border-gray-200 hover:border-teal-200 text-gray-400 hover:text-teal-700 flex items-center justify-center transition-all">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </button>

                {/* Chat icon */}
                <button
                  onClick={() => onChat(doc)}
                  title="Chat"
                  className="w-9 h-9 rounded-xl bg-teal-600 hover:bg-teal-700 border border-teal-600 text-white flex items-center justify-center transition-all shadow-sm">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    <path d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                  </svg>
                </button>
              </div>

            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MESSAGES VIEW — list of all chat conversations
══════════════════════════════════════════════════ */
function MessagesView({ patientData, doctors, onOpenChat }) {
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { fetchConversations(); }, []);

  const fetchConversations = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('messages')
      .select('*')
      .or(`sender_id.eq.${patientData.id},receiver_id.eq.${patientData.id}`)
      .order('created_at', { ascending: false });

    if (data) {
      const convMap = {};
      data.forEach(msg => {
        const otherId = msg.sender_id === patientData.id ? msg.receiver_id : msg.sender_id;
        if (!convMap[otherId]) {
          const doc = doctors.find(d => d.id === otherId);
          convMap[otherId] = { doctor: doc, lastMsg: msg, unread: 0 };
        }
        if (msg.receiver_id === patientData.id && !msg.is_read) {
          convMap[otherId].unread = (convMap[otherId].unread || 0) + 1;
        }
      });
      setConversations(Object.values(convMap).filter(c => c.doctor));
    }
    setLoading(false);
  };

  const formatTime = (ts) => {
    const d = new Date(ts);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
      return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    }
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-teal-600" />
    </div>
  );

  return (
    <div className="p-7 max-w-2xl">
      <div className="flex items-center justify-between mb-5">
      </div>

      <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
        {conversations.length === 0 ? (
          <div className="py-16 text-center">
            <div className="w-14 h-14 bg-teal-100 rounded-full flex items-center justify-center mx-auto mb-3">
              <svg className="w-6 h-6 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            </div>
            <p className="text-sm font-semibold text-gray-700">No messages yet</p>
            <p className="text-xs text-gray-400 mt-1">Start a chat from the Find Doctors section</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-50">
            {conversations.map(({ doctor, lastMsg, unread }) => (
              <button key={doctor.id} onClick={() => {
                // Clear this conversation's unread badge immediately
                setConversations(prev => prev.map(c =>
                  c.doctor.id === doctor.id ? { ...c, unread: 0 } : c
                ));
                onOpenChat(doctor, fetchConversations);
              }}
                className="w-full flex items-center space-x-3 px-5 py-4 hover:bg-gray-50 transition text-left">
                {doctor.avatar_url
                  ? <img src={doctor.avatar_url} alt="" className="w-11 h-11 rounded-full object-cover flex-shrink-0 ring-2 ring-gray-100" />
                  : <div className="w-11 h-11 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold">{doctor.name?.charAt(0)}</span></div>}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm ${unread > 0 ? 'font-bold text-gray-900' : 'font-semibold text-gray-900'}`}>Dr. {doctor.name}</p>
                    <p className="text-xs text-gray-400">{formatTime(lastMsg.created_at)}</p>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={`text-xs truncate pr-2 ${unread > 0 ? 'text-gray-800 font-medium' : 'text-gray-500'}`}>
                      {lastMsg.sender_id === patientData.id ? 'You: ' : ''}{lastMsg.content}
                    </p>
                    {unread > 0 && (
                      <span className="min-w-[18px] h-[18px] bg-teal-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 flex-shrink-0">
                        {unread}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-teal-600 mt-0.5">{doctor.specialization}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   SYMPTOM CHECKER — GROQ AI CHATBOT
══════════════════════════════════════════════════ */
function SymptomCheckerPanel({ patientData }) {
  const [messages, setMessages] = useState([
    {
      role: 'assistant',
      content: `Hello ${patientData?.name?.split(' ')[0] || 'there'}. I am a symptom checker assistant. Describe your symptoms and I will help you understand possible causes and whether you should seek medical attention. Please note: this is not a substitute for professional medical advice.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setError('');

    const newMessages = [...messages, { role: 'user', content: text }];
    setMessages(newMessages);
    setLoading(true);

    try {
      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.NEXT_PUBLIC_GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: [
            {
              role: 'system',
              content: `You are a medical symptom checker assistant for a healthcare platform. The patient's name is ${patientData?.name || 'the user'}. 
Your role is to:
1. Ask clarifying questions about symptoms (duration, severity, location, associated symptoms).
2. Provide a brief, clear assessment of possible conditions.
3. Recommend urgency level: Emergency (go to ER now), Urgent (see doctor within 24 hours), Routine (schedule an appointment), or Self-care (home treatment likely sufficient).
4. Suggest basic self-care steps where appropriate.
5. Always remind patients you are an AI and cannot replace a doctor.
Keep responses concise, professional, and structured. Never diagnose definitively. Always err on the side of caution for serious symptoms.`,
            },
            ...newMessages.map(m => ({ role: m.role, content: m.content })),
          ],
          max_tokens: 500,
          temperature: 0.4,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData?.error?.message || `API error ${res.status}`);
      }

      const data = await res.json();
      const reply = data.choices?.[0]?.message?.content || 'I could not process your request. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: reply }]);
    } catch (err) {
      setError(err.message || 'Failed to get response. Check your GROQ API key.');
      // Remove the user message we optimistically added if request failed
    } finally {
      setLoading(false);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearChat = () => {
    setMessages([{
      role: 'assistant',
      content: `Hello ${patientData?.name?.split(' ')[0] || 'there'}. I am a symptom checker assistant. Describe your symptoms and I will help you understand possible causes and whether you should seek medical attention. Please note: this is not a substitute for professional medical advice.`,
    }]);
    setError('');
  };

  const QUICK_PROMPTS = [
    'I have a headache and fever',
    'I feel chest pain and shortness of breath',
    'I have a sore throat and cough',
    'I have stomach pain and nausea',
  ];

  return (
    <div className="flex h-[calc(100vh-64px)] overflow-hidden">

      {/* ── LEFT IMAGE PANEL ── */}
      <div className="hidden lg:flex w-80 xl:w-96 flex-shrink-0 relative flex-col overflow-hidden">
        {/* Background image */}
        <img
          src="https://images.unsplash.com/photo-1576091160550-2173dba999ef?w=800&q=80"
          alt="Medical"
          className="absolute inset-0 w-full h-full object-cover"
        />
        {/* Dark gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-b from-teal-900/80 via-teal-800/70 to-gray-900/90" />

        {/* Content over image */}
        <div className="relative z-10 flex flex-col h-full p-8 justify-between">
          {/* Top badge */}
          <div>
            <div className="inline-flex items-center gap-2 bg-white/15 backdrop-blur-sm border border-white/20 rounded-full px-3 py-1.5 mb-8">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-white text-xs font-semibold tracking-wide">AI-Powered</span>
            </div>

            <h2 className="text-2xl font-bold text-white leading-snug mb-3">
              Smart Symptom<br />Analysis
            </h2>
            <p className="text-teal-200 text-sm leading-relaxed">
              Describe your symptoms and our AI will help assess possible conditions and recommend the right level of care.
            </p>
          </div>

          {/* Feature list */}
          <div className="space-y-3 my-auto py-8">
            {[
              { icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', label: 'Instant symptom assessment' },
              { icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z', label: 'Urgency level guidance' },
              { icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z', label: 'Doctor referral suggestions' },
              { icon: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z', label: 'Private & confidential' },
            ].map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-8 h-8 bg-white/15 rounded-lg flex items-center justify-center flex-shrink-0">
                  <svg className="w-4 h-4 text-teal-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={f.icon} />
                  </svg>
                </div>
                <span className="text-sm text-white/85 font-medium">{f.label}</span>
              </div>
            ))}
          </div>

          {/* Disclaimer footer */}
          <div className="bg-white/10 backdrop-blur-sm border border-white/15 rounded-xl p-4">
            <p className="text-xs text-teal-200 leading-relaxed">
              <span className="font-bold text-white">Disclaimer:</span> This tool is for informational purposes only and does not constitute medical advice. Always consult a qualified doctor for diagnosis and treatment.
            </p>
          </div>
        </div>
      </div>

      {/* ── RIGHT CHAT PANEL ── */}
      <div className="flex-1 flex flex-col bg-gray-50 overflow-hidden">
        {/* Chat header */}
        <div className="bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-teal-700 rounded-xl flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-900">AI Symptom Checker</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <p className="text-xs text-gray-400">Powered by Groq · llama-3.1-8b-instant</p>
              </div>
            </div>
          </div>
          <button
            onClick={clearChat}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            New Chat
          </button>
        </div>

        {/* Messages area */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} gap-2.5`}>
              {msg.role === 'assistant' && (
                <div className="w-8 h-8 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0 self-end mb-1 shadow-sm">
                  <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
              )}
              <div className={`max-w-[75%] px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
                msg.role === 'user'
                  ? 'bg-teal-700 text-white rounded-br-sm'
                  : 'bg-white text-gray-800 border border-gray-100 rounded-bl-sm'
              }`}>
                {msg.content}
              </div>
              {msg.role === 'user' && (
                <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0 self-end mb-1 shadow-sm">
                  <span className="text-teal-700 text-xs font-bold">{patientData?.name?.charAt(0) || 'P'}</span>
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div className="flex justify-start gap-2.5">
              <div className="w-8 h-8 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0 self-end mb-1 shadow-sm">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              <div className="bg-white border border-gray-100 px-4 py-3 rounded-2xl rounded-bl-sm flex items-center gap-1.5 shadow-sm">
                <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-2 h-2 bg-teal-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-xs text-red-700 flex items-start gap-2">
              <svg className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {error}
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick prompts — only show on first load */}
        {messages.length === 1 && (
          <div className="px-6 pb-3 flex flex-wrap gap-2 flex-shrink-0">
            {QUICK_PROMPTS.map((p, i) => (
              <button key={i} onClick={() => { setInput(p); inputRef.current?.focus(); }}
                className="px-3 py-1.5 text-xs font-medium text-teal-700 bg-white border border-teal-100 rounded-lg hover:bg-teal-50 hover:border-teal-300 transition shadow-sm">
                {p}
              </button>
            ))}
          </div>
        )}

        {/* Input bar */}
        <div className="bg-white border-t border-gray-100 px-6 py-4 flex gap-3 flex-shrink-0">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Describe your symptoms in detail..."
            rows={2}
            className="flex-1 resize-none border border-gray-200 rounded-xl px-4 py-3 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent transition bg-gray-50"
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || loading}
            className="px-5 bg-teal-700 text-white rounded-xl font-semibold text-sm hover:bg-teal-800 transition disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0 flex flex-col items-center justify-center gap-1 min-w-[72px]">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
            </svg>
            <span className="text-xs">Send</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MAIN PATIENT DASHBOARD
══════════════════════════════════════════════════ */
export default function PatientDashboard() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [patientData, setPatientData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [viewingDoctor, setViewingDoctor] = useState(null);
  const [chatDoctor, setChatDoctor] = useState(null);
  const messagesRefetchRef = useRef(null); // holds MessagesView's fetchConversations

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
  const notifRef = useRef(null);
  const profileRef = useRef(null);

  // Health details state
  const [healthDetails, setHealthDetails] = useState(null);
  const [isEditingHealth, setIsEditingHealth] = useState(false);
  const [healthForm, setHealthForm] = useState({});
  const [savingHealth, setSavingHealth] = useState(false);

  // ── Nearby filter state ───────────────────────────────────────
  const [patientLocation, setPatientLocation] = useState(null); // { lat, lng }
  const [nearbyRadius, setNearbyRadius] = useState(10); // km
  const [nearbyMode, setNearbyMode] = useState(false);
  const [nearbyLoading, setNearbyLoading] = useState(false);
  const [nearbyError, setNearbyError] = useState('');

  // ── Unread messages badge ─────────────────────────────────────
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

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
        fetchUnreadMsgCount();
        fetchPayments();
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

  // Real-time
  useEffect(() => {
    if (!patientData?.id) return;
    const ch = supabase.channel('patient-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `patient_id=eq.${patientData.id}` }, () => fetchAppointments())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'medical_records', filter: `patient_id=eq.${patientData.id}` }, () => fetchMedicalRecords())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${patientData.id}` }, () => { fetchNotifications(); fetchAppointments(); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'record_requests', filter: `patient_id=eq.${patientData.id}` }, () => fetchPendingRequests())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'patient_health_details', filter: `patient_id=eq.${patientData.id}` }, () => fetchHealthDetails())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `receiver_id=eq.${patientData.id}` }, () => fetchUnreadMsgCount())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [patientData?.id]);

  // Click-outside
  useEffect(() => {
    const handle = (e) => {
      if (notifRef.current && !notifRef.current.contains(e.target)) setShowNotifications(false);
      if (profileRef.current && !profileRef.current.contains(e.target)) setShowProfileMenu(false);
    };
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  // ── Data Fetchers ─────────────────────────────────────────────
  const fetchUnreadMsgCount = async () => {
    if (!patientData?.id) return;
    const { count } = await supabase.from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('receiver_id', patientData.id)
      .eq('is_read', false);
    setUnreadMsgCount(count || 0);
  };

  const fetchPendingRequests = async () => {
    if (!patientData?.id) return;
    const { data } = await supabase
      .from('record_requests')
      .select('*, doctor:doctor_id(name, specialization, avatar_url)')
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
      .select('*, doctor:doctor_id(name, specialization, avatar_url)')
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
        const { error } = await supabase.from('patient_health_details').update(payload).eq('id', healthDetails.id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('patient_health_details').insert([payload]).select().single();
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

  // ── Profile Image Upload ──────────────────────────────────────
  const handleAvatarUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !patientData?.id) return;
    if (!['image/jpeg', 'image/jpg', 'image/png', 'image/webp'].includes(file.type)) { alert('Please select a JPEG, PNG, or WebP image.'); return; }
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
    const { data } = await supabase.from('users').select('id,name,email,specialization,avatar_url,certificate_url,certificate_name,experience_years,experience_details,languages,consultation_fee,clinic_place_name,clinic_address,clinic_lat,clinic_lng,doctor_id').eq('role', 'doctor').eq('is_approved', true);
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
      const ranges = { morning: ['06:00:00', '12:00:00'], afternoon: ['12:00:00', '17:00:00'], evening: ['17:00:00', '22:00:00'] };
      const [gte, lt] = ranges[selectedTimeOfDay];
      const { data } = await supabase.from('time_slots').select('*')
        .eq('doctor_id', selectedDoctor.id).eq('date', selectedDate).eq('is_available', true)
        .gte('start_time', gte).lt('start_time', lt).order('start_time');
      setTimeSlots(data || []);
    } finally { setLoading(false); }
  };

  // ── Payment State ─────────────────────────────────────────────
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [payments, setPayments] = useState([]);

  const fetchPayments = async () => {
    const { data } = await supabase
      .from('payments')
      .select('*, appointment:appointment_id(*, doctor:doctor_id(name,specialization,avatar_url), time_slot:slot_id(date,start_time))')
      .eq('patient_id', patientData?.id)
      .order('created_at', { ascending: false });
    if (data) setPayments(data);
  };

  // Generate unique appointment code
  const generateAppointmentCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = 'APT-';
    for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
  };

  const handleBookAppointment = () => {
    if (!selectedSlot) { alert('Please select a time slot'); return; }
    // Show payment modal instead of booking directly
    setShowPaymentModal(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedSlot) return;
    setPaymentProcessing(true);
    try {
      const fee = selectedDoctor.consultation_fee || 0;
      const platformFee = +(fee * 0.05).toFixed(2);
      const doctorNet = +(fee - platformFee).toFixed(2);

      // ── STEP 1: Book the appointment FIRST so it exists in the DB ──
      const { data, error } = await supabase.rpc('book_appointment', {
        p_slot_id: selectedSlot.id, p_patient_id: patientData.id,
        p_doctor_id: selectedDoctor.id, p_symptoms: symptoms || null, p_notes: notes || null
      });
      if (error) throw error;
      if (!data.success) throw new Error(data.error);
      const appointmentId = data.id;

      // ── STEP 2: Fetch this appointment's exact created_at timestamp ──
      const { data: thisAppt } = await supabase
        .from('appointments')
        .select('id, created_at')
        .eq('id', appointmentId)
        .single();

      // ── STEP 3: Count how many non-cancelled appointments for this slot
      //    were created AT OR BEFORE this one — that count IS the token number.
      //    Using created_at comparison makes this race-condition safe: each
      //    patient's row already exists when we count, so no two patients
      //    will ever share the same position. ──
      const { count: tokenNumber } = await supabase
        .from('appointments')
        .select('id', { count: 'exact', head: true })
        .eq('slot_id', selectedSlot.id)
        .not('status', 'in', '(cancelled,rejected)')
        .lte('created_at', thisAppt.created_at);

      const safeToken = tokenNumber || 1;

      // ── STEP 4: Calculate reporting time from token position ──
      const parseMin = (t = '') => { const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
      const slotStartMin = parseMin(selectedSlot.start_time);
      const slotEndMin = parseMin(selectedSlot.end_time);
      const maxPat = selectedSlot.max_patients || 1;
      const gapMin = Math.floor((slotEndMin - slotStartMin) / maxPat);
      const reportMin = slotStartMin + (safeToken - 1) * gapMin;
      const rHr = Math.floor(reportMin / 60), rMin = reportMin % 60;
      const reportingTime = `${String(rHr).padStart(2, '0')}:${String(rMin).padStart(2, '0')}`;
      const rHr12 = rHr % 12 || 12, ampm = rHr >= 12 ? 'PM' : 'AM';
      const reportingTimeDisplay = `${rHr12}:${String(rMin).padStart(2, '0')} ${ampm}`;

      // ── Appointment code encodes the token: APT-T001-XXXX ──
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      let suffix = ''; for (let i = 0; i < 4; i++) suffix += chars[Math.floor(Math.random() * chars.length)];
      const appointmentCode = `APT-T${String(safeToken).padStart(3, '0')}-${suffix}`;

      // ── STEP 5: Update appointment with confirmed status, code, token & reporting_time ──
      await supabase.from('appointments').update({
        status: 'confirmed',
        appointment_code: appointmentCode,
        payment_status: 'paid',
        token_number: safeToken,
        report_time: reportingTime,
      }).eq('id', appointmentId);

      // 3. Record payment
      await supabase.from('payments').insert([{
        appointment_id: appointmentId, patient_id: patientData.id, doctor_id: selectedDoctor.id,
        doctor_fee: fee, platform_fee: platformFee, total_amount: fee,
        status: 'paid', payment_method: 'fake_payment',
        transaction_id: `TXN-${Date.now()}`, created_at: new Date().toISOString(),
      }]);

      // 4. Credit admin wallet (5%)
      const { data: wallet } = await supabase.from('admin_wallet').select('*').limit(1).single();
      if (wallet) {
        await supabase.from('admin_wallet').update({
          balance: (wallet.balance || 0) + platformFee,
          total_earned: (wallet.total_earned || 0) + platformFee,
        }).eq('id', wallet.id);
      } else {
        await supabase.from('admin_wallet').insert([{ balance: platformFee, total_earned: platformFee, withdrawn: 0 }]);
      }

      // 5. Notification to doctor
      await supabase.from('notifications').insert([{
        user_id: selectedDoctor.id, type: 'new_appointment',
        title: 'New Paid Appointment',
        message: `${patientData.name} booked (Token #${safeToken}, report by ${reportingTimeDisplay}) on ${selectedDate}. Code: ${appointmentCode}`,
        related_id: appointmentId
      }]);

      // 6. Notification to patient
      await supabase.from('notifications').insert([{
        user_id: patientData.id, type: 'appointment_confirmed',
        title: 'Appointment Confirmed & Paid',
        message: `Confirmed with Dr. ${selectedDoctor.name} on ${selectedDate}. Token: #${safeToken} · Report by ${reportingTimeDisplay}. Code: ${appointmentCode}`,
        related_id: appointmentId
      }]);

      // 7. Send confirmation email
      const dateStr = new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      try {
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: patientData.email,
            subject: `Appointment Confirmed — Token #${safeToken} | Report by ${reportingTimeDisplay}`,
            html: `<div style="font-family:Inter,sans-serif;max-width:580px;margin:0 auto;background:#f9fafb;">
              <div style="background:#0f766e;padding:28px 32px;border-radius:12px 12px 0 0;">
                <p style="color:#99f6e4;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;margin:0 0 6px;">AMRT Health Platform</p>
                <h1 style="color:#fff;font-size:22px;margin:0;font-weight:800;">Appointment Confirmed</h1>
              </div>
              <div style="background:#fff;padding:28px 32px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
                <p style="color:#374151;font-size:14px;">Hi <strong>${patientData.name}</strong>,</p>
                <p style="color:#6b7280;font-size:13px;margin-top:4px;">Your appointment has been confirmed and payment received.</p>

                <div style="display:flex;gap:12px;margin:20px 0;">
                  <div style="flex:1;background:#f0fdf4;border:1.5px solid #bbf7d0;border-radius:10px;padding:16px;text-align:center;">
                    <p style="margin:0 0 6px;font-size:10px;color:#166534;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Token Number</p>
                    <p style="margin:0;font-size:40px;font-weight:900;color:#15803d;line-height:1;">#${safeToken}</p>
                    <p style="margin:8px 0 0;font-size:11px;color:#86efac;">Your queue position</p>
                  </div>
                  <div style="flex:1;background:#eff6ff;border:1.5px solid #bfdbfe;border-radius:10px;padding:16px;text-align:center;">
                    <p style="margin:0 0 6px;font-size:10px;color:#1e40af;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Report By</p>
                    <p style="margin:0;font-size:30px;font-weight:900;color:#1d4ed8;line-height:1;">${reportingTimeDisplay}</p>
                    <p style="margin:8px 0 0;font-size:11px;color:#93c5fd;">Your allocated time</p>
                  </div>
                </div>

                <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px 18px;margin:16px 0;">
                  <p style="margin:0 0 4px;font-size:10px;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">Appointment Code</p>
                  <p style="margin:0;font-size:20px;font-weight:800;color:#0f172a;letter-spacing:.1em;font-family:monospace;">${appointmentCode}</p>
                  <p style="margin:6px 0 0;font-size:11px;color:#94a3b8;">Show this at the front desk on arrival</p>
                </div>

                <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#6b7280;">Doctor</td><td style="padding:8px 0;font-weight:600;color:#0f172a;text-align:right;">Dr. ${selectedDoctor.name}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#6b7280;">Specialization</td><td style="padding:8px 0;font-weight:600;color:#0f172a;text-align:right;">${selectedDoctor.specialization}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#6b7280;">Date</td><td style="padding:8px 0;font-weight:600;color:#0f172a;text-align:right;">${dateStr}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#6b7280;">Slot</td><td style="padding:8px 0;font-weight:600;color:#0f172a;text-align:right;">${formatTime(selectedSlot.start_time)} – ${formatTime(selectedSlot.end_time)}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#1d4ed8;font-weight:600;">Your Reporting Time</td><td style="padding:8px 0;font-weight:700;color:#1d4ed8;text-align:right;">${reportingTimeDisplay}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#15803d;font-weight:600;">Queue Token</td><td style="padding:8px 0;font-weight:700;color:#15803d;text-align:right;">#${safeToken}</td></tr>
                  <tr style="border-bottom:1px solid #f1f5f9;"><td style="padding:8px 0;color:#6b7280;">Consultation Fee</td><td style="padding:8px 0;font-weight:600;color:#0f172a;text-align:right;">₹${fee}</td></tr>
                  <tr style="border-top:2px solid #e5e7eb;"><td style="padding:10px 0 6px;color:#0f172a;font-size:14px;font-weight:700;">You Paid</td><td style="padding:10px 0 6px;font-weight:800;color:#0f766e;font-size:16px;text-align:right;">₹${fee}</td></tr>
                </table>

                <div style="background:#fefce8;border:1px solid #fef08a;border-radius:8px;padding:12px 16px;margin-top:8px;">
                  <p style="margin:0;font-size:12px;color:#713f12;line-height:1.6;"><strong>Reminder:</strong> Please arrive at the clinic and check in at reception by <strong>${reportingTimeDisplay}</strong>. Present your code <strong style="font-family:monospace;">${appointmentCode}</strong> or this email to the front desk.</p>
                </div>

                <p style="color:#94a3b8;font-size:11px;margin-top:24px;text-align:center;">AMRT Health Platform · Automated confirmation — do not reply</p>
              </div>
            </div>`,
          }),
        });
      } catch (_) { /* email is optional */ }

      setShowPaymentModal(false);
      setShowBookingModal(false);
      setSelectedDoctor(null); setSelectedDate(null); setSelectedSlot(null);
      setSymptoms(''); setNotes('');
      fetchAppointments();
      fetchPayments();
      setCurrentView('appointments');
    } catch (err) {
      console.error('Payment/booking error:', err);
      alert('Failed to process payment. Please try again.');
    } finally { setPaymentProcessing(false); }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    router.push('/Login');
  };

  // ── Nearby Doctor Filter ──────────────────────────────────────
  const getPatientLocation = () => {
    if (!navigator.geolocation) { setNearbyError('Geolocation is not supported by your browser.'); return; }
    setNearbyLoading(true);
    setNearbyError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setPatientLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setNearbyMode(true);
        setNearbyLoading(false);
      },
      (err) => {
        setNearbyError('Could not get your location: ' + err.message);
        setNearbyLoading(false);
      }
    );
  };

  const clearNearbyFilter = () => {
    setNearbyMode(false);
    setPatientLocation(null);
    setNearbyError('');
  };

  // ── Derived ───────────────────────────────────────────────────
  const doctorsWithDistance = doctors.map(d => {
    if (patientLocation && d.clinic_lat && d.clinic_lng) {
      return { ...d, _distance: haversineDistance(patientLocation.lat, patientLocation.lng, parseFloat(d.clinic_lat), parseFloat(d.clinic_lng)) };
    }
    return { ...d, _distance: null };
  });

  const filteredDoctors = doctorsWithDistance.filter(d => {
    const sm = selectedSpecialty === 'all' || d.specialization?.toLowerCase() === selectedSpecialty;
    const qm = d.name?.toLowerCase().includes(searchQuery.toLowerCase()) || d.specialization?.toLowerCase().includes(searchQuery.toLowerCase());
    const nm = !nearbyMode || (d._distance != null && d._distance <= nearbyRadius);
    return sm && qm && nm;
  }).sort((a, b) => {
    if (nearbyMode && a._distance != null && b._distance != null) return a._distance - b._distance;
    return 0;
  });

  const upcomingAppointments = appointments.filter(a =>
    (a.status === 'scheduled' || a.status === 'confirmed') && new Date(a.time_slot?.date) >= new Date().setHours(0, 0, 0, 0));
  const pastAppointments = appointments.filter(a =>
    a.status === 'completed' || (new Date(a.time_slot?.date) < new Date().setHours(0, 0, 0, 0) && a.status !== 'cancelled'));
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
    { id: 'mydoctors', label: 'My Doctors', d: 'M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z' },
    { id: 'payments', label: 'Payments', badge: payments.length, d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { id: 'records', label: 'Medical Records', d: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
    { id: 'messages', label: 'Messages', badge: unreadMsgCount, d: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z' },
    { id: 'symptomchecker', label: 'Symptom Checker', d: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-sm ${
                currentView === item.id
                  ? 'bg-teal-700 text-white'
                  : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'
              }`}>
              <div className="flex items-center space-x-2.5">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.d} />
                </svg>
                <span className="font-medium">{item.label}</span>
              </div>
              {item.badge > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                  currentView === item.id ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
      </aside>

      {/* ── Main ── */}
      <main className="ml-60 min-h-screen">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div className="px-7 py-3.5 flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-gray-900">
                {currentView === 'dashboard' && `Welcome back, ${patientData?.name?.split(' ')[0]}`}
                {currentView === 'appointments' && 'My Appointments'}
                {currentView === 'doctors' && 'Find Doctors'}
                {currentView === 'mydoctors' && 'My Doctors'}
                {currentView === 'records' && 'Medical Records'}
                {currentView === 'payments' && 'My Payments'}
                {currentView === 'messages' && 'Messages'}
                {currentView === 'symptomchecker' && 'Symptom Checker'}
                {currentView === 'profile' && 'My Profile'}
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              {/* Notification Bell */}
              <div className="relative" ref={notifRef}>
                <button
                  onClick={() => { setShowNotifications(v => !v); setShowProfileMenu(false); }}
                  className="relative w-9 h-9 bg-gray-50 hover:bg-gray-100 rounded-xl flex items-center justify-center transition">
                  <svg className="w-[18px] h-[18px] text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                  </svg>
                  {(notifications.length + pendingRequests.length) > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1 leading-none">
                      {notifications.length + pendingRequests.length}
                    </span>
                  )}
                </button>

                {showNotifications && (
                  <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                      <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">Notifications</span>
                      {notifications.length > 1 && (
                        <button onClick={markAllRead} className="text-[11px] text-teal-600 hover:text-teal-700 font-semibold transition">Mark all read</button>
                      )}
                    </div>
                    <div className="max-h-80 overflow-y-auto divide-y divide-gray-50">
                      {notifications.length === 0 && pendingRequests.length === 0 ? (
                        <div className="py-10 text-center">
                          <p className="text-sm font-semibold text-gray-500">All caught up!</p>
                          <p className="text-xs text-gray-400 mt-0.5">No new notifications</p>
                        </div>
                      ) : (
                        <>
                          {notifications.map(notif => (
                            <div key={notif.id} className="px-4 py-3 hover:bg-gray-50 transition">
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                  <svg className="w-4 h-4 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-gray-900">{notif.title}</p>
                                  <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{notif.message}</p>
                                </div>
                                <button onClick={() => markRead(notif.id)} className="text-gray-300 hover:text-gray-500 transition flex-shrink-0">
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                                </button>
                              </div>
                            </div>
                          ))}
                          {pendingRequests.map(req => (
                            <div key={req.id} className="px-4 py-3 hover:bg-amber-50 transition cursor-pointer"
                              onClick={() => { setSelectedRequest(req); setShowUploadModal(true); setShowNotifications(false); }}>
                              <div className="flex items-start gap-3">
                                <div className="w-8 h-8 bg-amber-50 rounded-xl flex items-center justify-center flex-shrink-0">
                                  <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-bold text-gray-900">Document Requested</p>
                                  <p className="text-xs text-gray-500 mt-0.5">Dr. {req.doctor?.name} needs: {req.request_type}</p>
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

              {/* Profile menu */}
              <div className="relative" ref={profileRef}>
                <button
                  onClick={() => { setShowProfileMenu(v => !v); setShowNotifications(false); }}
                  className="flex items-center space-x-2 px-2 py-1.5 rounded-xl hover:bg-gray-50 transition">
                  {avatarUploading ? (
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <div className="w-4 h-4 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : <AvatarImg size="sm" />}
                  <span className="text-sm font-semibold text-gray-700 hidden sm:block">{patientData?.name?.split(' ')[0]}</span>
                </button>
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden py-1">
                    <button onClick={() => { avatarInputRef.current?.click(); setShowProfileMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /></svg>
                      Change Photo
                    </button>
                    <button onClick={() => { setCurrentView('profile'); setShowProfileMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                      <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                      My Profile
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button onClick={handleLogout}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                      Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        {/* ══════════ DASHBOARD ══════════ */}
        {currentView === 'dashboard' && (
          <div className="p-7 space-y-6">
            {/* Hero */}
            <div className="bg-gradient-to-r from-teal-700 to-teal-500 rounded-xl p-6 text-white relative overflow-hidden">
              <div className="relative z-10">
                <p className="text-teal-200 text-sm mb-1">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'},</p>
                <h2 className="text-2xl font-bold">{patientData?.name}</h2>
                <p className="text-teal-200 text-sm mt-1">
                  {upcomingAppointments.length > 0
                    ? `You have ${upcomingAppointments.length} upcoming appointment${upcomingAppointments.length > 1 ? 's' : ''}`
                    : 'No upcoming appointments'}
                </p>
              </div>
              <div className="absolute right-0 top-0 w-32 h-full opacity-10">
                <svg viewBox="0 0 100 100" className="w-full h-full"><circle cx="80" cy="20" r="40" fill="white" /><circle cx="30" cy="80" r="30" fill="white" /></svg>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label: "Today's Appointments", value: todayAppointments.length, color: 'border-l-blue-500', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
                { label: 'Upcoming', value: upcomingAppointments.length, color: 'border-l-teal-500', icon: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z' },
                { label: 'Medical Records', value: medicalRecords.length, color: 'border-l-purple-500', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
                { label: 'Doctors Available', value: doctors.length, color: 'border-l-green-500', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z' },
              ].map(s => (
                <div key={s.label} className={`bg-white rounded-xl p-5 border border-gray-100 border-l-4 ${s.color}`}>
                  <h3 className="text-2xl font-bold text-gray-900">{s.value}</h3>
                  <p className="text-xs font-semibold text-gray-600 mt-1">{s.label}</p>
                </div>
              ))}
            </div>

            {/* Today's appointments */}
            {todayAppointments.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-gray-900">Today's Appointments</h2>
                  <button onClick={() => setCurrentView('appointments')} className="text-xs text-teal-600 font-semibold">View all</button>
                </div>
                <div className="divide-y divide-gray-50">
                  {todayAppointments.map(apt => (
                    <div key={apt.id} className="px-5 py-3.5 flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 bg-teal-700 rounded-full flex items-center justify-center">
                          <span className="text-white font-bold text-sm">{apt.doctor?.name?.charAt(0)}</span>
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-gray-900">Dr. {apt.doctor?.name}</p>
                          <p className="text-xs text-gray-500">{apt.doctor?.specialization} · {formatTime(apt.time_slot?.start_time)}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-lg text-xs font-semibold capitalize border ${statusCls(apt.status)}`}>{apt.status}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-4">
              <button onClick={() => setCurrentView('doctors')}
                className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:border-teal-200 hover:shadow-sm transition group">
                <div className="w-10 h-10 bg-teal-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-teal-200 transition">
                  <svg className="w-5 h-5 text-teal-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <p className="font-bold text-gray-900 text-sm">Find a Doctor</p>
                <p className="text-xs text-gray-500 mt-0.5">{doctors.length} doctors available nearby</p>
              </button>
              <button onClick={() => setCurrentView('records')}
                className="bg-white rounded-xl border border-gray-100 p-5 text-left hover:border-purple-200 hover:shadow-sm transition group">
                <div className="w-10 h-10 bg-purple-100 rounded-xl flex items-center justify-center mb-3 group-hover:bg-purple-200 transition">
                  <svg className="w-5 h-5 text-purple-700" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                </div>
                <p className="font-bold text-gray-900 text-sm">Medical Records</p>
                <p className="text-xs text-gray-500 mt-0.5">{medicalRecords.length} records stored</p>
              </button>
            </div>
          </div>
        )}

        {/* ══════════ APPOINTMENTS ══════════ */}
        {currentView === 'appointments' && (
          <div className="p-7 space-y-5">
            <div className="flex space-x-1 bg-gray-100 rounded-xl p-1 w-fit">
              {[['upcoming', 'Upcoming'], ['past', 'Past'], ['cancelled', 'Cancelled']].map(([id, label]) => (
                <button key={id} onClick={() => setActiveTab(id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition ${activeTab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="bg-white rounded-xl border border-gray-100">
              {displayAppointments.length > 0 ? (
                <div className="divide-y divide-gray-50">
                  {displayAppointments.map(apt => (
                    <div key={apt.id} className="px-5 py-4 flex items-center justify-between">
                      <div className="flex items-center space-x-3 flex-1 min-w-0">
                        <div className="w-10 h-10 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">{apt.doctor?.name?.charAt(0)}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-sm font-bold text-gray-900">Dr. {apt.doctor?.name}</h4>
                          <p className="text-xs text-gray-500">{apt.doctor?.specialization}</p>
                          <div className="flex items-center space-x-2 mt-0.5">
                            <span className="text-xs text-gray-400">{apt.time_slot?.date ? formatDate(apt.time_slot.date, { weekday: 'short', month: 'short', day: 'numeric' }) : 'N/A'}</span>
                            <span className="text-gray-200">·</span>
                            <span className="text-xs text-gray-400">{formatTime(apt.time_slot?.start_time)}</span>
                          </div>
                          {apt.token_number && apt.status === 'confirmed' && (
                            <div className="flex items-center gap-2 mt-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 bg-teal-50 border border-teal-200 text-teal-700 text-xs font-bold px-2.5 py-1 rounded-full">
                                Token #{apt.token_number}
                              </span>
                              {apt.report_time && (
                                <span className="inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold px-2.5 py-1 rounded-full">
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
        )}

        {/* ══════════ FIND DOCTORS ══════════ */}
        {currentView === 'doctors' && (
          <div className="p-7 space-y-5">
            {/* Search + Filter bar */}
            <div className="bg-white rounded-xl border border-gray-100 p-5 space-y-4">
              <div className="relative">
                <svg className="w-4 h-4 text-gray-400 absolute left-3.5 top-1/2 -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search by name or specialty..."
                  className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-transparent" />
              </div>

              {/* Specialty chips */}
              <div className="flex flex-wrap gap-2">
                {specialties.map(spec => (
                  <button key={spec.id} onClick={() => setSelectedSpecialty(spec.id)}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${selectedSpecialty === spec.id ? 'bg-teal-700 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100'}`}>
                    {spec.name}
                  </button>
                ))}
              </div>

              {/* ── NEARBY FILTER ── */}
              <div className="border-t border-gray-100 pt-3">
                <div className="flex flex-wrap items-center gap-3">
                  {!nearbyMode ? (
                    <button onClick={getPatientLocation} disabled={nearbyLoading}
                      className="flex items-center gap-2 px-4 py-2 bg-white text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-100 transition disabled:opacity-60">
                      {nearbyLoading
                        ? <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>
                        : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>}
                      {nearbyLoading ? 'Detecting location…' : 'Find Nearby Doctors'}
                    </button>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-semibold px-3 py-2 rounded-lg">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        Nearby filter ON
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-600 font-medium">Radius:</label>
                        {[5, 10, 15, 25].map(r => (
                          <button key={r} onClick={() => setNearbyRadius(r)}
                            className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition ${nearbyRadius === r ? 'bg-teal-700 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>
                            {r} km
                          </button>
                        ))}
                      </div>
                      <button onClick={clearNearbyFilter}
                        className="flex items-center gap-1 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-semibold rounded-lg hover:bg-gray-200 transition">
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        Clear
                      </button>
                    </div>
                  )}
                  {nearbyError && <p className="text-xs text-red-500">{nearbyError}</p>}
                </div>
                {nearbyMode && (
                  <p className="text-xs text-gray-400 mt-2">
                    Showing {filteredDoctors.length} doctor{filteredDoctors.length !== 1 ? 's' : ''} within {nearbyRadius} km of your location
                  </p>
                )}
              </div>
            </div>

            {/* Doctor grid */}
            {filteredDoctors.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredDoctors.map(doctor => (
                  <div key={doctor.id} className="bg-white rounded-xl border border-gray-100 hover:shadow-md transition-all overflow-hidden flex flex-col">
                    <div className="h-1 bg-teal-700"></div>
                    <div className="p-5 flex-1 flex flex-col">
                      <div className="flex items-start space-x-3.5 mb-4">
                        {doctor.avatar_url
                          ? <img src={doctor.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                          : <div className="w-12 h-12 bg-teal-700 rounded-xl flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-xl">{doctor.name?.charAt(0)}</span></div>}
                        <div className="min-w-0 flex-1">
                          <h4 className="font-bold text-gray-900 text-sm">Dr. {doctor.name}</h4>
                          <p className="text-xs text-teal-600 font-medium mt-0.5">{doctor.specialization}</p>
                          {doctor._distance != null && (
                            <span className="inline-flex items-center gap-1 mt-1 bg-blue-50 text-blue-700 text-[10px] font-semibold px-2 py-0.5 rounded-full">
                              {doctor._distance.toFixed(1)} km
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1 mb-4 flex-1">
                        {doctor.experience_years && (
                          <p className="text-xs text-gray-500 flex items-center">
                            <svg className="w-3.5 h-3.5 mr-1.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>
                            {doctor.experience_years}+ years experience
                          </p>
                        )}
                        {doctor.consultation_fee && (
                          <p className="text-xs text-gray-500 flex items-center">
                            <svg className="w-3.5 h-3.5 mr-1.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                            Consultation: ₹{doctor.consultation_fee}
                          </p>
                        )}
                        {doctor.clinic_place_name && (
                          <p className="text-xs text-gray-500 flex items-center">
                            <svg className="w-3.5 h-3.5 mr-1.5 text-gray-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" /></svg>
                            <span className="truncate">{doctor.clinic_place_name}</span>
                          </p>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        <button onClick={() => setViewingDoctor(doctor)}
                          className="py-2 border border-teal-700 text-teal-700 rounded-xl text-xs font-semibold hover:bg-teal-50 transition">
                          Details
                        </button>
                        <button onClick={() => setChatDoctor(doctor)}
                          className="py-2 border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition flex items-center justify-center gap-1"
                          title="Chat available after appointment confirmation">
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                          Chat
                        </button>
                        <button onClick={() => { setSelectedDoctor(doctor); setShowBookingModal(true); }}
                          className="py-2 bg-teal-700 text-white rounded-xl text-xs font-semibold hover:bg-teal-800 transition">
                          Book
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
                </div>
                <p className="text-sm font-semibold text-gray-900 mb-1">No doctors found</p>
                <p className="text-xs text-gray-400">
                  {nearbyMode ? `No doctors within ${nearbyRadius} km. Try increasing the radius.` : 'Adjust your search or specialty filter'}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ══════════ MY DOCTORS ══════════ */}
        {currentView === 'mydoctors' && (
          <MyDoctorsView patientData={patientData} onChat={(doc) => setChatDoctor(doc)} onDetails={(doc) => setViewingDoctor(doc)} />
        )}

        {/* ══════════ MESSAGES ══════════ */}
        {currentView === 'messages' && (
          <MessagesView
            patientData={patientData}
            doctors={doctors}
            onOpenChat={(doc, refetch) => {
              if (refetch) messagesRefetchRef.current = refetch;
              setChatDoctor(doc);
            }}
          />
        )}

        {/* ══════════ SYMPTOM CHECKER ══════════ */}
        {currentView === 'symptomchecker' && (
          <SymptomCheckerPanel patientData={patientData} />
        )}

        {/* ══════════ PAYMENTS ══════════ */}
        {currentView === 'payments' && (
          <div className="p-7">
            {/* Summary cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              {[
                { label: 'Total Paid', value: `₹${payments.reduce((s, p) => s + (p.total_amount || 0), 0).toLocaleString('en-IN')}`, color: 'border-l-teal-500', icon: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
                { label: 'Transactions', value: payments.length, color: 'border-l-blue-500', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
                { label: 'Platform Cut (5%)', value: `₹${payments.reduce((s, p) => s + (p.platform_fee || 0), 0).toLocaleString('en-IN')}`, color: 'border-l-purple-500', icon: 'M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z' },
              ].map(s => (
                <div key={s.label} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${s.color} p-5`}>
                  <p className="text-xs font-semibold text-gray-500">{s.label}</p>
                  <h3 className="text-2xl font-bold text-gray-900 mt-1">{s.value}</h3>
                </div>
              ))}
            </div>

            {payments.length > 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-50">
                  <h3 className="text-sm font-bold text-gray-900">Payment History</h3>
                  <p className="text-xs text-gray-400 mt-0.5">All your transactions</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        {['#', 'Transaction ID', 'Doctor', 'Date & Time', 'Apt. Code', 'You Paid', 'Platform (5%)', 'Doctor Gets', 'Status'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {payments.map((p, idx) => (
                        <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3 text-gray-300 font-medium">{idx + 1}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-500">{p.transaction_id}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              {p.appointment?.doctor?.avatar_url
                                ? <img src={p.appointment.doctor.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" />
                                : <div className="w-6 h-6 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white text-[9px] font-bold">{p.appointment?.doctor?.name?.charAt(0)}</span></div>}
                              <span className="font-semibold text-gray-800 whitespace-nowrap">Dr. {p.appointment?.doctor?.name || '—'}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(p.created_at)}</td>
                          <td className="px-4 py-3">
                            <span className="font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md text-[11px]">
                              {p.appointment?.appointment_code || '—'}
                            </span>
                          </td>
                          <td className="px-4 py-3 font-bold text-teal-700">₹{p.total_amount}</td>
                          <td className="px-4 py-3 text-purple-600 font-semibold">−₹{p.platform_fee}</td>
                          <td className="px-4 py-3 font-semibold text-green-700">₹{((p.total_amount || 0) - (p.platform_fee || 0)).toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[10px] font-bold uppercase">
                              {p.status}
                            </span>
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
                  <svg className="w-7 h-7 text-teal-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" /></svg>
                </div>
                <p className="text-sm font-bold text-gray-800">No payments yet</p>
                <p className="text-xs text-gray-400 mt-1">Book an appointment to see your payment history</p>
              </div>
            )}
          </div>
        )}

        {/* ══════════ MEDICAL RECORDS ══════════ */}
        {currentView === 'records' && (
          <div className="p-7">
            <p className="text-xs text-gray-400 mb-5">{medicalRecords.length} record{medicalRecords.length !== 1 ? 's' : ''}</p>
            {medicalRecords.length > 0 ? (
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      {['#', 'Title', 'Doctor', 'Date', 'Type', 'Details', 'Doc'].map(h => (
                        <th key={h} className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {medicalRecords.map((record, idx) => (
                      <tr key={record.id} className="hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3 text-gray-300 font-medium">{idx + 1}</td>
                        <td className="px-4 py-3"><span className="font-semibold text-gray-900">{record.title || '—'}</span></td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            {record.doctor?.avatar_url
                              ? <img src={record.doctor.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0 ring-1 ring-teal-100 shadow-sm" />
                              : <div className="w-7 h-7 bg-gradient-to-br from-teal-600 to-teal-400 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm">
                                <span className="text-white font-bold text-[10px]">{record.doctor?.name?.charAt(0)}</span>
                              </div>}
                            <span className="text-gray-700 font-medium">Dr. {record.doctor?.name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatDate(record.created_at)}</td>
                        <td className="px-4 py-3">
                          <span className="px-2 py-0.5 bg-teal-50 text-teal-700 border border-teal-100 rounded-md capitalize text-[11px] font-medium">
                            {record.record_type?.replace('_', ' ') || '—'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 max-w-[200px]">
                          <span className="line-clamp-1">{record.description || '—'}</span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {record.document_url ? (
                            <a href={record.document_url} target="_blank" rel="noreferrer"
                              className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 font-semibold transition">
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                              View
                            </a>
                          ) : (
                            <span className="text-gray-300">—</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-gray-100 p-12 text-center">
                <p className="text-sm font-semibold text-gray-900 mb-1">No records yet</p>
                <p className="text-xs text-gray-400">Your medical records will appear here</p>
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
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              <span className="text-gray-700 font-medium">My Profile</span>
            </div>

            <div className="w-full space-y-5">

              {/* ── TOP CARD: Avatar + Info + Edit Profile ── */}
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
                        <svg className="w-3 h-3 text-white animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                      ) : (
                        <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                  </div>

                  {/* Name / email / meta */}
                  <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-gray-900">{patientData?.name}</h2>
                    <p className="text-sm text-gray-400 mt-0.5">{patientData?.email}</p>
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
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
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
                          {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(g => <option key={g} value={g}>{g}</option>)}
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

              {/* ── HEALTH DETAILS CARD ── */}
              <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                <div className="px-6 py-4 flex items-center justify-between border-b border-gray-50">
                  <div>
                    <h3 className="text-sm font-bold text-gray-900">Health Details</h3>
                    <p className="text-xs text-gray-400 mt-0.5">Physical measurements, conditions & emergency contact</p>
                  </div>
                  {!isEditingHealth ? (
                    <button onClick={() => setIsEditingHealth(true)}
                      className="flex items-center space-x-1.5 px-4 py-2 border border-gray-200 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-50 transition">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
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

                  {/* Medical Information */}
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

      {/* ══════════ DOCTOR DETAIL MODAL ══════════ */}
      {viewingDoctor && (
        <DoctorDetailModal
          doctor={viewingDoctor}
          onClose={() => setViewingDoctor(null)}
          onBook={(doc) => { setSelectedDoctor(doc); setShowBookingModal(true); }}
          onChat={(doc) => { setViewingDoctor(null); setChatDoctor(doc); }}
        />
      )}

      {/* ══════════ CHAT PANEL ══════════ */}
      {chatDoctor && patientData && (
        <ChatPanel
          patientData={patientData}
          chatDoctor={chatDoctor}
          onClose={() => {
            setChatDoctor(null);
            fetchUnreadMsgCount();
            // Re-fetch messages list so unread counts update
            if (messagesRefetchRef.current) messagesRefetchRef.current();
          }}
        />
      )}

      {/* ══════════ BOOKING MODAL ══════════ */}
      {showBookingModal && selectedDoctor && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto">
            <div className="bg-gradient-to-r from-teal-700 to-teal-600 p-5 flex items-center justify-between sticky top-0 z-10">
              <div className="flex items-center space-x-3">
                {selectedDoctor.avatar_url
                  ? <img src={selectedDoctor.avatar_url} alt="" className="w-10 h-10 rounded-xl object-cover ring-2 ring-white/30" />
                  : <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center"><span className="text-white font-bold">{selectedDoctor.name?.charAt(0)}</span></div>}
                <div>
                  <h3 className="text-base font-bold text-white">Dr. {selectedDoctor.name}</h3>
                  <p className="text-teal-200 text-xs">{selectedDoctor.specialization}</p>
                </div>
              </div>
              <button onClick={() => { setShowBookingModal(false); setSelectedDoctor(null); setSelectedDate(null); setSelectedSlot(null); }}
                className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* Calendar */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-gray-900">
                    {currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </h4>
                  <div className="flex gap-1">
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))}
                      className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition">
                      <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    </button>
                    <button onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))}
                      className="w-7 h-7 rounded-lg bg-gray-100 hover:bg-gray-200 flex items-center justify-center transition">
                      <svg className="w-3.5 h-3.5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map(d => (
                    <div key={d} className="text-center text-[11px] font-semibold text-gray-400 py-1">{d}</div>
                  ))}
                </div>
                <div className="grid grid-cols-7 gap-1">
                  {getDatesInMonth().map((date, i) => {
                    const available = isDateAvailable(date);
                    const selected = date && selectedDate === date.toISOString().split('T')[0];
                    const past = date && date < new Date().setHours(0, 0, 0, 0);
                    return (
                      <button key={i} disabled={!available || past}
                        onClick={() => { if (date && available && !past) { setSelectedDate(date.toISOString().split('T')[0]); setSelectedSlot(null); } }}
                        className={`h-9 text-xs font-medium rounded-lg transition-all ${!date ? 'invisible' : selected ? 'bg-teal-700 text-white' : available && !past ? 'hover:bg-teal-50 text-teal-700 font-bold' : 'text-gray-300 cursor-not-allowed'}`}>
                        {date?.getDate()}
                      </button>
                    );
                  })}
                </div>
              </div>
              {/* Time slots */}
              {selectedDate && (
                <div>
                  <div className="flex gap-2 mb-3">
                    {[{ id: 'morning', label: 'Morning', icon: '' }, { id: 'afternoon', label: 'Afternoon', icon: '' }, { id: 'evening', label: 'Evening', icon: '' }].map(p => (
                      <button key={p.id} onClick={() => { setSelectedTimeOfDay(p.id); setSelectedSlot(null); }}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition ${selectedTimeOfDay === p.id ? 'bg-teal-700 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-gray-100'}`}>
                        {p.icon} {p.label}
                      </button>
                    ))}
                  </div>
                  {timeSlots.length > 0 ? (
                    <div className="grid grid-cols-3 gap-1.5 max-h-40 overflow-y-auto">
                      {timeSlots.map(slot => (
                        <button key={slot.id} onClick={() => setSelectedSlot(slot)}
                          className={`py-2 rounded-lg text-xs font-semibold transition ${selectedSlot?.id === slot.id ? 'bg-teal-700 text-white' : 'bg-gray-50 text-gray-700 hover:bg-teal-50 hover:text-teal-700 border border-gray-100'}`}>
                          {formatTime(slot.start_time)}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-5 bg-gray-50 rounded-xl">
                      <p className="text-xs text-gray-400">No slots available for this time period</p>
                    </div>
                  )}
                </div>
              )}
              {/* Symptoms & Notes */}
              {selectedSlot && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Symptoms <span className="text-gray-300 normal-case font-normal">(optional)</span></label>
                    <textarea value={symptoms} onChange={e => setSymptoms(e.target.value)} placeholder="Describe your symptoms..." rows={3}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-teal-500 bg-gray-50 resize-none text-gray-900" />
                  </div>
                  <div>
                    <label className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5 block">Notes <span className="text-gray-300 normal-case font-normal">(optional)</span></label>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any additional information..." rows={3}
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
                    {' · '}{formatDate(selectedDate, { weekday: 'long', month: 'long', day: 'numeric' })}
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
                  className={`flex-1 px-5 py-2.5 rounded-xl text-sm font-bold transition ${selectedSlot && !loading ? 'bg-teal-700 text-white hover:bg-teal-800' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}>
                  {loading ? 'Checking...' : 'Continue to Payment'}
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
              <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" onChange={e => setFileToUpload(e.target.files[0])} />
              {fileToUpload ? (
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 bg-teal-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <svg className="w-4.5 h-4.5 text-teal-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-900 truncate">{fileToUpload.name}</p>
                  <p className="text-xs text-gray-400">{(fileToUpload.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-9 h-9 bg-gray-100 rounded-xl flex items-center justify-center mx-auto mb-2">
                    <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" /></svg>
                  </div>
                  <p className="text-xs font-semibold text-gray-700">Click to select file</p>
                  <p className="text-xs text-gray-400 mt-0.5">PDF, JPG, PNG — max 5 MB</p>
                </div>
              )}
            </div>
            <div className="flex space-x-2.5">
              <button onClick={() => { setShowUploadModal(false); setFileToUpload(null); }}
                className="flex-1 px-4 py-2.5 border border-gray-200 text-gray-600 rounded-xl text-xs font-semibold hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleFileUpload} disabled={!fileToUpload || uploading}
                className={`flex-1 px-4 py-2.5 bg-teal-700 text-white rounded-xl text-xs font-bold transition ${(!fileToUpload || uploading) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-teal-800'}`}>
                {uploading ? 'Uploading...' : 'Confirm Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ FAKE PAYMENT MODAL ══════════ */}
      {showPaymentModal && selectedDoctor && selectedSlot && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            {/* Header */}
            <div className="bg-gradient-to-r from-teal-700 to-teal-500 px-6 py-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-teal-200 text-xs font-semibold uppercase tracking-wider">Secure Checkout</p>
                  <h2 className="text-white font-bold text-lg mt-0.5">Confirm & Pay</h2>
                </div>
                <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                  <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" /></svg>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* Doctor info */}
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl p-3">
                {selectedDoctor.avatar_url
                  ? <img src={selectedDoctor.avatar_url} alt="" className="w-12 h-12 rounded-full object-cover flex-shrink-0" />
                  : <div className="w-12 h-12 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-lg">{selectedDoctor.name?.charAt(0)}</span></div>}
                <div>
                  <p className="font-bold text-gray-900 text-sm">Dr. {selectedDoctor.name}</p>
                  <p className="text-xs text-teal-600">{selectedDoctor.specialization}</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {selectedDate && new Date(selectedDate).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {' · '}{formatTime(selectedSlot.start_time)}
                  </p>
                </div>
              </div>

              {/* Price breakdown */}
              <div className="bg-gray-50 rounded-xl p-4 space-y-2.5">
                <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3">Payment Summary</p>
                {(() => {
                  const fee = selectedDoctor.consultation_fee || 0;
                  const platformFee = +(fee * 0.05).toFixed(2);
                  const doctorNet = +(fee - platformFee).toFixed(2);
                  return (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-700 font-medium">Consultation Fee</span>
                        <span className="text-sm font-bold text-gray-900">₹{fee}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-400 pl-1">
                        <span>↳ Platform charge (5% of fee)</span>
                        <span className="text-purple-500 font-semibold">−₹{platformFee}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs text-gray-400 pl-1">
                        <span>↳ Doctor receives</span>
                        <span className="text-green-600 font-semibold">₹{doctorNet}</span>
                      </div>
                      <div className="border-t border-dashed border-gray-200 pt-2.5 flex justify-between items-center">
                        <span className="text-base font-bold text-gray-900">You Pay</span>
                        <span className="text-xl font-bold text-teal-700">₹{fee}</span>
                      </div>
                    </>
                  );
                })()}
              </div>

              {/* Fake payment note */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex items-start gap-2.5">
                <svg className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <div>
                  <p className="text-xs font-bold text-amber-800">Demo Payment Mode</p>
                  <p className="text-xs text-amber-700 mt-0.5">This is a simulated payment for demo purposes. No real money is charged. Click "Confirm & Pay" to instantly confirm your appointment.</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="flex-1 py-3 border border-gray-200 text-gray-700 rounded-xl text-sm font-semibold hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button
                  onClick={handleConfirmPayment}
                  disabled={paymentProcessing}
                  className="flex-1 py-3 bg-teal-700 text-white rounded-xl text-sm font-bold hover:bg-teal-800 transition disabled:opacity-60 flex items-center justify-center gap-2">
                  {paymentProcessing ? (
                    <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Processing…</>
                  ) : (
                    <><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" /></svg>Confirm & Pay</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}