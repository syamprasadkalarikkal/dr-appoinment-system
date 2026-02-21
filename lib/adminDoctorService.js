// lib/adminDoctorService.js

import { supabase } from './supabaseClient';

/* ─────────────────────────────────────────────────────────
   APPROVE DOCTOR
   Calls the server-side API route which uses the service-role
   key to bypass RLS and update is_approved in public.users.
───────────────────────────────────────────────────────── */
export async function approveDoctor(doctorId) {
    try {
        const res = await fetch('/api/admin/approve-doctor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doctorId }),
        });

        const result = await res.json();

        if (!res.ok || !result.success) {
            return { success: false, error: result.error || 'Approval failed' };
        }

        const doctor = result.doctor;

        // Best-effort approval email (client-side is fine for email)
        try {
            await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: doctor.email,
                    subject: 'Your AMRT Account Has Been Approved ✓',
                    html: buildApprovalEmail(doctor),
                }),
            });
        } catch (_) { }

        return { success: true, doctor };
    } catch (error) {
        console.error('approveDoctor error:', error);
        return { success: false, error: error.message };
    }
}

/* ─────────────────────────────────────────────────────────
   REJECT DOCTOR WITH REASON
───────────────────────────────────────────────────────── */
export async function rejectDoctor(doctorId, reason = '') {
    try {
        const res = await fetch('/api/admin/reject-doctor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doctorId, reason }),
        });

        const result = await res.json();

        if (!res.ok || !result.success) {
            return { success: false, error: result.error || 'Rejection failed' };
        }

        const doctor = result.doctor;

        // Best-effort rejection email (client-side is fine for email)
        try {
            await fetch('/api/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: doctor.email,
                    subject: 'AMRT – Doctor Application Update',
                    html: buildRejectionEmail(doctor, reason),
                }),
            });
        } catch (_) { }

        return { success: true };
    } catch (error) {
        console.error('rejectDoctor error:', error);
        return { success: false, error: error.message };
    }
}


/* ─────────────────────────────────────────────────────────
   PERMANENTLY DELETE DOCTOR
   Calls the server-side API route which uses the service-role
   key to bypass RLS and delete from both public.users and auth.users.
───────────────────────────────────────────────────────── */
export async function permanentlyDeleteDoctor(doctorId) {
    try {
        const res = await fetch('/api/admin/delete-doctor', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ doctorId }),
        });

        const result = await res.json();

        if (!res.ok || !result.success) {
            return { success: false, error: result.error || 'Deletion failed' };
        }

        return { success: true, message: result.message, partial: result.partial ?? false };
    } catch (err) {
        console.error('permanentlyDeleteDoctor error:', err);
        return { success: false, error: err.message };
    }
}


/* ─────────────────────────────────────────────────────────
   NOTIFICATION HELPERS
───────────────────────────────────────────────────────── */
export async function fetchAdminNotifications(limit = 30) {
    try {
        const { data } = await supabase
            .from('notifications')
            .select('*')
            .eq('type', 'doctor_approval')
            .order('created_at', { ascending: false })
            .limit(limit);
        return data || [];
    } catch {
        return [];
    }
}

export async function markNotificationAsRead(id) {
    try {
        await supabase.from('notifications').update({ is_read: true }).eq('id', id);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

export async function markAllNotificationsAsRead() {
    try {
        await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('type', 'doctor_approval')
            .eq('is_read', false);
        return { success: true };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

/* ─────────────────────────────────────────────────────────
   EMAIL TEMPLATES
───────────────────────────────────────────────────────── */
function buildApprovalEmail(doctor) {
    return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#0f766e;padding:30px 32px;">
    <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700;">Account Approved ✓</h1>
  </div>
  <div style="padding:30px 32px;">
    <p>Hi <strong>Dr. ${doctor.name}</strong>,</p>
    <p>Your account has been <strong style="color:#059669;">approved</strong>. Log in and complete your profile to start accepting patients.</p>
    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:10px;padding:16px 20px;margin:16px 0;">
      <p style="margin:4px 0;font-size:13px;"><strong>Doctor ID:</strong> ${doctor.doctor_id || '—'}</p>
      <p style="margin:4px 0;font-size:13px;"><strong>Specialization:</strong> ${doctor.specialization || '—'}</p>
    </div>
  </div>
</div>`;
}

function buildRejectionEmail(doctor, reason) {
    return `<div style="font-family:sans-serif;max-width:560px;margin:0 auto;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;">
  <div style="background:#dc2626;padding:30px 32px;">
    <h1 style="color:#fff;font-size:22px;margin:0;font-weight:700;">Application Update</h1>
  </div>
  <div style="padding:30px 32px;">
    <p>Hi <strong>Dr. ${doctor.name}</strong>,</p>
    <p>Your registration has not been approved at this time.</p>
    ${reason ? `<div style="background:#fff1f2;border:1px solid #fecaca;border-radius:10px;padding:16px 20px;margin:16px 0;"><strong style="color:#991b1b;">Reason:</strong><p style="color:#7f1d1d;margin:6px 0 0;">${reason}</p></div>` : ''}
    <p style="font-size:13px;color:#6b7280;">Contact our admin team if you have questions or wish to reapply.</p>
  </div>
</div>`;
}