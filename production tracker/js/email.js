/**
 * EMAIL ALERTS & AUTOMATED SHIFT PDF REPORT DISPATCHER
 * ---------------------------------------------------------------------------
 * Triggers after EVERY production entry is saved — unconditionally.
 * Generates a light-theme PDF shift report containing:
 *   - Lemken Company branding & metadata
 *   - Production KPIs (Good vs Scrap, Operating Time, Productivity)
 *   - Vector visuals (OEE semicircle gauge + Availability/Performance/Quality
 *     progress bars + downtime loss bars) — drawn shapes, no images, so the
 *     PDF stays small enough to mail
 *   - Complete 15 Downtime Loss Category Audit Table
 *   - Supervisor Remarks & Quality Notes
 *
 * Sends the PDF report and summary via EmailJS to the designated supervisor email(s).
 * There is NO loss threshold and NO breakdown gate — every saved entry sends email.
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

  // Supabase Storage delivery: each entry's PDF is also uploaded to a public
  // `shift-reports` bucket and the email carries its download link
  // ({{report_url}}) alongside the inline copy. Same credentials pattern as
  // js/bundle.js SUPABASE_CONFIG.
  const REPORT_BUCKET = 'shift-reports';

  function getSupabaseClient() {
    try {
      if (!window.supabase) return null;
      let url = '', key = '';
      try {
        const raw = localStorage.getItem('prodtracker_supabase_config');
        if (raw) {
          const c = JSON.parse(raw);
          url = (c.url || '').trim();
          key = (c.key || '').trim();
        }
      } catch (_) { }
      if (!url || !key) {
        url = 'https://hqkxzxmpbocsqeurmvjs.supabase.co';
        key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhxa3h6eG1wYm9jc3FldXJtdmpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2OTA4OTQsImV4cCI6MjEwNDI2Njg5NH0.ecizDXHhbaRLqswZWhVtzuljN_1Fi41SF2Yr8zazsUA';
      }
      return window.supabase.createClient(url, key);
    } catch (err) {
      console.warn('[EmailAlert] Supabase client unavailable:', err);
      return null;
    }
  }

  async function uploadPdfAndGetUrl(client, blob, filename, logDate) {
    const path = `${logDate || 'nodate'}/${filename}`;
    const { error: upErr } = await client.storage.from(REPORT_BUCKET).upload(path, blob, {
      contentType: 'application/pdf',
      upsert: true
    });
    if (upErr) throw upErr;
    const { data } = client.storage.from(REPORT_BUCKET).getPublicUrl(path);
    if (!data || !data.publicUrl) throw new Error('No public URL (bucket may not be public)');
    return data.publicUrl;
  }

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

  // Light-theme palette + vector visuals (pure jsPDF shapes, zero images —
  // keeps the PDF tiny enough to mail). Layout unchanged.
  const LIGHT = {
    brand: [0, 130, 195],
    brandDark: [2, 90, 135],
    ink: [15, 23, 42],
    muted: [100, 116, 139],
    line: [203, 213, 225],
    card: [241, 245, 249],
    track: [226, 232, 240],
    green: [16, 185, 129],
    amber: [245, 158, 11],
    amberDark: [217, 119, 6],
    red: [239, 68, 68],
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

  // Horizontal progress bar with label + value. Returns y below the bar.
  function drawBar(doc, x, y, w, pct, color, label, valText) {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    doc.text(label, x, y);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
    doc.text(valText, x + w, y, { align: 'right' });
    const by = y + 2;
    doc.setFillColor(LIGHT.track[0], LIGHT.track[1], LIGHT.track[2]);
    doc.roundedRect(x, by, w, 4.5, 2, 2, 'F');
    const fw = Math.max(0, Math.min(w, (w * (Number(pct) || 0)) / 100));
    if (fw > 0.5) {
      doc.setFillColor(color[0], color[1], color[2]);
      doc.roundedRect(x, by, fw, 4.5, 2, 2, 'F');
    }
    return by + 9;
  }

  // Downtime loss visual: horizontal bars for the top non-zero losses.
  // Returns y below the visual.
  function drawLossVisual(doc, x, y, w, entry) {
    const rows = [];
    Object.keys(LOSS_LABELS).forEach((k) => {
      const mins = Number(entry[k]) || 0;
      if (mins > 0) rows.push({ label: LOSS_LABELS[k], mins });
    });
    rows.sort((a, b) => b.mins - a.mins);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    doc.text('Downtime Loss Visual (Minutes)', x, y);
    y += 2;
    if (rows.length === 0) {
      doc.setFillColor(236, 253, 245);
      doc.setDrawColor(LIGHT.green[0], LIGHT.green[1], LIGHT.green[2]);
      doc.roundedRect(x, y + 1, w, 10, 2, 2, 'FD');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.setTextColor(6, 95, 70);
      doc.text('Zero losses - optimal run', x + 4, y + 7.5);
      return y + 15;
    }
    const maxMins = Math.max.apply(null, rows.map((r) => r.mins).concat([1]));
    const shown = rows.slice(0, 6);
    const labelW = 52;
    const barX = x + labelW + 2;
    const barW = w - labelW - 24;
    shown.forEach((r) => {
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
      const lab = r.label.length > 24 ? (r.label.substring(0, 23) + '..') : r.label;
      doc.text(lab, x, y + 4.5);
      doc.setFillColor(LIGHT.track[0], LIGHT.track[1], LIGHT.track[2]);
      doc.roundedRect(barX, y + 1, barW, 4, 1.5, 1.5, 'F');
      const bw = Math.max(1.5, (barW * r.mins) / maxMins);
      const bc = r.mins > 60 ? LIGHT.red : (r.mins > 30 ? LIGHT.amber : LIGHT.brand);
      doc.setFillColor(bc[0], bc[1], bc[2]);
      doc.roundedRect(barX, y + 1, bw, 4, 1.5, 1.5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.text(`${r.mins}m`, barX + barW + 2, y + 4.5);
      y += 7;
    });
    if (rows.length > shown.length) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(7.5);
      doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
      doc.text(`+${rows.length - shown.length} more in audit table (page 2)`, x, y + 4);
      y += 7;
    }
    return y + 3;
  }

  /**
   * Generates the Comprehensive PDF Shift Report
   */
  async function generateShiftReportPDF(entry) {
    const { jsPDF } = window.jspdf || {};
    if (!jsPDF) {
      throw new Error('jsPDF library is not loaded on this page.');
    }

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    const contentWidth = pageWidth - (margin * 2);

    // ---------------------------------------------------------
    // PAGE 1: Header, Machine Metadata, KPIs & Vector Visuals
    // (pure jsPDF shapes — no images, keeps the PDF emailable)
    // ---------------------------------------------------------

    // Top Header Banner — light theme, LEMKEN brand blue
    doc.setFillColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.rect(0, 0, pageWidth, 24, 'F');
    doc.setFillColor(LIGHT.brandDark[0], LIGHT.brandDark[1], LIGHT.brandDark[2]);
    doc.rect(0, 24, pageWidth, 1.4, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.text('LEMKEN  -  THE AGROVISION COMPANY', margin, 11);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(224, 242, 254);
    doc.text('MANUFACTURING EXECUTION SYSTEM  |  SHIFT PRODUCTION & OEE REPORT', margin, 18);

    const reportDateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });
    doc.setFontSize(8);
    doc.setTextColor(255, 255, 255);
    doc.text(`Generated: ${reportDateStr}`, pageWidth - margin, 18, { align: 'right' });

    let y = 32;

    // Subheader Box / Machine Meta Grid — light card
    doc.setFillColor(LIGHT.card[0], LIGHT.card[1], LIGHT.card[2]);
    doc.setDrawColor(LIGHT.line[0], LIGHT.line[1], LIGHT.line[2]);
    doc.roundedRect(margin, y, contentWidth, 26, 3, 3, 'FD');

    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(`Machine: ${entry.machine_name || entry.machine_code} (${entry.machine_code || ''})`, margin + 5, y + 8);
    doc.text(`Shift: ${entry.shift || 'Shift A'} (${entry.shift_hours || 8.5} hrs)`, margin + 5, y + 15);
    doc.text(`Operator: ${entry.operator_name || 'N/A'}`, margin + 5, y + 22);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
    doc.text(`Log Date: ${entry.log_date || '-'}`, pageWidth / 2 + 10, y + 8);
    doc.text(`Planned Time: ${entry.planned_time_mins || 465} mins`, pageWidth / 2 + 10, y + 15);
    doc.text(`Operating Time: ${entry.operating_time_mins || 0} mins`, pageWidth / 2 + 10, y + 22);

    y += 32;

    // KPI Summary Scorecards (4 Columns) — light cards, colored accents
    const kpiCards = [
      { label: 'OVERALL OEE', val: `${entry.oee_rate || 0}%`, color: LIGHT.violet },
      { label: 'AVAILABILITY', val: `${entry.availability_rate || 0}%`, color: LIGHT.brand },
      { label: 'PERFORMANCE', val: `${entry.performance_rate || 0}%`, color: LIGHT.blue },
      { label: 'QUALITY RATE', val: `${entry.quality_rate || 0}%`, color: LIGHT.green }
    ];

    const cardWidth = (contentWidth - 9) / 4;
    kpiCards.forEach((kpi, idx) => {
      const cx = margin + (idx * (cardWidth + 3));
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.setLineWidth(0.8);
      doc.roundedRect(cx, y, cardWidth, 20, 2, 2, 'FD');
      // Colored top accent
      doc.setFillColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.roundedRect(cx, y, cardWidth, 2.2, 1, 1, 'F');

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(LIGHT.muted[0], LIGHT.muted[1], LIGHT.muted[2]);
      doc.text(kpi.label, cx + 4, y + 7);

      doc.setFontSize(13);
      doc.setTextColor(kpi.color[0], kpi.color[1], kpi.color[2]);
      doc.text(kpi.val, cx + 4, y + 16);
    });

    y += 26;

    // Production Quantities Quick Bar — light card
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(LIGHT.line[0], LIGHT.line[1], LIGHT.line[2]);
    doc.setLineWidth(0.5);
    doc.roundedRect(margin, y, contentWidth, 14, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    doc.text(`Total Produced: ${Number(entry.total_qty || 0).toLocaleString()} pcs`, margin + 6, y + 9);

    doc.setTextColor(6, 95, 70);
    doc.text(`Good Qty: ${Number(entry.good_qty || 0).toLocaleString()} pcs`, margin + 60, y + 9);

    doc.setTextColor(185, 28, 28);
    doc.text(`Rejected Scrap: ${Number(entry.rejected_qty || 0).toLocaleString()} pcs`, margin + 115, y + 9);

    doc.setTextColor(LIGHT.amberDark[0], LIGHT.amberDark[1], LIGHT.amberDark[2]);
    doc.text(`Total Loss: ${entry.total_losses_mins || 0} mins`, margin + 155, y + 9);

    y += 18;

    // OEE Health Visual: gauge (left) + Availability/Performance/Quality bars (right)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    doc.text('OEE Health Visual', margin, y);
    y += 4;
    const gaugeCx = margin + 30;
    const gaugeCy = y + 24;
    drawGauge(doc, gaugeCx, gaugeCy, 19, entry.oee_rate || 0);
    let by = y + 2;
    const barsX = margin + 60;
    const barsW = contentWidth - 60;
    by = drawBar(doc, barsX, by, barsW, entry.availability_rate || 0, LIGHT.brand, 'Availability', `${entry.availability_rate || 0}%`);
    by = drawBar(doc, barsX, by, barsW, entry.performance_rate || 0, LIGHT.blue, 'Performance', `${entry.performance_rate || 0}%`);
    by = drawBar(doc, barsX, by, barsW, entry.quality_rate || 0, LIGHT.green, 'Quality', `${entry.quality_rate || 0}%`);
    y = Math.max(gaugeCy + 10, by + 2);

    // Downtime loss visual (vector bars replace the old chart image)
    y = drawLossVisual(doc, margin, y, contentWidth, entry);

    // Page 1 Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text('Page 1 of 2  -  Lemken Production Tracker Executive Report', pageWidth / 2, pageHeight - 7, { align: 'center' });

    // ---------------------------------------------------------
    // PAGE 2: Part Production Details & Complete Losses Audit
    // ---------------------------------------------------------
    doc.addPage();

    // Top Header Banner on Page 2
    doc.setFillColor(LIGHT.brand[0], LIGHT.brand[1], LIGHT.brand[2]);
    doc.rect(0, 0, pageWidth, 16, 'F');
    doc.setFillColor(LIGHT.brandDark[0], LIGHT.brandDark[1], LIGHT.brandDark[2]);
    doc.rect(0, 16, pageWidth, 1.2, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`LEMKEN PRODUCTION & DOWNTIME LOSS AUDIT  -  ${entry.machine_name || entry.machine_code}`, margin, 11);

    y = 24;

    // Section 1: Manufactured Parts Table
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    doc.text('1. Manufactured Parts & Cycle Time Details', margin, y);
    y += 5;

    const partsRows = [];
    if (entry.part1_name || entry.part1_qty > 0) {
      partsRows.push(['Part 1', entry.part1_name || '-', `${entry.part1_cycle_time || 0} min`, `${entry.part1_qty || 0} pcs`]);
    }
    if (entry.part2_name || entry.part2_qty > 0) {
      partsRows.push(['Part 2', entry.part2_name || '-', `${entry.part2_cycle_time || 0} min`, `${entry.part2_qty || 0} pcs`]);
    }
    if (entry.part3_name || entry.part3_qty > 0) {
      partsRows.push(['Part 3', entry.part3_name || '-', `${entry.part3_cycle_time || 0} min`, `${entry.part3_qty || 0} pcs`]);
    }
    if (partsRows.length === 0) {
      partsRows.push(['All Parts', 'No parts logged', '0 min', '0 pcs']);
    }

    if (doc.autoTable) {
      doc.autoTable({
        startY: y,
        head: [['Slot', 'Part Name / Code', 'Cycle Time', 'Quantity Produced']],
        body: partsRows,
        theme: 'striped',
        headStyles: { fillColor: LIGHT.brand, textColor: [255, 255, 255], fontStyle: 'bold' },
        bodyStyles: { textColor: [15, 23, 42] },
        alternateRowStyles: { fillColor: LIGHT.card },
        styles: { fontSize: 8.5, cellPadding: 3 },
        margin: { left: margin, right: margin }
      });
      y = doc.lastAutoTable.finalY + 12;
    } else {
      y += 24;
    }

    // Section 2: 15 Downtime Losses Full Breakdown
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    doc.text('2. 15 Downtime Loss Categories Audit Log', margin, y);
    y += 5;

    const lossAuditRows = [];
    Object.keys(LOSS_LABELS).forEach((key, index) => {
      const mins = Number(entry[key]) || 0;
      const pct = entry.planned_time_mins > 0 ? ((mins / entry.planned_time_mins) * 100).toFixed(1) + '%' : '0.0%';
      const status = mins > 0 ? (mins > 60 ? 'CRITICAL BREACH' : 'ATTENTION') : 'NORMAL (0m)';
      lossAuditRows.push([
        (index + 1).toString(),
        LOSS_LABELS[key],
        `${mins} mins`,
        pct,
        status
      ]);
    });

    if (doc.autoTable) {
      doc.autoTable({
        startY: y,
        head: [['#', 'Downtime Loss Category', 'Duration', '% of Planned Time', 'Audit Flag']],
        body: lossAuditRows,
        theme: 'striped',
        headStyles: { fillColor: LIGHT.brand, textColor: [255, 255, 255], fontStyle: 'bold' },
        bodyStyles: { textColor: [15, 23, 42] },
        alternateRowStyles: { fillColor: LIGHT.card },
        styles: { fontSize: 8, cellPadding: 2.2 },
        columnStyles: {
          0: { cellWidth: 10 },
          2: { fontStyle: 'bold' },
          4: { fontStyle: 'bold' }
        },
        didParseCell: function (data) {
          if (data.section === 'body' && data.column.index === 4) {
            const val = data.cell.raw;
            if (val.includes('CRITICAL')) {
              data.cell.styles.textColor = [155, 28, 28];
            } else if (val.includes('ATTENTION')) {
              data.cell.styles.textColor = [146, 110, 25];
            } else {
              data.cell.styles.textColor = [14, 159, 110];
            }
          }
        },
        margin: { left: margin, right: margin }
      });
      y = doc.lastAutoTable.finalY + 10;
    } else {
      y += 80;
    }

    // Section 3: Supervisor Remarks & Action Notes
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10.5);
    doc.setTextColor(LIGHT.ink[0], LIGHT.ink[1], LIGHT.ink[2]);
    doc.text('3. Supervisor Remarks & Root Cause Notes', margin, y);
    y += 4;

    doc.setFillColor(LIGHT.card[0], LIGHT.card[1], LIGHT.card[2]);
    doc.setDrawColor(LIGHT.line[0], LIGHT.line[1], LIGHT.line[2]);
    doc.roundedRect(margin, y, contentWidth, 16, 2, 2, 'FD');

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(8.5);
    doc.setTextColor(60, 68, 90);
    const remarks = entry.remarks ? String(entry.remarks).trim() : 'No special supervisor remarks entered.';
    doc.text(remarks, margin + 4, y + 9, { maxWidth: contentWidth - 8 });

    // Page 2 Footer
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(140, 125, 80);
    doc.text('Page 2 of 2  -  CONFIDENTIAL  -  Lemken Agrovision Company Manufacturing Quality', pageWidth / 2, pageHeight - 7, { align: 'center' });

    // Prepare outputs
    const dataUri = doc.output('datauristring');
    const blob = doc.output('blob');
    const filename = `Shift_Report_${(entry.machine_code || 'Machine').replace(/[^a-zA-Z0-9_-]/g, '_')}_${entry.log_date || 'Date'}_${(entry.shift || 'Shift').replace(/\s+/g, '')}.pdf`;

    return {
      doc,
      blob,
      dataUri,
      filename
    };
  }

  /**
   * Dispatches the Shift Report Email via EmailJS with full parameters & PDF attachment
   * @param {object} entry The production shift entry record
   */
  async function sendShiftReport(entry) {
    const config = getConfig();

    if (!config.enabled) {
      console.log('[EmailAlert] Email alerts are currently disabled in settings.');
      return { skipped: true, reason: 'Disabled in settings' };
    }

    // NOTE: Sends on EVERY saved entry. No 120-min / breakdown cancellation —
    // that rule was removed per requirement so the supervisor gets a PDF each time.

    if (typeof emailjs === 'undefined') {
      console.warn('[EmailAlert] EmailJS SDK is not loaded. Cannot dispatch email.');
      return { skipped: true, reason: 'EmailJS SDK missing' };
    }

    // Vector PDF (~10-20KB) — one render, no image compression loop needed.
    let pdf = null;
    let reportUrl = '';
    try {
      console.log(`[EmailAlert] Generating PDF shift report with visuals for ${entry.machine_name || entry.machine_code}...`);
      pdf = await generateShiftReportPDF(entry);
      console.log(`[EmailAlert] PDF ready: ${pdf.dataUri.length} chars (budget ${PDF_BUDGET_CHARS})`);

      const client = getSupabaseClient();
      if (client) {
        try {
          reportUrl = await uploadPdfAndGetUrl(client, pdf.blob, pdf.filename, entry.log_date);
          console.log('[EmailAlert] PDF uploaded:', reportUrl);
        } catch (upErr) {
          console.warn('[EmailAlert] Storage upload failed, falling back to inline PDF:', (upErr && upErr.message) || upErr);
        }
      } else {
        console.warn('[EmailAlert] No Supabase client — falling back to inline PDF.');
      }
    } catch (err) {
      console.error('[EmailAlert] PDF generation failed:', err);
      return { success: false, stage: 'pdf-generate', error: err, detail: (err && err.message) || String(err) };
    }

    try {
      const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

      // Build Top Losses Summary
      const nonZeroLosses = [];
      Object.keys(LOSS_LABELS).forEach(k => {
        const m = Number(entry[k]) || 0;
        if (m > 0) nonZeroLosses.push(`${LOSS_LABELS[k]}: ${m}m`);
      });
      const lossSummaryStr = nonZeroLosses.length > 0 ? nonZeroLosses.join(', ') : 'None (Zero Downtime)';

      const templateParams = {
        to_email: config.recipient,
        recipient_email: config.recipient,
        machine_name: entry.machine_name || entry.machine_code,
        machine_code: entry.machine_code || '-',
        log_date: entry.log_date || '-',
        shift: entry.shift || '-',
        operator: entry.operator_name || 'N/A',
        oee: `${entry.oee_rate || 0}%`,
        availability: `${entry.availability_rate || 0}%`,
        performance: `${entry.performance_rate || 0}%`,
        quality: `${entry.quality_rate || 0}%`,
        good_qty: Number(entry.good_qty || 0).toLocaleString(),
        rejected_qty: Number(entry.rejected_qty || 0).toLocaleString(),
        total_qty: Number(entry.total_qty || 0).toLocaleString(),
        total_loss_mins: `${entry.total_losses_mins || 0} mins`,
        breakdown_mins: `${Number(entry.loss_breakdown) || 0} mins`,
        loss_summary: lossSummaryStr,
        remarks: entry.remarks || 'None',
        timestamp: nowStr,
        report_filename: pdf.filename,
        report_url: reportUrl,
        // Single PDF variable — template must use {{report_pdf}}.
        report_pdf: '',
        attachment: ''
      };

      let pdfOmitted = false;
      if (reportUrl) {
        // Full-quality PDF delivered via link — no DataURI needed, email stays tiny.
      } else if (pdf.dataUri && pdf.dataUri.length <= PDF_BUDGET_CHARS) {
        // Single copy only — a second alias would eat the 50KB budget twice.
        // Template must use {{report_pdf}} ({{attachment}} kept empty).
        templateParams.report_pdf = pdf.dataUri;
      } else {
        pdfOmitted = true;
        console.warn(`[EmailAlert] PDF is ${pdf.dataUri ? pdf.dataUri.length : 0} chars (budget ${PDF_BUDGET_CHARS}) — sending summary email without PDF. Use "Download Sample PDF" for the full report.`);
      }

      emailjs.init({ publicKey: config.publicKey });
      const resp = await emailjs.send(config.serviceId, config.templateId, templateParams);
      console.log('[EmailAlert] Shift report email delivered successfully!', resp);
      return { success: true, resp, filename: pdf.filename, pdfOmitted, reportUrl };
    } catch (err) {
      const detail = (err && (err.text || err.message)) || String(err);
      console.error('[EmailAlert] EmailJS send failed:', detail, err);
      return { success: false, stage: 'emailjs-send', error: err, detail };
    }
  }

  /**
   * Download a generated sample PDF directly in the browser
   */
  async function downloadSamplePDF(customEntry = null) {
    const sampleEntry = customEntry || {
      machine_code: 'CNC-DX200-1',
      machine_name: 'CNC DX 200-1',
      log_date: new Date().toISOString().split('T')[0],
      shift: 'Shift A',
      shift_hours: 8.5,
      operator_name: 'Abhijit Gedam',
      part1_name: 'Shaft Collar 45mm',
      part1_cycle_time: 2.5,
      part1_qty: 120,
      part2_name: 'Flange Bearing Plate',
      part2_cycle_time: 3.2,
      part2_qty: 60,
      part3_name: '',
      part3_cycle_time: 0,
      part3_qty: 0,
      total_qty: 180,
      rejected_qty: 4,
      good_qty: 176,
      loss_breakdown: 15,
      loss_tool_insert: 20,
      loss_setup: 30,
      total_losses_mins: 65,
      planned_time_mins: 465,
      operating_time_mins: 400,
      availability_rate: 86.0,
      performance_rate: 91.5,
      quality_rate: 97.8,
      oee_rate: 77.0,
      remarks: 'Minor tool insert wear replaced during mid-shift.'
    };

    const { doc, filename } = await generateShiftReportPDF(sampleEntry);
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
    const btnTest = document.getElementById('btn-email-test');
    const btnDownloadSample = document.getElementById('btn-email-download-sample');

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

    if (btnTest) {
      btnTest.addEventListener('click', async () => {
        const resultBox = document.getElementById('email-settings-result');
        if (resultBox) {
          resultBox.style.display = 'block';
          resultBox.style.background = 'rgba(6, 182, 212, 0.15)';
          resultBox.style.border = '1px solid rgba(6, 182, 212, 0.35)';
          resultBox.style.color = '#06b6d4';
          resultBox.textContent = 'Generating PDF with charts and sending test email...';
        }

        const sampleEntry = {
          machine_code: 'CNC-DX200-1',
          machine_name: 'CNC DX 200-1',
          log_date: new Date().toISOString().split('T')[0],
          shift: 'Shift A',
          shift_hours: 8.5,
          operator_name: 'Test Supervisor',
          part1_name: 'Sample Component A',
          part1_cycle_time: 3.0,
          part1_qty: 100,
          total_qty: 100,
          good_qty: 98,
          rejected_qty: 2,
          loss_breakdown: 10,
          total_losses_mins: 40,
          planned_time_mins: 465,
          operating_time_mins: 425,
          availability_rate: 91.4,
          performance_rate: 88.2,
          quality_rate: 98.0,
          oee_rate: 79.0,
          remarks: 'Automated test dispatch from LEMKEN Production Tracker.'
        };

        const res = await sendShiftReport(sampleEntry);
        if (resultBox) {
          if (res.success) {
            resultBox.style.background = 'rgba(16, 185, 129, 0.15)';
            resultBox.style.border = '1px solid rgba(16, 185, 129, 0.35)';
            resultBox.style.color = '#10b981';
            resultBox.textContent = res.pdfOmitted
              ? '✓ Email sent (summary only — PDF too large for EmailJS). Full report via "Download Sample PDF".'
              : '✓ Test email and PDF sent successfully!';
          } else if (res.skipped) {
            resultBox.style.background = 'rgba(245, 158, 11, 0.15)';
            resultBox.style.border = '1px solid rgba(245, 158, 11, 0.35)';
            resultBox.style.color = '#f59e0b';
            resultBox.textContent = `Skipped: ${res.reason || 'Check console'}`;
          } else {
            resultBox.style.background = 'rgba(239, 68, 68, 0.15)';
            resultBox.style.border = '1px solid rgba(239, 68, 68, 0.35)';
            resultBox.style.color = '#f87171';
            resultBox.textContent = `Email send error [${res.stage || 'unknown'}]: ${res.detail || (res.error ? (res.error.text || res.error.message || JSON.stringify(res.error)) : 'Check console (F12)')}`;
          }
        }
      });
    }

    if (btnDownloadSample) {
      btnDownloadSample.addEventListener('click', async () => {
        try {
          await downloadSamplePDF();
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

  // Export public API
  window.EmailAlert = {
    getConfig,
    saveConfig,
    generateShiftReportPDF,
    sendShiftReport,
    downloadSamplePDF
  };

})();
