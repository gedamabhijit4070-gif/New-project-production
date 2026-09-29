/**
 * WHATSAPP CHATBOT — Supabase Edge Function (inbound side of the bot)
 * ===========================================================================
 * URL:   https://<project-ref>.supabase.co/functions/v1/wa-webhook
 *
 * Responsibilities
 *   1. Meta webhook verification (GET  hub.challenge handshake).
 *   2. Chat with the user: every inbound message is read here, because
 *      WhatsApp — unlike Telegram — has no getUpdates the browser could poll.
 *        "hi"/"hello"/"start"  -> register the number + welcome + subscribe
 *        "status"/"latest"     -> reply with the latest production entries
 *        "today"               -> today's line summary (qty, OEE, losses)
 *        "stop"                -> unsubscribe
 *        anything else         -> help text with the commands
 *      Registering a number updates last_inbound_at, which opens the 24 h
 *      service window the tracker uses for pushing alerts.
 *   3. Optional CLOUD PUSH: the tracker (or a Supabase Database Webhook on
 *      production_entries) can POST { action:'push', record:{...} } here so
 *      entries are delivered even when no browser is open. Requests other
 *      than Meta's must carry the shared secret (?secret= or X-WA-Secret).
 *
 * Secrets (supabase secrets set ...):
 *   WA_VERIFY_TOKEN      shared token configured in Meta + in the app modal
 *   WA_PUSH_SECRET       guard for the push endpoint (defaults to WA_VERIFY_TOKEN)
 *   WHATSAPP_TOKEN       Meta permanent access token  (auto? no — you set it)
 *   WHATSAPP_PHONE_NUMBER_ID  Meta phone number id
 *   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
 *
 * NOTE: formatShiftAlert() below must stay identical to js/whatsapp.js so a
 * supervisor sees exactly the same text on both channels.
 * =========================================================================== */

const VERIFY_TOKEN = Deno.env.get('WA_VERIFY_TOKEN') || 'LEMKEN-WA-VERIFY-2026';
const PUSH_SECRET = Deno.env.get('WA_PUSH_SECRET') || VERIFY_TOKEN;
const WA_TOKEN = Deno.env.get('WHATSAPP_TOKEN') || '';
const WA_PHONE_ID = Deno.env.get('WHATSAPP_PHONE_NUMBER_ID') || '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';

const GRAPH = 'https://graph.facebook.com/v20.0';
const DAY_MS = 24 * 60 * 60 * 1000;

const SHIFT_TIMES = {
  'Shift A': '6 AM - 2:30 PM',
  'Shift B': '2:30 PM - 11 PM',
  'Shift C': '11 PM - 6 AM'
};

const LOSS_LABELS = {
  loss_breakdown: 'Breakdown Loss',
  loss_no_plan: 'No Plan',
  loss_no_material: 'No Material',
  loss_no_operator: 'No Operator',
  loss_startup: 'Start Up',
  loss_setup: 'Setup',
  loss_tool_insert: 'Tool & Insert Loss',
  loss_jig_fixture: 'Jig & Fixture Issue',
  loss_programming: 'Programming Loss',
  loss_measurement: 'Measurement & Adjustment',
  loss_document: 'Document Loss',
  loss_speed: 'Speed Loss',
  loss_quality_insp: 'Quality Inspection',
  loss_cleaning: 'Cleaning',
  loss_other: 'Other Losses'
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
  });

const cors = () =>
  new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,X-WA-Secret,Authorization,apikey',
      'Access-Control-Max-Age': '86400'
    }
  });

function rest(path, init = {}) {
  return fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
}

const fmtQty = (n) => (Number(n) || 0).toLocaleString('en-IN');
const fmtCycle = (n) => String(Math.round((Number(n) || 0) * 100) / 100);
const line = (label, value) => `-- ${label} - ${value}`;

function pad(n) { return String(n).padStart(2, '0'); }

/** YYYY-MM-DD for the shop's timezone (Asia/Kolkata). */
function todayInTZ(tz = 'Asia/Kolkata') {
  const d = new Date().toLocaleDateString('sv-SE', { timeZone: tz });
  return d;
}

// ---------------------------------------------------------------------------
// Message template — IDENTICAL to js/whatsapp.js / js/telegram.js
// ---------------------------------------------------------------------------
function buildParts(entry) {
  const names = [], cycles = [], qtys = [];
  for (let i = 1; i <= 3; i++) {
    const name = String(entry[`part${i}_name`] || '').trim();
    if (!name) continue;
    names.push(name);
    cycles.push(`${fmtCycle(entry[`part${i}_cycle_time`])} min`);
    qtys.push(`${name}: ${fmtQty(entry[`part${i}_qty`])}`);
  }
  return {
    names: names.length ? names.join(' + ') : 'Not specified',
    cycles: cycles.length ? cycles.join(' / ') : 'Not specified',
    qtys
  };
}

