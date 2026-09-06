// Master Application Controller
// Orchestrates:
// Page 1: Minimalist 11 Machines Grid (Machine names only)
// Page 2: Dedicated Machine Production & 13-Loss Fill-Up Form (Low-Effort Touch Steppers & Zero Typing)
// Page 3: OEE & Loss Analytics Dashboard
// Supabase Database Sync & LocalStorage fallback

import { MACHINES, SHIFTS, LOSS_DEFINITIONS } from './config.js';
import { calculateOEE } from './oeeCalculator.js';
import { db } from './supabaseClient.js';
import { historyMgr } from './historyManager.js';

class ProductionTrackerApp {
  constructor() {
    this.currentMachine = MACHINES[0];
    this.currentView = 'view-landing';
    this.dashboardFilter = {
      horizon: 'shift',
      interval: 'ALL_SHIFTS',
      machineCode: 'ALL'
    };
    this.init();
  }

  async init() {
    this.renderMinimalistMachines();
    this.renderLossInputs();
    this.populateMachineDropdowns();
    this.setupEventListeners();
    this.startClock();
    this.setTodayDate();
    this.updateDbStatusPill();
    
    // Load historical entries from Supabase / LocalStorage
    await historyMgr.loadEntries();
    this.renderExecutiveDashboard();
  }

  // Live Factory Clock & Shift Detection
  startClock() {
    const clockEl = document.getElementById('live-clock');
    const shiftBadge = document.getElementById('current-shift-badge');
    const dashActivePeriodText = document.getElementById('dash-active-period-text');

    const updateTime = () => {
      const now = new Date();
      const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      if (clockEl) clockEl.textContent = timeStr;

      const hours = now.getHours();
      const mins = now.getMinutes();
      const timeVal = hours + mins / 60;

      let detectedShift = 'Shift A';
      if (timeVal >= 7 && timeVal < 15.5) {
        detectedShift = 'Shift A';
      } else if (timeVal >= 15.5 && timeVal < 24) {
        detectedShift = 'Shift B';
      } else {
        detectedShift = 'Shift C';
      }

      if (shiftBadge) shiftBadge.textContent = detectedShift.toUpperCase();
      if (dashActivePeriodText && this.dashboardFilter.horizon === 'shift') {
        dashActivePeriodText.textContent = `${detectedShift} Active (${timeStr})`;
      }
    };

    updateTime();
    setInterval(updateTime, 1000);
  }

  setTodayDate() {
    const dateInput = document.getElementById('input-log-date');
    if (dateInput) {
      dateInput.value = new Date().toISOString().split('T')[0];
    }
  }

  // Populate Dropdowns with all 11 Machines
  populateMachineDropdowns() {
    const quickSwitcher = document.getElementById('fillup-machine-select');
    const histFilter = document.getElementById('filter-history-machine');

    const machineOptions = MACHINES.map(m => `<option value="${m.code}">${m.name} (${m.category})</option>`).join('');

    if (quickSwitcher) {
      quickSwitcher.innerHTML = machineOptions;
      quickSwitcher.value = this.currentMachine.code;
    }

    if (histFilter) {
      histFilter.innerHTML = '<option value="ALL">All 11 Machines</option>' + machineOptions;
    }
  }

