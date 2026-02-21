// app/api/admin/delete-doctor/route.js
// Uses the service-role key (server-side only) to delete from BOTH
// public.users and auth.users.

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const { doctorId } = await request.json();

    if (!doctorId) {
      return NextResponse.json({ error: 'doctorId is required' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        { error: 'Missing SUPABASE_SERVICE_ROLE_KEY in .env.local' },
        { status: 500 }
      );
    }

    // Admin client — service role bypasses RLS
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // 1. Get doctor name before deleting (for success message)
    const { data: doctor } = await admin
      .from('users')
      .select('name, email')
      .eq('id', doctorId)
      .single();

    // 2. Clean up dependent rows that may not cascade automatically
    await admin.from('notifications').delete().eq('user_id', doctorId);
    await admin.from('notifications').delete().eq('doctor_id', doctorId);
    await admin.from('time_slots').delete().eq('doctor_id', doctorId);
    await admin
      .from('appointments')
      .update({ status: 'cancelled' })
      .eq('doctor_id', doctorId)
      .in('status', ['scheduled', 'confirmed']);

    // 3. Delete from public.users (service role bypasses RLS)
    const { error: dbError } = await admin
      .from('users')
      .delete()
      .eq('id', doctorId);

    if (dbError) {
      console.error('public.users delete error:', dbError);
      return NextResponse.json(
        { success: false, error: `Failed to remove from database: ${dbError.message}` },
        { status: 500 }
      );
    }

    // 4. Delete from auth.users (best-effort — may fail if already removed)
    const { error: authError } = await admin.auth.admin.deleteUser(doctorId);
    if (authError) {
      console.warn('auth.users delete warning (non-fatal):', authError.message);
      // Profile is already gone from public.users, so report partial success
      return NextResponse.json({
        success: true,
        partial: true,
        message: `Dr. ${doctor?.name || doctorId} removed from the database. Auth account may still exist — remove manually from Supabase Auth dashboard if needed.`,
      });
    }

    return NextResponse.json({
      success: true,
      message: `Dr. ${doctor?.name || doctorId} has been permanently deleted.`,
    });
  } catch (err) {
    console.error('delete-doctor route error:', err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}