// app/api/admin/reject-doctor/route.js
// Uses service-role key (server-side only) to bypass RLS and reject a doctor.

import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function POST(request) {
    try {
        const { doctorId, reason = '' } = await request.json();

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

        const admin = createClient(supabaseUrl, serviceRoleKey, {
            auth: { autoRefreshToken: false, persistSession: false },
        });

        // 1. Fetch doctor info (name/email for notification + email)
        const { data: doctor, error: fetchError } = await admin
            .from('users')
            .select('name, email, doctor_id, specialization')
            .eq('id', doctorId)
            .single();

        if (fetchError) {
            return NextResponse.json({ success: false, error: fetchError.message }, { status: 500 });
        }

        // 2. Update is_approved = false (with optional rejection_reason)
        const updatePayload = {
            is_approved: false,
            updated_at: new Date().toISOString(),
            rejected_at: new Date().toISOString(),
        };
        if (reason) updatePayload.rejection_reason = reason;

        const { error: updateError } = await admin
            .from('users')
            .update(updatePayload)
            .eq('id', doctorId);

        if (updateError) {
            // Retry without rejection_reason in case column doesn't exist
            const { error: retryError } = await admin
                .from('users')
                .update({ is_approved: false, updated_at: new Date().toISOString() })
                .eq('id', doctorId);
            if (retryError) {
                return NextResponse.json({ success: false, error: retryError.message }, { status: 500 });
            }
        }

        // 3. Insert rejection notification (best-effort)
        try {
            await admin.from('notifications').insert([{
                user_id: doctorId,
                type: 'account_rejected',
                title: 'Application Update',
                message: reason
                    ? `Your application was not approved. Reason: ${reason}`
                    : 'Your doctor application was not approved at this time.',
                is_read: false,
                created_at: new Date().toISOString(),
            }]);
        } catch (notifErr) {
            console.warn('Notification insert failed (non-fatal):', notifErr.message);
        }

        return NextResponse.json({ success: true, doctor });
    } catch (err) {
        console.error('reject-doctor route error:', err);
        return NextResponse.json({ success: false, error: err.message }, { status: 500 });
    }
}