  // =========================================================================
  // PAGE 1: RENDER MINIMALIST 11 MACHINES GRID
  // =========================================================================
  renderMinimalistMachines() {
    const container = document.getElementById('minimal-machines-grid');
    if (!container) return;

    container.innerHTML = MACHINES.map(m => {
      const catClass = m.category.toLowerCase();
      return `
        <div class="minimal-machine-card card-${catClass}" data-machine-code="${m.code}">
          <div class="card-name-wrap">
            <span class="card-machine-type">${m.type || (m.category + ' CELL')}</span>
            <span class="card-machine-name">${m.name}</span>
          </div>
          <div class="card-action-links">
            <button type="button" class="btn-card-analyze" data-analyze-code="${m.code}" title="View OEE Analytics">
              <span>📊</span> Analytics
            </button>
            <div class="card-launch-icon" title="Log Production & Losses">
              ➔
            </div>
          </div>
        </div>
      `;
    }).join('');

    // Card click -> Page 2
    container.querySelectorAll('.minimal-machine-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (e.target.closest('.btn-card-analyze')) return;
        const code = card.getAttribute('data-machine-code');
        this.selectMachineForEntry(code);
      });
    });

    // Analytics click -> Page 3
    container.querySelectorAll('.btn-card-analyze').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const code = btn.getAttribute('data-analyze-code');
        this.inspectMachineInDashboard(code);
      });
    });
  }

  // =========================================================================
  // PAGE 2: STREAMLINED 13 LOSSES FORMAT WITH LOW-EFFORT TOUCH STEPPERS
  // =========================================================================
  renderLossInputs() {
    const container = document.getElementById('losses-13-grid-container');
    if (!container) return;

    container.innerHTML = LOSS_DEFINITIONS.map(loss => {
      return `
        <div class="loss-input-card" id="card_${loss.key}" data-loss-key="${loss.key}">
          <div class="loss-top-row">
            <div class="loss-label-box">
              <span class="loss-emoji-box">${this.getLossEmoji(loss.key)}</span>
              <span class="loss-name">${loss.label}</span>
            </div>
            <span class="loss-badge-display" id="badge_${loss.key}">0m</span>
          </div>

          <div class="loss-bottom-control-row">
            <div class="loss-quick-steppers">
              <button type="button" class="btn-loss-chip chip-dec" data-sub="5" data-target="${loss.key}">-5m</button>
              <button type="button" class="btn-loss-chip" data-add="5" data-target="${loss.key}">+5m</button>
              <button type="button" class="btn-loss-chip" data-add="15" data-target="${loss.key}">+15m</button>
              <button type="button" class="btn-loss-chip" data-add="30" data-target="${loss.key}">+30m</button>
              <button type="button" class="btn-loss-chip" data-add="60" data-target="${loss.key}">+60m</button>
              <button type="button" class="btn-loss-chip chip-zero" data-zero="${loss.key}">✕ 0</button>
            </div>
            <input type="number" min="0" id="${loss.key}" name="${loss.key}" class="loss-number-field" placeholder="0" value="0">
          </div>
        </div>
      `;
    }).join('');

    // Attach stepper listeners to chips
    container.querySelectorAll('.btn-loss-chip').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const targetId = btn.getAttribute('data-target') || btn.getAttribute('data-zero');
        const input = document.getElementById(targetId);
        if (!input) return;

        let currentVal = parseInt(input.value, 10) || 0;

        if (btn.hasAttribute('data-add')) {
          currentVal += parseInt(btn.getAttribute('data-add'), 10);
        } else if (btn.hasAttribute('data-sub')) {
          currentVal = Math.max(0, currentVal - parseInt(btn.getAttribute('data-sub'), 10));
        } else if (btn.hasAttribute('data-zero')) {
          currentVal = 0;
        }

        input.value = currentVal;
        this.updateLossCardBadge(targetId, currentVal);
        this.recalculateFormOEE();
      });
    });

    // Listen on manual input change to update badge
    LOSS_DEFINITIONS.forEach(loss => {
      const input = document.getElementById(loss.key);
      if (input) {
        input.addEventListener('input', () => {
          const val = Math.max(0, parseInt(input.value, 10) || 0);
          this.updateLossCardBadge(loss.key, val);
          this.recalculateFormOEE();
        });
      }
    });
  }

  updateLossCardBadge(key, val) {
    const badge = document.getElementById(`badge_${key}`);
    const card = document.getElementById(`card_${key}`);
    if (badge) badge.textContent = `${val}m`;
    if (card) {
      card.classList.toggle('has-loss', val > 0);
    }
  }

  getLossEmoji(key) {
    const map = {
      loss_breakdown: '🚨',
      loss_no_plan: '🗓️',
      loss_no_material: '📦',
      loss_no_operator: '👤',
      loss_startup: '⚡',
      loss_setup: '🔧',
      loss_jig_fixture: '🔩',
      loss_programming: '💻',
      loss_measurement: '📏',
      loss_document: '📄',
      loss_speed: '🐢',
      loss_quality_insp: '🔍',
      loss_cleaning: '🧹'
    };
    return map[key] || '⏱️';
  }

  selectMachineForEntry(code) {
    const machine = MACHINES.find(m => m.code === code) || MACHINES[0];
    this.currentMachine = machine;

    const nameEl = document.getElementById('form-machine-name');
    const badgeEl = document.getElementById('form-machine-badge');
    const quickSwitcher = document.getElementById('fillup-machine-select');

    if (nameEl) nameEl.textContent = machine.name;
    if (badgeEl) {
      badgeEl.textContent = `${machine.category} CELL`;
      badgeEl.className = `machine-tag-pill`;
    }
    if (quickSwitcher) {
      quickSwitcher.value = machine.code;
    }

    this.switchView('view-form');
    this.recalculateFormOEE();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Navigation View Switcher (using .hidden)
  switchView(viewId) {
    document.querySelectorAll('.view-container').forEach(sec => sec.classList.add('hidden'));
    const target = document.getElementById(viewId);
    if (target) target.classList.remove('hidden');
    this.currentView = viewId;

    document.querySelectorAll('.page-nav-tabs .nav-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-target-view') === viewId);
    });

    if (viewId === 'view-dashboard') {
      this.renderExecutiveDashboard();
    }
  }

  // Recalculate Live OEE & Update Calculated Ribbon
  recalculateFormOEE() {
    const formData = this.getFormData();
    const result = calculateOEE(formData);

    // Update Quality summary fields
    const totQty = document.getElementById('summary-total-qty');
    const goodQty = document.getElementById('summary-good-qty');
    if (totQty) totQty.value = result.total_qty;
    if (goodQty) goodQty.value = result.good_qty;

    // Update Live OEE Auto-Calculated Ribbon
    const calcPlanned = document.getElementById('calc-planned-time');
    const calcLosses = document.getElementById('calc-total-losses');
    const calcOper = document.getElementById('calc-operating-time');
    const calcAvail = document.getElementById('calc-avail');
    const calcPerf = document.getElementById('calc-perf');
    const calcQual = document.getElementById('calc-qual');
    const calcOee = document.getElementById('calc-oee');

    if (calcPlanned) calcPlanned.textContent = `${result.planned_time_mins} min`;
    if (calcLosses) calcLosses.textContent = `${result.total_losses_mins} min`;
    if (calcOper) calcOper.textContent = `${result.operating_time_mins} min`;
    if (calcAvail) calcAvail.textContent = `${result.availability_rate}%`;
    if (calcPerf) calcPerf.textContent = `${result.performance_rate}%`;
    if (calcQual) calcQual.textContent = `${result.quality_rate}%`;
    if (calcOee) calcOee.textContent = `${result.oee_rate}%`;

    return result;
  }

  getFormData() {
    const shiftHoursVal = parseFloat(document.getElementById('input-shift-hours')?.value) || 8.5;
    const operatorName = document.getElementById('input-operator-name')?.value?.trim() || '';
    const logDate = document.getElementById('input-log-date')?.value || new Date().toISOString().split('T')[0];
    const shift = document.getElementById('input-shift')?.value || 'Shift A';

    const data = {
      machine_code: this.currentMachine?.code || 'CNC-DX200-1',
      machine_name: this.currentMachine?.name || 'CNC DX 200-1',
      log_date: logDate,
      shift: shift,
      shift_hours: shiftHoursVal,
      operator_name: operatorName,

      part1_name: document.getElementById('part1_name')?.value?.trim() || '',
      part1_cycle_time: parseFloat(document.getElementById('part1_cycle_time')?.value) || 0,
      part1_qty: parseInt(document.getElementById('part1_qty')?.value, 10) || 0,

      part2_name: document.getElementById('part2_name')?.value?.trim() || '',
      part2_cycle_time: parseFloat(document.getElementById('part2_cycle_time')?.value) || 0,
      part2_qty: parseInt(document.getElementById('part2_qty')?.value, 10) || 0,

      part3_name: document.getElementById('part3_name')?.value?.trim() || '',
      part3_cycle_time: parseFloat(document.getElementById('part3_cycle_time')?.value) || 0,
      part3_qty: parseInt(document.getElementById('part3_qty')?.value, 10) || 0,

      rejected_qty: parseInt(document.getElementById('input-rejected-qty')?.value, 10) || 0,
      remarks: document.getElementById('input-remarks')?.value?.trim() || ''
    };

    LOSS_DEFINITIONS.forEach(loss => {
      const input = document.getElementById(loss.key);
      data[loss.key] = input ? (parseInt(input.value, 10) || 0) : 0;
    });

    return data;
  }

  // Clear Form Data Method
  clearEnteredData() {
    // Clear parts
    ['part1_name', 'part2_name', 'part3_name'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['part1_cycle_time', 'part2_cycle_time', 'part3_cycle_time'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    ['part1_qty', 'part2_qty', 'part3_qty', 'input-rejected-qty'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 0;
    });

    // Clear all 13 losses
    LOSS_DEFINITIONS.forEach(loss => {
      const input = document.getElementById(loss.key);
      if (input) input.value = 0;
      this.updateLossCardBadge(loss.key, 0);
    });

    // Clear remarks
    const rem = document.getElementById('input-remarks');
    if (rem) rem.value = '';

    this.recalculateFormOEE();
    this.showToast('All entered production & loss data cleared.', 'info');
  }

  // =========================================================================
  // PAGE 3: OEE & LOSS ANALYTICS DASHBOARD
  // =========================================================================
  inspectMachineInDashboard(machineCode) {
    this.dashboardFilter.machineCode = machineCode;
    this.switchView('view-dashboard');
  }

  renderExecutiveDashboard() {
    const { horizon, interval, machineCode } = this.dashboardFilter;

    // Update active machine label
    const labelEl = document.getElementById('dash-inspecting-label');
    if (labelEl) {
      if (machineCode === 'ALL') {
        labelEl.textContent = 'Inspecting: Entire Machining Cell (11 Machines)';
      } else {
        const found = MACHINES.find(m => m.code === machineCode);
        labelEl.textContent = `Inspecting: ${found ? found.name : machineCode}`;
      }
    }

    // Update machine pills
    document.querySelectorAll('#dash-machine-pills .machine-pill-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-filter-code') === machineCode);
    });

    // Update horizon buttons
    document.querySelectorAll('.period-tabs-group .period-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-horizon') === horizon);
    });

    // Filter entries
    const allEntries = historyMgr.entries || [];
    const todayStr = new Date().toISOString().split('T')[0];

    let filtered = allEntries.filter(e => {
      if (machineCode !== 'ALL' && e.machine_code !== machineCode) return false;
      if (interval !== 'ALL_SHIFTS' && e.shift !== interval) return false;

      if (horizon === 'today' && e.log_date !== todayStr) return false;
      if (horizon === 'week') {
        const d = new Date(e.log_date);
        const w = new Date();
        w.setDate(w.getDate() - 7);
        if (d < w) return false;
      }
      return true;
    });

    // Calculate metrics
    let totalPlanned = 0;
    let totalLosses = 0;
    let totalOperating = 0;
    let totalIdealRun = 0;
    let totalProduced = 0;
    let totalGood = 0;
    let totalRej = 0;

    let lossBreakdownMins = 0;
    let lossSetupMins = 0;
    let lossWaitingMins = 0;

    if (filtered.length > 0) {
      filtered.forEach(e => {
        totalPlanned += (e.planned_time_mins || 465);
        totalLosses += (e.total_losses_mins || 0);
        totalOperating += (e.operating_time_mins || 0);
        totalIdealRun += (parseFloat(e.ideal_run_time_mins) || 0);
        totalProduced += (e.total_qty || 0);
        totalGood += (e.good_qty || 0);
        totalRej += (e.rejected_qty || 0);

        lossBreakdownMins += (e.loss_breakdown || 0);
        lossSetupMins += (e.loss_setup || 0);
        lossWaitingMins += ((e.loss_no_plan || 0) + (e.loss_no_material || 0) + (e.loss_no_operator || 0));
      });
    } else {
      totalPlanned = 0;
      totalOperating = 0;
      totalLosses = 0;
      totalIdealRun = 0;
      totalProduced = 0;
      totalGood = 0;
      totalRej = 0;
      lossBreakdownMins = 0;
      lossSetupMins = 0;
      lossWaitingMins = 0;
    }

    const availRate = totalPlanned > 0 ? Math.min(100, Math.max(0, (totalOperating / totalPlanned) * 100)) : 0;
    const perfRate = totalOperating > 0 ? Math.min(100, Math.max(0, (totalIdealRun / totalOperating) * 100)) : 0;
    const qualRate = totalProduced > 0 ? Math.min(100, Math.max(0, (totalGood / totalProduced) * 100)) : 0;
    const oeeRate = (availRate * perfRate * qualRate) / 10000;

    // Cockpit Gauge Card
    const oeeNumEl = document.getElementById('dash-oee-num');
    const gaugeFill = document.getElementById('dash-gauge-fill');
    const ratingBadge = document.getElementById('dash-rating-badge');
    const statusMarker = document.getElementById('dash-status-marker');

    if (oeeNumEl) oeeNumEl.textContent = oeeRate.toFixed(1);
    if (gaugeFill) {
      const radius = 56;
      const circ = 2 * Math.PI * radius;
      const offset = circ - (Math.min(100, oeeRate) / 100) * circ;
      gaugeFill.style.strokeDasharray = `${circ}`;
      gaugeFill.style.strokeDashoffset = `${offset}`;

      if (filtered.length === 0) {
        gaugeFill.style.stroke = '#374151';
        if (ratingBadge) {
          ratingBadge.textContent = 'No Records Logged';
          ratingBadge.style.color = 'var(--text-muted)';
        }
        if (statusMarker) statusMarker.textContent = '● Awaiting Supabase Records';
      } else if (oeeRate >= 85) {
        gaugeFill.style.stroke = '#10B981';
        if (ratingBadge) {
          ratingBadge.textContent = 'World-Class';
          ratingBadge.style.color = 'var(--emerald-400)';
        }
        if (statusMarker) statusMarker.textContent = '● Above Target';
      } else if (oeeRate >= 70) {
        gaugeFill.style.stroke = '#06B6D4';
        if (ratingBadge) {
          ratingBadge.textContent = 'Optimal';
          ratingBadge.style.color = 'var(--cyan-400)';
        }
        if (statusMarker) statusMarker.textContent = '● On Target';
      } else {
        gaugeFill.style.stroke = '#F59E0B';
        if (ratingBadge) {
          ratingBadge.textContent = 'Attention Needed';
          ratingBadge.style.color = 'var(--amber-400)';
        }
        if (statusMarker) statusMarker.textContent = '▲ Review Stoppages';
      }
    }

    // 3 Core Pillars
    const aNum = document.getElementById('dash-avail-num');
    const aBar = document.getElementById('dash-avail-bar');
    const aPlanned = document.getElementById('dash-avail-planned');
    const aLoss = document.getElementById('dash-avail-losses');

    if (aNum) aNum.textContent = `${availRate.toFixed(1)}%`;
    if (aBar) aBar.style.width = `${Math.min(100, availRate)}%`;
    if (aPlanned) aPlanned.textContent = `${totalPlanned}m`;
    if (aLoss) aLoss.textContent = `${totalLosses}m`;

    const pNum = document.getElementById('dash-perf-num');
    const pBar = document.getElementById('dash-perf-bar');
    const pIdeal = document.getElementById('dash-perf-ideal');
    const pOper = document.getElementById('dash-perf-operating');

    if (pNum) pNum.textContent = `${perfRate.toFixed(1)}%`;
    if (pBar) pBar.style.width = `${Math.min(100, perfRate)}%`;
    if (pIdeal) pIdeal.textContent = `${Math.round(totalIdealRun)}m`;
    if (pOper) pOper.textContent = `${totalOperating}m`;

    const qNum = document.getElementById('dash-qual-num');
    const qBar = document.getElementById('dash-qual-bar');
    const qGood = document.getElementById('dash-qual-good');
    const qRej = document.getElementById('dash-qual-rej');

    if (qNum) qNum.textContent = `${qualRate.toFixed(1)}%`;
    if (qBar) qBar.style.width = `${Math.min(100, qualRate)}%`;
    if (qGood) qGood.textContent = totalGood;
    if (qRej) qRej.textContent = totalRej;

    // Deep-Dive Ribbon
    const rBreak = document.getElementById('ribbon-breakdown');
    const rSetup = document.getElementById('ribbon-setup');
    const rWait = document.getElementById('ribbon-waiting');
    const rProd = document.getElementById('ribbon-produced-qty');

    if (rBreak) rBreak.textContent = `${lossBreakdownMins}m`;
    if (rSetup) rSetup.textContent = `${lossSetupMins}m`;
    if (rWait) rWait.textContent = `${lossWaitingMins}m`;
    if (rProd) rProd.textContent = totalGood;

    this.renderMachineComparisonMatrix(allEntries);
    this.renderRootCauseTable(filtered);
  }

  renderMachineComparisonMatrix(allEntries) {
    const tbody = document.getElementById('dash-matrix-tbody');
    if (!tbody) return;

    tbody.innerHTML = MACHINES.map(m => {
      const mEntries = allEntries.filter(e => e.machine_code === m.code);
      const isFocused = this.dashboardFilter.machineCode === m.code;

      let produced = 0;
      let operating = 0;
      let losses = 0;
      let oee = 0;
      let avail = 0;
      let perf = 0;
      let qual = 0;
      let statusHtml = '<span class="status-badge-inactive">● Idle / Ready</span>';
      let prodBadge = '<span class="productivity-badge prod-zero">0 pcs</span>';

      if (mEntries.length > 0) {
        const latest = mEntries[0];
        produced = latest.good_qty || latest.total_qty || 0;
        losses = latest.total_losses_mins || 0;
        operating = latest.operating_time_mins || (465 - losses);
        oee = parseFloat(latest.oee_rate) || 0;
        avail = parseFloat(latest.availability_rate) || 0;
        perf = parseFloat(latest.performance_rate) || 0;
        qual = parseFloat(latest.quality_rate) || 100;

        if (oee >= 80) {
          statusHtml = '<span class="status-badge-optimal">● Optimal</span>';
          prodBadge = `<span class="productivity-badge prod-high">${produced} pcs</span>`;
        } else if (oee >= 60) {
          statusHtml = '<span class="status-badge-normal">● Normal</span>';
          prodBadge = `<span class="productivity-badge">${produced} pcs</span>`;
        } else {
          statusHtml = '<span class="status-badge-warning">▲ Downtime</span>';
          prodBadge = `<span class="productivity-badge">${produced} pcs</span>`;
        }
      }

      return `
        <tr class="${isFocused ? 'row-focused' : ''}">
          <td>
            <strong style="color:var(--text-primary); font-size:0.9rem;">${m.name}</strong>
            <div style="font-family:var(--font-mono); font-size:0.72rem; color:var(--text-muted);">${m.code}</div>
          </td>
          <td><span class="category-badge category-${m.category.toLowerCase()}">${m.category}</span></td>
          <td>${statusHtml}</td>
          <td>${prodBadge}</td>
          <td style="font-family:var(--font-mono); font-weight:600;">${operating > 0 ? operating + 'm' : '--'}</td>
          <td style="font-family:var(--font-mono); color:var(--rose-400); font-weight:600;">${losses > 0 ? losses + 'm' : '--'}</td>
          <td style="font-family:var(--font-mono);">${avail > 0 ? avail + '%' : '--'}</td>
          <td style="font-family:var(--font-mono);">${perf > 0 ? perf + '%' : '--'}</td>
          <td style="font-family:var(--font-mono);">${qual > 0 ? qual + '%' : '--'}</td>
          <td>
            <strong style="font-family:var(--font-mono); color:${oee >= 75 ? 'var(--cyan-400)' : (oee > 0 ? 'var(--amber-400)' : 'var(--text-muted)')}; font-size:0.95rem;">
              ${oee > 0 ? oee + '%' : '--'}
            </strong>
          </td>
          <td>
            <button type="button" class="btn-inspect-machine" data-matrix-code="${m.code}">
              Inspect
            </button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-inspect-machine').forEach(btn => {
      btn.addEventListener('click', () => {
        const code = btn.getAttribute('data-matrix-code');
        this.dashboardFilter.machineCode = code;
        this.renderExecutiveDashboard();
      });
    });
  }

  renderRootCauseTable(entries) {
    const tbody = document.getElementById('dash-root-cause-tbody');
    if (!tbody) return;

    if (!entries.length) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align:center; padding:2rem; color:var(--text-muted);">
            No loss occurrences recorded for this interval. Submit entries via the Log Production tab to populate this telemetry.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = entries.slice(0, 10).map(e => {
      let maxLossKey = 'loss_breakdown';
      let maxLossVal = 0;

      LOSS_DEFINITIONS.forEach(def => {
        const v = e[def.key] || 0;
        if (v > maxLossVal) {
          maxLossVal = v;
          maxLossKey = def.key;
        }
      });

      const maxLossDef = LOSS_DEFINITIONS.find(d => d.key === maxLossKey) || LOSS_DEFINITIONS[0];

      return `
        <tr>
          <td>
            <strong>${e.log_date}</strong>
            <div style="font-size:0.75rem; color:var(--text-muted);">${e.shift}</div>
          </td>
          <td>
            <strong>${e.machine_name || e.machine_code}</strong>
          </td>
          <td>
            <span class="loss-pill-badge">${maxLossDef.label}</span>
          </td>
          <td>
            <span class="why-category-badge">${maxLossVal > 30 ? 'High Impact' : 'Minor Loss'}</span>
          </td>
          <td style="font-family:var(--font-mono); font-weight:700; color:var(--rose-400);">
            <div class="loss-impact-bar-wrap">
              <div class="loss-impact-bar-fill" style="width:${Math.min(100, (maxLossVal / 60) * 100)}%;"></div>
            </div>
            ${maxLossVal} mins
          </td>
          <td>
            <span class="remarks-text">${e.remarks || 'Standard production cycle. Tool offsets and 5S clean routine.'}</span>
            <div style="font-size:0.72rem; color:var(--text-muted); margin-top:2px;">Operator: ${e.operator_name || 'N/A'}</div>
          </td>
        </tr>
      `;
    }).join('');
  }

  // =========================================================================
  // SETUP EVENT LISTENERS (OPERATOR PRESETS, STEPPERS & CLEAR DATA)
  // =========================================================================
  setupEventListeners() {
    // Brand Click -> Page 1
    const navBrand = document.getElementById('nav-brand-home');
    if (navBrand) {
      navBrand.addEventListener('click', () => this.switchView('view-landing'));
    }

    // Back to Fleet Button in Page 2
    const backFleetBtn = document.getElementById('btn-back-fleet');
    if (backFleetBtn) {
      backFleetBtn.addEventListener('click', () => this.switchView('view-landing'));
    }

    // Quick Switcher Dropdown in Page 2
    const quickSwitcher = document.getElementById('fillup-machine-select');
    if (quickSwitcher) {
      quickSwitcher.addEventListener('change', (e) => {
        this.selectMachineForEntry(e.target.value);
      });
    }

    // Top Navigation Tabs
    const btnP1 = document.getElementById('nav-btn-page1');
    const btnP2 = document.getElementById('nav-btn-page2');
    const btnP3 = document.getElementById('nav-btn-page3');

    if (btnP1) btnP1.addEventListener('click', () => this.switchView('view-landing'));
    if (btnP2) btnP2.addEventListener('click', () => this.switchView('view-form'));
    if (btnP3) btnP3.addEventListener('click', () => this.switchView('view-dashboard'));

    // Cycle Time Presets
    document.querySelectorAll('[data-preset]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-preset');
        const input = document.getElementById(targetId);
        if (input) {
          input.value = btn.getAttribute('data-val');
          this.recalculateFormOEE();
        }
      });
    });

    // Quantity Stepper Buttons
    document.querySelectorAll('[data-step]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-step');
        const amount = parseInt(btn.getAttribute('data-amount'), 10);
        const input = document.getElementById(targetId);
        if (input) {
          const cur = parseInt(input.value, 10) || 0;
          input.value = Math.max(0, cur + amount);
          this.recalculateFormOEE();
        }
      });
    });

    // Quantity Zero Buttons
    document.querySelectorAll('[data-zero]').forEach(btn => {
      btn.addEventListener('click', () => {
        const targetId = btn.getAttribute('data-zero');
        const input = document.getElementById(targetId);
        if (input) {
          input.value = 0;
          this.recalculateFormOEE();
        }
      });
    });

    // Zero All 13 Losses Button
    const btnZeroLosses = document.getElementById('btn-zero-all-losses');
    if (btnZeroLosses) {
      btnZeroLosses.addEventListener('click', () => {
        LOSS_DEFINITIONS.forEach(loss => {
          const input = document.getElementById(loss.key);
          if (input) input.value = 0;
          this.updateLossCardBadge(loss.key, 0);
        });
        this.recalculateFormOEE();
        this.showToast('All 13 loss categories reset to 0.', 'info');
      });
    }

    // Prominent "Clear Data" Buttons
    const btnClearTop = document.getElementById('btn-clear-top');
    const btnClearBottom = document.getElementById('btn-reset-form-bottom');
    const handleClearData = () => {
      if (confirm('Clear all entered production quantities and loss minutes?')) {
        this.clearEnteredData();
      }
    };
    if (btnClearTop) btnClearTop.addEventListener('click', handleClearData);
    if (btnClearBottom) btnClearBottom.addEventListener('click', handleClearData);

    // Shift Selector Change
    const shiftSelect = document.getElementById('input-shift');
    const hrsSelect = document.getElementById('input-shift-hours');
    if (shiftSelect && hrsSelect) {
      shiftSelect.addEventListener('change', (e) => {
        if (e.target.value === 'Shift C') {
          hrsSelect.value = '7.0';
        } else {
          hrsSelect.value = '8.5';
        }
        this.recalculateFormOEE();
      });
    }

    // Form inputs change -> live recalculation
    const form = document.getElementById('production-form');
    if (form) {
      form.addEventListener('input', () => this.recalculateFormOEE());
      form.addEventListener('change', () => this.recalculateFormOEE());
      form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }

    // Executive Dashboard Controls
    document.querySelectorAll('.period-tabs-group .period-tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dashboardFilter.horizon = btn.getAttribute('data-horizon');
        this.renderExecutiveDashboard();
      });
    });

    const intervalSelect = document.getElementById('dash-interval-select');
    if (intervalSelect) {
      intervalSelect.addEventListener('change', (e) => {
        this.dashboardFilter.interval = e.target.value;
        this.renderExecutiveDashboard();
      });
    }

    document.querySelectorAll('#dash-machine-pills .machine-pill-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this.dashboardFilter.machineCode = btn.getAttribute('data-filter-code');
        this.renderExecutiveDashboard();
      });
    });

    const dashRefresh = document.getElementById('dash-btn-refresh');
    if (dashRefresh) {
      dashRefresh.addEventListener('click', async () => {
        await historyMgr.loadEntries();
        this.renderExecutiveDashboard();
        this.showToast('Telemetry refreshed from database.', 'success');
      });
    }

    const dashExport = document.getElementById('dash-btn-export');
    if (dashExport) {
      dashExport.addEventListener('click', () => historyMgr.exportToCSV());
    }

    // History Modal Open/Close
    const btnOpenHist = document.getElementById('btn-open-history');
    const overlayHist = document.getElementById('drawer-history-overlay');
    const btnCloseHist = document.getElementById('btn-close-history');

    const openHistory = () => {
      this.refreshHistoryDrawer();
      overlayHist.classList.add('active');
    };
    const closeHistory = () => overlayHist.classList.remove('active');

    if (btnOpenHist) btnOpenHist.addEventListener('click', openHistory);
    if (btnCloseHist) btnCloseHist.addEventListener('click', closeHistory);
    if (overlayHist) {
      overlayHist.addEventListener('click', (e) => {
        if (e.target === overlayHist) closeHistory();
      });
    }

    // History Filters
    const fMach = document.getElementById('filter-history-machine');
    const fShift = document.getElementById('filter-history-shift');
    const fDate = document.getElementById('filter-history-date');
    const fSearch = document.getElementById('filter-history-search');

    const onFilterChange = () => {
      historyMgr.filterEntries({
        machineCode: fMach.value,
        shift: fShift.value,
        dateRange: fDate.value,
        search: fSearch.value
      });
      this.renderHistoryList();
    };

    if (fMach) fMach.addEventListener('change', onFilterChange);
    if (fShift) fShift.addEventListener('change', onFilterChange);
    if (fDate) fDate.addEventListener('change', onFilterChange);
    if (fSearch) fSearch.addEventListener('input', onFilterChange);

    // Export CSV
    const exportBtn = document.getElementById('btn-export-csv');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => historyMgr.exportToCSV());
    }

    // Supabase Settings Modal Openers
    const dbPill = document.getElementById('db-status-pill');
    const btnFormConnect = document.getElementById('btn-form-connect-db');
    const modalSettings = document.getElementById('modal-settings');
    const btnCloseSettings = document.getElementById('btn-close-settings');
    const btnSaveSettings = document.getElementById('btn-save-settings');
    const btnTestConn = document.getElementById('btn-test-connection');

    const openSettings = () => {
      const cfg = db.getConfig();
      document.getElementById('config-supabase-url').value = cfg.url || '';
      document.getElementById('config-supabase-key').value = cfg.anonKey || '';
      modalSettings.classList.remove('hidden');
    };
    const closeSettings = () => modalSettings.classList.add('hidden');

    if (dbPill) dbPill.addEventListener('click', openSettings);
    if (btnFormConnect) btnFormConnect.addEventListener('click', openSettings);
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeSettings);
    if (modalSettings) {
      modalSettings.addEventListener('click', (e) => {
        if (e.target === modalSettings) closeSettings();
      });
    }

    if (btnSaveSettings) {
      btnSaveSettings.addEventListener('click', async () => {
        const url = document.getElementById('config-supabase-url').value.trim();
        const key = document.getElementById('config-supabase-key').value.trim();
        db.configure(url, key, true);
        this.updateDbStatusPill();
        this.showToast('Supabase configuration saved!', 'success');
        closeSettings();
        await historyMgr.loadEntries();
        this.renderExecutiveDashboard();
      });
    }

    if (btnTestConn) {
      btnTestConn.addEventListener('click', async () => {
        const feedback = document.getElementById('settings-status-feedback');
        feedback.style.display = 'block';
        feedback.textContent = 'Testing connection to Supabase...';
        feedback.style.color = 'var(--cyan-400)';
        feedback.style.background = 'rgba(6, 182, 212, 0.1)';

        const url = document.getElementById('config-supabase-url').value.trim();
        const key = document.getElementById('config-supabase-key').value.trim();
        db.configure(url, key, false);
        const result = await db.testConnection();

        if (result.success) {
          feedback.textContent = '🟢 ' + result.message;
          feedback.style.color = 'var(--emerald-400)';
          feedback.style.background = 'rgba(16, 185, 129, 0.12)';
        } else {
          feedback.textContent = '🟠 ' + result.message;
          feedback.style.color = 'var(--amber-400)';
          feedback.style.background = 'rgba(245, 158, 11, 0.12)';
        }
      });
    }

    const btnClearLocalDb = document.getElementById('btn-clear-local-db');
    if (btnClearLocalDb) {
      btnClearLocalDb.addEventListener('click', async () => {
        if (confirm('Clear all locally saved records and start with 0 data?')) {
          db.clearLocalEntries();
          await historyMgr.loadEntries();
          this.renderExecutiveDashboard();
          this.showToast('All local entries cleared. Telemetry reset to 0.', 'info');
        }
      });
    }
  }

  // Form Submission
  async handleFormSubmit(e) {
    e.preventDefault();

    const formData = this.getFormData();
    if (!formData.operator_name) {
      alert('Please select or enter the Operator Name before saving.');
      document.getElementById('input-operator-name')?.focus();
      return;
    }

    const calculated = calculateOEE(formData);

    const entryPayload = {
      machine_code: formData.machine_code,
      machine_name: formData.machine_name,
      log_date: formData.log_date,
      shift: formData.shift,
      shift_hours: formData.shift_hours,
      operator_name: formData.operator_name,

      part1_name: formData.part1_name,
      part1_cycle_time: formData.part1_cycle_time,
      part1_qty: formData.part1_qty,

      part2_name: formData.part2_name,
      part2_cycle_time: formData.part2_cycle_time,
      part2_qty: formData.part2_qty,

      part3_name: formData.part3_name,
      part3_cycle_time: formData.part3_cycle_time,
      part3_qty: formData.part3_qty,

      total_qty: calculated.total_qty,
      rejected_qty: calculated.rejected_qty,
      good_qty: calculated.good_qty,

      loss_breakdown: formData.loss_breakdown,
      loss_no_plan: formData.loss_no_plan,
      loss_no_material: formData.loss_no_material,
      loss_no_operator: formData.loss_no_operator,
      loss_startup: formData.loss_startup,
      loss_setup: formData.loss_setup,
      loss_jig_fixture: formData.loss_jig_fixture,
      loss_programming: formData.loss_programming,
      loss_measurement: formData.loss_measurement,
      loss_document: formData.loss_document,
      loss_speed: formData.loss_speed,
      loss_quality_insp: formData.loss_quality_insp,
      loss_cleaning: formData.loss_cleaning,

      remarks: formData.remarks,

      total_losses_mins: calculated.total_losses_mins,
      planned_time_mins: calculated.planned_time_mins,
      operating_time_mins: calculated.operating_time_mins,
      ideal_run_time_mins: calculated.ideal_run_time_mins,
      availability_rate: calculated.availability_rate,
      performance_rate: calculated.performance_rate,
      quality_rate: calculated.quality_rate,
      oee_rate: calculated.oee_rate
    };

    const submitBtn = document.getElementById('btn-submit-entry');
    const originalText = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span>⏳</span> Saving Record...';

    const saveResult = await db.saveEntry(entryPayload);

    submitBtn.disabled = false;
    submitBtn.innerHTML = originalText;

    if (saveResult.success) {
      this.showToast(saveResult.message, 'success');
      await historyMgr.loadEntries();
      this.renderExecutiveDashboard();

      if (confirm('Entry saved successfully!\n\nWould you like to view the Analytics Dashboard?')) {
        this.switchView('view-dashboard');
      }
    } else {
      this.showToast('Error saving record: ' + saveResult.message, 'error');
    }
  }

  // History Drawer Rendering
  refreshHistoryDrawer() {
    historyMgr.filterEntries({
      machineCode: document.getElementById('filter-history-machine')?.value || 'ALL',
      shift: document.getElementById('filter-history-shift')?.value || 'ALL',
      dateRange: document.getElementById('filter-history-date')?.value || 'all',
      search: document.getElementById('filter-history-search')?.value || ''
    });
    this.renderHistoryList();
  }

  renderHistoryList() {
    const container = document.getElementById('history-entries-list');
    if (!container) return;

    const list = historyMgr.filteredEntries;
    const stats = historyMgr.getSummaryStats();

    document.getElementById('h-total-logs').textContent = stats.totalLogs;
    document.getElementById('h-total-parts').textContent = stats.totalQty;
    document.getElementById('h-avg-oee').textContent = `${stats.avgOee}%`;
    document.getElementById('h-total-loss').textContent = stats.totalLossMins;

    if (!list.length) {
      container.innerHTML = `
        <div class="no-entries-placeholder">
          <div style="font-size:2.5rem; margin-bottom:0.5rem;">📋</div>
          <h4>No production logs found</h4>
          <p style="font-size:0.8rem; color:var(--text-muted); margin-top:0.25rem;">
            Submit an entry for any machine to view it in this history log.
          </p>
        </div>
      `;
      return;
    }

    container.innerHTML = list.map(e => {
      const partsSummary = [];
      if (e.part1_name && e.part1_qty > 0) partsSummary.push(`${e.part1_name} (${e.part1_qty} pcs)`);
      if (e.part2_name && e.part2_qty > 0) partsSummary.push(`${e.part2_name} (${e.part2_qty} pcs)`);
      if (e.part3_name && e.part3_qty > 0) partsSummary.push(`${e.part3_name} (${e.part3_qty} pcs)`);

      return `
        <div class="history-entry-card">
          <div class="entry-card-header">
            <div class="entry-machine-badge">
              <span>⚙️</span>
              <span>${e.machine_name || e.machine_code}</span>
              <span class="entry-shift-pill">${e.shift}</span>
            </div>
            <div class="entry-date-op">
              <span>📅 ${e.log_date}</span> • <span>👤 ${e.operator_name || 'N/A'}</span>
            </div>
          </div>

          <div class="entry-metrics-row">
            <div class="entry-metric-item">
              <span class="entry-metric-label">Total OEE</span>
              <span class="entry-metric-value" style="color:var(--cyan-400);">${e.oee_rate || 0}%</span>
            </div>
            <div class="entry-metric-item">
              <span class="entry-metric-label">Availability</span>
              <span class="entry-metric-value" style="color:var(--emerald-400);">${e.availability_rate || 0}%</span>
            </div>
            <div class="entry-metric-item">
              <span class="entry-metric-label">Performance</span>
              <span class="entry-metric-value" style="color:var(--indigo-400);">${e.performance_rate || 0}%</span>
            </div>
            <div class="entry-metric-item">
              <span class="entry-metric-label">Quality</span>
              <span class="entry-metric-value" style="color:#A855F7;">${e.quality_rate || 0}%</span>
            </div>
          </div>

          ${partsSummary.length > 0 ? `
            <div class="entry-parts-list">
              <strong style="color:var(--text-primary);">Parts Logged:</strong> ${partsSummary.join(' • ')} 
              (Good: <span style="color:var(--emerald-400); font-weight:600;">${e.good_qty || 0}</span>, Rej: <span style="color:var(--rose-400);">${e.rejected_qty || 0}</span>)
            </div>
          ` : ''}

          <div class="entry-losses-summary">
            <span>⏱️ Total Losses: <strong>${e.total_losses_mins || 0} mins</strong></span>
            ${e.remarks ? `<span style="color:var(--text-muted);">| Note: "${e.remarks}"</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  // Supabase Status Pill & In-Form Status Banner
  updateDbStatusPill() {
    const dot = document.getElementById('db-status-dot');
    const text = document.getElementById('db-status-text');
    const formBanner = document.getElementById('form-db-banner');
    const formDot = document.getElementById('form-db-dot');
    const formText = document.getElementById('form-db-text');
    const formConnectBtn = document.getElementById('btn-form-connect-db');
    const dashStream = document.getElementById('dash-stream-label');
    const cfg = db.getConfig();

    if (cfg.isConnected && cfg.url) {
      if (dot) dot.className = 'status-dot';
      if (text) text.textContent = 'Supabase Connected';
      if (dashStream) dashStream.textContent = 'SUPABASE LIVE STREAM';
      
      if (formBanner) {
        formBanner.className = 'db-status-banner connected';
      }
      if (formDot) formDot.className = 'status-dot';
      if (formText) formText.textContent = `🟢 Supabase Database Connected: ${cfg.url} (Auto-syncing to public.production_entries)`;
      if (formConnectBtn) formConnectBtn.textContent = '⚡ Edit DB Settings';
    } else {
      if (dot) dot.className = 'status-dot offline';
      if (text) text.textContent = 'Local Storage';
      if (dashStream) dashStream.textContent = 'LOCAL STORAGE MODE';

      if (formBanner) {
        formBanner.className = 'db-status-banner offline';
      }
      if (formDot) formDot.className = 'status-dot offline';
      if (formText) formText.textContent = '🟠 Database: Local Storage Mode (Entries saved in browser. Click connect to sync with Supabase)';
      if (formConnectBtn) formConnectBtn.textContent = '⚡ Connect Supabase Database';
    }
  }

  // Toast
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type === 'success' ? 'toast-success' : (type === 'error' ? 'toast-error' : '')}`;
    const icon = type === 'success' ? '✅' : (type === 'error' ? '❌' : 'ℹ️');
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.animation = 'toastSlideOut 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1)';
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }
}

// Instantiate on DOM load
window.addEventListener('DOMContentLoaded', () => {
  window.app = new ProductionTrackerApp();
});