function buildLossBreakdown(entry) {
  const parts = [];
  for (const key in LOSS_LABELS) {
    const mins = Number(entry[key]) || 0;
    if (mins > 0) parts.push(`${LOSS_LABELS[key]} ${mins}m`);
  }
  return parts.length ? parts.join(', ') : 'None';
}

function formatShiftAlert(entry) {
  entry = entry || {};
  const parts = buildParts(entry);
  const shiftLabel = entry.shift || 'Shift A';
  const shiftTime = SHIFT_TIMES[shiftLabel] ? ` (${SHIFT_TIMES[shiftLabel]})` : '';

  let totalQty = Number(entry.total_qty);
  if (!totalQty) {
    totalQty = (Number(entry.part1_qty) || 0) + (Number(entry.part2_qty) || 0) + (Number(entry.part3_qty) || 0);
  }
  let qtyValue = fmtQty(totalQty);
  if (parts.qtys.length > 1) qtyValue += `  (${parts.qtys.join(' | ')})`;

  const rule = '\u{2501}'.repeat(32); // must match js/telegram.js + js/whatsapp.js
  const lines = [
    '\u{1F3ED} NEW PRODUCTION ENTRY',
    rule,
    line('DATE', entry.log_date || todayInTZ()),
    line('SHIFT', shiftLabel + shiftTime),
    line('MACHINE NAME', entry.machine_name || entry.machine_code || '-'),
    line('OPERATOR NAME', entry.operator_name || '-'),
    line('PART NUMBER', parts.names),
    line('CYCLE TIME', parts.cycles),
    line('QUANTITY', qtyValue),
    line('LOSSES OCCURED IN MINS', fmtQty(entry.total_losses_mins) + ' min'),
    rule
  ];
  if (Number(entry.total_losses_mins) > 0) lines.push(`Loss Breakdown: ${buildLossBreakdown(entry)}`);

  const extras = [];
  if (entry.good_qty !== undefined && entry.good_qty !== null) extras.push(`Good: ${fmtQty(entry.good_qty)}`);
  if (entry.rejected_qty !== undefined && entry.rejected_qty !== null) extras.push(`Rejected: ${fmtQty(entry.rejected_qty)}`);
  if (entry.oee_rate !== undefined && entry.oee_rate !== null) extras.push(`OEE: ${entry.oee_rate}%`);
  if (extras.length) lines.push(extras.join('  |  '));

  lines.push(`Logged: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true })}`);
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Outbound send
// ---------------------------------------------------------------------------
async function sendText(to, body) {
  if (!WA_TOKEN || !WA_PHONE_ID) throw new Error('WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID not set');
  const res = await fetch(`${GRAPH}/${WA_PHONE_ID}/messages`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${WA_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: String(to).replace(/[^\d]/g, ''),
      type: 'text',
      text: { preview_url: false, body: String(body).slice(0, 4096) }
    })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const e = data.error || {};
    console.error('[wa-webhook] Graph send failed', res.status, JSON.stringify(e));
    return { ok: false, code: e.code, error: e.message };
  }
  return { ok: true, id: data.messages && data.messages[0] && data.messages[0].id };
}

// ---------------------------------------------------------------------------
// Subscriber bookkeeping
// ---------------------------------------------------------------------------
async function touchSubscriber(id, name) {
  try {
    await rest('whatsapp_subscribers', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        id: String(id).replace(/[^\d]/g, ''),
        name: name || null,
        last_inbound_at: new Date().toISOString(),
        active: true
      })
    });
    return true;
  } catch (err) {
    console.error('[wa-webhook] subscriber upsert failed:', err);
    return false;
  }
}

async function setInactive(id) {
  try {
    await rest(`whatsapp_subscribers?id=eq.${String(id).replace(/[^\d]/g, '')}`, {
      method: 'PATCH',
      body: JSON.stringify({ active: false })
    });
  } catch (err) {
    console.error('[wa-webhook] unsubscribe failed:', err);
  }
}

async function activeSubscribers() {
  try {
    const res = await rest('whatsapp_subscribers?select=id,name,last_inbound_at,active&active=eq.true');
    if (!res.ok) return [];
    return await res.json();
  } catch (_) {
    return [];
  }
}

