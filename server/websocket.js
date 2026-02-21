/**
 * server/websocket.js
 * ─────────────────────────────────────────────────────────────────
 * Real-time WebSocket server for Doctor ↔ Patient chat.
 *
 * Usage:  node server/websocket.js
 * Port:   8080  (set NEXT_PUBLIC_WS_URL=ws://localhost:8080 in .env.local)
 * ─────────────────────────────────────────────────────────────────
 */

// Load .env.local from the project root (one level up from /server)
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env.local') });

const { WebSocketServer, WebSocket } = require('ws');
const { createClient } = require('@supabase/supabase-js');

/* ─── Config ─────────────────────────────────────── */
// Default port 8080 — must match NEXT_PUBLIC_WS_URL in .env.local
const PORT = process.env.WS_PORT || 8080;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
// Service role key is stored as SUPABASE_SERVICE_ROLE_KEY in .env.local
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
    console.error('[WS] ⚠️  Missing Supabase credentials. Check NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local');
}

/* ─── Supabase admin client (bypasses RLS) ────────── */
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

/* ─── In-memory state ─────────────────────────────── */
// rooms: Map<roomId, Set<WebSocket>>
const rooms = new Map();

// clientMeta: Map<WebSocket, { userId, role, roomId }>
const clientMeta = new Map();

/* ─── Helpers ─────────────────────────────────────── */

/**
 * Generate a deterministic room ID for a doctor-patient pair.
 * Matches the logic in Doctor.jsx / Patient.jsx:
 *   getRoomId(id1, id2) => 'chat_' + [id1, id2].sort().join('_')
 */
function getRoomId(id1, id2) {
    return 'chat_' + [id1, id2].sort().join('_');
}

/**
 * Verify that a confirmed appointment exists between doctor and patient.
 * Returns true if chat is permitted.
 */
async function isChatAllowed(doctorId, patientId) {
    const { data, error } = await supabase
        .from('appointments')
        .select('id, status')
        .eq('doctor_id', doctorId)
        .eq('patient_id', patientId)
        .in('status', ['confirmed', 'completed'])   // allow completed too so history is readable
        .limit(1);

    if (error) {
        console.error('[WS] isChatAllowed DB error:', error.message);
        return false;
    }
    return data && data.length > 0;
}

/**
 * Send a JSON payload to a single WebSocket client (safe).
 */
