import { supabase } from './supabaseClient';

/**
 * Send a notification when a doctor signs up
 */
export const sendDoctorApprovalNotification = async (doctorData) => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .insert([
        {
          type: 'doctor_approval',
          title: 'New Doctor Registration',
          message: `${doctorData.name} (${doctorData.specialization}) has signed up and is pending approval.`,
          doctor_id: doctorData.id,
          doctor_email: doctorData.email,
          doctor_name: doctorData.name,
          doctor_specialization: doctorData.specialization,
          is_read: false,
          created_at: new Date().toISOString(),
        }
      ]);

    if (error) {
      console.error('Error sending notification:', error);
      throw error;
    }

    return data;
  } catch (err) {
    console.error('Failed to send doctor approval notification:', err);
    throw err;
  }
};

/**
 * Subscribe to real-time notifications for admin
 */
export const subscribeToDoctorNotifications = (callback) => {
  try {
    const subscription = supabase
      .from('notifications')
      .on('INSERT', (payload) => {
        if (payload.new.type === 'doctor_approval') {
          callback(payload.new);
        }
      })
      .subscribe();

    return subscription;
  } catch (err) {
    console.error('Failed to subscribe to notifications:', err);
    return null;
  }
};

/**
 * Fetch all unread notifications
 */
export const fetchUnreadNotifications = async () => {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('is_read', false)
      .eq('type', 'doctor_approval')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return [];
  }
};

/**
 * Mark notification as read
 */
export const markNotificationAsRead = async (notificationId) => {
  try {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true })
      .eq('id', notificationId);

    if (error) throw error;
  } catch (err) {
    console.error('Error marking notification as read:', err);
  }
};