const inWindow = (sub) => {
  const t = Date.parse(sub.last_inbound_at || '');
  return !isNaN(t) && (Date.now() - t) < DAY_MS;
};

// ---------------------------------------------------------------------------
// Chat replies
// ---------------------------------------------------------------------------
const WELCOME = [
  '\u{2705} You are now connected to the *Production Tracker*.',
  '',
  'Every new production entry will be pushed here in real time for 24 h after your last message — just send *hi* again any time to refresh that window.',
  '',
  'Commands you can use:',
  '\u2022 *status* — latest shift entries',
  '\u2022 *today* — today\u2019s line summary',
  '\u2022 *stop* — stop the alerts',
  '',
  '(Sent by the Production Tracker bot)'
].join('\n');

const HELP = [
  '\u{1F4CC} I did not catch that. Available commands:',
  '\u2022 *hi* \u2014 (re)subscribe and start real-time tracking',
  '\u2022 *status* \u2014 latest production entries',
  '\u2022 *today* \u2014 today\u2019s quantity, OEE and losses',
  '\u2022 *stop* \u2014 unsubscribe from alerts'
].join('\n');

async function replyStatus(to) {
  const res = await rest('production_entries?select=*&order=created_at.desc&limit=5');
  const rows = res.ok ? await res.json() : [];
  if (!rows.length) return sendText(to, 'No production entries recorded yet today.');
  const header = `\u{1F4CA} LATEST ${rows.length} ENTRIES\n${'\u2501'.repeat(34)}`;
  const body = rows.map((r) => formatShiftAlert(r)).join(`\n${'\u2501'.repeat(34)}\n`);
  return sendText(to, `${header}\n${body}`);
}

async function replyToday(to) {
  const day = todayInTZ();
  const res = await rest(`production_entries?select=*&log_date=eq.${day}&limit=500`);
  const rows = res.ok ? await res.json() : [];
  if (!rows.length) return sendText(to, `Nothing logged for ${day} yet.`);

  const qty = rows.reduce((s, r) => s + (Number(r.total_qty) || 0), 0);
  const good = rows.reduce((s, r) => s + (Number(r.good_qty) || 0), 0);
  const rej = rows.reduce((s, r) => s + (Number(r.rejected_qty) || 0), 0);
  const loss = rows.reduce((s, r) => s + (Number(r.total_losses_mins) || 0), 0);
  const machines = [...new Set(rows.map((r) => r.machine_name || r.machine_code).filter(Boolean))];
  const shifts = [...new Set(rows.map((r) => r.shift).filter(Boolean))];
  const avgOee = rows.length
    ? (rows.reduce((s, r) => s + (Number(r.oee_rate) || 0), 0) / rows.length).toFixed(1)
    : 0;

  const text = [
    `\u{1F3ED} TODAY (${day}) — LINE SUMMARY`,
    '\u2501'.repeat(34),
    line('ENTRIES', rows.length),
    line('MACHINES', machines.length ? machines.join(', ') : '-'),
    line('SHIFTS', shifts.join(', ') || '-'),
    line('QUANTITY', `${fmtQty(qty)}  (Good ${fmtQty(good)} | Rejected ${fmtQty(rej)})`),
    line('AVG OEE', `${avgOee}%`),
    line('LOSSES OCCURED IN MINS', `${fmtQty(loss)} min`),
    '\u2501'.repeat(34)
  ].join('\n');
  return sendText(to, text);
}

/** Handles one inbound chat message. Returns true when it was consumed. */
async function handleChatMessage(from, text, profileName) {
  const raw = String(text || '').trim();
  const norm = raw.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();

  // Opting out first: it is the only command that must not re-subscribe.
  // Matching is deliberately forgiving — people write "please stop", "stop!".
  if (/^(please |pls |kindly )?(stop|unsubscribe|remove me|opt ?out)( please| thanks| now)?$/.test(norm)) {
    await setInactive(from);
    await sendText(from, '\u{1F6AB} Alerts stopped. Send *hi* whenever you want them back.');
    return true;
  }

  // Every other message re-opens the 24 h service window (done inside the
  // branches so an opt-out never re-opens it).
  const isGreeting = /^(hi|hii|hihi|hello|hey|yo|hola|namaste|ok|okay|start|good morning|good evening|good afternoon|subscribe)( |$)/.test(norm);

  if (isGreeting) {
    await touchSubscriber(from, profileName);
    await sendText(from, WELCOME);
    console.log(`[wa-webhook] subscribed +${from} (${profileName || 'unknown'})`);
    return true;
  }

  if (/^(status|latest|last|entries|report|show me)( |$)/.test(norm)) {
    await touchSubscriber(from, profileName);
    await replyStatus(from);
    return true;
  }

  if (/^(today|summary|day|totals)( |$)/.test(norm)) {
    await touchSubscriber(from, profileName);
    await replyToday(from);
    return true;
  }

  if (/^(help|menu|commands|options)( |$)/.test(norm)) {
    await touchSubscriber(from, profileName);
    await sendText(from, HELP);
    return true;
  }

  // First contact without a recognisable word — greet, register and help.
  await touchSubscriber(from, profileName);
  await sendText(from, `Hi${profileName ? ' ' + profileName : ''} \u{1F44B}\n\n${WELCOME}`);
  return true;
}

