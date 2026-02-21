import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Use service role key to bypass RLS for chat message inserts
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
    try {
        const { room_id, sender_id, receiver_id, content } = await req.json();

        if (!room_id || !sender_id || !receiver_id || !content?.trim()) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const { data, error } = await supabaseAdmin
            .from('messages')
            .insert([{ room_id, sender_id, receiver_id, content: content.trim() }])
            .select()
            .single();

        if (error) {
            console.error('[chat/send] Supabase error:', error.message);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ message: data });
    } catch (e) {
        console.error('[chat/send] Unexpected error:', e.message);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
