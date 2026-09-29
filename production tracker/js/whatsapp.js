/**
 * WHATSAPP SUPERVISOR ALERTS (broadcast edition — mirror of telegram.js)
 * ---------------------------------------------------------------------------
 * Pushes a shift-entry alert to EVERY WhatsApp number that has chatted
 * "hi" with the bot the moment a production record is saved on the website.
 *
 * Transport: the official Meta WhatsApp Business Cloud API
 *   POST https://graph.facebook.com/v20.0/{phoneNumberId}/messages
 * which (verified 2026-09-29) answers cross-origin requests, so — exactly like
 * the Telegram module — no server/proxy is needed for SENDING.
 *
 * RECEIVING is different from Telegram, and this is the one real difference:
 * Telegram exposes getUpdates, WhatsApp does not. Incoming messages ("hi",
 * "status", "stop") are delivered by Meta only to an HTTPS webhook, which
 * lives in the Supabase Edge Function  supabase/functions/wa-webhook.
 * That function:
 *     1. registers a number the moment it sends "hi" into the shared table
 *        public.whatsapp_subscribers (so every device of this app sees it);
 *     2. answers chat commands (status / today / stop);
 *     3. can push new entries itself (cloud mode) when a Supabase
 *        Database Webhook is attached to production_entries.
 * This module therefore reads subscribers from Supabase instead of polling.
 *
 * 24 HOURS RULE (important, WhatsApp-specific)
 *   A business may only send free-form text within 24 h of the customer's
 *   last message. "hi" opens that window; when it closes, sends are skipped
 *   (they are NOT failures and nobody is dropped) until the person writes
 *   again. Optionally set an approved utility template name in the settings
 *   modal to keep pushing after the window closes.
 *
 * Message template (identical to the Telegram one, per requirement):
 *   -- DATE -
 *   -- SHIFT -
 *   -- MACHINE NAME -
 *   -- OPERATOR NAME -
 *   -- PART NUMBER -
 *   -- CYCLE TIME -
 *   -- QUANTITY -
 *   -- LOSSES OCCURED IN MINS -
 *
 * NOTE: an access token shipped in client-side code is readable by anyone who
 * can open the website. This is acceptable for a private/internal shopfloor
 * tool. If this app is ever made public, move the send step behind a server
 * proxy (the wa-webhook function can do it) and rotate the token.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var WA_STORAGE_KEY = 'prodtracker_whatsapp_config';

  var DEFAULT_CONFIG = {
    // Meta WhatsApp Business Cloud API credentials (see README for setup).
    token: '',
    phoneNumberId: '',
    // Shared secret the webhook checks on Meta's verification GET request.
    verifyToken: 'LEMKEN-WA-VERIFY-2026',
    enabled: true,
    // ON  -> this browser sends every alert (works with no cloud setup).
    // OFF -> the Supabase Edge Function / Database Webhook sends them instead.
    // Turn it OFF only after the database webhook is connected, otherwise the
    // supervisor receives the same entry twice.
    pushFromBrowser: true,
    botName: 'Production Tracker Bot',
    // Supabase Edge Function base URL (inbound chat + optional cloud push).
    waUrl: 'https://hqkxzxmpbocsqeurmvjs.supabase.co/functions/v1/wa-webhook',
    // Subscriber table lives in Supabase, shared by every device.
    supabaseUrl: 'https://hqkxzxmpbocsqeurmvjs.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhxa3h6eG1wYm9jc3FldXJtdmpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2OTA4OTQsImV4cCI6MjEwNDI2Njg5NH0.ecizDXHhbaRLqswZWhVtzuljN_1Fi41SF2Yr8zazsUA',
    // Optional approved WhatsApp utility template used when the 24 h window
    // is closed. Leave empty to simply skip those chats (they auto-resume).
    templateName: '',
    // Cached copy of public.whatsapp_subscribers (offline/first-load fallback).
    subscribers: [],
    // Chats skipped recently because their 24 h service window had expired.
    windowClosed: []
  };

  // Shift clock windows (kept in sync with getCurrentShiftInfo in bundle.js)
  var SHIFT_TIMES = {
    'Shift A': '6 AM - 2:30 PM',
    'Shift B': '2:30 PM - 11 PM',
    'Shift C': '11 PM - 6 AM'
  };

  // Local copy of the loss labels so this file stays self-contained.
  var LOSS_LABELS = {
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

  var DAY_MS = 24 * 60 * 60 * 1000;

  // ---------------------------------------------------------------------------
  // Config helpers
  // ---------------------------------------------------------------------------
  function getConfig() {
    var cfg = {};
    var k;
    for (k in DEFAULT_CONFIG) cfg[k] = DEFAULT_CONFIG[k];
    try {
      var raw = localStorage.getItem(WA_STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (k in saved) {
          if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') cfg[k] = saved[k];
        }
      }
    } catch (_) { }
    if (!Array.isArray(cfg.subscribers)) cfg.subscribers = [];
    if (!Array.isArray(cfg.windowClosed)) cfg.windowClosed = [];
    return cfg;
  }

  function saveConfig(patch) {
    var cfg = getConfig();
    for (var k in patch) {
      if (patch[k] !== undefined && patch[k] !== null) cfg[k] = patch[k];
    }
    try { localStorage.setItem(WA_STORAGE_KEY, JSON.stringify(cfg)); } catch (_) { }
    return cfg;
  }

  /** Cached subscribers — refreshed from Supabase whenever possible. */
  function getSubscribers() {
    return getConfig().subscribers || [];
  }

  function toNum(v) { return typeof v === 'number' ? v : (Number(v) || 0); }

  /**
   * WhatsApp only allows free-form text for 24 h after the customer's last
   * message. A missing/unknown timestamp counts as CLOSED, so the bot never
   * spams someone who never wrote in.
   */
  function isWindowOpen(sub) {
    var last = sub && (sub.last_inbound_at || sub.lastInboundAt);
    if (!last) return false;
    var t = Date.parse(last);
    if (isNaN(t)) return false;
    return (Date.now() - t) < DAY_MS;
  }

  function markWindowClosed(id) {
    id = String(id);
    var cfg = getConfig();
    var list = cfg.windowClosed.slice();
    if (list.indexOf(id) === -1) list.push(id);
    saveConfig({ windowClosed: list });
  }

  function clearWindowClosed(id) {
    id = String(id);
    var cfg = getConfig();
    saveConfig({ windowClosed: cfg.windowClosed.filter(function (x) { return x !== id; }) });
  }

  // ---------------------------------------------------------------------------
  // Supabase: shared subscriber table
  // ---------------------------------------------------------------------------
  function restBase() {
    var cfg = getConfig();
    return String(cfg.supabaseUrl).replace(/\/$/, '');
  }

  /**
   * Reads public.whatsapp_subscribers (written by the webhook when someone
   * sends "hi"). Falls back to the local cache so the module still works
   * before the table exists or while offline.
   */
  function fetchSubscribers() {
    var cfg = getConfig();
    var url = restBase() + '/rest/v1/whatsapp_subscribers'
      + '?select=id,name,last_inbound_at,welcomed_at,active,created_at'
      + '&active=eq.true&order=created_at.asc';
    return fetch(url, {
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey,
        'Content-Type': 'application/json'
      }
    }).then(function (res) {
      if (!res.ok) {
        return res.text().then(function (t) {
          throw new Error('Subscriber table unreachable (HTTP ' + res.status + '). '
            + 'Run supabase/whatsapp_subscribers.sql in the Supabase SQL editor. '
            + String(t).slice(0, 140));
        });
      }
      return res.json();
    }).then(function (rows) {
      rows = (rows || []).map(function (r) {
        return {
          id: String(r.id),
          name: r.name || ('+' + r.id),
          last_inbound_at: r.last_inbound_at || null,
          welcomed_at: r.welcomed_at || null,
          active: r.active !== false
        };
      });
      saveConfig({ subscribers: rows });
      return rows;
    });
  }

  /** Best-effort fetch with a timeout; never rejects (returns cache/null). */
  function fetchSubscribersQuietly(ms) {
    return withTimeout(fetchSubscribers(), ms || 3000).catch(function () {
      return getSubscribers();
    });
  }

  /** Adds / re-enables a number by hand (same "Add chat id" flow as Telegram). */
  function addSubscriber(id, name) {
    id = String(id || '').replace(/[^\d]/g, '');
    if (!id) return Promise.reject(new Error('Enter a WhatsApp number with country code, e.g. 919876543210'));
    var cfg = getConfig();
    var payload = {
      id: id,
      name: name || ('+' + id),
      active: true,
      last_inbound_at: new Date().toISOString(),
      welcomed_at: new Date().toISOString()
    };
    return fetch(restBase() + '/rest/v1/whatsapp_subscribers', {
      method: 'POST',
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify(payload)
    }).then(function (res) {
      if (!res.ok && res.status !== 201) throw new Error('Could not save subscriber (HTTP ' + res.status + ')');
      return fetchSubscribers();
    });
  }

  function removeSubscriber(id) {
    id = String(id).replace(/[^\d]/g, '');
    var cfg = getConfig();
    return fetch(restBase() + '/rest/v1/whatsapp_subscribers?id=eq.' + id, {
      method: 'DELETE',
      headers: {
        'apikey': cfg.anonKey,
        'Authorization': 'Bearer ' + cfg.anonKey
      }
    }).then(function () {
      saveConfig({
        subscribers: getSubscribers().filter(function (s) { return String(s.id).replace(/[^\d]/g, '') !== id; })
      });
      return getSubscribers();
    }).catch(function () {
      // Table not deployed yet — at least drop it from the local list.
      saveConfig({
        subscribers: getSubscribers().filter(function (s) { return String(s.id).replace(/[^\d]/g, '') !== id; })
      });
      return getSubscribers();
    });
  }

  function withTimeout(promise, ms) {
    return new Promise(function (resolve, reject) {
      var done = false;
      var t = setTimeout(function () {
        if (!done) { done = true; reject(new Error('Timed out')); }
      }, ms);
      promise.then(function (v) {
        if (!done) { done = true; clearTimeout(t); resolve(v); }
      }, function (e) {
        if (!done) { done = true; clearTimeout(t); reject(e); }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Message builder — byte-for-byte the Telegram template
  // ---------------------------------------------------------------------------
  function fmtQty(n) {
    var v = Number(n) || 0;
    return v.toLocaleString('en-IN');
  }

  function fmtCycle(n) {
    var v = Number(n) || 0;
    return (Math.round(v * 100) / 100).toString();
  }

  function line(label, value) {
    return '-- ' + label + ' - ' + value;
  }

  function buildParts(entry) {
    var names = [], cycles = [], qtys = [];
    for (var i = 1; i <= 3; i++) {
      var name = (entry['part' + i + '_name'] || '').toString().trim();
      if (!name) continue;
      names.push(name);
      cycles.push(fmtCycle(entry['part' + i + '_cycle_time']) + ' min');
      qtys.push(name + ': ' + fmtQty(entry['part' + i + '_qty']));
    }
    return {
      names: names.length ? names.join(' + ') : 'Not specified',
      cycles: cycles.length ? cycles.join(' / ') : 'Not specified',
      qtys: qtys
    };
  }

  function buildLossBreakdown(entry) {
    var parts = [];
    for (var key in LOSS_LABELS) {
      var mins = Number(entry[key]) || 0;
      if (mins > 0) parts.push(LOSS_LABELS[key] + ' ' + mins + 'm');
    }
    return parts.length ? parts.join(', ') : 'None';
  }

  /** Formats a production entry into the supervisor alert text. */
  function formatShiftAlert(entry) {
    entry = entry || {};
    var parts = buildParts(entry);
    var shiftLabel = entry.shift || 'Shift A';
    var shiftTime = SHIFT_TIMES[shiftLabel] ? ' (' + SHIFT_TIMES[shiftLabel] + ')' : '';

    var totalQty = Number(entry.total_qty);
    if (!totalQty) {
      totalQty = (Number(entry.part1_qty) || 0) + (Number(entry.part2_qty) || 0) + (Number(entry.part3_qty) || 0);
    }

    var qtyValue = fmtQty(totalQty);
    if (parts.qtys.length > 1) qtyValue += '  (' + parts.qtys.join(' | ') + ')';

    var header = '\u{1F3ED} NEW PRODUCTION ENTRY';
    var rule = '\u{2501}'.repeat(32); // must match telegram.js exactly

    var lines = [
      header,
      rule,
      line('DATE', entry.log_date || new Date().toISOString().split('T')[0]),
      line('SHIFT', shiftLabel + shiftTime),
      line('MACHINE NAME', entry.machine_name || entry.machine_code || '-'),
      line('OPERATOR NAME', entry.operator_name || '-'),
      line('PART NUMBER', parts.names),
      line('CYCLE TIME', parts.cycles),
      line('QUANTITY', qtyValue),
      line('LOSSES OCCURED IN MINS', fmtQty(entry.total_losses_mins) + ' min'),
      rule
    ];

    if (Number(entry.total_losses_mins) > 0) {
      lines.push('Loss Breakdown: ' + buildLossBreakdown(entry));
    }

    var extras = [];
    if (entry.good_qty !== undefined && entry.good_qty !== null) extras.push('Good: ' + fmtQty(entry.good_qty));
    if (entry.rejected_qty !== undefined && entry.rejected_qty !== null) extras.push('Rejected: ' + fmtQty(entry.rejected_qty));
    if (entry.oee_rate !== undefined && entry.oee_rate !== null) extras.push('OEE: ' + entry.oee_rate + '%');
    if (extras.length) lines.push(extras.join('  |  '));

    var logged = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    lines.push('Logged: ' + logged);

    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Low level WhatsApp Cloud API call
  // ---------------------------------------------------------------------------
  function graph(method, path, payload) {
    var cfg = getConfig();
    if (!cfg.token) return Promise.reject(new Error('Access token not configured'));
    if (!cfg.phoneNumberId) return Promise.reject(new Error('Phone Number ID not configured'));
    return fetch('https://graph.facebook.com/v20.0/' + path, {
      method: method,
      headers: {
        'Authorization': 'Bearer ' + cfg.token,
        'Content-Type': 'application/json'
      },
      body: payload ? JSON.stringify(payload) : undefined
    }).then(function (res) {
      return res.json().catch(function () { return {}; }).then(function (json) {
        if (!res.ok || (json && json.error)) {
          var e = json && json.error ? json.error : {};
          var err = new Error(e.message || ('WhatsApp Cloud API error ' + res.status));
          err.code = e.code || res.status;
          err.errorData = e.error_data;
          err.httpStatus = res.status;
          throw err;
        }
        return json;
      });
    });
  }

  /** Verifies token + phone number id. Returns the WABA display details. */
  function verifyConnection() {
    var cfg = getConfig();
    if (!cfg.token || !cfg.phoneNumberId) {
      return Promise.reject(new Error('Enter the Access Token and Phone Number ID first.'));
    }
    return graph('GET', cfg.phoneNumberId + '?fields=display_phone_number,verified_name,quality_rating,platform');
  }

  // ---------------------------------------------------------------------------
  // Sending
  // ---------------------------------------------------------------------------
  function normaliseNumber(id) {
    return String(id || '').replace(/[^\d]/g, '');
  }

  function sendText(to, text) {
    return graph('POST', getConfig().phoneNumberId + '/messages', {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: normaliseNumber(to),
      type: 'text',
      text: { preview_url: false, body: String(text).slice(0, 4096) }
    });
  }

  /**
   * Approved utility template — the only way to reach someone whose 24 h
   * window is closed. Parameter order must match what Meta approved.
   */
  function sendTemplate(to, text) {
    var cfg = getConfig();
    var params = String(text).split('\n').filter(Boolean).slice(0, 10).map(function (s) {
      return { type: 'text', text: s.slice(0, 60) };
    });
    return graph('POST', cfg.phoneNumberId + '/messages', {
      messaging_product: 'whatsapp',
      to: normaliseNumber(to),
      type: 'template',
      template: {
        name: cfg.templateName,
        language: { code: 'en' },
        components: [{ type: 'body', parameters: params }]
      }
    });
  }

  /**
   * Sends one text to one chat.
   *   - 24 h window closed  -> skipped (never dropped), retried automatically
   *     as soon as the person writes to the bot again;
   *   - token rejected      -> reported once, sends stop for this session;
   *   - receiver not on WA  -> reported, chat stays subscribed.
   */
  function sendToSubscriber(sub, text, opts) {
    opts = opts || {};
    var cfg = getConfig();
    var id = normaliseNumber(sub.id);

    if (!opts.force && !isWindowOpen(sub)) {
      markWindowClosed(id);
      return Promise.resolve({ id: id, name: sub.name, ok: false, skipped: 'window', error: '24h window closed' });
    }

    var send = (!opts.force && cfg.templateName) ? sendTemplate(id, text) : sendText(id, text);

    return send.then(function (json) {
      clearWindowClosed(id);
      var subList = getSubscribers();
      for (var i = 0; i < subList.length; i++) {
        if (normaliseNumber(subList[i].id) === id) subList[i].welcomed_at = subList[i].welcomed_at || new Date().toISOString();
      }
      saveConfig({ subscribers: subList });
      return { id: id, name: sub.name, ok: true, message_id: json && json.messages && json.messages[0] && json.messages[0].id };
    }).catch(function (err) {
      var msg = String(err && err.message || err);
      if (err && (err.code === 470 || err.code === 131026 || /24 hour|window|template/i.test(msg))) {
        markWindowClosed(id);
        console.warn('[WhatsApp] 24 h session closed for ' + sub.name + ' — skipped until they message '
          + cfg.botName + ' again' + (cfg.templateName ? ' (template will be used).' : '.'));
        return { id: id, name: sub.name, ok: false, skipped: 'window', error: msg };
      }
      if (err && (err.code === 190 || err.code === 401 || err.httpStatus === 401)) {
        console.warn('[WhatsApp] Access token rejected: ' + msg + ' — update it in WhatsApp Alerts settings.');
        return { id: id, name: sub.name, ok: false, fatal: true, error: msg };
      }
      if (err && err.code === 100) {
        console.warn('[WhatsApp] ' + sub.name + ' is not reachable on WhatsApp: ' + msg);
        return { id: id, name: sub.name, ok: false, error: msg };
      }
      console.warn('[WhatsApp] Could not reach ' + sub.name + ': ' + msg);
      return { id: id, name: sub.name, ok: false, error: msg };
    });
  }

  /**
   * Broadcasts one text to every subscriber, sequentially.
   * opts.force (Send Test button) ignores the 24 h window check.
   */
  function broadcast(text, opts) {
    opts = opts || {};
    var all = getSubscribers();

    var tasks = all.map(function (sub, i) {
      return function () {
        return sendToSubscriber(sub, text, opts).then(function (r) {
          if (i > 0 && opts.gapMs) {
            return new Promise(function (res) { setTimeout(res, opts.gapMs); }).then(function () { return r; });
          }
          return r;
        });
      };
    });

    var results = [];
    return tasks.reduce(function (chain, task) {
      return chain.then(function () { return task(); }).then(function (r) { results.push(r); });
    }, Promise.resolve()).then(function () {
      var ok = results.filter(function (r) { return r.ok; });
      var skipped = results.filter(function (r) { return r.skipped === 'window'; });
      var bad = results.filter(function (r) { return !r.ok && !r.skipped; });
      console.log('[WhatsApp] Delivered ' + ok.length + '/' + all.length + ' subscriber(s).'
        + (skipped.length ? ' ' + skipped.length + ' skipped (24h window closed).' : '')
        + (bad.length ? ' Failed: ' + bad.map(function (b) { return b.name + ' (' + b.error + ')'; }).join('; ') : ''));
      if (typeof opts.onDone === 'function') opts.onDone(results);
      return { results: results, total: all.length, delivered: ok.length, skipped: skipped.length, failed: bad.length };
    });
  }

  /**
   * Sends the shift alert to every subscriber. Never throws and never blocks
   * the caller, so a WhatsApp outage can never break the save flow.
   */
  function sendShiftAlert(entry) {
    try {
      var cfg = getConfig();
      if (!cfg.enabled) return Promise.resolve(null);
      if (!cfg.pushFromBrowser) {
        console.log('[WhatsApp] Browser push is OFF — the Supabase webhook forwards this entry.');
        return Promise.resolve(null);
      }
      if (!cfg.token || !cfg.phoneNumberId) {
        console.warn('[WhatsApp] Not configured yet — open "WhatsApp Alerts" and paste the access token + Phone Number ID.');
        return Promise.resolve(null);
      }
      var text = formatShiftAlert(entry);
      return fetchSubscribersQuietly(3000).then(function (subs) {
        if (!subs || !subs.length) {
          console.warn('[WhatsApp] No subscribers yet — ask supervisors to send "hi" to ' + cfg.botName + ' on WhatsApp.');
          return null;
        }
        return broadcast(text, { gapMs: 80 });
      }).catch(function (err) {
        console.warn('[WhatsApp] Shift alert failed:', err && err.message);
        return null;
      });
    } catch (err) {
      console.warn('[WhatsApp] Shift alert failed:', err && err.message);
      return Promise.resolve(null);
    }
  }

  /** Sends a plain-text test message to every subscriber (ignores the window). */
  function sendTestMessage(customText) {
    var cfg = getConfig();
    return fetchSubscribersQuietly(3000).then(function (subs) {
      if (!subs || !subs.length) {
        throw new Error('No subscribers. Send "hi" to the bot on WhatsApp first.');
      }
      var text = customText ||
        '\u{2705} Production Tracker test alert\n' +
        'WhatsApp notifications are working for this device.\n' +
        'Subscribers receiving alerts: ' + subs.length;
      return broadcast(text, { gapMs: 80, force: true });
    }).then(function (r) {
      if (!r.delivered) {
        throw new Error(r.failed ? ('Delivery failed: ' + r.results.filter(function (x) { return !x.ok && !x.skipped; })[0].error)
          : 'No message delivered');
      }
      return r;
    });
  }

  // ---------------------------------------------------------------------------
  // Settings modal UI
  // ---------------------------------------------------------------------------
  var OPENERS = ['btn-open-whatsapp-settings', 'btn-open-whatsapp-settings-alt'];

  function $(id) { return document.getElementById(id); }

  function renderStatus(el, kind, text) {
    if (!el) return;
    var palette = {
      ok: ['rgba(16, 185, 129, 0.15)', 'var(--emerald-400, #10b981)'],
      err: ['rgba(244, 63, 94, 0.15)', 'var(--rose-400, #f43f5e)'],
      info: ['rgba(6, 182, 212, 0.12)', 'var(--cyan-400, #06b6d2)'],
      warn: ['rgba(245, 158, 11, 0.15)', 'var(--amber-400, #f59e0b)']
    };
    var p = palette[kind] || palette.info;
    el.style.display = 'block';
    el.style.background = p[0];
    el.style.color = p[1];
    el.textContent = text;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function renderSubscribers() {
    var list = $('wa-subscriber-list');
    var count = $('wa-sub-count');
    var subs = getSubscribers();
    if (count) count.textContent = subs.length;
    if (!list) return;
    if (!subs.length) {
      list.innerHTML = '<div style="padding: 10px; font-size: 0.8rem; color: var(--text-muted);">'
        + 'No subscribers yet. Save this number as <strong>' + escapeHtml(getConfig().botName)
        + '</strong> in WhatsApp and send <strong>hi</strong> — the person is added automatically.</div>';
      return;
    }
    list.innerHTML = subs.map(function (s) {
      var open = isWindowOpen(s);
      return '<div class="wa-sub-row" style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 10px; border-bottom:1px solid var(--border-subtle); font-size:0.8rem;">'
        + '<div style="min-width:0;">'
        + '<div style="color: var(--text-primary, #e5e7eb); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">'
        + escapeHtml(s.name || 'Subscriber')
        + (open ? '' : ' <span style="color:var(--amber-400)">(24h window closed \u2014 send "hi" to resume)</span>')
        + '</div>'
        + '<div style="color: var(--text-muted); font-size:0.72rem;">+' + escapeHtml(String(s.id)) + '</div>'
        + '</div>'
        + '<button type="button" class="wa-sub-remove" data-id="' + escapeHtml(String(s.id)) + '"'
        + ' title="Stop sending alerts to this number"'
        + ' style="flex:0 0 auto; background:transparent; border:1px solid rgba(244,63,94,0.35); color:var(--rose-400); border-radius:6px; padding:3px 8px; cursor:pointer; font-size:0.72rem;">Remove</button>'
        + '</div>';
    }).join('');

    Array.prototype.forEach.call(list.querySelectorAll('.wa-sub-remove'), function (btn) {
      btn.addEventListener('click', function () {
        removeSubscriber(btn.getAttribute('data-id')).then(function () {
          renderSubscribers();
          populateForm();
        });
      });
    });
  }

  function populateForm() {
    var cfg = getConfig();
    var token = $('cfg-wa-token');
    var phoneId = $('cfg-wa-phone-id');
    var enabled = $('cfg-wa-enabled');
    var fromBrowser = $('cfg-wa-browser-push');
    var template = $('cfg-wa-template');
    if (token) token.value = cfg.token || '';
    if (phoneId) phoneId.value = cfg.phoneNumberId || '';
    if (enabled) enabled.checked = !!cfg.enabled;
    if (fromBrowser) fromBrowser.checked = !!cfg.pushFromBrowser;
    if (template) template.value = cfg.templateName || '';
    var hint = $('wa-bot-hint');
    if (hint) {
      var closed = cfg.windowClosed.length;
      hint.textContent = 'Bot: ' + cfg.botName + '  |  Alerts ' + (cfg.enabled ? 'ON' : 'OFF')
        + '  |  Push: ' + (cfg.pushFromBrowser ? 'this browser' : 'Supabase webhook')
        + '  |  ' + cfg.subscribers.length + ' subscriber(s)'
        + (closed ? '  |  ' + closed + ' in 24h cooldown' : '');
    }
    renderSubscribers();
  }

  function openModal() {
    var modal = $('modal-whatsapp');
    if (!modal) return;
    populateForm();
    var res = $('wa-settings-result');
    if (res) res.style.display = 'none';
    modal.classList.remove('hidden');
    // Refresh the shared list straight away so the count is never stale.
    fetchSubscribersQuietly(3000).then(function () { populateForm(); });
  }

  function closeModal() {
    var modal = $('modal-whatsapp');
    if (modal) modal.classList.add('hidden');
  }

  function currentDraft() {
    return {
      token: (($('cfg-wa-token') && $('cfg-wa-token').value.trim()) || DEFAULT_CONFIG.token),
      phoneNumberId: (($('cfg-wa-phone-id') && $('cfg-wa-phone-id').value.trim()) || DEFAULT_CONFIG.phoneNumberId),
      templateName: (($('cfg-wa-template') && $('cfg-wa-template').value.trim()) || ''),
      enabled: $('cfg-wa-enabled') ? !!$('cfg-wa-enabled').checked : true,
      pushFromBrowser: $('cfg-wa-browser-push') ? !!$('cfg-wa-browser-push').checked : true
    };
  }

  function wireUI() {
    var i;
    for (i = 0; i < OPENERS.length; i++) {
      (function (btn) {
        if (btn) btn.addEventListener('click', openModal);
      })($(OPENERS[i]));
    }

    var btnClose = $('btn-close-whatsapp-modal');
    if (btnClose) btnClose.addEventListener('click', closeModal);

    var overlay = $('modal-whatsapp');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
    }

    var btnVerify = $('btn-wa-verify');
    if (btnVerify) {
      btnVerify.addEventListener('click', function () {
        var res = $('wa-settings-result');
        renderStatus(res, 'info', 'Checking access token\u2026');
        saveConfig(currentDraft());
        verifyConnection().then(function (info) {
          renderStatus(res, 'ok', '\u{2705} Connected to ' + (info.verified_name || 'WhatsApp')
            + ' (' + (info.display_phone_number || 'number') + ')'
            + (info.quality_rating ? ' \u2014 quality: ' + info.quality_rating : ''));
        }).catch(function (err) {
          renderStatus(res, 'err', '\u{274C} ' + err.message);
        });
      });
    }

    // Pull everyone who sent "hi" (stored by the webhook in Supabase).
    var btnSync = $('btn-wa-sync');
    if (btnSync) {
      btnSync.addEventListener('click', function () {
        var res = $('wa-settings-result');
        renderStatus(res, 'info', 'Reading subscribers from Supabase\u2026');
        saveConfig(currentDraft());
        fetchSubscribers().then(function (subs) {
          populateForm();
          if (subs.length) {
            renderStatus(res, 'ok', '\u{2705} ' + subs.length + ' subscriber(s): '
              + subs.map(function (s) { return s.name; }).join(', '));
          } else {
            renderStatus(res, 'warn', '\u{26A0}\uFE0F Table is empty — no one has sent "hi" to the bot yet.');
          }
        }).catch(function (err) {
          populateForm();
          renderStatus(res, 'err', '\u{274C} ' + err.message);
        });
      });
    }

    // Manual fallback: add a number without it having sent "hi" first.
    var btnAdd = $('btn-wa-add-sub');
    if (btnAdd) {
      btnAdd.addEventListener('click', function () {
        var input = $('cfg-wa-add-sub');
        var res = $('wa-settings-result');
        var val = input && input.value.trim();
        if (!val) { renderStatus(res, 'err', '\u{274C} Enter a WhatsApp number with country code first.'); return; }
        addSubscriber(val, 'Manual +' + val.replace(/[^\d]/g, '')).then(function () {
          if (input) input.value = '';
          populateForm();
          renderStatus(res, 'ok', '\u{2705} +' + val.replace(/[^\d]/g, '') + ' added. Note: WhatsApp may only accept '
            + 'free-form messages within 24 h of THEIR message to the bot.');
        }).catch(function (err) {
          renderStatus(res, 'err', '\u{274C} ' + err.message);
        });
      });
    }

    var btnTest = $('btn-wa-test');
    if (btnTest) {
      btnTest.addEventListener('click', function () {
        var res = $('wa-settings-result');
        saveConfig(currentDraft());
        renderStatus(res, 'info', 'Sending test message to ' + getSubscribers().length + ' subscriber(s)\u2026');
        sendTestMessage().then(function (r) {
          renderStatus(res, 'ok', '\u{2705} Test delivered to ' + r.delivered + ' of ' + r.total
            + ' subscriber(s).' + (r.skipped ? ' ' + r.skipped + ' skipped (24h window closed).' : '')
            + ' Check their WhatsApp.');
        }).catch(function (err) {
          renderStatus(res, 'err', '\u{274C} ' + err.message);
        });
      });
    }

    var btnSave = $('btn-wa-save');
    if (btnSave) {
      btnSave.addEventListener('click', function () {
        saveConfig(currentDraft());
        var res = $('wa-settings-result');
        renderStatus(res, 'ok', '\u{2705} WhatsApp alert settings saved.');
        populateForm();
        setTimeout(closeModal, 900);
      });
    }

    var btnCancel = $('btn-wa-cancel');
    if (btnCancel) btnCancel.addEventListener('click', closeModal);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUI);
  } else {
    wireUI();
  }

  // Background refresh of the shared subscriber list (cheap, once a minute).
  function backgroundSync() {
    try {
      if (!getConfig().enabled) return;
      fetchSubscribersQuietly(4000).then(function (subs) {
        var modal = $('modal-whatsapp');
        if (modal && !modal.classList.contains('hidden') && subs) populateForm();
      });
    } catch (_) { }
  }
  setTimeout(backgroundSync, 6000);
  setInterval(backgroundSync, 60000);

  // ---------------------------------------------------------------------------
  // Public surface (used by bundle.js after every successful save)
  // ---------------------------------------------------------------------------
  window.WhatsappAlert = {
    config: getConfig,
    saveConfig: saveConfig,
    subscribers: getSubscribers,
    fetchSubscribers: fetchSubscribers,
    addSubscriber: addSubscriber,
    removeSubscriber: removeSubscriber,
    isWindowOpen: isWindowOpen,
    sendText: sendText,
    broadcast: broadcast,
    formatShiftAlert: formatShiftAlert,
    sendShiftAlert: sendShiftAlert,
    sendTestMessage: sendTestMessage,
    verifyConnection: verifyConnection
  };
})();
