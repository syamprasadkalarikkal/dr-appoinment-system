'use client';

/*
  ╔══════════════════════════════════════════════════════════════╗
  ║  Run this SQL in Supabase → SQL Editor before using Admin    ║
  ╠══════════════════════════════════════════════════════════════╣
  ║                                                              ║
  ║  CREATE TABLE IF NOT EXISTS public.admin_profiles (          ║
  ║    id          UUID PRIMARY KEY                              ║
  ║                  REFERENCES auth.users(id) ON DELETE CASCADE,║
  ║    role_title  TEXT DEFAULT 'Admin',                         ║
  ║    bio         TEXT,                                         ║
  ║    address     TEXT,                                         ║
  ║    avatar_url  TEXT,                                         ║
  ║    updated_at  TIMESTAMPTZ DEFAULT NOW()                     ║
  ║  );                                                          ║
  ║                                                              ║
  ║  ALTER TABLE public.admin_profiles ENABLE ROW LEVEL SECURITY;║
  ║                                                              ║
  ║  CREATE POLICY "Admins manage own profile"                   ║
  ║    ON public.admin_profiles FOR ALL                          ║
  ║    USING (auth.uid() = id)                                   ║
  ║    WITH CHECK (auth.uid() = id);                             ║
  ║                                                              ║
  ╚══════════════════════════════════════════════════════════════╝
*/

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

/* ─── Icon helper ─── */
const Ic = ({ d, className = 'w-4 h-4' }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.8}
    strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
    <path d={d} />
  </svg>
);

/* ─── Status badge ─── */
const StatusBadge = ({ status }) => {
  const map = {
    scheduled: 'bg-blue-50 text-blue-700 border-blue-200',
    confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    completed: 'bg-sky-50 text-sky-700 border-sky-200',
    cancelled: 'bg-red-50 text-red-600 border-red-200',
    rejected:  'bg-red-50 text-red-600 border-red-200',
  };
  return (
    <span className={`px-2.5 py-0.5 rounded-lg text-xs font-semibold border capitalize ${map[status] ?? 'bg-gray-50 text-gray-600 border-gray-200'}`}>
      {status}
    </span>
  );
};

/* ─── Sparkline ─── */
function Spark({ data, valueKey, color }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div className="flex items-end gap-0.5 h-10">
      {data.map((d, i) => (
        <div key={i} className="flex-1 rounded-sm" style={{ height: `${Math.max(((d[valueKey] || 0) / max) * 100, 4)}%`, backgroundColor: color, opacity: 0.7 }} />
      ))}
    </div>
  );
}

/* ─── Bar chart ─── */
function BarChart({ data, valueKey, color = '#0d9488', height = 160 }) {
  const max = Math.max(...data.map(d => d[valueKey] || 0), 1);
  return (
    <div className="flex items-end gap-0.5" style={{ height }}>
      {data.map((d, i) => (
        <div key={i} className="flex flex-col items-center gap-1 flex-1">
          <div className="w-full rounded-t" style={{ height: `${Math.max(((d[valueKey] || 0) / max) * (height - 18), 2)}px`, backgroundColor: color, opacity: 0.85 }} />
          <span className="text-[8px] text-gray-400 truncate w-full text-center">{d.day ?? d.label}</span>
        </div>
      ))}
    </div>
  );
}

