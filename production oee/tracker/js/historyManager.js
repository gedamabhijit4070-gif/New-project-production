// History Log & CSV Export Manager
import { db } from './supabaseClient.js';
import { MACHINES } from './config.js';

export class HistoryManager {
  constructor() {
    this.entries = [];
    this.filteredEntries = [];
  }

  async loadEntries() {
    this.entries = await db.fetchEntries(200);
    this.filteredEntries = [...this.entries];
    return this.entries;
  }

  filterEntries(filters = {}) {
    const { machineCode, shift, dateRange, search } = filters;
    const todayStr = new Date().toISOString().split('T')[0];

    this.filteredEntries = this.entries.filter(item => {
      // Machine filter
      if (machineCode && machineCode !== 'ALL' && item.machine_code !== machineCode) {
        return false;
      }
      // Shift filter
      if (shift && shift !== 'ALL' && item.shift !== shift) {
        return false;
      }
      // Date filter
      if (dateRange === 'today' && item.log_date !== todayStr) {
        return false;
      }
      if (dateRange === 'week') {
        const itemDate = new Date(item.log_date);
        const weekAgo = new Date();
        weekAgo.setDate(weekAgo.getDate() - 7);
        if (itemDate < weekAgo) return false;
      }
      // Search text (operator or machine name)
      if (search && search.trim()) {
        const query = search.toLowerCase();
        const op = (item.operator_name || '').toLowerCase();
        const mName = (item.machine_name || '').toLowerCase();
        if (!op.includes(query) && !mName.includes(query)) return false;
      }
      return true;
    });

    return this.filteredEntries;
  }

  getSummaryStats() {
    const list = this.filteredEntries;
    if (!list.length) {
      return { totalLogs: 0, totalQty: 0, avgOee: 0, totalLossMins: 0 };
    }

    let sumQty = 0;
    let sumOee = 0;
    let sumLoss = 0;

    list.forEach(e => {
      sumQty += (e.total_qty || 0);
      sumOee += (parseFloat(e.oee_rate) || 0);
      sumLoss += (e.total_losses_mins || 0);
    });

    return {
      totalLogs: list.length,
      totalQty: sumQty,
      avgOee: +(sumOee / list.length).toFixed(1),
      totalLossMins: sumLoss
    };
  }

  exportToCSV() {
    if (!this.filteredEntries.length) {
      alert('No production entries to export.');
      return;
    }

    const headers = [
      'Log ID', 'Date', 'Shift', 'Shift Hours', 'Machine Code', 'Machine Name', 'Operator Name',
      'Part 1 Name', 'Part 1 Cycle (min)', 'Part 1 Qty',
      'Part 2 Name', 'Part 2 Cycle (min)', 'Part 2 Qty',
      'Part 3 Name', 'Part 3 Cycle (min)', 'Part 3 Qty',
      'Total Qty', 'Rejected Qty', 'Good Qty',
      'Breakdown (min)', 'No Plan (min)', 'No Material (min)', 'No Operator (min)',
      'Startup (min)', 'Setup (min)', 'Jig/Fixture (min)', 'Programming (min)',
      'Measurement (min)', 'Document (min)', 'Speed (min)', 'Quality Insp (min)', 'Cleaning (min)',
      'Total Losses (min)', 'Planned Time (min)', 'Operating Time (min)', 'Ideal Run Time (min)',
      'Availability (%)', 'Performance (%)', 'Quality (%)', 'OEE (%)', 'Remarks'
    ];

    const rows = this.filteredEntries.map(e => [
      `"${e.id || ''}"`,
      `"${e.log_date || ''}"`,
      `"${e.shift || ''}"`,
      e.shift_hours || 8.5,
      `"${e.machine_code || ''}"`,
      `"${e.machine_name || ''}"`,
      `"${(e.operator_name || '').replace(/"/g, '""')}"`,
      `"${(e.part1_name || '').replace(/"/g, '""')}"`,
      e.part1_cycle_time || 0,
      e.part1_qty || 0,
      `"${(e.part2_name || '').replace(/"/g, '""')}"`,
      e.part2_cycle_time || 0,
      e.part2_qty || 0,
      `"${(e.part3_name || '').replace(/"/g, '""')}"`,
      e.part3_cycle_time || 0,
      e.part3_qty || 0,
      e.total_qty || 0,
      e.rejected_qty || 0,
      e.good_qty || 0,
      e.loss_breakdown || 0,
      e.loss_no_plan || 0,
      e.loss_no_material || 0,
      e.loss_no_operator || 0,
      e.loss_startup || 0,
      e.loss_setup || 0,
      e.loss_jig_fixture || 0,
      e.loss_programming || 0,
      e.loss_measurement || 0,
      e.loss_document || 0,
      e.loss_speed || 0,
      e.loss_quality_insp || 0,
      e.loss_cleaning || 0,
      e.total_losses_mins || 0,
      e.planned_time_mins || 0,
      e.operating_time_mins || 0,
      e.ideal_run_time_mins || 0,
      e.availability_rate || 0,
      e.performance_rate || 0,
      e.quality_rate || 0,
      e.oee_rate || 0,
      `"${(e.remarks || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' 
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    const timestamp = new Date().toISOString().split('T')[0];
    link.setAttribute('download', `Production_OEE_Log_${timestamp}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const historyMgr = new HistoryManager();
