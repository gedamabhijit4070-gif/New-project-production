/**
 * CSV / Data Export Utilities for Production & OEE Tracker
 */
import { LOSS_FIELDS } from './machines.js';

export function exportEntriesToCSV(entries, filenamePrefix = 'Shopfloor_Report') {
  if (!entries || entries.length === 0) {
    alert('No production & OEE records available to export.');
    return;
  }

  const baseHeaders = [
    'Log ID',
    'Date',
    'Shift',
    'Shift Hours',
    'Machine Code',
    'Machine Name',
    'Operator Name',
    'Part 1 Name',
    'Part 1 Cycle (min)',
    'Part 1 Qty',
    'Part 2 Name',
    'Part 2 Cycle (min)',
    'Part 2 Qty',
    'Part 3 Name',
    'Part 3 Cycle (min)',
    'Part 3 Qty',
    'Total Produced',
    'Rejected Qty',
    'Good Qty',
    'Planned Time (min)',
    'Total Loss (min)',
    'Operating Time (min)',
    'Ideal Run Time (min)',
    'Availability %',
    'Performance %',
    'Quality %',
    'OEE %',
    'Productivity (Parts/Hr)'
  ];

  // Append 15 loss column headers
  const lossHeaders = LOSS_FIELDS.map(f => f.label + ' (min)');
  const allHeaders = [...baseHeaders, ...lossHeaders, 'Remarks / Root Cause', 'Created At'];

  const escapeField = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const rows = entries.map(e => {
    const productivityRate = e.productivity_rate !== undefined 
      ? e.productivity_rate 
      : (Number(e.operating_time_mins) > 0 ? Number(((Number(e.good_qty) * 60) / Number(e.operating_time_mins)).toFixed(1)) : 0);

    const baseRow = [
      escapeField(e.id),
      escapeField(e.log_date),
      escapeField(e.shift),
      e.shift_hours,
      escapeField(e.machine_code),
      escapeField(e.machine_name),
      escapeField(e.operator_name),
      escapeField(e.part1_name),
      e.part1_cycle_time,
      e.part1_qty,
      escapeField(e.part2_name),
      e.part2_cycle_time,
      e.part2_qty,
      escapeField(e.part3_name),
      e.part3_cycle_time,
      e.part3_qty,
      e.total_qty,
      e.rejected_qty,
      e.good_qty,
      e.planned_time_mins,
      e.total_losses_mins,
      e.operating_time_mins,
      e.ideal_run_time_mins,
      e.availability_rate,
      e.performance_rate,
      e.quality_rate,
      e.oee_rate,
      productivityRate
    ];

    const lossRow = LOSS_FIELDS.map(f => Number(e[f.key]) || 0);

    return [
      ...baseRow,
      ...lossRow,
      escapeField(e.remarks),
      escapeField(e.created_at)
    ];
  });

  const csvContent = [allHeaders.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  const todayStr = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', `${filenamePrefix}_${todayStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Export Periodic Analysis Report (Daily / Weekly / Monthly) to CSV
 * Supports both multi-machine matrix export and single-machine chronological history.
 */
export function exportPeriodicReportToCSV(periodicData, filenamePrefix = 'Periodic_OEE_Loss_Report') {
  if (!periodicData) {
    alert('No periodic analytics data available to export.');
    return;
  }

  const escapeField = (val) => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const lines = [];

  // Report Metadata Header
  lines.push(`"REPORT TITLE","Shopfloor OEE & 15-Loss Periodic Analysis"`);
  lines.push(`"HORIZON TYPE","${periodicData.periodType.toUpperCase()}"`);
  lines.push(`"SELECTED PERIOD","${escapeField(periodicData.activePeriodLabel)}"`);
  lines.push(`"SELECTED TARGET","${escapeField(periodicData.selectedMachine.name)} (${periodicData.selectedMachine.code})"`);
  lines.push(`"EXPORT TIMESTAMP","${new Date().toISOString()}"`);
  lines.push('');

  // Section 1: 11-Machine Comparison Matrix for this period
  lines.push('"SECTION 1: 11-MACHINE PERFORMANCE MATRIX (SEPARATE MACHINE EVALUATION)"');
  const matrixHeaders = [
    'Machine Code',
    'Machine Name',
    'Type',
    'Shifts',
    'Planned Hours',
    'Operating Hours',
    'Loss Hours',
    'Availability %',
    'Performance %',
    'Quality %',
    'OEE %',
    'Productivity (Parts/Hr)',
    'Total Produced',
    'Good Units',
    'Scrap Units',
    'Top Loss Category',
    'Status'
  ];
  lines.push(matrixHeaders.map(escapeField).join(','));

  (periodicData.machineMatrix || []).forEach(m => {
    lines.push([
      escapeField(m.code),
      escapeField(m.name),
      escapeField(m.category),
      m.shiftCount,
      m.plannedHours,
      m.operatingHours,
      m.lossHours,
      m.availability,
      m.performance,
      m.quality,
      m.oee,
      m.productivity,
      m.totalOutput,
      m.goodQty,
      m.scrapQty,
      escapeField(m.topLoss ? `${m.topLoss.label} (${m.topLoss.mins}m)` : 'None'),
      escapeField(m.status)
    ].join(','));
  });

  lines.push('');

  // Section 2: 15 Shopfloor Downtime Losses Breakdown
  lines.push(`"SECTION 2: 15-LOSS BREAKDOWN FOR ${escapeField(periodicData.selectedMachine.name)}"`);
  const lossHeaders = [
    'Loss Name',
    'Category',
    'Total Downtime (Mins)',
    'Total Downtime (Hours)',
    'Incident Count',
    '% of Downtime',
    'Impact on Availability %'
  ];
  lines.push(lossHeaders.map(escapeField).join(','));

  (periodicData.detailedLossList || []).forEach(l => {
    lines.push([
      escapeField(l.label),
      escapeField(l.category),
      l.mins,
      l.hours,
      l.count,
      l.pctOfLoss,
      l.impactOnAvail
    ].join(','));
  });

  lines.push('');

  // Section 3: Periodic Chronological History (Days, Weeks, or Months)
  lines.push(`"SECTION 3: CHRONOLOGICAL ${periodicData.periodType.toUpperCase()} HISTORY FOR ${escapeField(periodicData.selectedMachine.name)}"`);
  const historyHeaders = [
    'Period Interval',
    'Shifts Logged',
    'Operating (Mins)',
    'Planned (Mins)',
    'Total Loss (Mins)',
    'Availability %',
    'Performance %',
    'Quality %',
    'OEE %',
    'Productivity (Parts/Hr)',
    'Total Produced',
    'Good Units',
    'Scrap Units',
    'Top Downtime Loss'
  ];
  lines.push(historyHeaders.map(escapeField).join(','));

  (periodicData.periodicHistory || []).forEach(h => {
    lines.push([
      escapeField(h.label),
      h.shiftCount,
      h.operatingMins,
      h.plannedMins,
      h.lossMins,
      h.availability,
      h.performance,
      h.quality,
      h.oee,
      h.productivity,
      h.totalOutput,
      h.goodQty,
      h.scrapQty,
      escapeField(h.topLoss ? `${h.topLoss.label} (${h.topLoss.mins}m)` : 'None')
    ].join(','));
  });

  const csvContent = lines.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  const todayStr = new Date().toISOString().split('T')[0];
  link.setAttribute('href', url);
  link.setAttribute('download', `${filenamePrefix}_${periodicData.periodType}_${todayStr}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