/* ─── Notification Bell ─── */
function NotificationBell({ notifications, onMarkRead, onMarkAllRead }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = notifications.filter(n => !n.is_read).length;
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);
  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="relative w-9 h-9 bg-gray-50 hover:bg-gray-100 rounded-xl flex items-center justify-center transition">
        <Ic d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" className="w-[18px] h-[18px] text-gray-600" />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-gray-100 z-50 overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-bold text-gray-800 uppercase tracking-wide">Notifications</span>
            {unread > 0 && <button onClick={onMarkAllRead} className="text-[11px] text-teal-600 font-semibold">Mark all read</button>}
          </div>
          <div className="max-h-72 overflow-y-auto divide-y divide-gray-50">
            {notifications.length === 0 ? (
              <div className="py-10 text-center">
                <p className="text-sm font-semibold text-gray-500">All caught up!</p>
                <p className="text-xs text-gray-400 mt-0.5">No new notifications</p>
              </div>
            ) : notifications.map(n => (
              <div key={n.id} onClick={() => !n.is_read && onMarkRead(n.id)}
                className={`px-4 py-3 hover:bg-gray-50 transition cursor-pointer ${!n.is_read ? 'bg-teal-50/40' : ''}`}>
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 bg-teal-50 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Ic d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" className="w-4 h-4 text-teal-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-gray-900">{n.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-gray-400 mt-1">{new Date(n.created_at).toLocaleString()}</p>
                  </div>
                  {!n.is_read && <div className="w-1.5 h-1.5 bg-teal-500 rounded-full mt-1.5 flex-shrink-0" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Reject Modal ─── */
function RejectModal({ doctor, onConfirm, onCancel, loading }) {
  const [reason, setReason] = useState('');
  const presets = ['Incomplete or missing qualification documents', 'Certificate not recognized', 'Information does not match records', 'Specialization not available', 'Under further review — please reapply'];
  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-red-600 px-6 py-4">
          <h3 className="text-sm font-bold text-white">Reject Application — Dr. {doctor.name}</h3>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {presets.map(p => (
              <button key={p} onClick={() => setReason(p)} className={`px-2.5 py-1 text-xs rounded-lg border transition ${reason === p ? 'bg-red-100 border-red-300 text-red-700' : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-red-50'}`}>{p}</button>
            ))}
          </div>
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} placeholder="Rejection reason (sent to doctor)…"
            className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400 resize-none" />
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2.5 text-sm font-semibold border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition">Cancel</button>
            <button onClick={() => onConfirm(reason)} disabled={loading} className="flex-1 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl hover:bg-red-700 transition disabled:opacity-50">
              {loading ? 'Sending…' : 'Reject & Notify'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Delete Modal ─── */
function DeleteModal({ doctor, onConfirm, onCancel, loading }) {
  const [typed, setTyped] = useState('');
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gray-900 px-6 py-4"><h3 className="text-sm font-bold text-white">Permanently Delete — Dr. {doctor.name}</h3></div>
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
            This permanently removes the doctor's profile, account, and all appointments.
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Type <code className="bg-gray-100 px-1 rounded">{doctor.name}</code> to confirm</label>
            <input type="text" value={typed} onChange={e => setTyped(e.target.value)} placeholder={doctor.name}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-red-400" />
          </div>
          <div className="flex gap-3">
            <button onClick={onCancel} className="flex-1 py-2.5 text-sm font-semibold border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition">Cancel</button>
            <button onClick={onConfirm} disabled={typed !== doctor.name || loading} className="flex-1 py-2.5 text-sm font-semibold bg-red-600 text-white rounded-xl disabled:opacity-40 transition">
              {loading ? 'Deleting…' : 'Delete Permanently'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Add Admin Modal ─── */
function AddAdminModal({ onClose, onSuccess }) {
  const [form, setForm]     = useState({ name: '', email: '', password: '', phone: '', role_title: 'Admin' });
  const [avatar, setAvatar] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState('');
  const fileRef = useRef(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white';

  const handleAvatarPick = e => {
    const file = e.target.files?.[0]; if (!file) return;
    setAvatar(file);
    setPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async () => {
    if (!form.name || !form.email || !form.password) { setError('Name, email and password are required.'); return; }
    if (form.password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setLoading(true); setError('');
    try {
      // 1. Create auth user
      const { data: authData, error: authErr } = await supabase.auth.signUp({
        email: form.email,
        password: form.password,
        options: { data: { name: form.name, role: 'admin' } },
      });
      if (authErr) throw authErr;
      const uid = authData.user?.id;
      if (!uid) throw new Error('User creation failed — no user ID returned.');

      // 2. Upload profile image to admin_profile bucket
      let avatar_url = null;
      if (avatar) {
        const ext  = avatar.name.split('.').pop().toLowerCase();
        const path = `admin_${uid}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from('admin_profile')
          .upload(path, avatar, { upsert: true, contentType: avatar.type });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('admin_profile').getPublicUrl(path);
        avatar_url = `${urlData.publicUrl}?t=${Date.now()}`;
      }

      // 3. Insert into public.users with role = 'admin' (no role_title — not in schema)
      const { error: dbErr } = await supabase.from('users').insert([{
        id:          uid,
        name:        form.name,
        email:       form.email,
        phone:       form.phone || null,
        role:        'admin',
        avatar_url:  avatar_url,
        is_approved: true,
        created_at:  new Date().toISOString(),
      }]);
      if (dbErr) throw dbErr;

      // 4. Try to create admin_profiles row (best-effort, won't block if RLS issues)
      try {
        await supabase.from('admin_profiles').upsert([{
          id:         uid,
          role_title: form.role_title || 'Admin',
          avatar_url: avatar_url,
          updated_at: new Date().toISOString(),
        }], { onConflict: 'id' });
      } catch (_) { /* admin_profiles is optional */ }

      onSuccess(); onClose();
    } catch (e) { setError(e.message || 'Failed to create admin.'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="bg-gradient-to-r from-teal-700 to-teal-500 px-6 py-4 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Add New Admin</h3>
            <p className="text-teal-100 text-xs mt-0.5">Create an admin account with role = admin</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition"><Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5 text-white" /></button>
        </div>
        <div className="p-5 space-y-3">
          {error && <div className="bg-red-50 border border-red-200 rounded-xl px-3 py-2 text-xs text-red-700">{error}</div>}

          {/* Avatar picker */}
          <div className="flex items-center gap-4">
            <div className="relative cursor-pointer" onClick={() => fileRef.current?.click()}>
              {preview
                ? <img src={preview} alt="" className="w-14 h-14 rounded-full object-cover ring-4 ring-teal-100" />
                : <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center ring-4 ring-teal-100">
                    <Ic d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" className="w-5 h-5 text-teal-500" />
                  </div>}
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-teal-700 text-white rounded-full flex items-center justify-center shadow">
                <Ic d="M12 4v16m8-8H4" className="w-3 h-3" />
              </div>
            </div>
            <div>
              <p className="text-xs font-semibold text-gray-700">Profile Photo <span className="text-gray-400">(optional)</span></p>
              <p className="text-[11px] text-gray-400">Saved to avatars storage + admin_profiles</p>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarPick} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Full Name *</label><input type="text" value={form.name} onChange={set('name')} placeholder="Full name" className={inp} /></div>
            <div><label className="block text-xs font-semibold text-gray-500 mb-1">Role Title</label><input type="text" value={form.role_title} onChange={set('role_title')} placeholder="e.g. Super Admin" className={inp} /></div>
          </div>
          <div><label className="block text-xs font-semibold text-gray-500 mb-1">Email *</label><input type="email" value={form.email} onChange={set('email')} placeholder="admin@amrt.com" className={inp} /></div>
          <div><label className="block text-xs font-semibold text-gray-500 mb-1">Phone</label><input type="tel" value={form.phone} onChange={set('phone')} placeholder="+91 98765 43210" className={inp} /></div>
          <div><label className="block text-xs font-semibold text-gray-500 mb-1">Password *</label><input type="password" value={form.password} onChange={set('password')} placeholder="Min 8 characters" className={inp} /></div>

          <div className="bg-teal-50 border border-teal-200 rounded-xl px-3 py-2 flex gap-2">
            <Ic d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-4 h-4 text-teal-600 flex-shrink-0 mt-0.5" />
            <p className="text-[11px] text-teal-800">This account will be created with <strong>role = admin</strong> and full admin access. A verification email will be sent.</p>
          </div>

          <div className="flex gap-3 pt-1">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleSubmit} disabled={loading} className="flex-1 py-2.5 text-sm font-semibold bg-teal-700 text-white rounded-xl hover:bg-teal-800 transition disabled:opacity-50 flex items-center justify-center gap-2">
              {loading ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Creating…</> : 'Create Admin'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Admin Profile Modal ─── */
function AdminProfileModal({ admin, isOwn, onClose, onUpdate }) {
  const [editing, setEditing]       = useState(false);
  const [saving, setSaving]         = useState(false);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState(admin.avatar_url || null);
  const [profileExtra, setProfileExtra]   = useState({ bio: '', address: '', role_title: 'Admin' }); // from admin_profiles
  const [loadingExtra, setLoadingExtra]   = useState(true);

  const [form, setForm] = useState({
    name:       admin.name       || '',
    phone:      admin.phone      || '',
    role_title: admin.role_title || 'Admin',  // will be overwritten by admin_profiles load
    bio:        '',
    address:    '',
  });

  const fileRef = useRef(null);
  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));
  const inp = 'w-full px-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500 bg-white';

  /* Load extended profile from admin_profiles */
  useEffect(() => {
    const loadExtra = async () => {
      setLoadingExtra(true);
      try {
        const { data } = await supabase
          .from('admin_profiles')
          .select('bio, address, avatar_url, role_title')
          .eq('id', admin.id)
          .maybeSingle();
        if (data) {
          setProfileExtra({ bio: data.bio || '', address: data.address || '', role_title: data.role_title || 'Admin' });
          setForm(f => ({ ...f, bio: data.bio || '', address: data.address || '', role_title: data.role_title || 'Admin' }));
          if (data.avatar_url && !admin.avatar_url) setAvatarPreview(data.avatar_url);
        }
      } catch (_) {}
      finally { setLoadingExtra(false); }
    };
    loadExtra();
  }, [admin.id]);

  /* Save: update public.users + upsert admin_profiles */
  const handleSave = async () => {
    if (!form.name.trim()) { alert('Name is required.'); return; }
    setSaving(true);
    try {
      // 1. Update public.users (only columns that exist in the schema)
      const { error: usrErr } = await supabase
        .from('users')
        .update({
          name:  form.name.trim(),
          phone: form.phone.trim() || null,
        })
        .eq('id', admin.id);
      if (usrErr) throw usrErr;

      // 2. Upsert admin_profiles (best-effort — non-blocking if RLS not yet disabled)
      try {
        await supabase.from('admin_profiles').upsert({
          id:         admin.id,
          role_title: form.role_title.trim() || 'Admin',
          bio:        form.bio.trim()        || null,
          address:    form.address.trim()    || null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      } catch (_) { /* silent — users table already saved */ }

      onUpdate({
        ...admin,
        name:       form.name.trim(),
        phone:      form.phone.trim() || null,
        role_title: form.role_title.trim() || 'Admin',
      });
      setProfileExtra({ bio: form.bio, address: form.address, role_title: form.role_title });
      setEditing(false);
    } catch (e) { alert('Save failed: ' + e.message); }
    finally { setSaving(false); }
  };

  /* Avatar upload → admin_profile bucket → save URL to users.avatar_url only */
  const handleAvatarChange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarPreview(URL.createObjectURL(file)); // instant local preview
    setAvatarLoading(true);
    try {
      const ext  = file.name.split('.').pop().toLowerCase();
      const filePath = `admin_${admin.id}.${ext}`;

      // 1. Upload file to admin_profile storage bucket
      const { error: upErr } = await supabase.storage
        .from('admin_profile')
        .upload(filePath, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;

      // 2. Get the public URL
      const { data: urlData } = supabase.storage
        .from('admin_profile')
        .getPublicUrl(filePath);
      const finalUrl = `${urlData.publicUrl}?t=${Date.now()}`;

      // 3. Save URL to public.users only — no admin_profiles write needed
      const { error: usrErr } = await supabase
        .from('users')
        .update({ avatar_url: finalUrl })
        .eq('id', admin.id);
      if (usrErr) throw usrErr;

      setAvatarPreview(finalUrl);
      onUpdate({ ...admin, avatar_url: finalUrl });
    } catch (e) {
      alert('Photo upload failed: ' + e.message);
      setAvatarPreview(admin.avatar_url || null);
    } finally {
      setAvatarLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const joined = admin.created_at
    ? new Date(admin.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '—';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden my-4">

        {/* Header */}
        <div className="bg-gradient-to-r from-teal-700 to-teal-500 p-5 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">{isOwn ? 'My Profile' : 'Admin Profile'}</h3>
            <p className="text-teal-200 text-xs mt-0.5">{isOwn ? 'Manage your account details' : 'Viewing admin account'}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition">
            <Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5 text-white" />
          </button>
        </div>

        <div className="p-6 space-y-5">

          {/* ── Avatar + name card ── */}
          <div className="flex items-center gap-4 bg-gray-50 rounded-2xl p-4">
            <div className="relative flex-shrink-0">
              {avatarPreview
                ? <img src={avatarPreview} alt="" className="w-20 h-20 rounded-2xl object-cover ring-4 ring-white shadow" />
                : <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-teal-600 to-teal-800 flex items-center justify-center ring-4 ring-white shadow">
                    <span className="text-white font-black text-3xl">{admin.name?.charAt(0)?.toUpperCase()}</span>
                  </div>}
              {isOwn && (
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={avatarLoading}
                  className="absolute -bottom-1.5 -right-1.5 w-7 h-7 bg-teal-700 hover:bg-teal-800 text-white rounded-full flex items-center justify-center shadow-md transition disabled:opacity-60">
                  {avatarLoading
                    ? <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    : <Ic d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" className="w-3.5 h-3.5" />}
                </button>
              )}
            </div>
            <div className="min-w-0">
              <p className="font-black text-gray-900 text-base truncate">{admin.name}</p>
              <span className="inline-block mt-0.5 px-2 py-0.5 bg-teal-100 text-teal-700 text-[11px] font-bold rounded-full">{profileExtra.role_title || admin.role_title || 'Admin'}</span>
              <p className="text-xs text-gray-400 mt-1 truncate">{admin.email}</p>
              {isOwn && <p className="text-[11px] text-gray-400 mt-0.5">Click photo to change</p>}
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />

          {/* ── View or Edit ── */}
          {editing ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Full Name <span className="text-red-400">*</span></label>
                  <input type="text" value={form.name} onChange={set('name')} className={inp} placeholder="Your full name" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1.5">Role Title</label>
                  <input type="text" value={form.role_title} onChange={set('role_title')} className={inp} placeholder="e.g. Super Admin" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">Phone</label>
                <input type="tel" value={form.phone} onChange={set('phone')} className={inp} placeholder="+91 98765 43210" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">Address</label>
                <input type="text" value={form.address} onChange={set('address')} className={inp} placeholder="City, State" />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-500 mb-1.5">Bio / About</label>
                <textarea value={form.bio} onChange={set('bio')} rows={3}
                  className={`${inp} resize-none`} placeholder="Short description about you…" />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setEditing(false); setForm({ name: admin.name || '', phone: admin.phone || '', role_title: profileExtra.role_title || 'Admin', bio: profileExtra.bio, address: profileExtra.address }); }}
                  className="flex-1 py-2.5 text-sm font-semibold border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving}
                  className="flex-1 py-2.5 text-sm font-semibold bg-teal-700 text-white rounded-xl hover:bg-teal-800 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <><div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />Saving…</> : 'Save Changes'}
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-1">
              {loadingExtra
                ? <div className="flex justify-center py-6"><div className="w-5 h-5 border-2 border-teal-600 border-t-transparent rounded-full animate-spin" /></div>
                : <>
                    {[
                      ['Email',      admin.email               ],
                      ['Phone',      admin.phone      || '—'   ],
                      ['Role Title', profileExtra.role_title || 'Admin'],
                      ['Address',    profileExtra.address || '—'],
                      ['Joined',     joined                    ],
                    ].map(([l, v]) => (
                      <div key={l} className="flex justify-between items-center py-2.5 border-b border-gray-50">
                        <span className="text-xs text-gray-400 font-semibold">{l}</span>
                        <span className="text-xs text-gray-800 text-right max-w-[60%] break-all">{v}</span>
                      </div>
                    ))}

                    {profileExtra.bio && (
                      <div className="pt-3">
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Bio</p>
                        <p className="text-sm text-gray-700 leading-relaxed bg-gray-50 rounded-xl p-3">{profileExtra.bio}</p>
                      </div>
                    )}

                    {isOwn && (
                      <button onClick={() => setEditing(true)}
                        className="w-full mt-3 py-2.5 bg-teal-50 text-teal-700 rounded-xl text-sm font-bold hover:bg-teal-100 transition border border-teal-200 flex items-center justify-center gap-2">
                        <Ic d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" className="w-3.5 h-3.5" />
                        Edit Profile
                      </button>
                    )}
                  </>
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Doctor Detail Modal ─── */
function DoctorDetailModal({ doctor, doctorPatients, doctorAppointments, onClose, onDelete }) {
  const [tab, setTab] = useState('profile');
  const fD = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fT = t => { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; };
  const revApts = doctorAppointments.filter(a => ['confirmed', 'completed'].includes(a.status));
  const totalIncome = revApts.length * (doctor.consultation_fee || 0);
  const amrtShare = totalIncome * 0.05;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
        <div className="bg-gradient-to-r from-teal-700 to-teal-500 p-5 flex items-start justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            {doctor.avatar_url ? <img src={doctor.avatar_url} alt="" className="w-14 h-14 rounded-xl object-cover ring-2 ring-white/30" /> : <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center"><span className="text-white font-bold text-xl">{doctor.name?.charAt(0)}</span></div>}
            <div>
              <h2 className="text-base font-bold text-white">Dr. {doctor.name}</h2>
              <p className="text-teal-100 text-sm">{doctor.specialization}</p>
              {doctor.experience_years && <p className="text-teal-200 text-xs mt-0.5">{doctor.experience_years} yrs experience</p>}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 bg-white/20 hover:bg-white/30 rounded-full flex items-center justify-center transition"><Ic d="M6 18L18 6M6 6l12 12" className="w-3.5 h-3.5 text-white" /></button>
        </div>

        <div className="grid grid-cols-4 divide-x divide-gray-100 bg-gray-50 flex-shrink-0 text-center">
          {[['Patients', doctorPatients.length], ['Appointments', doctorAppointments.length], ['Gross Income', `₹${totalIncome.toLocaleString()}`], ['AMRT 5%', `₹${amrtShare.toFixed(0)}`]].map(([l, v]) => (
            <div key={l} className="py-2.5"><p className="text-sm font-bold text-gray-900">{v}</p><p className="text-[10px] text-gray-400">{l}</p></div>
          ))}
        </div>

        <div className="flex border-b border-gray-100 flex-shrink-0 px-4 bg-white">
          {['profile', 'patients', 'appointments', 'revenue'].map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-4 py-3 text-xs font-semibold border-b-2 transition capitalize ${tab === t ? 'border-teal-700 text-teal-700' : 'border-transparent text-gray-400 hover:text-gray-600'}`}>{t}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {tab === 'profile' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[['Email', doctor.email], ['Doctor ID', doctor.doctor_id || '—'], ['Qualification', doctor.qualification || '—'], ['Specialization', doctor.specialization || '—'], ['Experience', doctor.experience_years ? `${doctor.experience_years} yrs` : '—'], ['Consultation Fee', doctor.consultation_fee ? `₹${doctor.consultation_fee}` : '—'], ['Languages', doctor.languages || '—'], ['Joined', fD(doctor.created_at)]].map(([l, v]) => (
                  <div key={l} className="bg-gray-50 rounded-xl p-3"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{l}</p><p className="text-sm font-semibold text-gray-900 mt-0.5 break-all">{v}</p></div>
                ))}
              </div>
              {doctor.experience_details && <div className="bg-gray-50 rounded-xl p-4"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">About</p><p className="text-sm text-gray-700 leading-relaxed">{doctor.experience_details}</p></div>}
              {(doctor.clinic_place_name || doctor.clinic_address) && (
                <div className="bg-teal-50 border border-teal-100 rounded-xl p-4">
                  <p className="text-[10px] font-bold text-teal-400 uppercase tracking-wider mb-1">Clinic</p>
                  {doctor.clinic_place_name && <p className="text-sm font-bold text-teal-900">{doctor.clinic_place_name}</p>}
                  {doctor.clinic_address && <p className="text-xs text-teal-600 mt-0.5">{doctor.clinic_address}</p>}
                </div>
              )}
              {doctor.clinic_lat && doctor.clinic_lng && (
                <div className="rounded-xl overflow-hidden border border-gray-200">
                  <div className="bg-gray-50 px-3 py-1.5 text-xs text-gray-500 font-medium flex items-center gap-1.5"><Ic d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0zM15 11a3 3 0 11-6 0 3 3 0 016 0z" className="w-3.5 h-3.5 text-teal-600" />Clinic Location</div>
                  <iframe src={`https://maps.google.com/maps?q=${doctor.clinic_lat},${doctor.clinic_lng}&z=15&output=embed`} width="100%" height="180" style={{ border: 0 }} allowFullScreen loading="lazy" />
                </div>
              )}
              {doctor.certificate_url && (
                <div className="flex items-center justify-between bg-blue-50 border border-blue-100 rounded-xl p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 bg-blue-100 rounded-xl flex items-center justify-center"><Ic d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" className="w-4 h-4 text-blue-600" /></div>
                    <div><p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider">Certificate</p><p className="text-xs font-semibold text-blue-900">{doctor.certificate_name || 'Verified Document'}</p><p className="text-[10px] text-green-600 font-semibold mt-0.5">✓ Verified</p></div>
                  </div>
                  <a href={doctor.certificate_url} target="_blank" rel="noreferrer" className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition">View</a>
                </div>
              )}
              <button onClick={onDelete} className="w-full py-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 transition text-sm font-semibold border border-red-200 flex items-center justify-center gap-2">
                <Ic d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" className="w-4 h-4" />
                Delete This Doctor
              </button>
            </div>
          )}

          {tab === 'patients' && (
            doctorPatients.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full">
                  <thead className="bg-gray-50"><tr>{['Patient', 'Email', 'Phone', 'Blood', 'Apts', 'Joined'].map(h => <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-2.5">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {doctorPatients.map(p => (
                      <tr key={p.id} className="hover:bg-gray-50 transition">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" /> : <div className="w-7 h-7 bg-teal-700 rounded-full flex items-center justify-center"><span className="text-white text-[10px] font-bold">{p.name?.charAt(0)}</span></div>}
                            <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">{p.name}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-500">{p.email}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{p.phone || '—'}</td>
                        <td className="px-3 py-2.5 text-xs font-semibold text-red-600">{p.blood_group || '—'}</td>
                        <td className="px-3 py-2.5 text-xs font-bold text-teal-700 text-center">{doctorAppointments.filter(a => a.patient_id === p.id).length}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-400 whitespace-nowrap">{fD(p.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="text-center py-12"><p className="text-sm text-gray-400">No patients yet</p></div>
          )}

          {tab === 'appointments' && (
            doctorAppointments.length > 0 ? (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full">
                  <thead className="bg-gray-50"><tr>{['Patient', 'Date', 'Time', 'Status', 'Fee'].map(h => <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-3 py-2.5">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {doctorAppointments.map(a => (
                      <tr key={a.id} className="hover:bg-gray-50 transition">
                        <td className="px-3 py-2.5">
                          <div className="flex items-center gap-2">
                            {a.patient?.avatar_url ? <img src={a.patient.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover" /> : <div className="w-6 h-6 bg-teal-700 rounded-full flex items-center justify-center"><span className="text-white text-[9px] font-bold">{a.patient?.name?.charAt(0)}</span></div>}
                            <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">{a.patient?.name || '—'}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-xs text-gray-600 whitespace-nowrap">{fD(a.time_slot?.date)}</td>
                        <td className="px-3 py-2.5 text-xs text-gray-600">{fT(a.time_slot?.start_time)}</td>
                        <td className="px-3 py-2.5"><StatusBadge status={a.status} /></td>
                        <td className="px-3 py-2.5 text-xs font-semibold text-green-700">{['confirmed','completed'].includes(a.status) && doctor.consultation_fee ? `₹${doctor.consultation_fee}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <div className="text-center py-12"><p className="text-sm text-gray-400">No appointments yet</p></div>
          )}

          {tab === 'revenue' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                {[['Total Apts', doctorAppointments.length, 'bg-blue-50 text-blue-700'], ['Revenue-Counted', revApts.length, 'bg-green-50 text-green-700'], ['Scheduled', doctorAppointments.filter(a => a.status === 'scheduled').length, 'bg-amber-50 text-amber-700']].map(([l, v, c]) => (
                  <div key={l} className={`rounded-xl p-3 text-center ${c.split(' ')[0]}`}><p className={`text-xl font-bold ${c.split(' ')[1]}`}>{v}</p><p className="text-[10px] text-gray-500 mt-0.5">{l}</p></div>
                ))}
              </div>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full">
                  <thead className="bg-gray-50"><tr>{['Description', 'Value'].map(h => <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-2.5">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-gray-50">
                    {[['Fee per Appointment', `₹${doctor.consultation_fee || 0}`], ['Revenue Appointments (confirmed + completed)', `× ${revApts.length}`], ['Total Patients Paid', `₹${totalIncome.toLocaleString()}`], ['Platform Cut (5% of fee)', `−₹${amrtShare.toFixed(2)}`], ['Doctor Receives (95%)', `₹${(totalIncome * 0.95).toFixed(2)}`]].map(([d, v], i) => (
                      <tr key={i} className={i === 3 ? 'bg-purple-50' : i === 2 ? 'bg-green-50/50' : 'hover:bg-gray-50'}>
                        <td className="px-4 py-3 text-sm text-gray-700">{d}</td>
                        <td className={`px-4 py-3 text-sm font-bold ${i === 3 ? 'text-purple-700' : i === 2 ? 'text-green-700' : 'text-gray-900'}`}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-gray-400">Revenue is counted when appointment status is <strong>confirmed</strong> or <strong>completed</strong>.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   MAIN ADMIN COMPONENT
═══════════════════════════════════════════════════ */
export default function Admin() {
  const router = useRouter();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [pageLoading, setPageLoading]         = useState(true);
  const [currentView, setCurrentView]         = useState('dashboard');
  const [actionLoading, setActionLoading]     = useState(null);

  const [pendingDoctors, setPendingDoctors]   = useState([]);
  const [approvedDoctors, setApprovedDoctors] = useState([]);
  const [allPatients, setAllPatients]         = useState([]);
  const [allAppointments, setAllAppointments] = useState([]);
  const [notifications, setNotifications]     = useState([]);
  const [allAdmins, setAllAdmins]             = useState([]);
  const [currentAdmin, setCurrentAdmin]       = useState(null);
  const [allPayments, setAllPayments]         = useState([]);
  const [adminWallet, setAdminWallet]         = useState(null);
  const [withdrawAmount, setWithdrawAmount]   = useState('');
  const [withdrawing, setWithdrawing]         = useState(false);

  const [aptTab, setAptTab]                   = useState('all');
  const [doctorSearch, setDoctorSearch]       = useState('');
  const [revMonth, setRevMonth]               = useState(new Date().getMonth());
  const [revYear, setRevYear]                 = useState(new Date().getFullYear());
  const [currentMonth, setCurrentMonth]       = useState(new Date());
  const [selectedDate, setSelectedDate]       = useState(new Date());

  const [rejectModal, setRejectModal]         = useState(null);
  const [deleteModal, setDeleteModal]         = useState(null);
  const [detailDoctor, setDetailDoctor]       = useState(null);
  const [showAddAdmin, setShowAddAdmin]       = useState(false);
  const [viewAdminProfile, setViewAdminProfile] = useState(null);
  const [showMyProfile, setShowMyProfile]     = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  const channelRef     = useRef(null);
  const notifChanRef   = useRef(null);
  const profileMenuRef = useRef(null);

  useEffect(() => { checkAuth(); }, []);
  useEffect(() => {
    if (isAuthenticated) { fetchAllData(); fetchNotifications(); setupRealtime(); requestNotificationPermission(); }
    return () => { channelRef.current?.unsubscribe(); notifChanRef.current?.unsubscribe(); };
  }, [isAuthenticated]);
  useEffect(() => {
    const h = e => { if (profileMenuRef.current && !profileMenuRef.current.contains(e.target)) setShowProfileMenu(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const checkAuth = async () => {
    try {
      if (localStorage.getItem('userRole') !== 'admin' || localStorage.getItem('isAdmin') !== 'true') { router.push('/Login'); return; }
      setIsAuthenticated(true);
    } catch { router.push('/Login'); } finally { setPageLoading(false); }
  };

  const fetchAllData = async () => {
    try {
      const [{ data: pending }, { data: approved }, { data: patients }, { data: appointments }, { data: admins }, { data: payments }, { data: wallet }] = await Promise.all([
        supabase.from('users').select('*').eq('role', 'doctor').eq('is_approved', false).order('created_at', { ascending: false }),
        supabase.from('users').select('*').eq('role', 'doctor').eq('is_approved', true).order('created_at', { ascending: false }),
        supabase.from('users').select('*').eq('role', 'patient').order('created_at', { ascending: false }),
        supabase.from('appointments').select('*, patient:patient_id(id,name,email,phone,dob,blood_group,age,gender,avatar_url,created_at), doctor:doctor_id(name,specialization,consultation_fee), time_slot:slot_id(date,start_time,end_time)').order('created_at', { ascending: false }),
        supabase.from('users').select('*').eq('role', 'admin').order('created_at', { ascending: false }),
        supabase.from('payments').select('*, patient:patient_id(id,name,email,avatar_url), doctor:doctor_id(id,name,specialization,avatar_url), appointment:appointment_id(appointment_code, time_slot:slot_id(date,start_time))').order('created_at', { ascending: false }),
        supabase.from('admin_wallet').select('*').limit(1).maybeSingle(),
      ]);
      setPendingDoctors(pending || []);
      setApprovedDoctors(approved || []);
      setAllPatients(patients || []);
      setAllAppointments(appointments || []);
      setAllAdmins(admins || []);
      setAllPayments(payments || []);
      setAdminWallet(wallet || { balance: 0, total_earned: 0, withdrawn: 0 });
      const adminId = localStorage.getItem('adminId') || localStorage.getItem('userId');
      if (admins?.length > 0) setCurrentAdmin(admins.find(a => a.id === adminId) || admins[0]);
    } catch (e) { console.error(e); }
  };

  const handleWithdraw = async () => {
    const amt = parseFloat(withdrawAmount);
    if (!amt || amt <= 0) { alert('Enter a valid amount'); return; }
    if (amt > (adminWallet?.balance || 0)) { alert('Insufficient balance'); return; }
    setWithdrawing(true);
    try {
      const newBalance = (adminWallet.balance || 0) - amt;
      const newWithdrawn = (adminWallet.withdrawn || 0) + amt;
      if (adminWallet.id) {
        await supabase.from('admin_wallet').update({ balance: newBalance, withdrawn: newWithdrawn }).eq('id', adminWallet.id);
      }
      setAdminWallet({ ...adminWallet, balance: newBalance, withdrawn: newWithdrawn });
      setWithdrawAmount('');
      alert(`₹${amt.toFixed(2)} withdrawal recorded successfully!`);
    } catch (e) { alert('Withdrawal failed: ' + e.message); }
    finally { setWithdrawing(false); }
  };

  const fetchNotifications = async () => { const data = await fetchAdminNotifications(30); setNotifications(data || []); };

  const setupRealtime = () => {
    channelRef.current = supabase.channel('admin-doctor-sigs')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'users', filter: 'role=eq.doctor' }, async p => {
        fetchAllData();
        await supabase.from('notifications').insert([{ type: 'doctor_approval', title: 'New Doctor Registration', message: `${p.new.name} (${p.new.specialization || 'Specialist'}) signed up and needs approval.`, doctor_id: p.new.id, doctor_email: p.new.email, doctor_name: p.new.name, doctor_specialization: p.new.specialization, is_read: false, created_at: new Date().toISOString() }]);
      }).subscribe();
    notifChanRef.current = supabase.channel('admin-notif-ch')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: 'type=eq.doctor_approval' }, p => {
        setNotifications(prev => [p.new, ...prev]);
        sendBrowserNotification('New Doctor Registration 🏥', { body: p.new.message });
      }).subscribe();
  };

  const handleApprove = async id => {
    setActionLoading(id + '-approve');
    const r = await approveDoctor(id);
    if (!r.success) alert(`Failed: ${r.error}`); else { fetchAllData(); fetchNotifications(); }
    setActionLoading(null);
  };

  const handleRejectConfirm = async reason => {
    if (!rejectModal) return;
    setActionLoading(rejectModal.id + '-reject');
    const r = await rejectDoctor(rejectModal.id, reason);
    if (!r.success) alert(`Failed: ${r.error}`); else { fetchAllData(); fetchNotifications(); }
    setRejectModal(null); setActionLoading(null);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteModal) return;
    setActionLoading(deleteModal.id + '-delete');
    const r = await permanentlyDeleteDoctor(deleteModal.id);
    if (!r.success) alert(r.partialSuccess ? `Partial: ${r.error}` : `Failed: ${r.error}`); else fetchAllData();
    setDeleteModal(null); setDetailDoctor(null); setActionLoading(null);
  };

  const handleMarkRead    = async id => { await markReadService(id); setNotifications(p => p.map(n => n.id === id ? { ...n, is_read: true } : n)); };
  const handleMarkAllRead = async () => { await markAllNotificationsAsRead(); setNotifications(p => p.map(n => ({ ...n, is_read: true }))); };
  const handleLogout = () => { localStorage.clear(); router.push('/Login'); };

  const fD = d => d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const fT = t => { if (!t) return ''; const [h, m] = t.split(':'); const hr = parseInt(h); return `${hr % 12 || 12}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; };

  const revFilter   = a => ['confirmed', 'completed'].includes(a.status);
  const getDoctorApts = id => allAppointments.filter(a => a.doctor_id === id);
  const getDoctorPats = id => {
    const ids = [...new Set(allAppointments.filter(a => a.doctor_id === id).map(a => a.patient_id))];
    return allPatients.filter(p => ids.includes(p.id));
  };

  const totalAmrt = allAppointments.filter(revFilter).reduce((s, a) => s + (a.doctor?.consultation_fee || 0) * 0.05, 0);

  const getDailyRevenue = () => {
    const days = new Date(revYear, revMonth + 1, 0).getDate();
    return Array.from({ length: days }, (_, i) => {
      const day = i + 1;
      const ds  = `${revYear}-${String(revMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const apts = allAppointments.filter(a => a.time_slot?.date === ds && revFilter(a));
      return { day: String(day), income: +(apts.reduce((s, a) => s + (a.doctor?.consultation_fee || 0), 0) * 0.05).toFixed(2) };
    });
  };

  const getDatesInMonth = () => {
    const y = currentMonth.getFullYear(), mo = currentMonth.getMonth();
    const arr = Array(new Date(y, mo, 1).getDay()).fill(null);
    for (let d = 1; d <= new Date(y, mo + 1, 0).getDate(); d++) arr.push(new Date(y, mo, d));
    return arr;
  };
  const getAptsForDate = date => { if (!date) return []; const ds = date.toISOString().split('T')[0]; return allAppointments.filter(a => a.time_slot?.date === ds); };

  const filteredApts = allAppointments.filter(a => {
    if (aptTab === 'scheduled') return a.status === 'scheduled';
    if (aptTab === 'confirmed') return a.status === 'confirmed';
    if (aptTab === 'completed') return a.status === 'completed';
    if (aptTab === 'cancelled') return ['cancelled', 'rejected'].includes(a.status);
    return true;
  });

  const filteredDoctors = approvedDoctors.filter(d =>
    !doctorSearch || d.name?.toLowerCase().includes(doctorSearch.toLowerCase()) || d.specialization?.toLowerCase().includes(doctorSearch.toLowerCase())
  );

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

  /* ── Nav items — exactly Patient panel style ── */
  const navItems = [
    { id: 'dashboard',    label: 'Dashboard',    d: 'M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6' },
    { id: 'doctors',      label: 'Doctors',       d: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z' },
    { id: 'patients',     label: 'Patients',      d: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z' },
    { id: 'appointments', label: 'Appointments',  d: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', badge: allAppointments.filter(a => a.status === 'scheduled').length },
    { id: 'revenue',      label: 'Revenue',       d: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z' },
    { id: 'payments',     label: 'Payments',      d: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
    { id: 'pending',      label: 'Approvals',     d: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2', badge: pendingDoctors.length },
    { id: 'admins',       label: 'Admin Team',    d: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z' },
  ];

  if (pageLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
        <p className="text-xs text-gray-500">Loading...</p>
      </div>
    </div>
  );
  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Modals */}
      {rejectModal      && <RejectModal doctor={rejectModal} loading={actionLoading === rejectModal.id + '-reject'} onConfirm={handleRejectConfirm} onCancel={() => setRejectModal(null)} />}
      {deleteModal      && <DeleteModal doctor={deleteModal} loading={actionLoading === deleteModal.id + '-delete'} onConfirm={handleDeleteConfirm} onCancel={() => setDeleteModal(null)} />}
      {detailDoctor     && <DoctorDetailModal doctor={detailDoctor} doctorPatients={getDoctorPats(detailDoctor.id)} doctorAppointments={getDoctorApts(detailDoctor.id)} onClose={() => setDetailDoctor(null)} onDelete={() => { setDetailDoctor(null); setDeleteModal(detailDoctor); }} />}
      {showAddAdmin     && <AddAdminModal onClose={() => setShowAddAdmin(false)} onSuccess={fetchAllData} />}
      {viewAdminProfile && <AdminProfileModal admin={viewAdminProfile} isOwn={currentAdmin?.id === viewAdminProfile.id} onClose={() => setViewAdminProfile(null)} onUpdate={u => { setAllAdmins(p => p.map(a => a.id === u.id ? u : a)); if (currentAdmin?.id === u.id) setCurrentAdmin(u); }} />}
      {showMyProfile && currentAdmin && <AdminProfileModal admin={currentAdmin} isOwn={true} onClose={() => setShowMyProfile(false)} onUpdate={u => { setCurrentAdmin(u); setAllAdmins(p => p.map(a => a.id === u.id ? u : a)); }} />}

      {/* ════ SIDEBAR — exactly Patient panel style ════ */}
      <aside className="fixed left-0 top-0 h-full w-60 bg-white border-r border-gray-100 z-40 flex flex-col">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center">
          <img src="/amrt-logo.png" alt="AMRT" className="h-7 w-auto object-contain" onError={e => { e.target.style.display = 'none'; }} />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
          {navItems.map(item => (
            <button key={item.id} onClick={() => setCurrentView(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl transition-all text-sm ${currentView === item.id ? 'bg-teal-700 text-white' : 'text-gray-500 hover:bg-gray-50 hover:text-gray-900'}`}>
              <div className="flex items-center space-x-2.5">
                <svg className="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={item.d} />
                </svg>
                <span className="font-medium">{item.label}</span>
              </div>
              {item.badge > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${currentView === item.id ? 'bg-white/20 text-white' : 'bg-teal-100 text-teal-700'}`}>
                  {item.badge > 9 ? '9+' : item.badge}
                </span>
              )}
            </button>
          ))}
        </nav>
        {/* Admin mini card at bottom */}
        {currentAdmin && (
          <div className="border-t border-gray-100 p-3">
            <button onClick={() => setShowMyProfile(true)}
              className="w-full flex items-center gap-3 px-2 py-2 rounded-xl hover:bg-gray-50 transition text-left">
              {currentAdmin.avatar_url
                ? <img src={currentAdmin.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-white flex-shrink-0" />
                : <div className="w-8 h-8 rounded-full bg-teal-700 flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-xs">{currentAdmin.name?.charAt(0)}</span></div>}
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-gray-900 truncate">{currentAdmin.name}</p>
                <p className="text-[10px] text-gray-400 truncate">{currentAdmin.role_title || 'Admin'}</p>
              </div>
            </button>
          </div>
        )}
      </aside>

      {/* ════ MAIN ════ */}
      <main className="ml-60 min-h-screen">
        {/* Header */}
        <header className="bg-white border-b border-gray-100 sticky top-0 z-30">
          <div className="px-7 py-3.5 flex items-center justify-between">
            <div>
              <h1 className="text-base font-bold text-gray-900">{navItems.find(n => n.id === currentView)?.label || 'Dashboard'}</h1>
              <p className="text-xs text-gray-400 mt-0.5">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
            </div>
            <div className="flex items-center gap-2">
              <NotificationBell notifications={notifications} onMarkRead={handleMarkRead} onMarkAllRead={handleMarkAllRead} />
              <div className="relative" ref={profileMenuRef}>
                <button onClick={() => setShowProfileMenu(v => !v)}
                  className="flex items-center gap-2 px-2 py-1.5 rounded-xl hover:bg-gray-50 transition">
                  {currentAdmin?.avatar_url
                    ? <img src={currentAdmin.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-white" />
                    : <div className="w-8 h-8 rounded-full bg-teal-700 flex items-center justify-center"><span className="text-white font-bold text-xs">{currentAdmin?.name?.charAt(0) || 'A'}</span></div>}
                  <span className="text-sm font-semibold text-gray-700 hidden sm:block">{currentAdmin?.name?.split(' ')[0] || 'Admin'}</span>
                </button>
                {showProfileMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-lg border border-gray-100 z-50 overflow-hidden py-1">
                    <button onClick={() => { setShowMyProfile(true); setShowProfileMenu(false); }}
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 transition">
                      <Ic d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" className="w-4 h-4 text-gray-400" />My Profile
                    </button>
                    <div className="border-t border-gray-100 my-1" />
                    <button onClick={handleLogout} className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition">
                      <Ic d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" className="w-4 h-4" />Sign Out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex">
          <div className="flex-1 p-7 min-w-0">

            {/* ════ DASHBOARD ════ */}
            {currentView === 'dashboard' && (() => {
              const revApts = allAppointments.filter(revFilter);
              const last14 = Array.from({ length: 14 }, (_, i) => {
                const d = new Date(); d.setDate(d.getDate() - (13 - i));
                const ds = d.toISOString().split('T')[0];
                const apts = allAppointments.filter(a => a.time_slot?.date === ds && revFilter(a));
                return { day: d.getDate().toString(), income: apts.reduce((s, a) => s + (a.doctor?.consultation_fee || 0) * 0.05, 0) };
              });
              const weekDays = ['Su','Mo','Tu','We','Th','Fr','Sa'];
              const aptsByDay = weekDays.map((day, i) => ({ day, count: allAppointments.filter(a => a.time_slot?.date && new Date(a.time_slot.date).getDay() === i).length }));

              return (
                <div className="space-y-6">
                  {/* Hero */}
                  <div className="bg-gradient-to-r from-teal-700 to-teal-500 rounded-xl p-6 text-white relative overflow-hidden">
                    <div className="relative z-10">
                      <p className="text-teal-200 text-sm mb-1">Good {new Date().getHours() < 12 ? 'Morning' : new Date().getHours() < 17 ? 'Afternoon' : 'Evening'}, {currentAdmin?.name?.split(' ')[0] || 'Admin'}</p>
                      <h2 className="text-xl font-bold">AMRT Platform Overview</h2>
                      <p className="text-teal-200 text-sm mt-1">{pendingDoctors.length > 0 ? `${pendingDoctors.length} doctor application${pendingDoctors.length > 1 ? 's' : ''} awaiting approval` : 'All doctor approvals up to date'}</p>
                    </div>
                    <div className="absolute right-0 top-0 w-32 h-full opacity-10"><svg viewBox="0 0 100 100" className="w-full h-full"><circle cx="80" cy="20" r="40" fill="white" /><circle cx="30" cy="80" r="30" fill="white" /></svg></div>
                  </div>

                  {/* KPIs */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    {[
                      { label: 'AMRT Revenue', value: `₹${totalAmrt.toFixed(0)}`, sub: '5% platform share', color: 'border-l-purple-500', spark: last14, sk: 'income', sc: '#8b5cf6' },
                      { label: 'Total Patients', value: allPatients.length, sub: 'registered users', color: 'border-l-blue-500', spark: null },
                      { label: 'Appointments', value: allAppointments.length, sub: `${allAppointments.filter(a => a.status === 'scheduled').length} pending`, color: 'border-l-teal-500', spark: aptsByDay, sk: 'count', sc: '#0d9488' },
                      { label: 'Active Doctors', value: approvedDoctors.length, sub: `${pendingDoctors.length} pending approval`, color: 'border-l-green-500', spark: null },
                    ].map(s => (
                      <div key={s.label} className={`bg-white rounded-xl p-5 border border-gray-100 border-l-4 ${s.color}`}>
                        <p className="text-xs font-semibold text-gray-500">{s.label}</p>
                        <h3 className="text-2xl font-bold text-gray-900 mt-0.5">{s.value}</h3>
                        <p className="text-[10px] text-gray-400 mb-3">{s.sub}</p>
                        {s.spark && <Spark data={s.spark} valueKey={s.sk} color={s.sc} />}
                      </div>
                    ))}
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Revenue chart */}
                    <div className="lg:col-span-2 bg-white rounded-xl border border-gray-100 p-5">
                      <div className="flex items-center justify-between mb-4">
                        <div>
                          <h3 className="text-sm font-bold text-gray-900">AMRT Revenue — Last 14 Days</h3>
                          <p className="text-[11px] text-gray-400 mt-0.5">5% from confirmed &amp; completed appointments</p>
                        </div>
                        <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-full">₹{last14.reduce((s, d) => s + d.income, 0).toFixed(0)}</span>
                      </div>
                      <BarChart data={last14} valueKey="income" color="#8b5cf6" height={160} />
                    </div>
                    {/* Top doctors */}
                    <div className="bg-white rounded-xl border border-gray-100 p-5">
                      <h3 className="text-sm font-bold text-gray-900 mb-4">Top Doctors by AMRT Revenue</h3>
                      <div className="space-y-3">
                        {approvedDoctors.map(d => ({ ...d, amrt: getDoctorApts(d.id).filter(revFilter).length * (d.consultation_fee || 0) * 0.05 })).sort((a, b) => b.amrt - a.amrt).slice(0, 6).map((d, i) => (
                          <div key={d.id} className="flex items-center gap-2.5">
                            <span className="text-xs text-gray-300 font-bold w-3">{i + 1}</span>
                            {d.avatar_url ? <img src={d.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" /> : <div className="w-7 h-7 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white text-[10px] font-bold">{d.name?.charAt(0)}</span></div>}
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-gray-900 truncate">Dr. {d.name}</p>
                              <p className="text-[10px] text-gray-400 truncate">{d.specialization}</p>
                            </div>
                            <span className="text-xs font-bold text-purple-700">₹{d.amrt.toFixed(0)}</span>
                          </div>
                        ))}
                        {approvedDoctors.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No doctors yet</p>}
                      </div>
                    </div>
                  </div>

                  {/* Recent appointments table */}
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-gray-900">Recent Appointments</h3>
                      <button onClick={() => setCurrentView('appointments')} className="text-xs text-teal-600 font-semibold">View all</button>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50"><tr>{['Patient','Doctor','Specialty','Date & Time','Status','Fee'].map(h => <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 py-2.5">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {allAppointments.slice(0, 6).map(apt => (
                            <tr key={apt.id} className="hover:bg-gray-50 transition">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                  {apt.patient?.avatar_url ? <img src={apt.patient.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" /> : <div className="w-7 h-7 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white text-[10px] font-bold">{apt.patient?.name?.charAt(0)}</span></div>}
                                  <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">{apt.patient?.name}</span>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-xs font-medium text-gray-700 whitespace-nowrap">Dr. {apt.doctor?.name}</td>
                              <td className="px-5 py-3 text-xs text-teal-600">{apt.doctor?.specialization}</td>
                              <td className="px-5 py-3 text-xs text-gray-500 whitespace-nowrap">{fD(apt.time_slot?.date)} · {fT(apt.time_slot?.start_time)}</td>
                              <td className="px-5 py-3"><StatusBadge status={apt.status} /></td>
                              <td className="px-5 py-3 text-xs font-semibold text-green-700">{revFilter(apt) && apt.doctor?.consultation_fee ? `₹${apt.doctor.consultation_fee}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {allAppointments.length === 0 && <p className="text-xs text-gray-400 text-center py-10">No appointments yet</p>}
                  </div>
                </div>
              );
            })()}

            {/* ════ DOCTORS ════ */}
            {currentView === 'doctors' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">{approvedDoctors.length} approved doctors</p>
                  <div className="relative w-64">
                    <input type="text" placeholder="Search doctors…" value={doctorSearch} onChange={e => setDoctorSearch(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-teal-500" />
                    <Ic d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                  </div>
                </div>
                {filteredDoctors.length > 0 ? (
                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50"><tr>{['Doctor','Specialization','Fee','Exp','Patients','Apts','AMRT Rev.','Profile','Actions'].map(h => <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {filteredDoctors.map(d => {
                            const apts = getDoctorApts(d.id);
                            const pats = getDoctorPats(d.id);
                            const amrt = apts.filter(revFilter).length * (d.consultation_fee || 0) * 0.05;
                            return (
                              <tr key={d.id} className="hover:bg-gray-50 transition">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    {d.avatar_url ? <img src={d.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <div className="w-8 h-8 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-xs">{d.name?.charAt(0)}</span></div>}
                                    <div className="min-w-0"><p className="text-xs font-bold text-gray-900 whitespace-nowrap">Dr. {d.name}</p><p className="text-[10px] text-gray-400 truncate">{d.email}</p></div>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs text-teal-600 font-medium whitespace-nowrap">{d.specialization}</td>
                                <td className="px-4 py-3 text-xs font-semibold text-gray-700">{d.consultation_fee ? `₹${d.consultation_fee}` : '—'}</td>
                                <td className="px-4 py-3 text-xs text-gray-600">{d.experience_years ? `${d.experience_years}y` : '—'}</td>
                                <td className="px-4 py-3 text-xs font-bold text-gray-900 text-center">{pats.length}</td>
                                <td className="px-4 py-3 text-xs font-bold text-gray-900 text-center">{apts.length}</td>
                                <td className="px-4 py-3 text-xs font-bold text-purple-700">₹{amrt.toFixed(0)}</td>
                                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${d.profile_completed ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>{d.profile_completed ? 'Complete' : 'Incomplete'}</span></td>
                                <td className="px-4 py-3">
                                  <div className="flex gap-1.5">
                                    <button onClick={() => setDetailDoctor(d)} className="px-2.5 py-1 bg-teal-50 text-teal-700 rounded-lg text-xs font-semibold hover:bg-teal-100 transition">View</button>
                                    <button onClick={() => setDeleteModal(d)} disabled={!!actionLoading} className="px-2.5 py-1 bg-red-50 text-red-600 rounded-lg text-xs font-semibold hover:bg-red-100 transition disabled:opacity-50">Delete</button>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : (
                  <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
                    <p className="text-sm text-gray-400">{doctorSearch ? 'No doctors match your search' : 'No approved doctors yet'}</p>
                  </div>
                )}
              </div>
            )}

            {/* ════ PATIENTS ════ */}
            {currentView === 'patients' && (
              <div className="space-y-5">
                <p className="text-xs text-gray-400">{allPatients.length} registered patients</p>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  {allPatients.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50"><tr>{['Patient','Email','Phone','Age','Gender','Blood','Apts','Joined'].map(h => <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {allPatients.map(p => (
                            <tr key={p.id} className="hover:bg-gray-50 transition">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  {p.avatar_url ? <img src={p.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <div className="w-8 h-8 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-xs">{p.name?.charAt(0)}</span></div>}
                                  <span className="text-xs font-bold text-gray-900 whitespace-nowrap">{p.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500">{p.email}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{p.phone || '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600">{p.age || '—'}</td>
                              <td className="px-4 py-3 text-xs text-gray-600 capitalize">{p.gender || '—'}</td>
                              <td className="px-4 py-3 text-xs font-semibold text-red-600">{p.blood_group || '—'}</td>
                              <td className="px-4 py-3 text-xs font-bold text-teal-700 text-center">{allAppointments.filter(a => a.patient_id === p.id).length}</td>
                              <td className="px-4 py-3 text-xs text-gray-400 whitespace-nowrap">{fD(p.created_at)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="text-xs text-gray-400 text-center py-12">No patients registered yet</p>}
                </div>
              </div>
            )}

            {/* ════ APPOINTMENTS ════ */}
            {currentView === 'appointments' && (
              <div className="space-y-5">
                {/* Tabs — Patient panel style */}
                <div className="flex space-x-1 bg-gray-100 rounded-xl p-1 w-fit">
                  {[['all','All',allAppointments.length],['scheduled','Scheduled',allAppointments.filter(a=>a.status==='scheduled').length],['confirmed','Confirmed',allAppointments.filter(a=>a.status==='confirmed').length],['completed','Completed',allAppointments.filter(a=>a.status==='completed').length],['cancelled','Cancelled',allAppointments.filter(a=>['cancelled','rejected'].includes(a.status)).length]].map(([id,label,count]) => (
                    <button key={id} onClick={() => setAptTab(id)}
                      className={`px-4 py-2 rounded-lg text-xs font-semibold transition flex items-center gap-1.5 ${aptTab === id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                      {label}
                      {count > 0 && <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${aptTab === id ? 'bg-teal-100 text-teal-700' : 'bg-gray-200 text-gray-500'}`}>{count}</span>}
                    </button>
                  ))}
                </div>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  {filteredApts.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50"><tr>{['Patient','Doctor','Specialty','Date','Time','Status','Fee'].map(h => <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {filteredApts.map(apt => (
                            <tr key={apt.id} className="hover:bg-gray-50 transition">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2.5">
                                  {apt.patient?.avatar_url ? <img src={apt.patient.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" /> : <div className="w-8 h-8 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white text-xs font-bold">{apt.patient?.name?.charAt(0)}</span></div>}
                                  <div className="min-w-0">
                                    <p className="text-xs font-bold text-gray-900 whitespace-nowrap">{apt.patient?.name}</p>
                                    <p className="text-[10px] text-gray-400 truncate">{apt.patient?.email}</p>
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-xs font-medium text-gray-800 whitespace-nowrap">Dr. {apt.doctor?.name}</td>
                              <td className="px-5 py-3 text-xs text-teal-600">{apt.doctor?.specialization}</td>
                              <td className="px-5 py-3 text-xs text-gray-600 whitespace-nowrap">{fD(apt.time_slot?.date)}</td>
                              <td className="px-5 py-3 text-xs text-gray-600">{fT(apt.time_slot?.start_time)}</td>
                              <td className="px-5 py-3"><StatusBadge status={apt.status} /></td>
                              <td className="px-5 py-3 text-xs font-semibold text-green-700">{revFilter(apt) && apt.doctor?.consultation_fee ? `₹${apt.doctor.consultation_fee}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-sm font-semibold text-gray-900 mb-1">No appointments found</p>
                      <p className="text-xs text-gray-400">No records match the selected filter.</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════ REVENUE ════ */}
            {currentView === 'revenue' && (() => {
              const allRevApts = allAppointments.filter(revFilter);
              const totalDocInc = allRevApts.reduce((s, a) => s + (a.doctor?.consultation_fee || 0), 0);
              const daily = getDailyRevenue();
              const monthRev = daily.reduce((s, d) => s + d.income, 0);

              return (
                <div className="space-y-6">
                  <div className="grid grid-cols-3 gap-4">
                    {[['Total Collected from Patients',`₹${totalDocInc.toLocaleString()}`,'All paid appointments','border-l-blue-500'],['Platform Revenue (5%)',`₹${totalAmrt.toFixed(2)}`,'Deducted from each fee','border-l-purple-500'],['Revenue Appointments',allRevApts.length,'Confirmed + Completed','border-l-teal-500']].map(([l,v,s,c]) => (
                      <div key={l} className={`bg-white rounded-xl border border-gray-100 border-l-4 ${c} p-5`}>
                        <p className="text-xs font-semibold text-gray-500">{l}</p>
                        <h3 className="text-2xl font-bold text-gray-900 mt-1">{v}</h3>
                        <p className="text-[10px] text-gray-400 mt-0.5">{s}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-white rounded-xl border border-gray-100 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h3 className="text-sm font-bold text-gray-900">Daily AMRT Revenue</h3>
                        <p className="text-[11px] text-gray-400">Month total: <span className="font-bold text-purple-700">₹{monthRev.toFixed(2)}</span></p>
                      </div>
                      <div className="flex gap-2">
                        <select value={revMonth} onChange={e => setRevMonth(+e.target.value)} className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500">
                          {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                        </select>
                        <select value={revYear} onChange={e => setRevYear(+e.target.value)} className="border border-gray-200 rounded-xl px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-teal-500">
                          {[2024,2025,2026].map(y => <option key={y} value={y}>{y}</option>)}
                        </select>
                      </div>
                    </div>
                    <BarChart data={daily} valueKey="income" color="#8b5cf6" height={180} />
                  </div>

                  <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div className="px-5 py-4 border-b border-gray-50"><h3 className="text-sm font-bold text-gray-900">Revenue by Doctor</h3><p className="text-[11px] text-gray-400">Confirmed &amp; completed appointments</p></div>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50"><tr>{['Doctor','Specialization','Fee/Visit','Rev. Apts','Patient Paid (Total)','Platform Cut (5%)','Doctor Receives (95%)','Certificate'].map(h => <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-2.5">{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-50">
                          {[...approvedDoctors]
                            .map(d => {
                              const ra = getDoctorApts(d.id).filter(revFilter);
                              const income = ra.length * (d.consultation_fee || 0);
                              return { ...d, ra, income, amrt: income * 0.05 };
                            })
                            .sort((a, b) => b.income - a.income)
                            .map(d => (
                              <tr key={d.id} className="hover:bg-gray-50 transition">
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-2.5">
                                    {d.avatar_url ? <img src={d.avatar_url} alt="" className="w-7 h-7 rounded-full object-cover" /> : <div className="w-7 h-7 bg-teal-700 rounded-full flex items-center justify-center"><span className="text-white text-[10px] font-bold">{d.name?.charAt(0)}</span></div>}
                                    <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">Dr. {d.name}</span>
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-xs text-teal-600">{d.specialization}</td>
                                <td className="px-4 py-3 text-xs font-semibold text-gray-700">₹{d.consultation_fee || 0}</td>
                                <td className="px-4 py-3 text-xs text-gray-600 text-center">{d.ra.length}</td>
                                <td className="px-4 py-3 text-xs font-bold text-green-700">₹{d.income.toLocaleString()}</td>
                                <td className="px-4 py-3 text-xs font-bold text-purple-700">₹{d.amrt.toFixed(2)}</td>
                                <td className="px-4 py-3 text-xs text-gray-600">₹{(d.income * 0.95).toFixed(2)}</td>
                                <td className="px-4 py-3">{d.certificate_url ? <a href={d.certificate_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 font-semibold hover:underline">View</a> : <span className="text-xs text-gray-300">None</span>}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                    </div>
                    {approvedDoctors.length === 0 && <p className="text-xs text-gray-400 text-center py-10">No doctor revenue data</p>}
                  </div>
                </div>
              );
            })()}

            {/* ════ PAYMENTS ════ */}
            {currentView === 'payments' && (
              <div className="space-y-6">
                {/* Wallet card */}
                <div className="bg-gradient-to-r from-purple-700 to-purple-500 rounded-xl p-6 text-white">
                  <p className="text-purple-200 text-xs font-semibold uppercase tracking-wider mb-1">Admin Wallet</p>
                  <h2 className="text-3xl font-bold">₹{(adminWallet?.balance || 0).toFixed(2)}</h2>
                  <p className="text-purple-200 text-xs mt-1">Available Balance</p>
                  <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/20">
                    <div><p className="text-purple-200 text-xs">Total Earned</p><p className="text-white font-bold text-lg">₹{(adminWallet?.total_earned || 0).toFixed(2)}</p></div>
                    <div><p className="text-purple-200 text-xs">Total Withdrawn</p><p className="text-white font-bold text-lg">₹{(adminWallet?.withdrawn || 0).toFixed(2)}</p></div>
                  </div>
                </div>

                {/* Withdraw form */}
                <div className="bg-white rounded-xl border border-gray-100 p-5">
                  <h3 className="text-sm font-bold text-gray-900 mb-1">Withdraw Funds</h3>
                  <p className="text-xs text-gray-400 mb-4">Record a withdrawal from the platform wallet</p>
                  <div className="flex gap-3">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 font-semibold text-sm">₹</span>
                      <input
                        type="number"
                        value={withdrawAmount}
                        onChange={e => setWithdrawAmount(e.target.value)}
                        placeholder="Enter amount"
                        min="1"
                        max={adminWallet?.balance || 0}
                        className="w-full pl-7 pr-3 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      />
                    </div>
                    <button
                      onClick={handleWithdraw}
                      disabled={withdrawing || !withdrawAmount}
                      className="px-5 py-2.5 bg-purple-700 text-white rounded-xl text-sm font-bold hover:bg-purple-800 transition disabled:opacity-50 flex items-center gap-2">
                      {withdrawing ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : null}
                      Withdraw
                    </button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-2">Available: ₹{(adminWallet?.balance || 0).toFixed(2)}</p>
                </div>

                {/* All payments table */}
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-50 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-gray-900">All Payments</h3>
                      <p className="text-[11px] text-gray-400">{allPayments.length} total transactions · Platform earned ₹{allPayments.reduce((s,p)=>s+(p.platform_fee||0),0).toFixed(2)}</p>
                    </div>
                  </div>
                  {allPayments.length > 0 ? (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-gray-50">
                          <tr>{['#','Txn ID','Patient','Doctor','Apt. Code','Date','Patient Paid','Platform (5%)','Doctor Gets','Status'].map(h => (
                            <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-4 py-2.5 whitespace-nowrap">{h}</th>
                          ))}</tr>
                        </thead>
                        <tbody className="divide-y divide-gray-50">
                          {allPayments.map((p, idx) => (
                            <tr key={p.id} className="hover:bg-gray-50 transition">
                              <td className="px-4 py-3 text-xs text-gray-300">{idx+1}</td>
                              <td className="px-4 py-3 font-mono text-[11px] text-gray-500">{p.transaction_id}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {p.patient?.avatar_url ? <img src={p.patient.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" /> : <div className="w-6 h-6 bg-blue-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white text-[9px] font-bold">{p.patient?.name?.charAt(0)}</span></div>}
                                  <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">{p.patient?.name || '—'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  {p.doctor?.avatar_url ? <img src={p.doctor.avatar_url} alt="" className="w-6 h-6 rounded-full object-cover flex-shrink-0" /> : <div className="w-6 h-6 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white text-[9px] font-bold">{p.doctor?.name?.charAt(0)}</span></div>}
                                  <span className="text-xs font-semibold text-gray-900 whitespace-nowrap">Dr. {p.doctor?.name || '—'}</span>
                                </div>
                              </td>
                              <td className="px-4 py-3">
                                <span className="font-mono font-bold text-teal-700 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded-md text-[11px]">
                                  {p.appointment?.appointment_code || '—'}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-xs text-gray-500 whitespace-nowrap">{fD(p.created_at)}</td>
                              <td className="px-4 py-3 text-xs font-bold text-teal-700">₹{p.total_amount}</td>
                              <td className="px-4 py-3 text-xs font-bold text-purple-700">−₹{p.platform_fee}</td>
                              <td className="px-4 py-3 text-xs font-bold text-green-700">₹{((p.total_amount||0)-(p.platform_fee||0)).toFixed(2)}</td>
                              <td className="px-4 py-3">
                                <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[10px] font-bold uppercase">{p.status}</span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="py-16 text-center">
                      <div className="w-14 h-14 bg-purple-50 rounded-full flex items-center justify-center mx-auto mb-3"><Ic d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" className="w-7 h-7 text-purple-400" /></div>
                      <p className="text-sm font-bold text-gray-700">No payments yet</p>
                      <p className="text-xs text-gray-400 mt-1">Payments appear when patients book and pay for appointments</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ════ APPROVALS ════ */}
            {currentView === 'pending' && (
              <div className="space-y-4">
                <p className="text-xs text-gray-400">{pendingDoctors.length} application{pendingDoctors.length !== 1 ? 's' : ''} awaiting review</p>
                {pendingDoctors.length > 0 ? pendingDoctors.map(doctor => (
                  <div key={doctor.id} className="bg-white rounded-xl border border-gray-100 hover:border-teal-200 transition overflow-hidden">
                    <div className="px-5 py-4 flex items-center justify-between gap-4">
                      <div className="flex items-center gap-4">
                        {doctor.avatar_url ? <img src={doctor.avatar_url} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" /> : <div className="w-12 h-12 bg-teal-700 rounded-xl flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-lg">{doctor.name?.charAt(0)}</span></div>}
                        <div>
                          <h4 className="text-sm font-bold text-gray-900">Dr. {doctor.name}</h4>
                          <p className="text-xs text-teal-600 font-semibold">{doctor.specialization}</p>
                          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-xs text-gray-500">
                            <span>{doctor.email}</span>
                            {doctor.doctor_id && <span>ID: {doctor.doctor_id}</span>}
                            {doctor.qualification && <span>{doctor.qualification}</span>}
                            {doctor.experience_years && <span>{doctor.experience_years} yrs exp</span>}
                            {doctor.consultation_fee && <span>Fee: ₹{doctor.consultation_fee}</span>}
                            <span>Applied: {fD(doctor.created_at)}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        {doctor.certificate_url && <a href={doctor.certificate_url} target="_blank" rel="noreferrer" className="px-3 py-2 border border-blue-200 bg-blue-50 text-blue-700 rounded-xl text-xs font-semibold hover:bg-blue-100 transition">View Cert.</a>}
                        <button onClick={() => handleApprove(doctor.id)} disabled={!!actionLoading}
                          className="px-4 py-2 bg-teal-700 text-white rounded-xl text-xs font-semibold hover:bg-teal-800 transition disabled:opacity-50 flex items-center gap-1.5">
                          {actionLoading === doctor.id + '-approve' ? <div className="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin" /> : <Ic d="M5 13l4 4L19 7" className="w-3.5 h-3.5" />}
                          Approve
                        </button>
                        <button onClick={() => setRejectModal(doctor)} disabled={!!actionLoading} className="px-4 py-2 border border-red-200 bg-red-50 text-red-600 rounded-xl text-xs font-semibold hover:bg-red-100 transition disabled:opacity-50">Reject</button>
                      </div>
                    </div>
                  </div>
                )) : (
                  <div className="bg-white rounded-xl border border-gray-100 p-16 text-center">
                    <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3"><Ic d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" className="w-7 h-7 text-green-600" /></div>
                    <p className="text-sm font-bold text-gray-800">All caught up!</p>
                    <p className="text-xs text-gray-400 mt-1">No pending doctor approvals.</p>
                  </div>
                )}
              </div>
            )}

            {/* ════ ADMIN TEAM ════ */}
            {currentView === 'admins' && (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs text-gray-400">{allAdmins.length} admin account{allAdmins.length !== 1 ? 's' : ''}</p>
                  <button onClick={() => setShowAddAdmin(true)} className="px-4 py-2 bg-teal-700 text-white rounded-xl text-xs font-semibold hover:bg-teal-800 transition flex items-center gap-1.5">
                    <Ic d="M12 4v16m8-8H4" className="w-3.5 h-3.5" />Add New Admin
                  </button>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50"><tr>{['Admin','Email','Phone','Role Title','Joined','Actions'].map(h => <th key={h} className="text-left text-[10px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-gray-50">
                        {allAdmins.map(admin => (
                          <tr key={admin.id} className="hover:bg-gray-50 transition">
                            <td className="px-5 py-3">
                              <div className="flex items-center gap-3">
                                {admin.avatar_url ? <img src={admin.avatar_url} alt="" className="w-8 h-8 rounded-full object-cover ring-2 ring-teal-100 flex-shrink-0" /> : <div className="w-8 h-8 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white font-bold text-xs">{admin.name?.charAt(0)}</span></div>}
                                <p className="text-xs font-bold text-gray-900 whitespace-nowrap">{admin.name}{currentAdmin?.id === admin.id && <span className="ml-1.5 text-[10px] bg-teal-100 text-teal-700 px-1.5 py-0.5 rounded-full font-bold">You</span>}</p>
                              </div>
                            </td>
                            <td className="px-5 py-3 text-xs text-gray-500">{admin.email}</td>
                            <td className="px-5 py-3 text-xs text-gray-600">{admin.phone || '—'}</td>
                            <td className="px-5 py-3"><span className="px-2 py-0.5 bg-teal-50 text-teal-700 text-xs font-semibold rounded-full">{admin.role_title || 'Admin'}</span></td>
                            <td className="px-5 py-3 text-xs text-gray-400 whitespace-nowrap">{fD(admin.created_at)}</td>
                            <td className="px-5 py-3"><button onClick={() => setViewAdminProfile(admin)} className="px-3 py-1.5 bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold hover:bg-gray-100 transition border border-gray-200">View Profile</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {allAdmins.length === 0 && <p className="text-xs text-gray-400 text-center py-10">No admins found</p>}
                </div>
              </div>
            )}

          </div>

          {/* ════ RIGHT SIDEBAR — Calendar ════ */}
          <aside className="w-60 flex-shrink-0 border-l border-gray-100 bg-white sticky top-[61px] self-start min-h-[calc(100vh-61px)] p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-gray-900">{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h3>
              <div className="flex gap-0.5">
                {[['M15 19l-7-7 7-7',-1],['M9 5l7 7-7 7',1]].map(([d,dir],i) => (
                  <button key={i} onClick={() => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + dir))} className="p-1 hover:bg-gray-100 rounded-lg transition">
                    <svg className="w-3.5 h-3.5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={d} /></svg>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-7 gap-0.5 mb-1">{['Su','Mo','Tu','We','Th','Fr','Sa'].map(d => <div key={d} className="text-center text-[9px] text-gray-400 font-semibold py-0.5">{d}</div>)}</div>
            <div className="grid grid-cols-7 gap-0.5 mb-4">
              {getDatesInMonth().map((date, i) => {
                const isSel = date && selectedDate && date.toDateString() === selectedDate.toDateString();
                const isToday = date && date.toDateString() === new Date().toDateString();
                const hasApts = date && getAptsForDate(date).length > 0;
                return (
                  <button key={i} onClick={() => date && setSelectedDate(date)}
                    className={`aspect-square rounded-lg flex items-center justify-center text-[10px] relative transition ${!date ? 'invisible' : ''} ${isToday ? 'bg-teal-700 text-white font-bold' : isSel ? 'bg-gray-800 text-white font-bold' : 'hover:bg-gray-100 text-gray-600'}`}>
                    {date && <>{date.getDate()}{hasApts && !isToday && !isSel && <div className="absolute bottom-0.5 w-1 h-1 bg-teal-500 rounded-full" />}</>}
                  </button>
                );
              })}
            </div>
            <h4 className="text-xs font-bold text-gray-900 mb-2">{selectedDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</h4>
            <div className="space-y-2">
              {getAptsForDate(selectedDate).slice(0, 3).map((apt, i) => (
                <div key={apt.id} className={`p-2.5 rounded-xl ${i % 2 === 0 ? 'bg-teal-50' : 'bg-blue-50'}`}>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    {apt.patient?.avatar_url ? <img src={apt.patient.avatar_url} alt="" className="w-5 h-5 rounded-full object-cover flex-shrink-0" /> : <div className="w-5 h-5 bg-teal-700 rounded-full flex items-center justify-center flex-shrink-0"><span className="text-white text-[8px] font-bold">{apt.patient?.name?.charAt(0)}</span></div>}
                    <p className="text-xs font-semibold text-gray-900 truncate">{apt.patient?.name}</p>
                  </div>
                  <p className="text-[10px] text-gray-500 ml-7">Dr. {apt.doctor?.name}</p>
                  <p className="text-[10px] text-gray-400 ml-7">{fT(apt.time_slot?.start_time)}</p>
                </div>
              ))}
              {getAptsForDate(selectedDate).length === 0 && <p className="text-xs text-gray-400 text-center py-4">No appointments</p>}
            </div>

            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Platform Revenue</p>
              <div className="bg-purple-50 border border-purple-100 rounded-xl p-3 space-y-1.5">
                {[['All Time', `₹${totalAmrt.toFixed(0)}`], ['This Month', `₹${getDailyRevenue().reduce((s, d) => s + d.income, 0).toFixed(0)}`]].map(([l, v]) => (
                  <div key={l} className="flex justify-between items-center">
                    <span className="text-[11px] text-purple-600">{l}</span>
                    <span className="text-xs font-bold text-purple-800">{v}</span>
                  </div>
                ))}
                <p className="text-[9px] text-purple-400 pt-1 border-t border-purple-100">5% of confirmed + completed</p>
              </div>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}