function sendJSON(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

/**
 * Broadcast a JSON payload to every client in a room except the sender.
 */
function broadcastToRoom(roomId, payload, excludeWs = null) {
    const room = rooms.get(roomId);
    if (!room) return;
    for (const ws of room) {
        if (ws !== excludeWs) sendJSON(ws, payload);
    }
}

/**
 * Add a client to a room; create room if it doesn't exist.
 */
function joinRoom(ws, roomId) {
    if (!rooms.has(roomId)) rooms.set(roomId, new Set());
    rooms.get(roomId).add(ws);
}

/**
 * Remove a client from its room; delete room if empty.
 */
function leaveRoom(ws) {
    const meta = clientMeta.get(ws);
    if (!meta?.roomId) return;
    const room = rooms.get(meta.roomId);
    if (room) {
        room.delete(ws);
        if (room.size === 0) rooms.delete(meta.roomId);
    }
}

/**
 * Persist a message to the Supabase `messages` table and return the row.
 */
async function persistMessage({ roomId, senderId, receiverId, content }) {
    const { data, error } = await supabase
        .from('messages')
        .insert([{ room_id: roomId, sender_id: senderId, receiver_id: receiverId, content }])
        .select()
        .single();

    if (error) {
        console.error('[WS] persistMessage error:', error.message);
        return null;
    }
    return data;
}

/**
 * Mark messages in a room as read for a specific receiver.
 */
async function markAsRead(roomId, receiverId) {
    await supabase
        .from('messages')
        .update({ is_read: true })
        .eq('room_id', roomId)
        .eq('receiver_id', receiverId)
        .eq('is_read', false);
}

/* ─── Message Handlers ────────────────────────────── */

/**
 * Handle the initial "join" event from a connecting client.
 *
 * Expected payload:
 * {
 *   type: 'join',
 *   userId:   string,   // the connecting user's ID
 *   role:     'doctor' | 'patient',
 *   doctorId: string,   // one side of the room
 *   patientId: string,  // other side of the room
 * }
 */
async function handleJoin(ws, payload) {
    const { userId, role, doctorId, patientId } = payload;

    if (!userId || !doctorId || !patientId) {
        return sendJSON(ws, { type: 'error', message: 'join: missing userId, doctorId, or patientId' });
    }

    // 🔒 Gate: verify a confirmed appointment exists
    const allowed = await isChatAllowed(doctorId, patientId);
    if (!allowed) {
        return sendJSON(ws, {
            type: 'chat_blocked',
            message: 'Chat is only available after a doctor confirms your appointment.',
        });
    }

    const roomId = getRoomId(doctorId, patientId);
    clientMeta.set(ws, { userId, role, roomId, doctorId, patientId });
    joinRoom(ws, roomId);

    // Mark incoming messages as read now that the user is online
    await markAsRead(roomId, userId);

    // Notify the other party that this user is online
    broadcastToRoom(roomId, { type: 'presence', userId, status: 'online' }, ws);

    sendJSON(ws, { type: 'joined', roomId, message: 'Connected to chat room.' });
    console.log(`[WS] User ${userId} (${role}) joined room ${roomId}`);
}

/**
 * Handle an outgoing message from a client.
 *
 * Expected payload:
 * {
 *   type:       'message',
 *   content:    string,
 *   receiverId: string,
 * }
 */
async function handleMessage(ws, payload) {
    const meta = clientMeta.get(ws);
    if (!meta) return sendJSON(ws, { type: 'error', message: 'Not in a room. Send join first.' });

    const { content, receiverId } = payload;
    if (!content?.trim()) return;

    // Double-check the appointment is still confirmed
    const allowed = await isChatAllowed(meta.doctorId, meta.patientId);
    if (!allowed) {
        return sendJSON(ws, { type: 'chat_blocked', message: 'Your appointment is no longer confirmed.' });
    }

    // Persist to DB
    const saved = await persistMessage({
        roomId: meta.roomId,
        senderId: meta.userId,
        receiverId,
        content: content.trim(),
    });

    if (!saved) return sendJSON(ws, { type: 'error', message: 'Failed to save message.' });

    // Acknowledge the sender
    sendJSON(ws, { type: 'message_ack', tempId: payload.tempId, message: saved });

    // Deliver to other party in the room
    broadcastToRoom(meta.roomId, { type: 'new_message', message: saved }, ws);

    console.log(`[WS] Message in room ${meta.roomId}: "${content.trim().slice(0, 40)}"`);
}

/**
 * Handle typing indicators.
 *
 * Expected payload:
 * { type: 'typing', isTyping: boolean }
 */
function handleTyping(ws, payload) {
    const meta = clientMeta.get(ws);
    if (!meta) return;
    broadcastToRoom(meta.roomId, { type: 'typing', userId: meta.userId, isTyping: payload.isTyping }, ws);
}

/**
 * Handle "read receipt" confirmation from the receiver.
 *
 * Expected payload:
 * { type: 'read_receipt', messageIds: string[] }
 */
async function handleReadReceipt(ws, payload) {
    const meta = clientMeta.get(ws);
    if (!meta || !payload.messageIds?.length) return;

    await supabase
        .from('messages')
        .update({ is_read: true })
        .in('id', payload.messageIds);

    broadcastToRoom(meta.roomId, {
        type: 'messages_read',
        messageIds: payload.messageIds,
        readBy: meta.userId,
    }, ws);
}

/* ─── Main WebSocket Server ───────────────────────── */

const wss = new WebSocketServer({ port: PORT });

wss.on('connection', (ws, req) => {
    const ip = req.socket.remoteAddress;
    console.log(`[WS] New connection from ${ip}`);

    // Ping / pong heartbeat so the OS doesn't kill idle connections
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', async (raw) => {
        let payload;
        try {
            payload = JSON.parse(raw);
        } catch {
            return sendJSON(ws, { type: 'error', message: 'Invalid JSON' });
        }

        switch (payload.type) {
            case 'join': await handleJoin(ws, payload); break;
            case 'message': await handleMessage(ws, payload); break;
            case 'typing': handleTyping(ws, payload); break;
            case 'read_receipt': await handleReadReceipt(ws, payload); break;
            default:
                sendJSON(ws, { type: 'error', message: `Unknown message type: ${payload.type}` });
        }
    });

    ws.on('close', () => {
        const meta = clientMeta.get(ws);
        if (meta) {
            broadcastToRoom(meta.roomId, { type: 'presence', userId: meta.userId, status: 'offline' }, ws);
            console.log(`[WS] User ${meta.userId} left room ${meta.roomId}`);
        }
        leaveRoom(ws);
        clientMeta.delete(ws);
    });

    ws.on('error', (err) => {
        console.error('[WS] Socket error:', err.message);
    });
});

/* ─── Heartbeat interval (removes dead sockets) ─── */
const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (!ws.isAlive) {
            const meta = clientMeta.get(ws);
            if (meta) {
                broadcastToRoom(meta.roomId, { type: 'presence', userId: meta.userId, status: 'offline' }, ws);
                leaveRoom(ws);
                clientMeta.delete(ws);
            }
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30_000);

wss.on('close', () => clearInterval(heartbeat));

console.log(`✅ WebSocket server running on ws://localhost:${PORT}`);
console.log(`   Chat is gated: only users with a CONFIRMED appointment can chat.`);
console.log(`   Supabase URL: ${SUPABASE_URL || '(NOT SET — check .env.local)'}`);


module.exports = wss; // For testing or custom Next.js server integration