// ---------------------------------------------------------------------------
// Cloud push — new production entry forwarded to every window-open chat
// ---------------------------------------------------------------------------
async function pushEntry(entry) {
  const subs = await activeSubscribers();
  const target = subs.filter(inWindow);
  if (!target.length) {
    console.log('[wa-webhook] push: no subscriber with an open 24h window');
    return { pushed: 0, total: subs.length };
  }
  const text = formatShiftAlert(entry);
  let pushed = 0;
  for (const sub of target) {
    const r = await sendText(sub.id, text);
    if (r.ok) pushed++;
    await new Promise((resolve) => setTimeout(resolve, 80)); // stay polite
  }
  return { pushed, total: subs.length };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  const url = new URL(req.url);

  if (req.method === 'OPTIONS') return cors();

  // --- Meta's webhook handshake -------------------------------------------
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    if (mode === 'subscribe' && token === VERIFY_TOKEN && challenge) {
      console.log('[wa-webhook] Meta webhook verified');
      return new Response(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
    }
    // Friendly probe so you can check the URL is live.
    if (!mode) {
      return json({
        ok: true,
        service: 'Production Tracker WhatsApp bot webhook',
        has_token: Boolean(WA_TOKEN),
        has_phone_id: Boolean(WA_PHONE_ID),
        configured: Boolean(WA_TOKEN && WA_PHONE_ID && SUPABASE_URL && SERVICE_KEY)
      });
    }
    return json({ error: 'Verification failed' }, 403);
  }

  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  let body;
  try {
    body = await req.json();
  } catch (_) {
    return json({ error: 'Invalid JSON' }, 400);
  }

  // --- Cloud push from the tracker / Database Webhook ----------------------
  if (body && body.table === 'production_entries' && body.record) {
    // Supabase Database Webhook payload: { type, table, record, ... }
    const secret = req.headers.get('x-wa-secret') || url.searchParams.get('secret') || '';
    if (secret !== PUSH_SECRET) return json({ error: 'Bad secret' }, 401);
    const result = await pushEntry(body.record);
    return json({ ok: true, ...result });
  }
  if (body && body.action === 'push') {
    const secret = req.headers.get('x-wa-secret') || url.searchParams.get('secret') || '';
    if (secret !== PUSH_SECRET) return json({ error: 'Bad secret' }, 401);
    const result = await pushEntry(body.record || body.entry || {});
    return json({ ok: true, ...result });
  }

  // --- Inbound chat from Meta ---------------------------------------------
  if (body && body.object === 'whatsapp') {
    const entry = Array.isArray(body.entry) ? body.entry[0] : null;
    const change = entry && Array.isArray(entry.changes) ? entry.changes[0] : null;
    const value = (change && change.value) || {};
    const messages = Array.isArray(value.messages) ? value.messages : [];
    const contacts = Array.isArray(value.contacts) ? value.contacts : [];

    // Delivery receipts and empty batches still get a 200 so Meta stops retrying.
    if (!messages.length) return json({ ok: true, ignored: 'no messages' });

    for (const msg of messages) {
      const profile = contacts.find((c) => c.wa_id === msg.from);
      const profileName = (profile && profile.profile && profile.profile.name) || msg.from;
      if (msg.type === 'text') {
        try {
          await handleChatMessage(msg.from, msg.text.body, profileName);
        } catch (err) {
          console.error('[wa-webhook] chat handler failed:', err);
        }
      } else {
        await touchSubscriber(msg.from, profileName);
        await sendText(msg.from, HELP);
      }
    }
    return json({ ok: true, handled: messages.length });
  }

  return json({ ok: true, ignored: 'unrecognised payload' }, 200);
});

console.log('[wa-webhook] started — verify token:', VERIFY_TOKEN ? 'set' : 'MISSING');
