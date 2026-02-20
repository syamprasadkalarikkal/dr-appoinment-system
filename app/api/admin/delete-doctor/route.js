import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

/**
 * POST /api/admin/delete-doctor
 *
 * Permanently removes a doctor from:
 *  1. public.users  (your app table)
 *  2. auth.users    (Supabase authentication)
 *
 * Uses the SERVICE ROLE key — this route must NEVER be called
 * without first verifying the caller is an authenticated admin.
 */

// ── Admin-level Supabase client (server-side ONLY) ──────────────────────────
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY, // ⚠️  Never expose this to the browser
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

export async function POST(request) {
  try {
    const body = await request.json();
    const { doctorId } = body;

    // ── 1. Validate input ────────────────────────────────────────────────────
    if (!doctorId || typeof doctorId !== 'string') {
      return NextResponse.json(
        { success: false, error: 'Invalid or missing doctorId' },
        { status: 400 }
      );
    }

    // ── 2. Verify the caller is an authenticated admin ───────────────────────
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorised — no token provided' },
        { status: 401 }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user: caller }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !caller) {
      return NextResponse.json(
        { success: false, error: 'Unauthorised — invalid session' },
        { status: 401 }
      );
    }

    // Confirm the caller has the admin role in your users table
    const { data: callerProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('role')
      .eq('id', caller.id)
      .single();

    if (profileError || callerProfile?.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Forbidden — admin access required' },
        { status: 403 }
      );
    }

    // ── 3. Verify the target is actually a doctor ────────────────────────────
    const { data: doctorProfile, error: doctorFetchError } = await supabaseAdmin
      .from('users')
      .select('id, name, role, email')
      .eq('id', doctorId)
      .single();

    if (doctorFetchError || !doctorProfile) {
      return NextResponse.json(
        { success: false, error: 'Doctor not found' },
        { status: 404 }
      );
    }

    if (doctorProfile.role !== 'doctor') {
      return NextResponse.json(
        { success: false, error: 'Target user is not a doctor' },
        { status: 400 }
      );
    }

    // ── 4. Clean up related data (cascade-safe order) ────────────────────────

    // 4a. Remove notifications sent to or about this doctor
    await supabaseAdmin
      .from('notifications')
      .delete()
      .or(`user_id.eq.${doctorId},doctor_id.eq.${doctorId}`);

    // 4b. Remove time slots created by this doctor
    await supabaseAdmin
      .from('time_slots')
      .delete()
      .eq('doctor_id', doctorId);

    // 4c. Cancel any pending/scheduled appointments
    await supabaseAdmin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'confirmed']);

    // ── 5. Delete from public.users ──────────────────────────────────────────
    const { error: deleteUserError } = await supabaseAdmin
      .from('users')
      .delete()
      .eq('id', doctorId);

    if (deleteUserError) {
      console.error('[delete-doctor] Failed to delete from users table:', deleteUserError);
      return NextResponse.json(
        { success: false, error: 'Failed to delete doctor profile' },
        { status: 500 }
      );
    }

    // ── 6. Delete from auth.users (requires service role) ───────────────────
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(doctorId);

    if (deleteAuthError) {
      // The public.users row is already gone — log but don't fail silently
      console.error('[delete-doctor] Failed to delete from auth.users:', deleteAuthError);
      return NextResponse.json(
        {
          success: false,
          error: 'Doctor profile deleted but auth account removal failed. Please remove manually from Supabase dashboard.',
          partialSuccess: true,
        },
        { status: 500 }
      );
    }

    // ── 7. Success ───────────────────────────────────────────────────────────
    console.log(`[delete-doctor] Successfully deleted doctor: ${doctorProfile.name} (${doctorId})`);

    return NextResponse.json({
      success: true,
      message: `Doctor "${doctorProfile.name}" has been permanently deleted from all records.`,
      deletedDoctor: {
        id: doctorId,
        name: doctorProfile.name,
        email: doctorProfile.email,
      },
    });
  } catch (err) {
    console.error('[delete-doctor] Unexpected error:', err);
    return NextResponse.json(
      { success: false, error: 'An unexpected server error occurred' },
      { status: 500 }
    );
  }
}