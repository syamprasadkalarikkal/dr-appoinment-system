// app/api/admin/approve-doctor/route.js
// Uses service-role key (server-side only) to bypass RLS and approve a doctor.

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

        // 1. Update is_approved in public.users
        const { data: doctor, error: updateError } = await admin
            .from('users')
            .update({ is_approved: true, updated_at: new Date().toISOString() })
            .eq('id', doctorId)
            .select()
            .single();

        if (updateError) {
            console.error('approve-doctor update error:', updateError);
            return NextResponse.json(
                { success: false, error: updateError.message },
                { status: 500 }
            );
        }

        // 2. Insert approval notification for the doctor (best-effort)
        try {
            await admin.from('notifications').insert([{
                user_id: doctorId,
                type: 'account_approved',
                title: 'Account Approved!',
                message: 'Your doctor account has been approved. You can now log in and complete your profile.',
                is_read: false,
                created_at: new Date().toISOString(),
            }]);
        } catch (notifErr) {
            console.warn('Notification insert failed (non-fatal):', notifErr.message);
        }

        return NextResponse.json({ success: true, doctor });
    } catch (err) {
        console.error('approve-doctor route error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
