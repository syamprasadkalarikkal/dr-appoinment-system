import { supabase } from './supabaseClient';

/**
 * Fetch user role and profile data from the users table
 * @param {string} userId - The user's UUID from auth
 * @returns {Promise<Object>} User data including role
 */
export async function getUserRole(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Error fetching user role:', error);
      return null;
    }

    return data;
  } catch (err) {
    console.error('Exception in getUserRole:', err);
    return null;
  }
}

/**
 * Check if user account is approved (for doctors)
 * @param {string} userId - The user's UUID
 * @returns {Promise<boolean>} Approval status
 */
export async function isUserApproved(userId) {
  try {
    const { data, error } = await supabase
      .from('users')
      .select('is_approved, role')
      .eq('id', userId)
      .single();

    if (error) return false;

    // Admin and patients are always approved
    if (data.role === 'admin' || data.role === 'patient') {
      return true;
    }

    // Doctors need explicit approval
    return data.is_approved === true;
  } catch (err) {
    return false;
  }
}