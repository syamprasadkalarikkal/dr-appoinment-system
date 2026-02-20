import { supabase } from './supabaseClient';
export const approveDoctor = async (doctorId) => {
    // 1. Flip the approval flag
    const { error: updateError } = await supabase
        .from('users')
        .update({ is_approved: true })
        .eq('id', doctorId)
        .eq('role', 'doctor'); // safety guard — only affects doctor rows

    if (updateError) {
        console.error('[approveDoctor] Update failed:', updateError);
        return { success: false, error: updateError.message };
    }

    // 2. Notify the doctor inside the app
    const { error: notifError } = await supabase
        .from('notifications')
        .insert([
            {
                user_id: doctorId,
                type: 'account_approved',
                title: '🎉 Account Approved',
                message:
                    'Your doctor account has been approved by the admin. You can now log in and start accepting appointments.',
                is_read: false,
                created_at: new Date().toISOString(),
            },
        ]);

    if (notifError) {
        // Non-fatal — approval already succeeded
        console.warn('[approveDoctor] Notification insert failed:', notifError);
    }

    // 3. Mark the related admin pending-approval notification as read
    await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('type', 'doctor_approval')
        .eq('doctor_id', doctorId)
        .eq('is_read', false);

    return { success: true };
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reject a doctor application.
 *
 * Keeps the user row but sets is_approved = false, blocking login.
 * Sends the doctor a rejection notification.
 *
 * @param {string} doctorId
 * @returns {{ success: boolean, error?: string }}
 */
export const rejectDoctor = async (doctorId) => {
    const { error: updateError } = await supabase
        .from('users')
        .update({ is_approved: false })
        .eq('id', doctorId)
        .eq('role', 'doctor');

    if (updateError) {
        console.error('[rejectDoctor] Update failed:', updateError);
        return { success: false, error: updateError.message };
    }

    // Notify the doctor
    await supabase.from('notifications').insert([
        {
            user_id: doctorId,
            type: 'account_rejected',
            title: 'Application Not Approved',
            message:
                'Unfortunately your doctor account application has not been approved at this time. Please contact support for more information.',
            is_read: false,
            created_at: new Date().toISOString(),
        },
    ]);

    return { success: true };
};

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Permanently delete a doctor from BOTH public.users AND auth.users.
 *
 * This calls the server-side API route /api/admin/delete-doctor,
 * which uses the Supabase service role key to remove the auth record.
 * The service role key is NEVER exposed to the browser.
 *
 * @param {string} doctorId - UUID of the doctor to delete permanently
 * @returns {{ success: boolean, message?: string, error?: string }}
 */
export const permanentlyDeleteDoctor = async (doctorId) => {
    // Get the current session token to authenticate the API call
    const {
        data: { session },
        error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session?.access_token) {
        return {
            success: false,
            error: 'No active session found. Please log in again.',
        };
    }

    try {
        const response = await fetch('/api/admin/delete-doctor', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${session.access_token}`,
            },
            body: JSON.stringify({ doctorId }),
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
            console.error('[permanentlyDeleteDoctor] API error:', result.error);
            return {
                success: false,
                error: result.error || 'Deletion failed. Please try again.',
                partialSuccess: result.partialSuccess ?? false,
            };
        }

        return {
            success: true,
            message: result.message,
            deletedDoctor: result.deletedDoctor,
        };
    } catch (err) {
        console.error('[permanentlyDeleteDoctor] Network error:', err);
        return {
            success: false,
            error: 'Network error — could not reach the server.',
        };
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATION HELPERS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert a pending-approval notification when a doctor signs up.
 * Call this right after supabase.auth.signUp in your signup flow.
 *
 * @param {{ id: string, name: string, email: string, specialization: string }} doctorData
 */
export const sendDoctorApprovalNotification = async (doctorData) => {
    const { error } = await supabase.from('notifications').insert([
        {
            type: 'doctor_approval',
            title: 'New Doctor Registration',
            message: `${doctorData.name} (${doctorData.specialization || 'Doctor'}) has signed up and is pending approval.`,
            doctor_id: doctorData.id,
            doctor_email: doctorData.email,
            doctor_name: doctorData.name,
            doctor_specialization: doctorData.specialization,
            is_read: false,
            created_at: new Date().toISOString(),
        },
    ]);

    if (error) {
        console.error('[sendDoctorApprovalNotification] Failed:', error);
        throw error;
    }
};

/**
 * Subscribe to real-time doctor-approval notifications (Supabase v2).
 *
 * @param {(notification: object) => void} callback
 * @returns The Supabase channel — call channel.unsubscribe() on cleanup.
 */
export const subscribeToDoctorNotifications = (callback) => {
    return supabase
        .channel('admin-doctor-approval-notifications')
        .on(
            'postgres_changes',
            {
                event: 'INSERT',
                schema: 'public',
                table: 'notifications',
                filter: 'type=eq.doctor_approval',
            },
            (payload) => callback(payload.new)
        )
        .subscribe();
};

/**
 * Fetch all notifications for the admin bell (latest 30).
 */
export const fetchAdminNotifications = async (limit = 30) => {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('type', 'doctor_approval')
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('[fetchAdminNotifications] Failed:', error);
        return [];
    }

    return data || [];
};

/**
 * Fetch only unread admin notifications.
 */
export const fetchUnreadNotifications = async () => {
    const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('type', 'doctor_approval')
        .eq('is_read', false)
        .order('created_at', { ascending: false });

    if (error) {
        console.error('[fetchUnreadNotifications] Failed:', error);
        return [];
    }

    return data || [];
};

/**
 * Mark a single notification as read.
 * @param {string|number} notificationId
 */
export const markNotificationAsRead = async (notificationId) => {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

    if (error) {
        console.error('[markNotificationAsRead] Failed:', error);
        throw error;
    }
};

/**
 * Mark all unread doctor-approval notifications as read.
 */
export const markAllNotificationsAsRead = async () => {
    const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('type', 'doctor_approval')
        .eq('is_read', false);

    if (error) {
        console.error('[markAllNotificationsAsRead] Failed:', error);
        throw error;
    }
};