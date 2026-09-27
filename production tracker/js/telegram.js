/**
 * TELEGRAM SUPERVISOR ALERTS (broadcast edition)
 * ---------------------------------------------------------------------------
 * Pushes a shift-entry alert to EVERYONE who has pressed /start on the bot the
 * moment a production record is saved on the website.
 *
 * Uses the official Telegram Bot HTTP API (https://api.telegram.org) which
 * allows cross-origin browser requests, so no server/proxy is required.
 *
 * How subscribers are discovered
 *   Telegram offers no "list everyone who /start'ed the bot" method, so the
 *   only source is getUpdates. This module:
 *     1. polls getUpdates on page load, on a 60s timer, and right before every
 *        broadcast — so a user who pressed /start while the tracker was closed
 *        is still picked up on the next save;
 *     2. remembers every chat id it sees in localStorage (never lost, even
 *        though getUpdates only re-delivers unconfirmed updates);
 *     3. replies "✅ subscribed" once per newly discovered chat so the user
 *        gets immediate proof that /start worked;
 *     4. keeps EVERY chat that pressed /start on the list forever. If Telegram
 *        refuses a send (HTTP 403 = the supervisor blocked the bot) the chat is
 *        only put on a 10-minute cooldown and retried, so alerts resume by
 *        themselves the moment they unblock — a single failure never removes
 *        someone from the broadcast list.
 *
 * Message template (per requirement):
 *   -- DATE -
 *   -- SHIFT -
 *   -- MACHINE NAME -
 *   -- OPERATOR NAME -
 *   -- PART NUMBER -
 *   -- CYCLE TIME -
 *   -- QUANTITY -
 *   -- LOSSES OCCURED IN MINS -
 *
 * NOTE: a bot token shipped in client-side code is readable by anyone who can
 * open the website. This is acceptable for a private/internal shopfloor tool.
 * If this app is ever made public, move the send step behind a server proxy and
 * regenerate the token with @BotFather.
 * ---------------------------------------------------------------------------
 */
