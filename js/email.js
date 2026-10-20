/**
 * EMAIL ALERTS & COLLECTIVE SHIFT PDF REPORT DISPATCHER
 * ---------------------------------------------------------------------------
 * ONE collective report per shift (A / B / C) — never one per machine.
 * Sent once when the shift's data is collected (all 11 machines, or first
 * save after the shift window ends). Generates a light-theme PDF containing:
 *   - Lemken Company branding + shift metadata + line KPI tiles
 *   - Vector visuals (line OEE gauge + Availability/Performance/Quality
 *     progress bars + shift-wide downtime loss bars) — drawn shapes, no
 *     images, so the PDF stays small enough to mail
 *   - Machine-wise summary table + full analysis section per reporting machine
 *
 * Sends the collective PDF + summary via EmailJS to the supervisor email(s).
 * ---------------------------------------------------------------------------
 */

(function () {
  'use strict';

  const STORAGE_KEY = 'prodtracker_email_config';

  const DEFAULT_CONFIG = {
    enabled: true,
    recipient: 'gedamabhijit4070@gmail.com',
    serviceId: 'service_prodtrack',
    templateId: 'template_1ekvs05',
    publicKey: 'Ev55sXxAA4E5n8dIF'
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

  // EmailJS rejects requests whose TOTAL template variables exceed 50KB
  // (51200 chars). The vector PDF is ~10-20KB, so it fits inline directly.
  const PDF_BUDGET_CHARS = 46000;

  // Light-theme palette + vector visuals (pure jsPDF shapes, zero images —
  // keeps the PDF tiny enough to mail). Layout unchanged.
  // Executive palette: deep navy + gold, warm-cream cards. Professional
  // document look (matches the email template's navy/gold theme).
  function getConfig() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // Drop legacy rule keys so old installs always send on every entry.
        delete parsed.triggerOnEveryEntry;
        delete parsed.cancelIfLossExceeds120OrBreakdown;
        return Object.assign({}, DEFAULT_CONFIG, parsed);
      }
    } catch (e) {
      console.warn('[EmailAlert] Failed to read config from localStorage', e);
    }
    return Object.assign({}, DEFAULT_CONFIG);
  }

  function saveConfig(cfg) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
      return true;
    } catch (e) {
      console.error('[EmailAlert] Failed to save config to localStorage', e);
      return false;
    }
  }

  const LIGHT = {
    brand: [11, 29, 58],        // navy — primary surfaces
    brandDark: [7, 19, 40],     // deeper navy — rules/shadows
    accent: [200, 162, 60],     // gold — highlights, accents, key figures
    accentLight: [232, 205, 130],
    ink: [15, 23, 42],
    muted: [100, 116, 139],
    line: [216, 206, 180],      // warm border
    card: [247, 244, 236],      // cream card fill
    track: [226, 232, 240],
    green: [16, 185, 129],
    amber: [217, 119, 6],
    amberDark: [180, 106, 10],
    red: [220, 60, 60],
    blue: [14, 165, 233],
    violet: [139, 92, 246]
  };

  function oeeColor(pct) {
    const v = Number(pct) || 0;
    if (v >= 85) return LIGHT.green;
    if (v >= 60) return LIGHT.amber;
    return LIGHT.red;
  }

  // Semicircle OEE gauge from vector segments. Angle t runs PI (left) -> 0
  // (right) across the TOP of the circle. Returns the gauge color.
  function drawGauge(doc, cx, cy, r, pct) {
    const frac = Math.max(0, Math.min(1, (Number(pct) || 0) / 100));
    const segs = 36;
    const col = oeeColor(pct);
    doc.setLineWidth(5);
    doc.setDrawColor(LIGHT.track[0], LIGHT.track[1], LIGHT.track[2]);
    for (let i = 0; i < segs; i++) {
      const a0 = Math.PI - (i / segs) * Math.PI;
      const a1 = Math.PI - ((i + 1) / segs) * Math.PI;
      doc.line(cx + r * Math.cos(a0), cy - r * Math.sin(a0), cx + r * Math.cos(a1), cy - r * Math.sin(a1));
    }
    const fill = frac > 0 ? Math.max(1, Math.round(segs * frac)) : 0;
    doc.setDrawColor(col[0], col[1], col[2]);
    for (let i = 0; i < fill; i++) {
      const a0 = Math.PI - (i / segs) * Math.PI;
      const a1 = Math.PI - ((i + 1) / segs) * Math.PI;
      doc.line(cx + r * Math.cos(a0), cy - r * Math.sin(a0), cx + r * Math.cos(a1), cy - r * Math.sin(a1));
    }
    doc.setLineWidth(0.8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(col[0], col[1], col[2]);
    doc.text(`${Number(pct) || 0}%`, cx, cy - 2, { align: 'center' });
    doc.setFontSize(8);
    doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
    doc.text('OVERALL OEE', cx, cy + 5, { align: 'center' });
    doc.setFontSize(7.5);
    doc.text('0', cx - r - 1, cy + 1, { align: 'right' });
    doc.text('100', cx + r + 1, cy + 1, { align: 'left' });
    return col;
  }

  // KPI strip: equal cells with caps label above a big value. Systematic
  // per-machine numbers row (OEE · A · P · Q · Good · Scrap · Loss).
  function drawKpiStrip(doc, x, y, w, cells) {
    const n = Math.max(1, cells.length);
    const cw = w / n;
    const h = 15;
    cells.forEach((c, i) => {
      const cx = x + i * cw;
      doc.setFillColor(LIGHT.card[0], LIGHT.card[1], LIGHT.card[2]);
      doc.setDrawColor(LIGHT.line[0], LIGHT.line[1], LIGHT.line[2]);
      doc.rect(cx, y, cw, h, i === 0 ? 'FD' : 'DF');
      if (i === 0) {
        doc.setFillColor(LIGHT.accent[0], LIGHT.accent[1], LIGHT.accent[2]);
        doc.rect(cx, y, 1.6, h, 'F');
      }
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7);
      doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
      doc.text(c.label, cx + cw / 2, y + 5, { align: 'center' });
      doc.setFontSize(13);
      doc.setTextColor(c.color ? c.color[0] : LIGHT.ink[0], c.color ? c.color[1] : LIGHT.ink[1], c.color ? c.color[2] : LIGHT.ink[2]);
      doc.text(c.value, cx + cw / 2, y + 12, { align: 'center' });
    });
    return y + h + 4;
  }

  // Inline progress bar: label left, bar center, value right — one clean row.
  // Returns y below the bar.
  function drawBar(doc, x, y, w, pct, color, label, valText) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    doc.text(label, x, y + 4);
    const trackW = w - 66;
    doc.setFillColor(LIGHT.track[0], LIGHT.track[1], LIGHT.track[2]);
    doc.roundedRect(x + 33, y + 0.8, trackW, 4.2, 2, 2, 'F');
    const fw = Math.max(1.2, Math.min(trackW, (trackW * (Number(pct) || 0)) / 100));
    doc.setFillColor(color[0], color[1], color[2]);
    doc.roundedRect(x + 33, y + 0.8, fw, 4.2, 2, 2, 'F');
    doc.setTextColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.text(valText, x + w, y + 4, { align: 'right' });
    return y + 7;
  }

  // Loss analysis: gold-tick title + labeled vector bars with value chips.
  // Returns y below the visual.
  function drawLossVisual(doc, x, y, w, entry, title) {
    const rows = [];
    Object.keys(LOSS_LABELS).forEach((k) => {
      const mins = Number(entry[k]) || 0;
      if (mins > 0) rows.push({ label: LOSS_LABELS[k], mins });
    });
    rows.sort((a, b) => b.mins - a.mins);
    // Title with gold tick
    y = ensureSpace(doc, y, 12, doc.internal.pageSize.getHeight());
    doc.setFillColor(LIGHT.accent[0], LIGHT.accent[1], LIGHT.accent[2]);
    doc.rect(x, y, 2.5, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.text((title || 'Loss Analysis (Minutes)').toUpperCase(), x + 4, y + 4.3);
    y += 9;
    if (rows.length === 0) {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(LIGHT.green[0], LIGHT.green[1], LIGHT.green[2]);
      doc.roundedRect(x, y, w, 10, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9.5);
      doc.setTextColor(6, 95, 70);
      doc.text('Zero losses - optimal run', x + 4, y + 6.5);
      return y + 14;
    }
    const shown = rows.slice(0, 4);
    const maxMins = shown[0].mins || 1;
    const labelW = 46;
    const barX = x + labelW + 1;
    const barW = w - labelW - 44;
    shown.forEach((r) => {
      y = ensureSpace(doc, y, 8, doc.internal.pageSize.getHeight());
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
      doc.text(r.label, x, y + 4.2);
      doc.setFillColor(LIGHT.track[0], LIGHT.track[1], LIGHT.track[2]);
      doc.roundedRect(barX, y + 1.2, barW, 3.4, 1.7, 1.7, 'F');
      const bw = Math.max(2, (barW * r.mins) / maxMins);
      const bc = r.mins > 60 ? LIGHT.red : (r.mins > 30 ? LIGHT.amber : LIGHT.brand);
      doc.setFillColor(bc[0], bc[1], bc[2]);
      doc.roundedRect(barX, y + 1.2, bw, 3.4, 1.7, 1.7, 'F');
      // Value chip
      doc.setFillColor(LIGHT.card[0], LIGHT.card[1], LIGHT.card[2]);
      doc.setDrawColor(LIGHT.line[0], LIGHT.line[1], LIGHT.line[2]);
      doc.roundedRect(x + w - 32, y, 32, 5.6, 1.5, 1.5, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.setTextColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
      doc.text(`${r.mins} min`, x + w - 16, y + 4.2, { align: 'center' });
      y += 7.5;
    });
    if (rows.length > shown.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(8.5);
      doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
      doc.text(`+${rows.length - shown.length} more losses recorded`, x, y + 4);
      y += 7;
    }
    return y + 3;
  }

  // ---------------------------------------------------------------------------
  // COLLECTIVE SHIFT REPORT — one email per shift, not per machine.
  // Sent once when the shift's data is collected: immediately when all 11
  // machines have an entry for that log date + shift, or otherwise on the
  // first save after the shift window ends (+20 min grace). Partial coverage
  // is fine — the report covers whatever machines reported. Deduped per
  // `logDate|shift` in localStorage (+ in-memory race guard).
  // ---------------------------------------------------------------------------
  const SENT_KEYS_KEY = 'prodtracker_collective_sent';
  const sendingKeys = new Set();

  function getSentKeys() {
    try {
      const raw = JSON.parse(localStorage.getItem(SENT_KEYS_KEY) || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch (_) { return []; }
  }

  function markSent(key) {
    try {
      const keys = getSentKeys();
      if (!keys.includes(key)) {
        keys.push(key);
        localStorage.setItem(SENT_KEYS_KEY, JSON.stringify(keys.slice(-60)));
      }
    } catch (_) { }
  }

  function getShiftEnd(logDate, shift) {
    try {
      const d = new Date(logDate + 'T00:00:00');
      if (isNaN(d.getTime())) return null;
      if (shift === 'Shift C') {
        d.setDate(d.getDate() + 1);
        d.setHours(6, 0, 0, 0);
      } else if (shift === 'Shift B') {
        d.setHours(23, 0, 0, 0);
      } else {
        d.setHours(14, 30, 0, 0);
      }
      return d;
    } catch (_) { return null; }
  }

  // One entry per machine: duplicate saves for the same machine (same code,
  // date, shift) keep only the most recent record, so no machine is counted
  // twice in the report or its totals.
  function dedupeByMachine(list) {
    const byCode = {};
    (list || []).forEach((e) => { if (e && e.machine_code) byCode[e.machine_code] = e; });
    return Object.keys(byCode).sort().map((c) => byCode[c]);
  }

  function aggregateEntries(list) {
    const agg = { count: (list || []).length, planned: 0, operating: 0, ideal: 0, total: 0, good: 0, rej: 0, lossTotal: 0, losses: {} };
    Object.keys(LOSS_LABELS).forEach((k) => { agg.losses[k] = 0; });
    (list || []).forEach((e) => {
      agg.planned += Number(e.planned_time_mins) || 0;
      agg.operating += Number(e.operating_time_mins) || 0;
      agg.ideal += Number(e.ideal_run_time_mins) || 0;
      agg.total += Number(e.total_qty) || 0;
      agg.good += Number(e.good_qty) || 0;
      agg.rej += Number(e.rejected_qty) || 0;
      agg.lossTotal += Number(e.total_losses_mins) || 0;
      Object.keys(LOSS_LABELS).forEach((k) => { agg.losses[k] += Number(e[k]) || 0; });
    });
    agg.availability = agg.planned > 0 ? Number(((agg.operating / agg.planned) * 100).toFixed(1)) : 0;
    agg.performance = agg.operating > 0 ? Number(((agg.ideal / agg.operating) * 100).toFixed(1)) : 0;
    agg.quality = agg.total > 0 ? Number((Math.min(100, (agg.good / agg.total) * 100)).toFixed(1)) : 100;
    agg.oee = Number(((agg.availability * agg.performance * agg.quality) / 10000).toFixed(1));
    agg.productivity = agg.operating > 0 ? Number(((agg.good * 60) / agg.operating).toFixed(1)) : 0;
    return agg;
  }

  function ensureSpace(doc, y, needed, pageHeight) {
    if (y + needed > pageHeight - 19) {
      doc.addPage();
      return 24;
    }
    return y;
  }

  // Per-machine analysis section in systematic order:
  //   1) header band (number chip · name · OEE verdict)
  //   2) KPI strip (OEE · A · P · Q · Good · Scrap · Loss)
  //   3) Availability / Performance / Quality bars
  //   4) loss analysis · 5) parts produced · 6) remarks
  function drawMachineSection(doc, m, margin, contentWidth, pageHeight, y, idx) {
    const a = aggregateEntries([m]);
    y = ensureSpace(doc, y, 60, pageHeight);

    // 1) Header band — navy with gold number chip
    doc.setFillColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.roundedRect(margin, y, contentWidth, 11, 2, 2, 'F');
    doc.setFillColor(LIGHT.accent[0], LIGHT.accent[1], LIGHT.accent[2]);
    doc.roundedRect(margin + 2, y + 2.5, 6, 6, 1.5, 1.5, 'F');
    doc.setTextColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(String(idx || 1), margin + 5, y + 6.7, { align: 'center' });
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.text(`${m.machine_name || m.machine_code}  (${m.machine_code || ''})`, margin + 11, y + 7.5);
    const mst = oeeStatus(a.oee);
    doc.setTextColor(LIGHT.accentLight[0], LIGHT.accentLight[1], LIGHT.accentLight[2]);
    doc.text(`OEE ${a.oee}%  ·  ${mst.label}`, margin + contentWidth - 4, y + 7.5, { align: 'right' });
    y += 15;

    // Operator line
    y = ensureSpace(doc, y, 8, pageHeight);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
    doc.text(`Operator: ${m.operator_name || '-'}   |   Productivity: ${a.productivity} pcs/hr`, margin, y);
    y += 6;

    // 2) KPI strip — big numbers, one glance per machine
    y = ensureSpace(doc, y, 20, pageHeight);
    y = drawKpiStrip(doc, margin, y, contentWidth, [
      { label: 'OEE', value: `${a.oee}%`, color: mst.color },
      { label: 'AVAILABILITY', value: `${a.availability}%` },
      { label: 'PERFORMANCE', value: `${a.performance}%` },
      { label: 'QUALITY', value: `${a.quality}%` },
      { label: 'GOOD', value: Number(m.good_qty || 0).toLocaleString() },
      { label: 'SCRAP', value: Number(m.rejected_qty || 0).toLocaleString() },
      { label: 'LOSS', value: `${a.lossTotal}m` }
    ]);

    // 3) A/P/Q bars
    y = ensureSpace(doc, y, 34, pageHeight);
    const barsW = contentWidth;
    y = drawBar(doc, margin, y, barsW, a.availability, LIGHT.blue, 'Availability', `${a.availability}%`);
    y = drawBar(doc, margin, y, barsW, a.performance, LIGHT.violet, 'Performance', `${a.performance}%`);
    y = drawBar(doc, margin, y, barsW, a.quality, LIGHT.green, 'Quality', `${a.quality}%`);
    y += 1;

    // 4) Loss analysis
    y = ensureSpace(doc, y, 20, pageHeight);
    y = drawLossVisual(doc, margin, y, contentWidth, m, `Loss Analysis (Minutes)`);

    // 5) Parts produced — mini table with navy header
    y = ensureSpace(doc, y, 26, pageHeight);
    doc.setFillColor(LIGHT.accent[0], LIGHT.accent[1], LIGHT.accent[2]);
    doc.rect(margin, y, 2.5, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9.5);
    doc.setTextColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.text('PARTS PRODUCED', margin + 4, y + 4.3);
    y += 8;
    const pCol = [contentWidth - 66, 32, 34]; // name | qty | cycle
    doc.setFillColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.rect(margin, y, contentWidth, 6.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(LIGHT.accentLight[0], LIGHT.accentLight[1], LIGHT.accentLight[2]);
    doc.text('PART', margin + 3, y + 4.4);
    doc.text('QTY', margin + pCol[0] + pCol[1] / 2, y + 4.4, { align: 'center' });
    doc.text('CYCLE', margin + pCol[0] + pCol[1] + pCol[2] / 2, y + 4.4, { align: 'center' });
    y += 6.5;
    let partRows = 0;
    for (let i = 1; i <= 3; i++) {
      const nm = (m[`part${i}_name`] || '').toString().trim();
      const qty = Number(m[`part${i}_qty`]) || 0;
      const ct = Number(m[`part${i}_cycle_time`]) || 0;
      if (nm || qty > 0) {
        y = ensureSpace(doc, y, 6.5, pageHeight);
        doc.setFillColor(partRows % 2 === 1 ? LIGHT.card[0] : 255, partRows % 2 === 1 ? LIGHT.card[1] : 255, partRows % 2 === 1 ? LIGHT.card[2] : 255);
        doc.setDrawColor(LIGHT.line[0], LIGHT.line[1], LIGHT.line[2]);
        doc.rect(margin, y, contentWidth, 6.5, 'FD');
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
        doc.text(nm || '-', margin + 3, y + 4.4);
        doc.text(`${qty} pcs`, margin + pCol[0] + pCol[1] / 2, y + 4.4, { align: 'center' });
        doc.text(`${ct} min`, margin + pCol[0] + pCol[1] + pCol[2] / 2, y + 4.4, { align: 'center' });
        y += 6.5;
        partRows++;
      }
    }
    if (partRows === 0) {
      doc.setDrawColor(LIGHT.line[0], LIGHT.line[1], LIGHT.line[2]);
      doc.rect(margin, y, contentWidth, 6.5, 'D');
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
      doc.text('No parts logged', margin + 3, y + 4.4);
      y += 6.5;
    }
    y += 4;

    // 6) Remarks — cream quote card with gold left edge
    const rk = (m.remarks || '').toString().trim() || 'No remarks entered.';
    const rkLines = doc.splitTextToSize(rk, contentWidth - 16).slice(0, 3);
    const cardH = 8 + rkLines.length * 4.8;
    y = ensureSpace(doc, y, cardH + 2, pageHeight);
    doc.setFillColor(LIGHT.card[0], LIGHT.card[1], LIGHT.card[2]);
    doc.setDrawColor(LIGHT.line[0], LIGHT.line[1], LIGHT.line[2]);
    doc.roundedRect(margin, y, contentWidth, cardH, 2, 2, 'FD');
    doc.setFillColor(LIGHT.accent[0], LIGHT.accent[1], LIGHT.accent[2]);
    doc.rect(margin, y + 1, 2.2, cardH - 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
    doc.text('REMARKS', margin + 6, y + 5);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(9);
    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    let ry = y + 9.5;
    rkLines.forEach((ln) => { doc.text(ln, margin + 6, ry); ry += 4.8; });

    return y + cardH + 6;
  }

  function oeeStatus(oee) {
    const v = Number(oee) || 0;
    if (v >= 85) return { label: 'World Class', color: LIGHT.green };
    if (v >= 60) return { label: 'Acceptable', color: LIGHT.amberDark };
    return { label: 'Needs Attention', color: LIGHT.red };
  }

  // Numbered section header: brand bar with number chip. Returns y below.
  function drawSectionTitle(doc, x, y, w, ph, num, title) {
    y = ensureSpace(doc, y, 14, ph);
    doc.setFillColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.roundedRect(x, y, w, 9, 2, 2, 'F');
    doc.setFillColor(255, 255, 255);
    doc.circle(x + 7, y + 4.5, 3, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.text(num, x + 7, y + 6.2, { align: 'center' });
    doc.setFontSize(10);
    doc.setTextColor(255, 255, 255);
    doc.text(title, x + 12, y + 6.5);
    return y + 12;
  }

  // Executive Summary card: verdict + auto-generated insights. Returns y below.
  function drawSummaryBox(doc, x, y, w, ph, agg, machines) {
    const st = oeeStatus(agg.oee);
    const per = machines.map((m) => ({ m, a: aggregateEntries([m]) }));
    per.sort((p, q) => q.a.oee - p.a.oee);
    const lines = [];
    lines.push({ t: `Line OEE ${agg.oee}% — ${st.label} against the 85% world-class benchmark.`, bold: true, color: st.color });
    if (per.length > 0) {
      lines.push({ t: `Best machine: ${per[0].m.machine_name || per[0].m.machine_code} at ${per[0].a.oee}% OEE.` });
      if (per.length > 1) lines.push({ t: `Lowest machine: ${per[per.length - 1].m.machine_name || per[per.length - 1].m.machine_code} at ${per[per.length - 1].a.oee}% OEE — review first.` });
    }
    const tops = Object.keys(LOSS_LABELS)
      .map((k) => ({ label: LOSS_LABELS[k], mins: agg.losses[k] || 0 }))
      .filter((r) => r.mins > 0)
      .sort((a, b) => b.mins - a.mins)
      .slice(0, 2);
    if (tops.length > 0) {
      const pct = agg.lossTotal > 0 ? Math.round((tops[0].mins / agg.lossTotal) * 100) : 0;
      lines.push({ t: `Dominant loss: ${tops[0].label} (${tops[0].mins} mins, ${pct}% of shift downtime).` });
    } else {
      lines.push({ t: 'Zero downtime recorded across all reporting machines.' });
    }
    lines.push({ t: `Output ${Number(agg.good || 0).toLocaleString()} good / ${Number(agg.rej || 0).toLocaleString()} scrap (${agg.quality}% quality) at ${agg.productivity} pcs/hr.` });
    const wrapped = [];
    lines.forEach((ln) => {
      doc.splitTextToSize(`- ${ln.t}`, w - 14).slice(0, 2).forEach((s) => wrapped.push({ t: s, bold: ln.bold, color: ln.color }));
    });
    const h = 5 + wrapped.length * 4.5 + 4;
    y = ensureSpace(doc, y, h, ph);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(LIGHT.line[0], LIGHT.line[1], LIGHT.line[2]);
    doc.roundedRect(x, y, w, h, 2, 2, 'FD');
    doc.setFillColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.roundedRect(x, y, 2.5, h, 1, 1, 'F');
    let ly = y + 6;
    wrapped.forEach((ln) => {
      doc.setFont('helvetica', ln.bold ? 'bold' : 'normal');
      doc.setFontSize(8.5);
      if (ln.color) doc.setTextColor(ln.color[0], ln.color[1], ln.color[2]);
      else doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
      doc.text(ln.t, x + 7, ly);
      ly += 4.5;
    });
    return y + h + 4;
  }

  async function generateCollectiveShiftReportPDF(logDate, shift, shiftEntries) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) throw new Error('jsPDF library is not loaded on this page.');
    const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - (margin * 2);

    const machines = dedupeByMachine(shiftEntries);
    const agg = aggregateEntries(machines);

    // Header — executive navy band with gold rule
    doc.setFillColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.rect(0, 0, pageWidth, 28, 'F');
    doc.setFillColor(LIGHT.accent[0], LIGHT.accent[1], LIGHT.accent[2]);
    doc.rect(0, 28, pageWidth, 1.6, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('LEMKEN', margin, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(LIGHT.accentLight[0], LIGHT.accentLight[1], LIGHT.accentLight[2]);
    doc.text('T H E   A G R O V I S I O N   C O M P A N Y', margin + 26, 12);
    doc.setFontSize(9);
    doc.setTextColor(214, 226, 240);
    doc.text(`MANUFACTURING EXECUTION SYSTEM  |  COLLECTIVE SHIFT REPORT - ${shift}`, margin, 20);
    const genStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`Generated: ${genStr}`, pageWidth - margin, 12, { align: 'right' });
    doc.setFontSize(9);
    doc.setTextColor(LIGHT.accent[0], LIGHT.accent[1], LIGHT.accent[2]);
    doc.setFont('helvetica', 'bold');
    doc.text(shift.toUpperCase(), pageWidth - margin, 20, { align: 'right' });

    let y = 36;

    // Meta box — cream card, gold left edge
    const metaH = 24;
    doc.setFillColor(LIGHT.card[0], LIGHT.card[1], LIGHT.card[2]);
    doc.setDrawColor(LIGHT.line[0], LIGHT.line[1], LIGHT.line[2]);
    doc.roundedRect(margin, y, contentWidth, metaH, 2.5, 2.5, 'FD');
    doc.setFillColor(LIGHT.accent[0], LIGHT.accent[1], LIGHT.accent[2]);
    doc.roundedRect(margin, y, 2.5, metaH, 1.2, 1.2, 'F');
    doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text('REPORT PERIOD', margin + 8, y + 8);
    doc.text('MACHINES REPORTING', margin + 74, y + 8);
    doc.text('SHIFT ENTRIES', margin + 132, y + 8);
    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`${logDate}  ·  ${shift}`, margin + 8, y + 16);
    doc.text(`${machines.length} / 11`, margin + 74, y + 16);
    doc.text(`${shiftEntries.length}`, margin + 132, y + 16);
    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7.5);
    doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
    doc.text('Compiled from website entries recorded for this shift.', margin + 8, y + 21.5);
    y += metaH + 8;

    // Machine-by-machine analysis first (no line summary)
    machines.forEach((m, i) => {
      y = drawMachineSection(doc, m, margin, contentWidth, pageHeight, y, i + 1);
    });

    // Machine summary table
    y = ensureSpace(doc, y, 12, pageHeight);
    doc.setFillColor(LIGHT.accent[0], LIGHT.accent[1], LIGHT.accent[2]);
    doc.rect(margin, y - 4.5, 3, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.text('MACHINE SUMMARY', margin + 6, y + 1);
    y += 7;
    const rows = machines.map((m) => {
      const a = aggregateEntries([m]);
      const st = oeeStatus(a.oee);
      return [
        m.machine_name || m.machine_code,
        m.operator_name || '-',
        Number(m.good_qty || 0).toLocaleString(),
        Number(m.rejected_qty || 0).toLocaleString(),
        `${a.lossTotal}m`,
        `${a.oee}%`,
        st.label
      ];
    });
    if (doc.autoTable) {
      doc.autoTable({
        startY: y,
        head: [['Machine', 'Operator', 'Good', 'Scrap', 'Loss', 'OEE', 'Status']],
        body: rows,
        theme: 'striped',
        headStyles: { fillColor: LIGHT.brand, textColor: LIGHT.accentLight, fontStyle: 'bold' },
        bodyStyles: { textColor: [15, 23, 42] },
        alternateRowStyles: { fillColor: LIGHT.card },
        styles: { fontSize: 8, cellPadding: 2.8, lineColor: LIGHT.line, lineWidth: 0.1 },
        didParseCell: function (data) {
          if (data.section === 'body' && (data.column.index === 5 || data.column.index === 6)) {
            const oee = parseFloat(String(data.row.raw[5]).replace('%', '')) || 0;
            data.cell.styles.textColor = oeeStatus(oee).color;
            data.cell.styles.fontStyle = 'bold';
          }
        },
        margin: { left: margin, right: margin }
      });
      y = doc.lastAutoTable.finalY + 10;
    }

    // Footers on every page — gold hairline + navy caption
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      doc.setFillColor(LIGHT.accent[0], LIGHT.accent[1], LIGHT.accent[2]);
      doc.rect(margin, pageHeight - 12, contentWidth, 0.4, 'F');
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
      doc.text(`Page ${i} of ${pages}  ·  Lemken Collective Shift Report (${shift}, ${logDate})`, pageWidth / 2, pageHeight - 7, { align: 'center' });
    }

    const dataUri = doc.output('datauristring');
    const blob = doc.output('blob');
    const filename = `Collective_Shift_Report_${logDate}_${shift.replace(/\s+/g, '')}.pdf`;
    return { doc, blob, dataUri, filename };
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
      { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
  }

  /**
   * Core sender: builds the collective PDF + machine-wise email body and sends
   * the ONE email for a shift. Marks the shift sent. Never throws.
   */
  async function dispatchCollectiveReport(logDate, shift, rawList) {
    const list = dedupeByMachine(rawList);
    const key = `${logDate}|${shift}`;
    const covered = list.length;

    const config = getConfig();
    if (!config.enabled) return { skipped: true, reason: 'Disabled in settings' };
    if (typeof emailjs === 'undefined') return { skipped: true, reason: 'EmailJS SDK missing' };

    sendingKeys.add(key);
    try {
      console.log(`[EmailAlert] Building collective shift report for ${key} (${covered} machines)...`);
      const { blob, dataUri, filename } = await generateCollectiveShiftReportPDF(logDate, shift, list);

      const agg = aggregateEntries(list);
      const topLosses = Object.keys(LOSS_LABELS)
        .map((k) => ({ label: LOSS_LABELS[k], mins: agg.losses[k] || 0 }))
        .filter((x) => x.mins > 0)
        .sort((a, b) => b.mins - a.mins)
        .slice(0, 3)
        .map((x) => `${x.label}: ${x.mins}m`);
      const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

      // Full machine-wise breakdown INSIDE the email body — no hosting needed.
      const byMachine = {};
      (list || []).forEach((e) => { if (e && e.machine_code) byMachine[e.machine_code] = e; });
      const machineRowsHtml = Object.keys(byMachine).sort().map((c) => {
        const m = byMachine[c];
        const a = aggregateEntries([m]);
        const st = oeeStatus(a.oee);
        return `<tr><td style="padding:8px 10px;border:1px solid #E7E0CC">${escHtml(m.machine_name || m.machine_code)}</td>`
          + `<td style="padding:8px 10px;border:1px solid #E7E0CC">${escHtml(m.operator_name || '-')}</td>`
          + `<td style="padding:8px 10px;border:1px solid #E7E0CC">${a.oee}% (${st.label})</td>`
          + `<td style="padding:8px 10px;border:1px solid #E7E0CC">${Number(m.good_qty || 0).toLocaleString()} / ${Number(m.rejected_qty || 0).toLocaleString()}</td>`
          + `<td style="padding:8px 10px;border:1px solid #E7E0CC">${a.lossTotal}m</td>`
          + `<td style="padding:8px 10px;border:1px solid #E7E0CC">${escHtml((m.remarks || '').toString().trim().substring(0, 80) || '-')}</td></tr>`;
      }).join('');

      const templateParams = {
        to_email: config.recipient,
        recipient_email: config.recipient,
        machine_name: `Collective - ${covered} machine(s) (${shift})`,
        machine_code: 'ALL',
        log_date: logDate,
        shift,
        operator: 'Multiple operators',
        oee: `${agg.oee}%`,
        availability: `${agg.availability}%`,
        performance: `${agg.performance}%`,
        quality: `${agg.quality}%`,
        good_qty: Number(agg.good || 0).toLocaleString(),
        rejected_qty: Number(agg.rej || 0).toLocaleString(),
        total_qty: Number(agg.total || 0).toLocaleString(),
        total_loss_mins: agg.lossTotal,
        breakdown_mins: agg.losses.loss_breakdown || 0,
        loss_summary: topLosses.length > 0 ? topLosses.join(', ') : 'None (Zero Downtime)',
        remarks: 'See PDF for machine-wise remarks.',
        timestamp: nowStr,
        report_filename: filename,
        machine_table: machineRowsHtml,
        report_pdf: (dataUri && dataUri.length <= PDF_BUDGET_CHARS) ? dataUri : '',
        attachment: ''
      };

      emailjs.init({ publicKey: config.publicKey });
      const resp = await emailjs.send(config.serviceId, config.templateId, templateParams);
      markSent(key);
      console.log('[EmailAlert] Collective shift report email sent:', key);
      return { success: true, resp, filename, key };
    } finally {
      sendingKeys.delete(key);
    }
  }

  /**
   * Timer sweep: for yesterday + today × A/B/C, auto-send any shift whose
   * window ended (+20 min grace), has entries, and was never sent. Reads
   * straight from the existing entries — no new database, no save needed.
   */
  // Fixed daily trigger times per shift (report for the shift that just ended):
  // Shift A → 15:00   Shift B → 12:00   Shift C → 07:00
  const SHIFT_TRIGGER = {
    'Shift A': { h: 15, m: 0 },
    'Shift B': { h: 12, m: 0 },
    'Shift C': { h: 7, m: 0 },
  };

  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  // Log-date a shift's report should use. Shift C carries the previous
  // calendar day (per your dating rule), everyone else uses the same day.
  function reportLogDateFor(shift, d) {
    const out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    if (shift === 'Shift C') out.setDate(out.getDate() - 1);
    return iso(out);
  }

  async function checkDueShiftReports(allEntries) {
    const results = [];
    try {
      const now = new Date();
      // Check today and yesterday so the app catches up on missed triggers
      // after being closed overnight.
      for (const shift of ['Shift A', 'Shift B', 'Shift C']) {
        const t = SHIFT_TRIGGER[shift];
        for (const offset of [0, -1]) {
          const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          d.setDate(d.getDate() + offset);
          const trigger = new Date(d.getFullYear(), d.getMonth(), d.getDate(), t.h, t.m, 0);
          if (Date.now() < trigger.getTime()) continue; // trigger not reached yet
          const ld = reportLogDateFor(shift, d);
          const key = `${ld}|${shift}`;
          if (getSentKeys().includes(key) || sendingKeys.has(key)) continue;
          const list = (allEntries || []).filter((e) => e && e.log_date === ld && e.shift === shift);
          if (list.length === 0) continue;
          console.log(`[EmailAlert] Trigger time reached for ${key} — auto-sending collective report.`);
          results.push(await dispatchCollectiveReport(ld, shift, list));
        }
      }
    } catch (err) {
      console.warn('[EmailAlert] Due-shift sweep failed:', (err && err.message) || err);
    }
    return results;
  }

  /**
   * Save-path trigger: 11/11 machines sends immediately; otherwise the timer
   * sweep (checkDueShiftReports) sends once the next shift starts (= this
   * shift ends). Partial coverage is fine — the report covers whatever
   * machines reported.
   */
  async function maybeSendCollectiveReport(savedEntry, allEntries) {
    try {
      const logDate = savedEntry && savedEntry.log_date;
      const shift = savedEntry && savedEntry.shift;
      if (!logDate || !shift) return { skipped: true, reason: 'Missing date/shift' };
      const key = `${logDate}|${shift}`;
      if (getSentKeys().includes(key) || sendingKeys.has(key)) return { skipped: true, reason: 'Already sent' };

      const list = (allEntries || []).filter((e) => e && e.log_date === logDate && e.shift === shift);
      if (list.length === 0) return { skipped: true, reason: 'No entries' };
      const covered = new Set(list.map((e) => e.machine_code).filter(Boolean)).size;

      const end = getShiftEnd(logDate, shift);
      const shiftOver = end ? Date.now() >= end.getTime() : false;
      if (covered < 11 && !shiftOver) {
        console.log(`[EmailAlert] Collective ${key}: ${covered}/11 machines, shift still open — waiting.`);
        return { pending: true, covered };
      }

      const config = getConfig();
      if (!config.enabled) return { skipped: true, reason: 'Disabled in settings' };
      if (typeof emailjs === 'undefined') return { skipped: true, reason: 'EmailJS SDK missing' };

      return dispatchCollectiveReport(logDate, shift, list);
    } catch (err) {
      const detail = (err && (err.text || err.message)) || String(err);
      console.error('[EmailAlert] Collective save-trigger failed:', detail, err);
      return { success: false, error: err, detail };
    }
  }

  /**
   * Manual test: builds ONE collective report from the latest saved
   * (log_date, shift) group in local storage and emails it. Never marks the
   * shift as sent, so the real per-shift trigger is unaffected. Test PDF is
   * uploaded under a `test/` prefix to keep real reports clean.
   */
  async function sendCollectiveTest() {
    const config = getConfig();
    if (!config.enabled) return { skipped: true, reason: 'Disabled in settings' };
    if (typeof emailjs === 'undefined') return { skipped: true, reason: 'EmailJS SDK missing' };

    let stored = [];
    try {
      stored = JSON.parse(localStorage.getItem('prodtracker_oee_entries') || '[]');
      if (!Array.isArray(stored)) stored = [];
    } catch (_) { stored = []; }
    if (stored.length === 0) return { skipped: true, reason: 'No saved entries yet — save a record first' };

    const groups = {};
    stored.forEach((e) => {
      if (!e || !e.log_date || !e.shift) return;
      const k = `${e.log_date}|${e.shift}`;
      (groups[k] = groups[k] || []).push(e);
    });
    const keys = Object.keys(groups).sort();
    if (keys.length === 0) return { skipped: true, reason: 'No dated entries found' };
    // TEST scope: yesterday's Shift B (local calendar date).
    const now = new Date();
    const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
    const yest = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    const key = `${yest}|Shift B`;
    const list = groups[key] || [];
    if (list.length === 0) return { skipped: true, reason: `No Shift B entries for yesterday (${yest}) — save Shift B records first` };
    const logDate = yest;
    const shift = 'Shift B';
    const covered = new Set(list.map((e) => e.machine_code).filter(Boolean)).size;

    try {
      console.log(`[EmailAlert] Building TEST collective report for ${key} (${covered} machines)...`);
      const dedupedList = dedupeByMachine(list);
      const { blob, dataUri, filename } = await generateCollectiveShiftReportPDF(logDate, shift, dedupedList);

      const agg = aggregateEntries(dedupedList);
      const topLosses = Object.keys(LOSS_LABELS)
        .map((k) => ({ label: LOSS_LABELS[k], mins: agg.losses[k] || 0 }))
        .filter((x) => x.mins > 0)
        .sort((a, b) => b.mins - a.mins)
        .slice(0, 3)
        .map((x) => `${x.label}: ${x.mins}m`);
      const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

      // Same machine-wise table the live collective email carries.
      const byMachine = {};
      (dedupedList || []).forEach((e) => { if (e && e.machine_code) byMachine[e.machine_code] = e; });
      const machineRowsHtml = Object.keys(byMachine).sort().map((c) => {
        const m = byMachine[c];
        const a = aggregateEntries([m]);
        const st = oeeStatus(a.oee);
        return `<tr><td style="padding:8px 10px;border:1px solid #CBD5E1">${escHtml(m.machine_name || m.machine_code)}</td>`
          + `<td style="padding:8px 10px;border:1px solid #CBD5E1">${escHtml(m.operator_name || '-')}</td>`
          + `<td style="padding:8px 10px;border:1px solid #CBD5E1">${a.oee}% (${st.label})</td>`
          + `<td style="padding:8px 10px;border:1px solid #CBD5E1">${Number(m.good_qty || 0).toLocaleString()} / ${Number(m.rejected_qty || 0).toLocaleString()}</td>`
          + `<td style="padding:8px 10px;border:1px solid #CBD5E1">${a.lossTotal}m</td>`
          + `<td style="padding:8px 10px;border:1px solid #CBD5E1">${escHtml((m.remarks || '').toString().trim().substring(0, 80) || '-')}</td></tr>`;
      }).join('');

      const templateParams = {
        to_email: config.recipient,
        recipient_email: config.recipient,
        machine_name: `Collective TEST - ${covered} machine(s) (${shift})`,
        machine_code: 'ALL',
        log_date: logDate,
        shift: `${shift} (TEST)`,
        operator: 'Multiple operators',
        oee: `${agg.oee}%`,
        availability: `${agg.availability}%`,
        performance: `${agg.performance}%`,
        quality: `${agg.quality}%`,
        good_qty: Number(agg.good || 0).toLocaleString(),
        rejected_qty: Number(agg.rej || 0).toLocaleString(),
        total_qty: Number(agg.total || 0).toLocaleString(),
        total_loss_mins: agg.lossTotal,
        breakdown_mins: agg.losses.loss_breakdown || 0,
        loss_summary: topLosses.length > 0 ? topLosses.join(', ') : 'None (Zero Downtime)',
        remarks: 'TEST alert — see PDF for machine-wise remarks.',
        timestamp: nowStr,
        report_filename: filename,
        machine_table: machineRowsHtml,
        report_pdf: (dataUri && dataUri.length <= PDF_BUDGET_CHARS) ? dataUri : '',
        attachment: ''
      };

      emailjs.init({ publicKey: config.publicKey });
      const resp = await emailjs.send(config.serviceId, config.templateId, templateParams);
      console.log('[EmailAlert] TEST collective report sent:', key);
      return { success: true, resp, filename, key, covered };
    } catch (err) {
      const detail = (err && (err.text || err.message)) || String(err);
      console.error('[EmailAlert] TEST collective send failed:', detail, err);
      return { success: false, error: err, detail };
    }
  }

  /**
   * Download a generated COLLECTIVE sample PDF directly in the browser
   * (3 sample machines, same layout as the real per-shift email).
   */
  async function downloadCollectiveSamplePDF() {
    const today = new Date().toISOString().split('T')[0];
    const mk = (code, name, op, p1, ct1, q1, good, rej, losses, lossTotal, avail, perf, qual, oee, remarks) => ({
      machine_code: code,
      machine_name: name,
      log_date: today,
      shift: 'Shift A',
      shift_hours: 8.5,
      operator_name: op,
      part1_name: p1,
      part1_cycle_time: ct1,
      part1_qty: q1,
      part2_name: '',
      part2_cycle_time: 0,
      part2_qty: 0,
      part3_name: '',
      part3_cycle_time: 0,
      part3_qty: 0,
      total_qty: q1,
      rejected_qty: rej,
      good_qty: good,
      ...losses,
      remarks,
      total_losses_mins: lossTotal,
      planned_time_mins: 465,
      operating_time_mins: 465 - lossTotal,
      ideal_run_time_mins: Math.round(q1 * ct1 * 100) / 100,
      availability_rate: avail,
      performance_rate: perf,
      quality_rate: qual,
      oee_rate: oee
    });
    const samples = [
      mk('CNC-DX200-1', 'CNC DX 200-1', 'Abhijit Gedam', 'Shaft Collar 45mm', 2.5, 120, 118, 2, { loss_tool_insert: 20, loss_setup: 15 }, 35, 92.5, 89.0, 98.3, 80.9, 'Insert wear replaced mid-shift.'),
      mk('VMC-1050', 'VMC 1050', 'Rahul Patil', 'Flange Plate 120mm', 3.2, 90, 88, 2, { loss_setup: 25, loss_measurement: 10 }, 35, 92.5, 85.0, 97.8, 76.9, 'First-piece inspection delay.'),
      mk('HMC-1', 'HMC 1', 'Suresh Kumar', 'Gear Housing', 4.1, 60, 60, 0, {}, 0, 100.0, 82.0, 100.0, 82.0, 'Smooth optimal run.')
    ];
    const { doc, filename } = await generateCollectiveShiftReportPDF(today, 'Shift A', samples);
    doc.save(filename);
  }

  // ---------------------------------------------------------------------------
  // Modal & UI Management
  // ---------------------------------------------------------------------------
  function initEmailModal() {
    const modal = document.getElementById('modal-email');
    const btnOpen = document.getElementById('btn-open-email-settings');
    const btnOpenAlt = document.getElementById('btn-open-email-settings-alt');
    const btnClose = document.getElementById('btn-close-email-modal');
    const btnCancel = document.getElementById('btn-email-cancel');
    const btnSave = document.getElementById('btn-email-save');
    const btnTestCollective = document.getElementById('btn-email-test-collective');
    const btnDownloadCollectiveSample = document.getElementById('btn-email-download-collective-sample');

    if (!modal) return;

    function openModal() {
      const cfg = getConfig();
      const inEmail = document.getElementById('cfg-email-recipient');
      const inService = document.getElementById('cfg-email-service');
      const inTemplate = document.getElementById('cfg-email-template');
      const inKey = document.getElementById('cfg-email-key');
      const chkEnabled = document.getElementById('cfg-email-enabled');

      if (inEmail) inEmail.value = cfg.recipient || '';
      if (inService) inService.value = cfg.serviceId || '';
      if (inTemplate) inTemplate.value = cfg.templateId || '';
      if (inKey) inKey.value = cfg.publicKey || '';
      if (chkEnabled) chkEnabled.checked = cfg.enabled !== false;

      const resultBox = document.getElementById('email-settings-result');
      if (resultBox) resultBox.style.display = 'none';

      modal.classList.remove('hidden');
    }

    function closeModal() {
      modal.classList.add('hidden');
    }

    if (btnOpen) btnOpen.addEventListener('click', openModal);
    if (btnOpenAlt) btnOpenAlt.addEventListener('click', openModal);
    if (btnClose) btnClose.addEventListener('click', closeModal);
    if (btnCancel) btnCancel.addEventListener('click', closeModal);

    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeModal();
    });

    if (btnSave) {
      btnSave.addEventListener('click', () => {
        const inEmail = document.getElementById('cfg-email-recipient');
        const inService = document.getElementById('cfg-email-service');
        const inTemplate = document.getElementById('cfg-email-template');
        const inKey = document.getElementById('cfg-email-key');
        const chkEnabled = document.getElementById('cfg-email-enabled');

        const updated = {
          enabled: chkEnabled ? chkEnabled.checked : true,
          recipient: inEmail ? inEmail.value.trim() : DEFAULT_CONFIG.recipient,
          serviceId: inService ? inService.value.trim() : DEFAULT_CONFIG.serviceId,
          templateId: inTemplate ? inTemplate.value.trim() : DEFAULT_CONFIG.templateId,
          publicKey: inKey ? inKey.value.trim() : DEFAULT_CONFIG.publicKey
        };

        saveConfig(updated);

        const resultBox = document.getElementById('email-settings-result');
        if (resultBox) {
          resultBox.style.display = 'block';
          resultBox.style.background = 'rgba(16, 185, 129, 0.15)';
          resultBox.style.border = '1px solid rgba(16, 185, 129, 0.35)';
          resultBox.style.color = '#10b981';
          resultBox.textContent = '✓ Email alert configuration saved successfully!';
          setTimeout(() => { resultBox.style.display = 'none'; closeModal(); }, 1200);
        } else {
          closeModal();
        }
      });
    }

    if (btnTestCollective) {
      btnTestCollective.addEventListener('click', async () => {
        const resultBox = document.getElementById('email-settings-result');
        if (resultBox) {
          resultBox.style.display = 'block';
          resultBox.style.background = 'rgba(6, 182, 212, 0.15)';
          resultBox.style.border = '1px solid rgba(6, 182, 212, 0.35)';
          resultBox.style.color = '#06b6d4';
          resultBox.textContent = "Building yesterday's Shift B collective test report...";
        }

        const res = await sendCollectiveTest();
        if (resultBox) {
          if (res.success) {
            resultBox.style.background = 'rgba(16, 185, 129, 0.15)';
            resultBox.style.border = '1px solid rgba(16, 185, 129, 0.35)';
            resultBox.style.color = '#10b981';
            resultBox.textContent = `✓ TEST collective sent (${res.covered} machines, ${res.key}) — real shift trigger unaffected.`;
          } else if (res.skipped) {
            resultBox.style.background = 'rgba(245, 158, 11, 0.15)';
            resultBox.style.border = '1px solid rgba(245, 158, 11, 0.35)';
            resultBox.style.color = '#f59e0b';
            resultBox.textContent = `Skipped: ${res.reason || 'Check console'}`;
          } else {
            resultBox.style.background = 'rgba(239, 68, 68, 0.15)';
            resultBox.style.border = '1px solid rgba(239, 68, 68, 0.35)';
            resultBox.style.color = '#f87171';
            resultBox.textContent = `Email send error: ${res.detail || 'Check console (F12)'}`;
          }
        }
      });
    }

    if (btnDownloadCollectiveSample) {
      btnDownloadCollectiveSample.addEventListener('click', async () => {
        try {
          await downloadCollectiveSamplePDF();
        } catch (e) {
          alert('Failed to generate sample PDF: ' + e.message);
        }
      });
    }
  }

  // Initialize on DOM load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initEmailModal);
  } else {
    initEmailModal();
  }

  // Export public API (collective shift report only)
  window.EmailAlert = {
    getConfig,
    saveConfig,
    generateCollectiveShiftReportPDF,
    maybeSendCollectiveReport,
    checkDueShiftReports,
    sendCollectiveTest,
    downloadCollectiveSamplePDF
  };

})();