(function () {
  'use strict';

  var TG_STORAGE_KEY = 'prodtracker_telegram_config';

  var DEFAULT_CONFIG = {
    token: '8749273284:AAEjsVRkln9o9WanlhfaGu-YLFGkOxpQxVE',
    botName: '@lemken_tracker_bot',
    enabled: true,
    // Every chat that pressed /start. { id, name, addedAt, welcomed }
    subscribers: [{ id: '6779455826', name: 'Abhi (Supervisor)', addedAt: 0, welcomed: true }],
    // Chat ids whose LAST send failed (HTTP 403 = the user blocked/deleted the
    // bot, or Telegram refused for a moment). They STAY subscribers — blocking
    // is usually temporary, so we throttle retries instead of deleting them.
    // Deleting was the old behaviour and it is what made alerts stop reaching
    // a supervisor permanently after one single failure.
    blocked: [],
    // chat id -> update_id already seen when the block was recorded. Lets us
    // recognise a genuinely NEW /start from someone who unblocked and came back.
    blockedAt: {},
    // chat id -> epoch ms before which no automatic retry is attempted.
    retryAt: {},
    // Highest update_id observed so far — the reference point for that test.
    lastUpdateId: 0
  };

  // Shift clock windows (kept in sync with getCurrentShiftInfo in bundle.js)
  var SHIFT_TIMES = {
    'Shift A': '06:00 - 13:30',
    'Shift B': '14:30 - 23:00',
    'Shift C': '23:00 - 06:00'
  };

  // Local copy of the 15 loss labels so this file stays self-contained.
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

  // ---------------------------------------------------------------------------
  // Config helpers
  // ---------------------------------------------------------------------------
  function getConfig() {
    var cfg = {};
    var k;
    for (k in DEFAULT_CONFIG) cfg[k] = DEFAULT_CONFIG[k];
    try {
      var raw = localStorage.getItem(TG_STORAGE_KEY);
      if (raw) {
        var saved = JSON.parse(raw);
        for (k in saved) {
          if (saved[k] !== undefined && saved[k] !== null && saved[k] !== '') cfg[k] = saved[k];
        }
      }
    } catch (_) { }
    if (!Array.isArray(cfg.subscribers) || !cfg.subscribers.length) {
      // Deep-copy so mutating a subscriber never touches the defaults object.
      cfg.subscribers = DEFAULT_CONFIG.subscribers.map(function (s) {
        var c = {};
        for (var k in s) c[k] = s[k];
        return c;
      });
    }
    if (!Array.isArray(cfg.blocked)) cfg.blocked = [];
    if (!cfg.blockedAt || typeof cfg.blockedAt !== 'object') cfg.blockedAt = {};
    if (!cfg.retryAt || typeof cfg.retryAt !== 'object') cfg.retryAt = {};
    if (typeof cfg.lastUpdateId !== 'number') cfg.lastUpdateId = 0;
    return cfg;
  }

  function saveConfig(patch) {
    var cfg = getConfig();
    for (var k in patch) {
      if (patch[k] !== undefined && patch[k] !== null) cfg[k] = patch[k];
    }
    try { localStorage.setItem(TG_STORAGE_KEY, JSON.stringify(cfg)); } catch (_) { }
    return cfg;
  }

  /** Every chat that will receive alerts. */
  function getSubscribers() {
    return getConfig().subscribers;
  }

  function getBlocked() {
    var b = getConfig().blocked;
    // Copy: getConfig() may hand back the shared DEFAULT_CONFIG array.
    return Array.isArray(b) ? b.slice() : [];
  }

  // A chat that blocked the bot is retried this often, so alerts resume by
  // themselves as soon as the supervisor unblocks — no /start needed.
  var RETRY_MS = 10 * 60 * 1000;

  function copyMap(obj) {
    var out = {};
    for (var k in obj) out[k] = obj[k];
    return out;
  }

  function getRetryAt() {
    var cfg = getConfig();
    return copyMap(cfg.retryAt);
  }

  function isBlocked(id) {
    id = String(id);
    return getBlocked().indexOf(id) !== -1;
  }

  /** True when this chat may be attempted right now (never sent, or cooldown over). */
  function canSend(id) {
    id = String(id);
    if (!isBlocked(id)) return true;
    return Date.now() >= (Number(getRetryAt()[id]) || 0);
  }

  /**
   * Telegram refused us for this chat (HTTP 403). The chat STAYS subscribed —
   * it is only put on a cooldown. Deleting it (the old behaviour) meant that a
   * supervisor who blocked the bot once, or any single transient failure, was
   * silently dropped forever and never received another alert.
   */
  function markBlocked(id, updateId) {
    id = String(id);
    var cfg = getConfig();
    var b = cfg.blocked.slice();
    var at = copyMap(cfg.blockedAt);
    var rt = copyMap(cfg.retryAt);
    if (b.indexOf(id) === -1) b.push(id);
    // Remember which update we had already seen: a NEWER /start later on means
    // the user unblocked and pressed start again, which clears the pause at once.
    at[id] = Number(updateId) || Number(cfg.lastUpdateId) || 0;
    rt[id] = Date.now() + RETRY_MS;
    saveConfig({ blocked: b, blockedAt: at, retryAt: rt });
  }

  /** Clears the delivery pause (success, or the admin/user asked back in). */
  function clearBlocked(id) {
    id = String(id);
    var cfg = getConfig();
    var b = cfg.blocked.filter(function (x) { return x !== id; });
    var at = copyMap(cfg.blockedAt);
    var rt = copyMap(cfg.retryAt);
    delete at[id];
    delete rt[id];
    saveConfig({ blocked: b, blockedAt: at, retryAt: rt });
    return b;
  }

  // Kept as the public name used by the settings modal.
  var unblock = clearBlocked;

  /**
   * Remembers a chat id. Returns true when it was NEW (i.e. the caller should
   * send the one-time welcome message). Chats that are on a delivery pause are
   * still real subscribers, so they are kept in the list — the broadcast simply
   * respects their cooldown.
   */
  function addSubscriber(id, name) {
    id = String(id || '').trim();
    if (!id) return false;
    var subs = getSubscribers();
    for (var i = 0; i < subs.length; i++) {
      if (String(subs[i].id) === id) {
        // Refresh the display name if Telegram now knows it.
        if (name && subs[i].name !== name) {
          subs[i].name = name;
          saveConfig({ subscribers: subs });
        }
        return false;
      }
    }
    subs.push({ id: id, name: name || ('Chat ' + id), addedAt: Date.now(), welcomed: false });
    saveConfig({ subscribers: subs });
    return true;
  }

  function removeSubscriber(id) {
    id = String(id);
    var subs = getSubscribers().filter(function (s) { return String(s.id) !== id; });
    saveConfig({ subscribers: subs });
    // An explicit removal also forgets any pause/cooldown bookkeeping.
    if (isBlocked(id)) clearBlocked(id);
    return subs;
  }

  function markWelcomed(id) {
    var subs = getSubscribers();
    for (var i = 0; i < subs.length; i++) {
      if (String(subs[i].id) === String(id)) subs[i].welcomed = true;
    }
    saveConfig({ subscribers: subs });
  }

  // ---------------------------------------------------------------------------
  // Low level API call
  // ---------------------------------------------------------------------------
  function api(method, payload) {
    var cfg = getConfig();
    if (!cfg.token) return Promise.reject(new Error('Bot token not configured'));
    return fetch('https://api.telegram.org/bot' + cfg.token + '/' + method, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (res) { return res.json(); }).then(function (json) {
      if (!json.ok) {
        var err = new Error(json.description || ('Telegram error ' + json.error_code));
        err.code = json.error_code;
        throw err;
      }
      return json.result;
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
  // Subscriber discovery via getUpdates
  // ---------------------------------------------------------------------------

  /** Pulls every chat visible in pending updates into the subscriber list. */
  function discoverSubscribers() {
    return api('getUpdates', {}).then(function (updates) {
      updates = updates || [];
      var discovered = [];
      var chats = {};
      var maxUpdateId = Number(getConfig().lastUpdateId) || 0;

      for (var i = 0; i < updates.length; i++) {
        var u = updates[i];
        var uid = Number(u.update_id) || 0;
        if (uid > maxUpdateId) maxUpdateId = uid;
        var msg = u.message || u.edited_message || u.channel_post || u.callback_query && u.callback_query.message;
        var chat = (msg && msg.chat) || (u.my_chat_member && u.my_chat_member.chat);
        if (!chat || !chat.id) continue;
        var id = String(chat.id);
        // Private chats only — groups/channels would need the bot added first.
        if (chat.type && chat.type !== 'private') continue;
        if (!chats[id]) {
          chats[id] = {
            id: id,
            name: chat.first_name
              ? chat.first_name + (chat.last_name ? ' ' + chat.last_name : '')
              : (chat.username ? '@' + chat.username : null),
            text: (msg && msg.text) || '',
            updateId: uid
          };
        } else if (uid >= chats[id].updateId) {
          // Keep the newest message from this chat (the /start matters most).
          chats[id].updateId = uid;
          if (msg && msg.text) chats[id].text = msg.text;
        }
      }

      var blockedAt = getConfig().blockedAt;
      for (var cid in chats) {
        var c = chats[cid];
        if (isBlocked(cid)) {
          // Everyone who ever pressed /start stays on the list — the chat is
          // only on a delivery pause. If this /start is NEWER than the update
          // recorded when the pause began, the supervisor unblocked the bot and
          // pressed start again, so resume them immediately.
          var freshStart = /^\/start/i.test(c.text)
            && c.updateId > (Number(blockedAt[cid]) || 0);
          if (freshStart) {
            console.log('[Telegram] ' + c.name + ' (' + cid + ') pressed /start again — resuming alerts.');
            unblock(cid);
          }
        }
        var isNew = addSubscriber(cid, c.name);
        if (isNew) discovered.push(c);
      }

      // Remember the high-water mark for the block comparison above.
      if (maxUpdateId > (Number(getConfig().lastUpdateId) || 0)) saveConfig({ lastUpdateId: maxUpdateId });

      // One-time confirmation so the user knows /start actually worked.
      discovered.forEach(function (d) {
        if (!/^\/start/i.test(d.text)) { markWelcomed(d.id); return; }
        // No point attempting a welcome to a chat that has paused delivery —
        // it would only produce a 403. They still receive future alerts.
        if (isBlocked(d.id)) { markWelcomed(d.id); return; }
        api('sendMessage', {
          chat_id: d.id,
          text: '\u{2705} You are subscribed to Production Tracker alerts.\n'
            + 'Every new production entry will be sent to this chat.\n'
            + '(Sent by ' + (getConfig().botName || 'the bot') + ')',
          disable_web_page_preview: true
        }).then(function () { markWelcomed(d.id); }).catch(function () { });
      });

      if (discovered.length) {
        console.log('[Telegram] Found ' + discovered.length + ' new subscriber(s): '
          + discovered.map(function (d) { return d.name; }).join(', '));
      }
      return { discovered: discovered, subscribers: getSubscribers() };
    });
  }

  /**
   * Best-effort discovery wrapped in a timeout, used right before a broadcast
   * so a freshly pressed /start still catches the current alert.
   */
  function discoverQuietly(ms) {
    return withTimeout(discoverSubscribers(), ms || 2500).catch(function () { return null; });
  }

  // ---------------------------------------------------------------------------
  // Message builder
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

  /**
   * Formats a production entry into the supervisor alert text.
   * Public so the settings modal can preview it.
   */
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
    var rule = '\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}\u{2501}';

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
  // Broadcasting
  // ---------------------------------------------------------------------------

  /**
   * Sends one text to one chat. A success clears any previous delivery pause;
   * HTTP 403 puts the chat on a cooldown (it stays subscribed) so it resumes
   * automatically once the supervisor unblocks the bot.
   */
  function sendToSubscriber(sub, text) {
    return api('sendMessage', {
      chat_id: sub.id,
      text: text,
      disable_web_page_preview: true
    }).then(function (msg) {
      if (isBlocked(sub.id)) clearBlocked(sub.id);
      // Anything actually delivered proves this chat receives alerts, so it no
      // longer needs the "pending welcome" marker in the settings list.
      if (!sub.welcomed) markWelcomed(sub.id);
      return { id: sub.id, name: sub.name, ok: true, message_id: msg.message_id };
    }).catch(function (err) {
      if (err.code === 403) {
        markBlocked(sub.id);
        console.warn('[Telegram] Delivery paused for ' + sub.name + ' (' + sub.id
          + ') — bot blocked by user, retrying every ' + (RETRY_MS / 60000)
          + ' min until they unblock: ' + err.message);
      } else {
        console.warn('[Telegram] Could not reach ' + sub.name + ' (' + sub.id + '): ' + err.message);
      }
      return { id: sub.id, name: sub.name, ok: false, error: err.message };
    });
  }

  /**
   * Broadcasts a message to every subscriber, sequentially (stays well inside
   * Telegram's ~30 msg/s limit).
   *
   * Chats whose cooldown has not expired are skipped, not dropped — the count
   * reported back always reflects the whole subscriber list. opts.force
   * (used by the "Send Test" button) ignores the cooldown.
   */
  function broadcast(text, opts) {
    opts = opts || {};
    var all = getSubscribers();
    var recipients = opts.force ? all : all.filter(function (s) { return canSend(s.id); });
    var paused = all.length - recipients.length;

    var tasks = recipients.map(function (sub, i) {
      return function () {
        return sendToSubscriber(sub, text).then(function (r) {
          if (i > 0 && opts.gapMs) return new Promise(function (res) { setTimeout(res, opts.gapMs); }).then(function () { return r; });
          return r;
        });
      };
    });

    var results = [];
    return tasks.reduce(function (chain, task) {
      return chain.then(function () { return task(); }).then(function (r) { results.push(r); });
    }, Promise.resolve()).then(function () {
      var ok = results.filter(function (r) { return r.ok; });
      var bad = results.filter(function (r) { return !r.ok; });
      console.log('[Telegram] Broadcast delivered to ' + ok.length + '/' + all.length + ' subscriber(s).'
        + (paused ? ' ' + paused + ' on delivery pause (cooldown), will retry automatically.' : '')
        + (bad.length ? ' Failed: ' + bad.map(function (b) { return b.name + ' (' + b.error + ')'; }).join('; ') : ''));
      if (typeof opts.onDone === 'function') opts.onDone(results);
      return { results: results, total: all.length, paused: paused };
    });
  }

  /**
   * Sends the shift alert to every subscriber. Never throws and never blocks
   * the caller, so a Telegram outage can never break the save flow.
   *
   * Discovery runs first (bounded) so a user who pressed /start a moment ago —
   * or while the tracker was closed — still receives this very alert.
   */
  function sendShiftAlert(entry) {
    try {
      var cfg = getConfig();
      if (!cfg.enabled) return Promise.resolve(null);
      if (!cfg.subscribers || !cfg.subscribers.length) {
        console.warn('[Telegram] No subscribers yet — ask users to open ' + cfg.botName + ' and press /start.');
        return Promise.resolve(null);
      }
      var text = formatShiftAlert(entry);
      return discoverQuietly(2500).then(function () {
        return broadcast(text, { gapMs: 60 });
      }).catch(function (err) {
        console.warn('[Telegram] Shift alert failed:', err && err.message);
        return null;
      });
    } catch (err) {
      console.warn('[Telegram] Shift alert failed:', err && err.message);
      return Promise.resolve(null);
    }
  }

  /** Sends a plain-text test message to every subscriber (ignores cooldowns). */
  function sendTestMessage(customText) {
    var cfg = getConfig();
    if (!cfg.subscribers || !cfg.subscribers.length) {
      return Promise.reject(new Error('No subscribers. Press /start in the bot first.'));
    }
    var text = customText ||
      '\u{2705} Production Tracker test alert\n' +
      'Telegram notifications are working for this device.\n' +
      'Subscribers receiving alerts: ' + cfg.subscribers.length;
    return broadcast(text, { gapMs: 60, force: true }).then(function (r) {
      var results = r.results;
      var ok = results.filter(function (x) { return x.ok; });
      if (!ok.length) {
        throw new Error(results.length ? results[0].error : 'Delivery failed');
      }
      return {
        message_id: ok[0].message_id,
        delivered: ok.length,
        total: r.total,
        paused: r.total - ok.length
      };
    });
  }

  /**
   * Legacy single-chat lookup kept for compatibility with the old button.
   * Returns the most recently seen chat.
   */
  function detectChatId() {
    return discoverSubscribers().then(function (r) {
      var subs = r.subscribers;
      if (!subs.length) throw new Error('No chats found. Send /start to ' + DEFAULT_CONFIG.botName + ' and retry.');
      return { id: String(subs[subs.length - 1].id), name: subs[subs.length - 1].name };
    });
  }

  /** Verifies the bot token is valid. */
  function verifyBot() {
    return api('getMe', {}).then(function (bot) {
      return { username: bot.username, first_name: bot.first_name };
    });
  }

  // ---------------------------------------------------------------------------
  // Settings modal UI
  // ---------------------------------------------------------------------------
  var OPENERS = ['btn-open-telegram-settings', 'btn-open-telegram-settings-alt'];

  function $(id) { return document.getElementById(id); }

  function renderStatus(el, kind, text) {
    if (!el) return;
    var palette = {
      ok: ['rgba(16, 185, 129, 0.15)', 'var(--emerald-400, #10b981)'],
      err: ['rgba(244, 63, 94, 0.15)', 'var(--rose-400, #f43f5e)'],
      info: ['rgba(6, 182, 212, 0.12)', 'var(--cyan-400, #06b6d2)']
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
    var list = $('tg-subscriber-list');
    var count = $('tg-sub-count');
    var subs = getSubscribers();
    if (count) count.textContent = subs.length;
    if (!list) return;
    if (!subs.length) {
      list.innerHTML = '<div style="padding: 10px; font-size: 0.8rem; color: var(--text-muted);">'
        + 'No subscribers yet. Open <strong>' + escapeHtml(getConfig().botName || '') + '</strong> in Telegram and press <strong>/start</strong>.</div>';
      return;
    }
    list.innerHTML = subs.map(function (s) {
      return '<div class="tg-sub-row" style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:7px 10px; border-bottom:1px solid var(--border-subtle); font-size:0.8rem;">'
        + '<div style="min-width:0;">'
        + '<div style="color: var(--text-primary, #e5e7eb); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">'
        + escapeHtml(s.name || 'Subscriber')
        + (s.welcomed ? '' : ' <span style="color:var(--amber-400)">(pending welcome)</span>')
        + (isBlocked(s.id)
            ? ' <span style="color:var(--rose-400)">(paused \u2014 blocked the bot, retries every '
              + (RETRY_MS / 60000) + ' min)</span>'
            : '')
        + '</div>'
        + '<div style="color: var(--text-muted); font-size:0.72rem;">' + escapeHtml(String(s.id)) + '</div>'
        + '</div>'
        + '<button type="button" class="tg-sub-remove" data-id="' + escapeHtml(String(s.id)) + '"'
        + ' title="Stop sending alerts to this chat"'
        + ' style="flex:0 0 auto; background:transparent; border:1px solid rgba(244,63,94,0.35); color:var(--rose-400); border-radius:6px; padding:3px 8px; cursor:pointer; font-size:0.72rem;">Remove</button>'
        + '</div>';
    }).join('');

    Array.prototype.forEach.call(list.querySelectorAll('.tg-sub-remove'), function (btn) {
      btn.addEventListener('click', function () {
        removeSubscriber(btn.getAttribute('data-id'));
        renderSubscribers();
      });
    });
  }

  function populateForm() {
    var cfg = getConfig();
    var token = $('cfg-tg-token');
    var enabled = $('cfg-tg-enabled');
    if (token) token.value = cfg.token || '';
    if (enabled) enabled.checked = !!cfg.enabled;
    var hint = $('tg-bot-hint');
    if (hint) {
      var paused = cfg.blocked.length;
      hint.textContent = 'Bot: ' + (cfg.botName || DEFAULT_CONFIG.botName)
        + '  |  Alerts ' + (cfg.enabled ? 'ON' : 'OFF')
        + '  |  ' + cfg.subscribers.length + ' subscriber(s)'
        + (paused ? '  |  ' + paused + ' paused (blocked the bot)' : '');
    }
    renderSubscribers();
  }

  function openModal() {
    var modal = $('modal-telegram');
    if (!modal) return;
    populateForm();
    var res = $('tg-settings-result');
    if (res) res.style.display = 'none';
    modal.classList.remove('hidden');
  }

  function closeModal() {
    var modal = $('modal-telegram');
    if (modal) modal.classList.add('hidden');
  }

  function currentDraft() {
    var subs = getSubscribers();
    var legacy = ($('cfg-tg-chat-id') && $('cfg-tg-chat-id').value.trim()) || '';
    if (legacy) {
      // Old single-chat field still present → keep it as a subscriber.
      addSubscriber(legacy, 'Supervisor');
      subs = getSubscribers();
    }
    return {
      token: ($('cfg-tg-token') && $('cfg-tg-token').value.trim()) || DEFAULT_CONFIG.token,
      enabled: $('cfg-tg-enabled') ? !!$('cfg-tg-enabled').checked : true,
      subscribers: subs
    };
  }

  function wireUI() {
    var i;
    for (i = 0; i < OPENERS.length; i++) {
      (function (btn) {
        if (btn) btn.addEventListener('click', openModal);
      })($(OPENERS[i]));
    }

    var btnClose = $('btn-close-telegram-modal');
    if (btnClose) btnClose.addEventListener('click', closeModal);

    var overlay = $('modal-telegram');
    if (overlay) {
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closeModal();
      });
    }

    var btnVerify = $('btn-tg-verify');
    if (btnVerify) {
      btnVerify.addEventListener('click', function () {
        var res = $('tg-settings-result');
        renderStatus(res, 'info', 'Checking bot token\u2026');
        saveConfig(currentDraft());
        verifyBot().then(function (bot) {
          renderStatus(res, 'ok', '\u{2705} Bot verified: ' + bot.first_name + ' (' + bot.username + ')');
        }).catch(function (err) {
          renderStatus(res, 'err', '\u{274C} ' + err.message);
        });
      });
    }

    // "Sync Subscribers" — pulls everyone who pressed /start into the list.
    var btnDetect = $('btn-tg-detect');
    if (btnDetect) {
      btnDetect.addEventListener('click', function () {
        var res = $('tg-settings-result');
        renderStatus(res, 'info', 'Scanning for users who pressed /start\u2026');
        saveConfig(currentDraft());
        discoverSubscribers().then(function (r) {
          renderSubscribers();
          populateForm();
          if (r.discovered.length) {
            renderStatus(res, 'ok', '\u{2705} Found ' + r.discovered.length + ' new subscriber(s): '
              + r.discovered.map(function (d) { return d.name; }).join(', ')
              + '. Total ' + r.subscribers.length + ' will receive alerts.');
          } else {
            renderStatus(res, 'ok', '\u{2705} No new subscribers. ' + r.subscribers.length
              + ' chat(s) currently receive alerts: '
              + r.subscribers.map(function (s) { return s.name; }).join(', ') + '.');
          }
        }).catch(function (err) {
          renderStatus(res, 'err', '\u{274C} ' + err.message);
        });
      });
    }

    // Manual fallback: paste a chat id if auto-discovery can't see it.
    var btnAdd = $('btn-tg-add-sub');
    if (btnAdd) {
      btnAdd.addEventListener('click', function () {
        var input = $('cfg-tg-add-sub');
        var res = $('tg-settings-result');
        var val = input && input.value.trim();
        if (!val) { renderStatus(res, 'err', '\u{274C} Enter a chat id first.'); return; }
        // Typing an id here is an explicit "reach this person" instruction, so
        // clear any delivery pause first (a previous 403 may have paused them).
        var wasBlocked = isBlocked(val);
        if (wasBlocked) unblock(val);
        var added = addSubscriber(val, 'Manual ' + val);
        if (input) input.value = '';
        renderSubscribers();
        populateForm();
        renderStatus(res, 'ok', added
          ? '\u{2705} Subscriber ' + val + (wasBlocked ? ' unblocked and added.' : ' added.')
          : (wasBlocked
              ? '\u{2705} Alerts resumed for ' + val + '.'
              : '\u{2139}\uFE0F ' + val + ' was already subscribed.'));
      });
    }

    var btnTest = $('btn-tg-test');
    if (btnTest) {
      btnTest.addEventListener('click', function () {
        var res = $('tg-settings-result');
        saveConfig(currentDraft());
        renderStatus(res, 'info', 'Sending test message to ' + getSubscribers().length + ' subscriber(s)\u2026');
        sendTestMessage().then(function (r) {
          renderStatus(res, 'ok', '\u{2705} Test delivered to ' + r.delivered + ' of ' + r.total
            + ' subscriber(s).' + (r.paused ? ' ' + r.paused + ' on delivery pause (they blocked the bot).' : '')
            + ' Check their Telegram.');
        }).catch(function (err) {
          renderStatus(res, 'err', '\u{274C} ' + err.message);
        });
      });
    }

    var btnSave = $('btn-tg-save');
    if (btnSave) {
      btnSave.addEventListener('click', function () {
        saveConfig(currentDraft());
        var res = $('tg-settings-result');
        renderStatus(res, 'ok', '\u{2705} Telegram alert settings saved.');
        populateForm();
        setTimeout(closeModal, 900);
      });
    }

    var btnCancel = $('btn-tg-cancel');
    if (btnCancel) btnCancel.addEventListener('click', closeModal);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireUI);
  } else {
    wireUI();
  }

  // Background discovery: pick up anyone who presses /start while the tracker
  // sits open. Silent, best-effort, and skipped when alerts are switched off.
  function backgroundSync() {
    try {
      if (!getConfig().enabled) return;
      discoverSubscribers().then(function (r) {
        if (r.discovered.length && $('modal-telegram') && !$('modal-telegram').classList.contains('hidden')) {
          renderSubscribers();
          populateForm();
        }
      }).catch(function () { });
    } catch (_) { }
  }
  setTimeout(backgroundSync, 4000);
  setInterval(backgroundSync, 60000);

  // ---------------------------------------------------------------------------
  // Public surface (used by bundle.js after every successful save)
  // ---------------------------------------------------------------------------
  window.TelegramAlert = {
    config: getConfig,
    saveConfig: saveConfig,
    subscribers: getSubscribers,
    addSubscriber: addSubscriber,
    removeSubscriber: removeSubscriber,
    markBlocked: markBlocked,
    unblock: unblock,
    clearBlocked: clearBlocked,
    canSend: canSend,
    isBlocked: isBlocked,
    blocked: getBlocked,
    discoverSubscribers: discoverSubscribers,
    broadcast: broadcast,
    formatShiftAlert: formatShiftAlert,
    sendShiftAlert: sendShiftAlert,
    sendTestMessage: sendTestMessage,
    detectChatId: detectChatId,
    verifyBot: verifyBot
  };
})();
