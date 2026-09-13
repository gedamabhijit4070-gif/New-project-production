/**
 * Industrial Production & OEE Tracker - Main Application Controller
 * Handles 3-Page Navigation, 11 Machines, 13-Loss Calculations, Periodic Analytics, and Chart.js
 */

import { MACHINES, LOSS_FIELDS } from './machines.js';
import {
  initStorage,
  getMachines,
  getProductionEntries,
  saveProductionEntry,
  deleteProductionEntry,
  clearAllProductionEntries,
  calculateOEE,
  calculateTimeWeightedOEE,
  getPeriodicAnalytics,
  seedDemoShiftData,
  getSupabaseConfig,
  saveSupabaseConfig,
  testSupabaseConnection,
  isConnectedToSupabase
} from './storage.js';
import { exportEntriesToCSV, exportPeriodicReportToCSV } from './export.js';

// Global Application State
const state = {
  currentView: 'view-machines',
  currentMachine: MACHINES[0],
  dashFilterMachine: 'ALL',
  dashFilterLoss: 'ALL', // 'ALL' or specific loss key
  periodType: 'daily', // 'daily', 'weekly', 'monthly', 'overall'
  periodValue: 'LATEST', // 'LATEST' or specific period key
  chartTrendOee: null,
  chartTrendLosses: null,
  chartLossesPareto: null,
  chartLossesDonut: null,
  lastPeriodicData: null
};

// DOM Cache
const dom = {
  // Navigation
  tabMachines: document.getElementById('tab-machines'),
  tabFillup: document.getElementById('tab-fillup'),
  tabAnalytics: document.getElementById('tab-analytics'),
  viewMachines: document.getElementById('view-machines'),
  viewFillup: document.getElementById('view-fillup'),
  viewAnalytics: document.getElementById('view-analytics'),
  liveClock: document.getElementById('live-clock'),
  shiftName: document.getElementById('shift-name'),
  btnBackToMachines: document.getElementById('btn-back-to-machines'),
  btnCancelEntry: document.getElementById('btn-cancel-entry'),

  // Page 1: Minimalist Machine Grid
  minimalMachinesGrid: document.getElementById('minimal-machines-grid'),

  // Page 2: Production Form Elements
  activeMachineName: document.getElementById('active-machine-name'),
  activeMachineType: document.getElementById('active-machine-type'),
  selectQuickMachine: document.getElementById('select-quick-machine'),
  form: document.getElementById('production-detail-form'),
  inputDate: document.getElementById('input-date'),
  inputShift: document.getElementById('input-shift'),
  inputShiftHours: document.getElementById('input-shift-hours'),
  inputOperator: document.getElementById('input-operator'),

  // Parts
  inputPart1Name: document.getElementById('input-part1-name'),
  inputPart1Cycle: document.getElementById('input-part1-cycle'),
  inputPart1Qty: document.getElementById('input-part1-qty'),
  inputPart2Name: document.getElementById('input-part2-name'),
  inputPart2Cycle: document.getElementById('input-part2-cycle'),
  inputPart2Qty: document.getElementById('input-part2-qty'),
  inputPart3Name: document.getElementById('input-part3-name'),
  inputPart3Cycle: document.getElementById('input-part3-cycle'),
  inputPart3Qty: document.getElementById('input-part3-qty'),
  inputRejectedQty: document.getElementById('input-rejected-qty'),
  inputRemarks: document.getElementById('input-remarks'),

  // Step 3 Downtime Loss Dropdown Quick-Selector
  selectDowntimeLoss: document.getElementById('select-downtime-loss'),
  inputDropdownLossMins: document.getElementById('input-dropdown-loss-mins'),
  btnApplyDropdownLoss: document.getElementById('btn-apply-dropdown-loss'),
  lossDropdownStatus: document.getElementById('loss-dropdown-status'),
  dashFilterLoss: document.getElementById('dash-filter-loss'),

  // Ribbon Calculations
  liveCalcPlannedTime: document.getElementById('live-calc-planned-time'),
  liveCalcTotalLoss: document.getElementById('live-calc-total-loss'),
  liveCalcOperatingTime: document.getElementById('live-calc-operating-time'),
  liveCalcAvailability: document.getElementById('live-calc-availability'),
  liveCalcPerformance: document.getElementById('live-calc-performance'),
  liveCalcQuality: document.getElementById('live-calc-quality'),
  liveCalcOee: document.getElementById('live-calc-oee'),
  liveCalcProductivity: document.getElementById('live-calc-productivity'),

  // Page 3: Periodic Analytics Dashboard Elements
  dashFilterMachine: document.getElementById('dash-filter-machine'),
  btnSeedSample: document.getElementById('btn-seed-sample'),
  btnExportPeriodCsv: document.getElementById('btn-export-period-csv'),
  selectPeriodInterval: document.getElementById('select-period-interval'),
  btnPeriodPrev: document.getElementById('btn-period-prev'),
  btnPeriodNext: document.getElementById('btn-period-next'),
  txtActivePeriod: document.getElementById('txt-active-period'),
  badgeActivePeriodLabel: document.getElementById('badge-active-period-label'),
  labelIntervalPicker: document.getElementById('label-interval-picker'),
  txtActiveTargetTitle: document.getElementById('txt-active-target-title'),
  machineRosterPills: document.getElementById('machine-roster-pills'),
  periodTabsGroup: document.getElementById('period-tabs-group'),
  targetKickerName: document.getElementById('target-kicker-name'),
  targetMainTitle: document.getElementById('target-main-title'),
  targetOeeSub: document.getElementById('target-oee-sub'),
  dashIdealTimeDisplay: document.getElementById('dash-ideal-time-display'),
  matrixPeriodSubtitle: document.getElementById('matrix-period-subtitle'),
  machineMatrixTbody: document.getElementById('machine-matrix-tbody'),
  titleTrendOee: document.getElementById('title-trend-oee'),
  badgeTrendPeriodType: document.getElementById('badge-trend-period-type'),
  titleTrendLosses: document.getElementById('title-trend-losses'),
  titleLossPareto: document.getElementById('title-loss-pareto'),
  titleLossesTable: document.getElementById('title-losses-table'),
  lossesBreakdownTbody: document.getElementById('losses-breakdown-tbody'),
  titlePeriodHistory: document.getElementById('title-period-history'),
  badgeHistoryHorizon: document.getElementById('badge-history-horizon'),
  periodHistoryTbody: document.getElementById('period-history-tbody'),

  dashMetricOee: document.getElementById('dash-metric-oee'),
  dashMetricProductivity: document.getElementById('dash-metric-productivity'),
  oeeRatingBadge: document.getElementById('oee-rating-badge'),
  dashMetricAvail: document.getElementById('dash-metric-avail'),
  dashTotalLosses: document.getElementById('dash-total-losses'),
  dashMetricPerf: document.getElementById('dash-metric-perf'),
  dashTotalOutput: document.getElementById('dash-total-output'),
  dashMetricQual: document.getElementById('dash-metric-qual'),
  dashGoodOutput: document.getElementById('dash-good-output'),
  dashScrapOutput: document.getElementById('dash-scrap-output'),
  rootCauseTbody: document.getElementById('root-cause-tbody'),

  // Global & Modal
  btnGlobalExport: document.getElementById('btn-global-export'),
  btnClearData: document.getElementById('btn-clear-data'),
  btnOpenMobileQr: document.getElementById('btn-open-mobile-qr'),
  modalMobileQr: document.getElementById('modal-mobile-qr'),
  btnCloseQrModal: document.getElementById('btn-close-qr-modal'),
  btnDismissQrModal: document.getElementById('btn-dismiss-qr-modal'),
  btnOpenDbSettings: document.getElementById('btn-open-db-settings'),
  dbStatusDot: document.getElementById('db-status-dot'),
  dbStatusText: document.getElementById('db-status-text'),
  modalSupabase: document.getElementById('modal-supabase'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  cfgSupabaseUrl: document.getElementById('cfg-supabase-url'),
  cfgSupabaseKey: document.getElementById('cfg-supabase-key'),
  btnTestSupabase: document.getElementById('btn-test-supabase'),
  btnSaveSupabase: document.getElementById('btn-save-supabase'),
  btnDisconnectSupabase: document.getElementById('btn-disconnect-supabase'),
  supabaseTestResult: document.getElementById('supabase-test-result'),
  toastContainer: document.getElementById('toast-container')
};

// Initialize Application
async function initApp() {
  try {
    startLiveClock();
    populateMachineSelectors();
    setupEventListeners();
    setDefaultFormValues();
    updateLiveOeeCalculations();
    await renderMinimalMachines();
  } catch (err) {
    console.error('Core UI render failed:', err);
  }

  // Asynchronously initialize storage and cloud connection without blocking UI
  try {
    await initStorage();
    updateSupabaseStatusIndicator();
    // Re-render machine launchpad with cloud records!
    await renderMinimalMachines();
  } catch (err) {
    console.warn('Storage initialization warning:', err);
  }

  // Zero-Click Live Database Auto-Sync (polls every 10s for hands-free monitoring)
  setInterval(async () => {
    if (state.currentView === 'view-analytics') {
      await renderAnalyticsDashboard();
    } else if (state.currentView === 'view-machines') {
      await renderMinimalMachines();
    }
  }, 10000);
}

// Guarantee execution regardless of whether DOMContentLoaded has already dispatched
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

/**
 * Live Clock and Shift Detection
 */
function getCurrentShiftInfo() {
  const hours = new Date().getHours();
  if (hours >= 6 && hours < 14) return { name: 'Shift A', time: '(06:00 - 14:00)' };
  if (hours >= 14 && hours < 22) return { name: 'Shift B', time: '(14:00 - 22:00)' };
  return { name: 'Shift C', time: '(22:00 - 06:00)' };
}

function getCurrentShift() {
  return getCurrentShiftInfo().name;
}

function startLiveClock() {
  const clockEl = document.getElementById('live-clock');
  const dateEl = document.getElementById('live-date');
  const shiftEl = document.getElementById('shift-name');
  const update = () => {
    const now = new Date();
    if (clockEl) clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: false });
    if (dateEl) {
      dateEl.textContent = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    }
    if (shiftEl) {
      const shiftInfo = getCurrentShiftInfo();
      shiftEl.textContent = `${shiftInfo.name} ${shiftInfo.time}`;
    }
  };
  update();
  setInterval(update, 1000);
}

/**
 * Supabase Connection Badge Status
 */
function updateSupabaseStatusIndicator() {
  if (!dom.dbStatusDot || !dom.dbStatusText) return;
  const isConnected = isConnectedToSupabase();
  if (isConnected) {
    dom.dbStatusDot.className = 'status-dot';
    dom.dbStatusText.textContent = 'Supabase: Connected';
    dom.dbStatusText.style.color = 'var(--emerald-400)';
  } else {
    dom.dbStatusDot.className = 'status-dot offline';
    dom.dbStatusText.textContent = 'Supabase: Offline (Click to Link)';
    dom.dbStatusText.style.color = 'var(--text-secondary)';
  }
}

/**
 * 3-Page Tab View Navigation
 */
function switchView(targetViewId) {
  // Update view containers
  [dom.viewMachines, dom.viewFillup, dom.viewAnalytics].forEach(view => {
    if (!view) return;
    if (view.id === targetViewId) {
      view.classList.remove('hidden');
    } else {
      view.classList.add('hidden');
    }
  });

  // Sync active class on the 3 top nav tabs: Machines, Production Data, Dashboard
  const navTabs = document.querySelectorAll('.nav-tab-btn');
  navTabs.forEach(tab => {
    if (tab.dataset.target === targetViewId) {
      tab.classList.add('active');
    } else {
      tab.classList.remove('active');
    }
  });

  const btnTopLogs = document.getElementById('btn-top-logs');
  const btnTopLogsText = document.getElementById('btn-top-logs-text');
  if (btnTopLogs) {
    if (targetViewId === 'view-analytics') {
      btnTopLogs.classList.add('active');
      if (btnTopLogsText) btnTopLogsText.textContent = '🏭 Machines Roster';
    } else {
      btnTopLogs.classList.remove('active');
      if (btnTopLogsText) btnTopLogsText.textContent = 'OEE Dashboard';
    }
  }

  state.currentView = targetViewId;
  window.scrollTo({ top: 0, behavior: 'smooth' });

  updateEnteredRecordsBadge();

  // If navigating to analytics dashboard, render Chart.js graphs
  if (targetViewId === 'view-analytics') {
    renderAnalyticsDashboard();
  }
}

function formatCardMachineName(name) {
  const map = {
    'CNC DX 200-1': 'CNC DX<br>200-1',
    'CNC 200-2': 'CNC<br>200-2',
    'CNC DX 250': 'CNC DX<br>250',
    'CNC DX12B': 'CNC<br>DX12B',
    'VMC 1050': 'VMC<br>1050',
    'VMC 1880': 'VMC<br>1880',
    'VMC 850': 'VMC 850',
    'VMC HAAS': 'VMC<br>HAAS',
    'VMC PX 20': 'VMC PX<br>20',
    'HMC 1': 'HMC 1',
    'HMC 2': 'HMC 2'
  };
  return map[name] || name;
}

/**
 * PAGE 1: Render 11 Clean Machine Name Cards Grid Matching UI Screenshot
 */
async function renderMinimalMachines() {
  const container = dom.minimalMachinesGrid || document.getElementById('minimal-machines-grid');
  if (!container) return;

  container.innerHTML = '';

  MACHINES.forEach(machine => {
    const card = document.createElement('div');
    card.className = `minimal-machine-card card-${machine.category.toLowerCase()}`;
    card.dataset.code = machine.code;

    card.innerHTML = `
      <div class="card-name-wrap">
        <span class="card-machine-type">${machine.category} CENTER</span>
        <h3 class="card-machine-name">${formatCardMachineName(machine.name)}</h3>
      </div>
      <div class="card-action-links">
        <button type="button" class="btn-card-analyze" data-code="${machine.code}" title="Analyze Daily, Weekly, Monthly OEE & Losses">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
          </svg>
          <span>Analyze</span>
        </button>
        <div class="card-launch-icon" title="Log Production Shift">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="5" y1="12" x2="19" y2="12"></line>
            <polyline points="12 5 19 12 12 19"></polyline>
          </svg>
        </div>
      </div>
    `;

    card.addEventListener('click', (e) => {
      const btnAnalyze = e.target.closest('.btn-card-analyze');
      if (btnAnalyze) {
        e.stopPropagation();
        selectMachine(machine.code);
        switchView('view-analytics');
        return;
      }
      openMachineFillup(machine.code);
    });

    container.appendChild(card);
  });
}

/**
 * Populate machine dropdowns on Page 2 and Page 3
 */
function populateMachineSelectors() {
  // Quick Switcher on Page 2
  dom.selectQuickMachine.innerHTML = '';
  MACHINES.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.code;
    opt.textContent = `${m.name} (${m.category})`;
    dom.selectQuickMachine.appendChild(opt);
  });

  // Filter on Page 3
  dom.dashFilterMachine.innerHTML = '<option value="ALL">All 11 Machines (Combined Plant)</option>';
  MACHINES.forEach(m => {
    const opt = document.createElement('option');
    opt.value = m.code;
    opt.textContent = m.name;
    dom.dashFilterMachine.appendChild(opt);
  });
}

/**
 * Fast Machine Selection Helper
 */
function selectMachine(code) {
  state.dashFilterMachine = code;
  if (dom.dashFilterMachine) {
    dom.dashFilterMachine.value = code;
  }
  renderAnalyticsDashboard();
}

/**
 * PAGE 3: Render Comprehensive Periodic OEE & 13-Loss Analytics Dashboard
 */
async function renderAnalyticsDashboard() {
  const data = await getPeriodicAnalytics({
    machineCode: state.dashFilterMachine,
    periodType: state.periodType,
    periodValue: state.periodValue
  });

  state.lastPeriodicData = data;

  // 1. Sync Horizon Tabs
  if (dom.periodTabsGroup) {
    dom.periodTabsGroup.querySelectorAll('.period-tab-btn').forEach(btn => {
      if (btn.dataset.period === state.periodType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // 2. Sync Dynamic Interval Picker Dropdown
  if (dom.selectPeriodInterval) {
    dom.selectPeriodInterval.innerHTML = '';
    let intervalOptions = [];
    let pickerLabel = 'SELECT SPECIFIC DAY';

    if (state.periodType === 'daily') {
      pickerLabel = 'SELECT SPECIFIC DAY';
      intervalOptions = [
        { key: 'ALL', label: 'All Recorded Days Combined' },
        ...data.availableDays
      ];
    } else if (state.periodType === 'weekly') {
      pickerLabel = 'SELECT ISO WEEK';
      intervalOptions = [
        { key: 'ALL', label: 'All Recorded Weeks Combined' },
        ...data.availableWeeks
      ];
    } else if (state.periodType === 'monthly') {
      pickerLabel = 'SELECT MONTH';
      intervalOptions = [
        { key: 'ALL', label: 'All Recorded Months Combined' },
        ...data.availableMonths
      ];
    } else {
      pickerLabel = 'OVERALL HORIZON';
      intervalOptions = [
        { key: 'ALL', label: 'All-Time Record Overview' }
      ];
    }

    if (dom.labelIntervalPicker) {
      dom.labelIntervalPicker.textContent = pickerLabel;
    }

    intervalOptions.forEach(opt => {
      const elOpt = document.createElement('option');
      elOpt.value = opt.key;
      elOpt.textContent = opt.label;
      if (opt.key === data.activePeriodValue) {
        elOpt.selected = true;
      }
      dom.selectPeriodInterval.appendChild(elOpt);
    });

    if (dom.txtActivePeriod) {
      dom.txtActivePeriod.textContent = data.activePeriodLabel;
    }
  }

  // 3. Sync Machine Roster Quick-Pills
  if (dom.machineRosterPills) {
    dom.machineRosterPills.querySelectorAll('.machine-pill-btn').forEach(btn => {
      if (btn.dataset.machineCode === state.dashFilterMachine) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  if (dom.txtActiveTargetTitle) {
    dom.txtActiveTargetTitle.textContent = `Currently Inspecting: ${data.selectedMachine.name} • ${data.activePeriodLabel}`;
  }

  // 4. Update Cockpit Titles and Metrics
  if (dom.targetKickerName) {
    dom.targetKickerName.textContent = `${data.selectedMachine.name} • ${data.periodType.toUpperCase()} ANALYSIS`;
  }
  if (dom.targetMainTitle) {
    dom.targetMainTitle.textContent = `${data.selectedMachine.name} (${data.activePeriodLabel})`;
  }
  if (dom.targetOeeSub) {
    dom.targetOeeSub.textContent = `${data.selectedMachine.name} OEE Score`;
  }

  dom.dashMetricOee.textContent = data.summary.oeeRate;
  if (dom.dashMetricProductivity) {
    dom.dashMetricProductivity.textContent = data.summary.productivityRate;
  }
  dom.dashMetricAvail.textContent = data.summary.availabilityRate;
  dom.dashMetricPerf.textContent = data.summary.performanceRate;
  dom.dashMetricQual.textContent = data.summary.qualityRate;

  dom.dashTotalLosses.textContent = `${data.summary.totalLossesMins.toLocaleString()}m`;
  dom.dashTotalOutput.textContent = `${data.summary.totalQty.toLocaleString()} pcs`;
  dom.dashGoodOutput.textContent = `${data.summary.goodQty.toLocaleString()} pcs`;
  dom.dashScrapOutput.textContent = `${data.summary.rejectedQty.toLocaleString()} pcs`;

  const elOpTimeDisplay = document.getElementById('dash-op-time-display');
  if (elOpTimeDisplay) elOpTimeDisplay.textContent = `${data.summary.operatingTimeMins.toLocaleString()}m`;

  const elIdealTimeDisplay = document.getElementById('dash-ideal-time-display');
  if (elIdealTimeDisplay) elIdealTimeDisplay.textContent = `${Math.round(data.summary.idealRunTimeMins).toLocaleString()}m`;

  // OEE Rating Badge & Status
  const oeeNum = Number(data.summary.oeeRate) || 0;
  const isZeroState = (data.summary.totalQty === 0 && data.summary.totalLossesMins === 0);

  if (isZeroState) {
    dom.oeeRatingBadge.textContent = 'Ready for Shift Data';
    dom.oeeRatingBadge.style.color = 'var(--text-secondary)';
    dom.oeeRatingBadge.style.background = 'rgba(255, 255, 255, 0.06)';
  } else if (oeeNum >= 85) {
    dom.oeeRatingBadge.textContent = 'World Class (≥ 85%)';
    dom.oeeRatingBadge.style.color = 'var(--emerald-400)';
    dom.oeeRatingBadge.style.background = 'rgba(16, 185, 129, 0.15)';
  } else if (oeeNum >= 70) {
    dom.oeeRatingBadge.textContent = 'Acceptable (≥ 70%)';
    dom.oeeRatingBadge.style.color = 'var(--cyan-400)';
    dom.oeeRatingBadge.style.background = 'rgba(6, 182, 212, 0.15)';
  } else {
    dom.oeeRatingBadge.textContent = 'Needs Improvement (< 70%)';
    dom.oeeRatingBadge.style.color = 'var(--rose-400)';
    dom.oeeRatingBadge.style.background = 'rgba(244, 63, 94, 0.15)';
  }

  // Radial Ring SVG
  const radialRing = document.getElementById('oee-radial-ring');
  if (radialRing) {
    const circumference = 351.86;
    const pct = isZeroState ? 0 : Math.min(100, Math.max(0, oeeNum));
    const offset = circumference * (1 - pct / 100);
    radialRing.style.strokeDashoffset = offset;
    radialRing.style.stroke = isZeroState ? 'var(--border-subtle)' : (pct >= 85 ? 'var(--emerald-400)' : pct >= 70 ? 'var(--cyan-400)' : 'var(--rose-400)');
  }

  // Pillars Progress Bars
  const barAvail = document.getElementById('bar-avail');
  const barPerf = document.getElementById('bar-perf');
  const barQual = document.getElementById('bar-qual');
  if (barAvail) barAvail.style.width = isZeroState ? '0%' : `${Math.min(100, Math.max(0, Number(data.summary.availabilityRate)))}%`;
  if (barPerf) barPerf.style.width = isZeroState ? '0%' : `${Math.min(100, Math.max(0, Number(data.summary.performanceRate)))}%`;
  if (barQual) barQual.style.width = isZeroState ? '0%' : `${Math.min(100, Math.max(0, Number(data.summary.qualityRate)))}%`;

  // Status Indicator
  const elOeeStatus = document.getElementById('oee-status-indicator');
  if (elOeeStatus) {
    if (isZeroState) {
      elOeeStatus.textContent = '⚪ Ready for New Production Data';
      elOeeStatus.style.color = 'var(--text-secondary)';
    } else if (oeeNum >= 85) {
      elOeeStatus.textContent = '🟢 World-Class Production Pace';
      elOeeStatus.style.color = 'var(--emerald-400)';
    } else if (oeeNum >= 70) {
      elOeeStatus.textContent = '🟢 Operating Within Normal Range';
      elOeeStatus.style.color = 'var(--cyan-400)';
    } else {
      elOeeStatus.textContent = '🔴 High Downtime / Action Required';
      elOeeStatus.style.color = 'var(--rose-400)';
    }
  }

  // Deep-Dive Loss Summary
  let totalIncidents = 0;
  let topLossName = 'None';
  let mostFreqName = 'None';
  let maxFreqCount = 0;

  LOSS_FIELDS.forEach(f => {
    const count = (data.summary.lossCounts && data.summary.lossCounts[f.key]) || 0;
    totalIncidents += count;
    if (count > maxFreqCount) {
      maxFreqCount = count;
      mostFreqName = f.label;
    }
  });

  if (data.summary.topLoss) {
    topLossName = `${data.summary.topLoss.label} (${data.summary.topLoss.mins}m)`;
  }

  const elTotalIncidents = document.getElementById('dash-total-incidents');
  const elTopLossName = document.getElementById('dash-top-loss-name');
  const elAvgStoppage = document.getElementById('dash-avg-stoppage');
  const elMostFreq = document.getElementById('dash-most-frequent-loss');

  if (elTotalIncidents) elTotalIncidents.textContent = totalIncidents;
  if (elTopLossName) elTopLossName.textContent = topLossName;
  if (elAvgStoppage) {
    const avg = totalIncidents > 0 ? (data.summary.totalLossesMins / totalIncidents).toFixed(1) : 0;
    elAvgStoppage.textContent = `${avg}m`;
  }
  if (elMostFreq) elMostFreq.textContent = mostFreqName;

  // 5. Render 11-Machine Comparison Matrix Table
  renderMachineMatrixTable(data.machineMatrix, data.activePeriodLabel);

  // 6. Render Chronological Trend Visualizations
  renderTrendOeeChart(data.trendPeriods, data.periodType);
  renderTrendLossesChart(data.trendPeriods, data.periodType);

  // 7. Render 15 Shopfloor Losses Pareto & Donut
  syncLossFilterDropdown();
  renderLossesParetoChart(data.summary.lossBreakdown, data.summary.lossCounts);
  renderLossClassificationDonut(data.summary.lossBreakdown);
  renderLossesBreakdownTable(data.detailedLossList, data.selectedMachine.name);

  // 8. Render Machine Chronological History Table
  renderPeriodHistoryTable(data.periodicHistory, data.selectedMachine.name, data.periodType);

  // 9. Render "Why & How Loss Occurs" Root-Cause Log Table
  renderRootCauseTable(data.lossIncidents);
}

/**
 * Render 11-Machine Performance Comparison Matrix Table
 * Evaluates each machine separately for the selected Day, Week, or Month
 */
function renderMachineMatrixTable(matrix, periodLabel) {
  if (!dom.machineMatrixTbody) return;
  if (dom.matrixPeriodSubtitle) {
    dom.matrixPeriodSubtitle.textContent = periodLabel;
  }
  dom.machineMatrixTbody.innerHTML = '';

  matrix.forEach(m => {
    const tr = document.createElement('tr');
    if (state.dashFilterMachine === m.code) {
      tr.classList.add('row-focused');
    }

    let oeeBadge = `<span class="status-badge-inactive">0.0%</span>`;
    let statusBadge = `<span class="status-badge-inactive">Inactive</span>`;

    if (m.shiftCount > 0) {
      if (m.oee >= 85) {
        oeeBadge = `<span class="status-badge-optimal">${m.oee}%</span>`;
        statusBadge = `<span class="status-badge-optimal">● Optimal</span>`;
      } else if (m.oee >= 70) {
        oeeBadge = `<span class="status-badge-normal">${m.oee}%</span>`;
        statusBadge = `<span class="status-badge-normal">● Normal</span>`;
      } else {
        oeeBadge = `<span class="status-badge-warning">${m.oee}%</span>`;
        statusBadge = `<span class="status-badge-warning">▲ Attention</span>`;
      }
    }

    const topLossDisplay = m.topLoss 
      ? `<span class="loss-pill-badge">${m.topLoss.label} (${m.topLoss.mins}m)</span>` 
      : '<span style="color: var(--text-muted); font-size: 0.78rem;">None recorded</span>';

    tr.innerHTML = `
      <td>
        <strong style="color: var(--text-primary);">${m.name}</strong>
        <div style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${m.code}</div>
      </td>
      <td><span class="machine-group-tag tag-${m.category.toLowerCase()}">${m.category}</span></td>
      <td style="font-family: var(--font-mono); font-weight: 700;">${m.shiftCount}</td>
      <td style="font-family: var(--font-mono);">${m.plannedHours}h</td>
      <td style="font-family: var(--font-mono); color: var(--emerald-400); font-weight: 700;">${m.operatingHours}h</td>
      <td style="font-family: var(--font-mono); color: var(--rose-400);">${m.lossHours}h</td>
      <td style="font-family: var(--font-mono); font-weight: 600;">${m.availability}%</td>
      <td style="font-family: var(--font-mono); font-weight: 600;">${m.performance}%</td>
      <td style="font-family: var(--font-mono); font-weight: 600;">${m.quality}%</td>
      <td>${oeeBadge}</td>
      <td style="font-family: var(--font-mono); font-weight: 700;">
        <span class="productivity-badge ${m.productivity > 0 ? 'prod-high' : 'prod-zero'}">${m.productivity} pcs/h</span>
      </td>
      <td>
        <strong style="color: var(--text-primary); font-family: var(--font-mono);">${m.totalOutput}</strong>
        <span style="font-size: 0.72rem; color: var(--text-muted);">(${m.goodQty} / <span style="color: var(--rose-400);">${m.scrapQty}</span>)</span>
      </td>
      <td>${topLossDisplay}</td>
      <td>${statusBadge}</td>
      <td>
        <button type="button" class="btn-inspect-machine" data-code="${m.code}" title="Inspect ${m.name} individually">
          🔍 Inspect
        </button>
      </td>
    `;

    tr.querySelector('.btn-inspect-machine')?.addEventListener('click', () => {
      selectMachine(m.code);
    });

    dom.machineMatrixTbody.appendChild(tr);
  });
}

/**
 * Chart.js: OEE & APQ Progression Over Time (Days, Weeks, Months)
 */
function renderTrendOeeChart(trendPeriods, periodType) {
  const ctx = document.getElementById('chart-trend-oee');
  if (!ctx || !window.Chart) return;

  if (dom.titleTrendOee) {
    const targetName = state.dashFilterMachine === 'ALL' ? 'All Machines Combined' : state.dashFilterMachine;
    dom.titleTrendOee.textContent = `${targetName}: OEE & APQ Progression (${periodType.toUpperCase()})`;
  }
  if (dom.badgeTrendPeriodType) {
    dom.badgeTrendPeriodType.textContent = `${periodType.toUpperCase()} TREND`;
  }

  if (state.chartTrendOee) {
    state.chartTrendOee.destroy();
  }

  const labels = trendPeriods.length > 0 ? trendPeriods.map(p => p.label) : ['No Data'];
  const oeeData = trendPeriods.map(p => p.oee);
  const availData = trendPeriods.map(p => p.availability);
  const perfData = trendPeriods.map(p => p.performance);
  const qualData = trendPeriods.map(p => p.quality);

  state.chartTrendOee = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'OEE %',
          data: oeeData,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.12)',
          borderWidth: 3,
          pointRadius: 4,
          pointHoverRadius: 7,
          pointBackgroundColor: '#ffffff',
          fill: true,
          tension: 0.3
        },
        {
          label: 'Availability %',
          data: availData,
          borderColor: '#10b981',
          borderWidth: 2,
          borderDash: [5, 4],
          pointRadius: 3,
          fill: false,
          tension: 0.3
        },
        {
          label: 'Performance %',
          data: perfData,
          borderColor: '#f59e0b',
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
          tension: 0.3
        },
        {
          label: 'Quality %',
          data: qualData,
          borderColor: '#818cf8',
          borderWidth: 2,
          pointRadius: 3,
          fill: false,
          tension: 0.3
        },
        {
          label: 'Productivity (pcs/h)',
          data: trendPeriods.map(p => p.productivity),
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251, 191, 36, 0.1)',
          borderWidth: 2.5,
          borderDash: [3, 3],
          pointRadius: 3.5,
          pointHoverRadius: 6,
          fill: false,
          tension: 0.3,
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { size: 11, family: 'Plus Jakarta Sans' },
            boxWidth: 12
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => {
              if (ctx.dataset.yAxisID === 'y1') {
                return ` ${ctx.dataset.label}: ${ctx.parsed.y} pcs/h`;
              }
              return ` ${ctx.dataset.label}: ${ctx.parsed.y}%`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            font: { size: 10, family: 'Plus Jakarta Sans' },
            maxRotation: 45
          },
          grid: { color: 'rgba(255, 255, 255, 0.04)' }
        },
        y: {
          min: 0,
          max: 100,
          ticks: {
            color: '#94a3b8',
            font: { family: 'JetBrains Mono' },
            callback: (v) => `${v}%`
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        y1: {
          position: 'right',
          title: {
            display: true,
            text: 'Productivity (pcs/h)',
            color: '#fbbf24',
            font: { size: 10 }
          },
          ticks: {
            color: '#fbbf24',
            font: { family: 'JetBrains Mono' }
          },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

/**
 * Chart.js: Stacked Downtime Losses Evolution Over Time (Minutes)
 */
function renderTrendLossesChart(trendPeriods, periodType) {
  const ctx = document.getElementById('chart-trend-losses');
  if (!ctx || !window.Chart) return;

  if (dom.titleTrendLosses) {
    const targetName = state.dashFilterMachine === 'ALL' ? 'All Machines' : state.dashFilterMachine;
    dom.titleTrendLosses.textContent = `${targetName}: Downtime Losses Evolution (${periodType.toUpperCase()})`;
  }

  if (state.chartTrendLosses) {
    state.chartTrendLosses.destroy();
  }

  const labels = trendPeriods.length > 0 ? trendPeriods.map(p => p.label) : ['No Data'];

  const bdBreakdown = trendPeriods.map(p => p.lossBreakdown?.loss_breakdown || 0);
  const bdSetup = trendPeriods.map(p => (p.lossBreakdown?.loss_setup || 0) + (p.lossBreakdown?.loss_startup || 0) + (p.lossBreakdown?.loss_programming || 0));
  const bdTooling = trendPeriods.map(p => (p.lossBreakdown?.loss_jig_fixture || 0) + (p.lossBreakdown?.loss_speed || 0));
  const bdQuality = trendPeriods.map(p => (p.lossBreakdown?.loss_quality_insp || 0) + (p.lossBreakdown?.loss_measurement || 0));
  const bdLogistics = trendPeriods.map(p => (p.lossBreakdown?.loss_no_material || 0) + (p.lossBreakdown?.loss_no_plan || 0) + (p.lossBreakdown?.loss_document || 0));
  const bdMaint = trendPeriods.map(p => (p.lossBreakdown?.loss_cleaning || 0) + (p.lossBreakdown?.loss_no_operator || 0));

  state.chartTrendLosses = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        { label: 'Breakdown', data: bdBreakdown, backgroundColor: '#f43f5e', borderRadius: 2 },
        { label: 'Setup & Startup', data: bdSetup, backgroundColor: '#6366f1', borderRadius: 2 },
        { label: 'Tooling & Speed', data: bdTooling, backgroundColor: '#f59e0b', borderRadius: 2 },
        { label: 'Quality & Measurement', data: bdQuality, backgroundColor: '#10b981', borderRadius: 2 },
        { label: 'Logistics & Plan', data: bdLogistics, backgroundColor: '#06b6d4', borderRadius: 2 },
        { label: 'Maintenance & Misc', data: bdMaint, backgroundColor: '#64748b', borderRadius: 2 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { size: 10, family: 'Plus Jakarta Sans' },
            boxWidth: 10
          }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.dataset.label}: ${ctx.parsed.y} mins`
          }
        }
      },
      scales: {
        x: {
          stacked: true,
          ticks: {
            color: '#94a3b8',
            font: { size: 10, family: 'Plus Jakarta Sans' },
            maxRotation: 45
          },
          grid: { display: false }
        },
        y: {
          stacked: true,
          ticks: {
            color: '#94a3b8',
            font: { family: 'JetBrains Mono' },
            callback: (v) => `${v}m`
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        }
      }
    }
  });
}

/**
 * Chart.js: 13 Losses Dual Chart (Duration in Mins & Frequency Count)
 */
function renderLossesParetoChart(lossBreakdown, lossCounts = {}) {
  const ctx = document.getElementById('chart-losses-pareto');
  if (!ctx || !window.Chart) return;

  const items = LOSS_FIELDS.map(f => ({
    label: f.label,
    mins: lossBreakdown[f.key] || 0,
    count: lossCounts[f.key] || 0
  })).sort((a, b) => b.mins - a.mins);

  const labels = items.map(i => i.label);
  const dataMins = items.map(i => i.mins);
  const dataCounts = items.map(i => i.count);

  if (state.chartLossesPareto) {
    state.chartLossesPareto.destroy();
  }

  const selectedLossMeta = LOSS_FIELDS.find(f => f.key === state.dashFilterLoss);
  const barColors = items.map(i => {
    if (selectedLossMeta && i.label === selectedLossMeta.label) {
      return '#06b6d4';
    }
    return selectedLossMeta ? 'rgba(244, 63, 94, 0.25)' : 'rgba(244, 63, 94, 0.65)';
  });
  const borderColors = items.map(i => {
    if (selectedLossMeta && i.label === selectedLossMeta.label) {
      return '#22d3ee';
    }
    return selectedLossMeta ? 'rgba(244, 63, 94, 0.4)' : '#f43f5e';
  });

  state.chartLossesPareto = new Chart(ctx, {
    data: {
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Total Downtime (Mins)',
          data: dataMins,
          backgroundColor: barColors,
          borderColor: borderColors,
          borderWidth: 1.5,
          borderRadius: 4,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: 'Frequency (Times Occurred)',
          data: dataCounts,
          borderColor: '#06b6d4',
          backgroundColor: '#06b6d4',
          borderWidth: 2.5,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#ffffff',
          yAxisID: 'y1'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#94a3b8',
            font: { size: 11, family: 'Plus Jakarta Sans' },
            boxWidth: 14
          }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.datasetIndex === 0) {
                return ` ${context.parsed.y} mins lost`;
              }
              return ` Occurred ${context.parsed.y} times`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: {
            color: '#94a3b8',
            font: { size: 9.5, family: 'Plus Jakarta Sans' },
            maxRotation: 45,
            minRotation: 30
          },
          grid: { display: false }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: {
            display: true,
            text: 'Minutes Lost',
            color: '#94a3b8',
            font: { size: 10 }
          },
          ticks: {
            color: '#94a3b8',
            font: { family: 'JetBrains Mono' }
          },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: {
            display: true,
            text: 'Times Occurred',
            color: '#06b6d4',
            font: { size: 10 }
          },
          ticks: {
            color: '#06b6d4',
            font: { family: 'JetBrains Mono' },
            stepSize: 1
          },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

/**
 * Chart.js: Loss Classification Donut
 */
function renderLossClassificationDonut(lossBreakdown) {
  const ctx = document.getElementById('chart-losses-donut');
  if (!ctx || !window.Chart) return;

  const groups = {
    'Equipment Breakdown': (lossBreakdown.loss_breakdown || 0),
    'Tooling & Fixtures': (lossBreakdown.loss_tool_insert || 0) + (lossBreakdown.loss_jig_fixture || 0),
    'Process & Setup': (lossBreakdown.loss_setup || 0) + (lossBreakdown.loss_startup || 0) + (lossBreakdown.loss_programming || 0),
    'Logistics & Planning': (lossBreakdown.loss_no_material || 0) + (lossBreakdown.loss_no_plan || 0) + (lossBreakdown.loss_document || 0),
    'Quality & Inspection': (lossBreakdown.loss_quality_insp || 0) + (lossBreakdown.loss_measurement || 0),
    'Maintenance & Speed': (lossBreakdown.loss_cleaning || 0) + (lossBreakdown.loss_speed || 0) + (lossBreakdown.loss_no_operator || 0),
    'Other Losses': (lossBreakdown.loss_other || 0)
  };

  const labels = Object.keys(groups);
  const values = Object.values(groups);

  if (state.chartLossesDonut) {
    state.chartLossesDonut.destroy();
  }

  state.chartLossesDonut = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: [
          '#f43f5e',
          '#f59e0b',
          '#6366f1',
          '#06b6d4',
          '#10b981',
          '#64748b',
          '#a855f7'
        ],
        borderWidth: 2,
        borderColor: '#111a2e'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#94a3b8',
            font: { size: 10, family: 'Plus Jakarta Sans' },
            boxWidth: 12,
            padding: 8
          }
        }
      },
      cutout: '62%'
    }
  });
}

/**
 * Sync Dashboard Loss Filter Dropdown
 */
function syncLossFilterDropdown() {
  const select = dom.dashFilterLoss || document.getElementById('dash-filter-loss');
  if (!select) return;

  if (select.children.length <= 1) {
    select.innerHTML = '<option value="ALL">All 15 Losses Combined</option>';
    LOSS_FIELDS.forEach(f => {
      const opt = document.createElement('option');
      opt.value = f.key;
      opt.textContent = `${f.label} (${f.category})`;
      select.appendChild(opt);
    });
  }
  select.value = state.dashFilterLoss || 'ALL';
}

/**
 * Render 15 Shopfloor Downtime Losses Detailed Table
 */
function renderLossesBreakdownTable(detailedLossList, targetName) {
  if (!dom.lossesBreakdownTbody) return;
  if (dom.titleLossesTable) {
    dom.titleLossesTable.textContent = `15 Shopfloor Downtime Losses Distribution: ${targetName}`;
  }
  dom.lossesBreakdownTbody.innerHTML = '';

  let listToRender = detailedLossList || [];
  if (state.dashFilterLoss && state.dashFilterLoss !== 'ALL') {
    listToRender = listToRender.filter(loss => loss.key === state.dashFilterLoss);
  }

  if (!listToRender || listToRender.length === 0) {
    dom.lossesBreakdownTbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding: 20px; color: var(--text-muted);">No downtime losses recorded for this selection.</td></tr>';
    return;
  }

  listToRender.forEach((loss, index) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: var(--font-mono); color: var(--text-muted);">${index + 1}</td>
      <td>
        <strong style="color: var(--text-primary);">${loss.label}</strong>
      </td>
      <td><span class="why-category-badge">${loss.category}</span></td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: ${loss.mins > 0 ? 'var(--rose-400)' : 'var(--text-muted)'};">${loss.mins}m</td>
      <td style="font-family: var(--font-mono);">${loss.hours}h</td>
      <td style="font-family: var(--font-mono);">${loss.count}</td>
      <td>
        <div class="loss-impact-bar-wrap">
          <div class="loss-impact-bar-fill" style="width: ${loss.pctOfLoss}%;"></div>
        </div>
        <span style="font-family: var(--font-mono); font-weight: 600;">${loss.pctOfLoss}%</span>
      </td>
      <td style="font-family: var(--font-mono); color: ${loss.impactOnAvail > 0 ? 'var(--amber-400)' : 'var(--text-muted)'};">-${loss.impactOnAvail}%</td>
    `;
    dom.lossesBreakdownTbody.appendChild(tr);
  });
}

/**
 * Render Machine Chronological Period History Table
 */
function renderPeriodHistoryTable(periodicHistory, targetName, periodType) {
  if (!dom.periodHistoryTbody) return;
  if (dom.titlePeriodHistory) {
    dom.titlePeriodHistory.textContent = `Chronological ${periodType.toUpperCase()} History: ${targetName}`;
  }
  if (dom.badgeHistoryHorizon) {
    dom.badgeHistoryHorizon.textContent = `${periodType.toUpperCase()} ARCHIVE`;
  }
  dom.periodHistoryTbody.innerHTML = '';

  if (!periodicHistory || periodicHistory.length === 0) {
    dom.periodHistoryTbody.innerHTML = '<tr><td colspan="14" style="text-align:center; padding: 24px; color: var(--text-muted);">No historical shift records logged yet for this selection.</td></tr>';
    return;
  }

  periodicHistory.forEach(h => {
    const tr = document.createElement('tr');
    let oeeBadge = `<span class="status-badge-inactive">0.0%</span>`;
    if (h.oee >= 85) oeeBadge = `<span class="status-badge-optimal">${h.oee}%</span>`;
    else if (h.oee >= 70) oeeBadge = `<span class="status-badge-normal">${h.oee}%</span>`;
    else if (h.oee > 0) oeeBadge = `<span class="status-badge-warning">${h.oee}%</span>`;

    const topLossDisplay = h.topLoss ? `${h.topLoss.label} (${h.topLoss.mins}m)` : 'None';

    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-weight: 700; color: var(--cyan-400);">${h.label}</td>
      <td style="font-family: var(--font-mono); font-weight: 700;">${h.shiftCount}</td>
      <td style="font-family: var(--font-mono);">${h.plannedMins}m</td>
      <td style="font-family: var(--font-mono); color: var(--emerald-400); font-weight: 700;">${h.operatingMins}m</td>
      <td style="font-family: var(--font-mono); color: var(--rose-400);">${h.lossMins}m</td>
      <td style="font-family: var(--font-mono);">${h.availability}%</td>
      <td style="font-family: var(--font-mono);">${h.performance}%</td>
      <td style="font-family: var(--font-mono);">${h.quality}%</td>
      <td>${oeeBadge}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: var(--amber-400);">${h.productivity} pcs/h</td>
      <td style="font-family: var(--font-mono); font-weight: 700;">${h.totalOutput}</td>
      <td style="font-family: var(--font-mono); color: var(--emerald-400);">${h.goodQty}</td>
      <td style="font-family: var(--font-mono); color: var(--rose-400);">${h.scrapQty}</td>
      <td style="font-size: 0.8rem; color: var(--text-secondary);">${topLossDisplay}</td>
    `;
    dom.periodHistoryTbody.appendChild(tr);
  });
}

/**
 * Render "Why & How Loss Occurred" Root-Cause Log Table
 */
function renderRootCauseTable(occurrences) {
  dom.rootCauseTbody.innerHTML = '';

  if (!occurrences || occurrences.length === 0) {
    dom.rootCauseTbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align:center; padding: 36px 20px; color: var(--text-secondary);">
          <div style="display:flex; flex-direction:column; align-items:center; gap:8px;">
            <span style="font-size: 1.05rem; font-weight: 700; color: var(--cyan-400);">No Stoppages Reported for this Horizon</span>
            <span style="font-size: 0.85rem; color: var(--text-muted);">No downtime incidents or remarks recorded for this specific interval.</span>
          </div>
        </td>
      </tr>
    `;
    return;
  }

  occurrences.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-size: 0.8rem;">${item.date}</td>
      <td><span class="shift-badge">${item.shift}</span></td>
      <td><strong>${item.machineName}</strong></td>
      <td>${item.operator}</td>
      <td><span class="loss-pill-badge">${item.primaryLoss}</span></td>
      <td><span class="why-category-badge">${item.whyCategory || 'Technical'}</span></td>
      <td class="remarks-text">${item.howItOccurred || item.remarks || 'Standard Stoppage'}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: var(--rose-400);">${item.totalLossMins}m</td>
    `;
    dom.rootCauseTbody.appendChild(tr);
  });
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'success' ? 'toast-success' : type === 'error' ? 'toast-error' : ''}`;
  toast.innerHTML = `
    <span style="font-weight: 700; color: ${type === 'success' ? 'var(--emerald-400)' : type === 'error' ? 'var(--rose-400)' : 'var(--cyan-400)'}">
      ${type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ'}
    </span>
    <span>${message}</span>
  `;
  dom.toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.animation = 'toastSlideOut 0.3s forwards cubic-bezier(0.16, 1, 0.3, 1)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

/**
 * Setup All Event Listeners
 */
function setupEventListeners() {
  const btnBrandHome = document.getElementById('btn-brand-home');
  if (btnBrandHome) {
    btnBrandHome.addEventListener('click', () => switchView('view-machines'));
    btnBrandHome.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        switchView('view-machines');
      }
    });
  }

  // 3 Core Navigation Tabs: 1. Machines | 2. Production Data | 3. Dashboard
  const mainNavTabs = document.getElementById('main-nav-tabs');
  if (mainNavTabs) {
    mainNavTabs.addEventListener('click', (e) => {
      const btn = e.target.closest('.nav-tab-btn');
      if (!btn) return;
      const targetView = btn.dataset.target;
      if (targetView) {
        switchView(targetView);
      }
    });
  }

  const tabMach = document.getElementById('nav-tab-machines');
  if (tabMach) tabMach.addEventListener('click', () => switchView('view-machines'));
  const tabFill = document.getElementById('nav-tab-fillup');
  if (tabFill) tabFill.addEventListener('click', () => switchView('view-fillup'));
  const tabDash = document.getElementById('nav-tab-analytics');
  if (tabDash) tabDash.addEventListener('click', () => switchView('view-analytics'));

  const btnTopLogs = document.getElementById('btn-top-logs');
  if (btnTopLogs) {
    btnTopLogs.addEventListener('click', () => {
      if (state.currentView === 'view-analytics') {
        switchView('view-machines');
      } else {
        switchView('view-analytics');
      }
    });
  }

  const btnBackFromAnalytics = document.getElementById('btn-back-to-machines-from-analytics');
  if (btnBackFromAnalytics) {
    btnBackFromAnalytics.addEventListener('click', () => switchView('view-machines'));
  }

  const btnOpenEnteredData = document.getElementById('btn-open-entered-data');
  if (btnOpenEnteredData) {
    btnOpenEnteredData.addEventListener('click', () => openEnteredDataModal());
  }

  const btnOpenEnteredFromDash = document.getElementById('btn-open-entered-from-dash');
  if (btnOpenEnteredFromDash) {
    btnOpenEnteredFromDash.addEventListener('click', () => openEnteredDataModal());
  }

  const btnCloseEnteredModal = document.getElementById('btn-close-entered-modal');
  if (btnCloseEnteredModal) {
    btnCloseEnteredModal.addEventListener('click', () => closeEnteredDataModal());
  }

  const btnCloseEnteredBottom = document.getElementById('btn-close-entered-bottom');
  if (btnCloseEnteredBottom) {
    btnCloseEnteredBottom.addEventListener('click', () => closeEnteredDataModal());
  }

  const inputSearchEntered = document.getElementById('input-search-entered');
  if (inputSearchEntered) {
    inputSearchEntered.addEventListener('input', () => filterAndRenderEnteredData());
  }

  const filterEnteredMachine = document.getElementById('filter-entered-machine');
  if (filterEnteredMachine) {
    filterEnteredMachine.addEventListener('change', () => filterAndRenderEnteredData());
  }

  const filterEnteredShift = document.getElementById('filter-entered-shift');
  if (filterEnteredShift) {
    filterEnteredShift.addEventListener('change', () => filterAndRenderEnteredData());
  }

  const btnExportEnteredCsv = document.getElementById('btn-export-entered-csv');
  if (btnExportEnteredCsv) {
    btnExportEnteredCsv.addEventListener('click', () => {
      if (window._currentFilteredEntries && window._currentFilteredEntries.length > 0) {
        exportEntriesToCSV(window._currentFilteredEntries, 'LEMKEN_Entered_Production_Logs');
      } else {
        showToast('No entered records available to export.', 'info');
      }
    });
  }

  const btnClearAllRecords = document.getElementById('btn-clear-all-records');
  if (btnClearAllRecords) {
    btnClearAllRecords.addEventListener('click', async () => {
      const ok = confirm('⚠️ Clear All Production Records?\n\nThis will permanently delete all entered shift records. Are you sure?');
      if (!ok) return;
      await clearAllProductionEntries();
      await filterAndRenderEnteredData();
      updateEnteredRecordsBadge();
      if (state.currentView === 'view-analytics') {
        await renderAnalyticsDashboard();
      }
      showToast('All production records cleared.', 'info');
    });
  }

  // Navigation Tabs
  if (dom.tabMachines) dom.tabMachines.addEventListener('click', () => switchView('view-machines'));
  if (dom.tabFillup) dom.tabFillup.addEventListener('click', () => switchView('view-fillup'));
  if (dom.tabAnalytics) dom.tabAnalytics.addEventListener('click', () => switchView('view-analytics'));
  if (dom.btnBackToMachines) dom.btnBackToMachines.addEventListener('click', () => switchView('view-machines'));
  if (dom.btnCancelEntry) dom.btnCancelEntry.addEventListener('click', () => switchView('view-machines'));

  // Page 2 Machine Switcher
  dom.selectQuickMachine.addEventListener('change', (e) => {
    openMachineFillup(e.target.value);
  });

  // Page 3 Machine Filter (Dropdown sync)
  if (dom.dashFilterMachine) {
    dom.dashFilterMachine.addEventListener('change', () => {
      selectMachine(dom.dashFilterMachine.value);
    });
  }

  // Periodic Horizon Buttons (Daily, Weekly, Monthly, Overall)
  if (dom.periodTabsGroup) {
    dom.periodTabsGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.period-tab-btn');
      if (!btn) return;
      state.periodType = btn.dataset.period;
      state.periodValue = 'LATEST';
      renderAnalyticsDashboard();
    });
  }

  // Dynamic Period Interval Dropdown
  if (dom.selectPeriodInterval) {
    dom.selectPeriodInterval.addEventListener('change', (e) => {
      state.periodValue = e.target.value;
      renderAnalyticsDashboard();
    });
  }

  // Prev / Next Period Stepper Buttons
  if (dom.btnPeriodPrev) {
    dom.btnPeriodPrev.addEventListener('click', () => {
      if (!dom.selectPeriodInterval) return;
      const idx = dom.selectPeriodInterval.selectedIndex;
      if (idx < dom.selectPeriodInterval.options.length - 1) {
        dom.selectPeriodInterval.selectedIndex = idx + 1;
        state.periodValue = dom.selectPeriodInterval.value;
        renderAnalyticsDashboard();
      }
    });
  }

  if (dom.btnPeriodNext) {
    dom.btnPeriodNext.addEventListener('click', () => {
      if (!dom.selectPeriodInterval) return;
      const idx = dom.selectPeriodInterval.selectedIndex;
      if (idx > 0) {
        dom.selectPeriodInterval.selectedIndex = idx - 1;
        state.periodValue = dom.selectPeriodInterval.value;
        renderAnalyticsDashboard();
      }
    });
  }

  // Machine Roster Quick-Pills
  if (dom.machineRosterPills) {
    dom.machineRosterPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.machine-pill-btn');
      if (!btn) return;
      const code = btn.dataset.machineCode;
      selectMachine(code);
    });
  }

  // Export Period CSV Button
  if (dom.btnExportPeriodCsv) {
    dom.btnExportPeriodCsv.addEventListener('click', () => {
      if (state.lastPeriodicData) {
        exportPeriodicReportToCSV(state.lastPeriodicData, `${state.dashFilterMachine}_Periodic_Analysis`);
      } else {
        showToast('No periodic report available to export.', 'error');
      }
    });
  }

  // Load Sample Data (3 Weeks Multi-Machine Shifts)
  if (dom.btnSeedSample) {
    dom.btnSeedSample.addEventListener('click', async () => {
      dom.btnSeedSample.disabled = true;
      dom.btnSeedSample.textContent = 'Populating...';
      try {
        await seedDemoShiftData();
        setDefaultFormValues();
        updateLiveOeeCalculations();
        await renderAnalyticsDashboard();
        showToast('⚡ 3 Weeks of realistic shift records populated across 11 machines!', 'success');
      } catch (err) {
        showToast('Failed to populate sample records.', 'error');
      } finally {
        dom.btnSeedSample.disabled = false;
        dom.btnSeedSample.innerHTML = `
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
          </svg>
          ⚡ Load Sample Data
        `;
      }
    });
  }

  // Live OEE Calculation triggers on Page 2
  const calcInputs = [
    dom.inputShiftHours,
    dom.inputPart1Cycle, dom.inputPart1Qty,
    dom.inputPart2Cycle, dom.inputPart2Qty,
    dom.inputPart3Cycle, dom.inputPart3Qty,
    dom.inputRejectedQty,
    ...document.querySelectorAll('.loss-calc-trigger')
  ];

  calcInputs.forEach(input => {
    if (input) {
      input.addEventListener('input', updateLiveOeeCalculations);
      input.addEventListener('change', updateLiveOeeCalculations);
    }
  });

  // Form Submit
  dom.form.addEventListener('submit', handleFormSubmit);

  // Global CSV Export
  dom.btnGlobalExport.addEventListener('click', async () => {
    const entries = await getProductionEntries();
    exportEntriesToCSV(entries, 'Shopfloor_OEE_11_Machines');
  });

  // Android Mobile QR Modal Listeners
  if (dom.btnOpenMobileQr) {
    dom.btnOpenMobileQr.addEventListener('click', () => {
      dom.modalMobileQr?.classList.remove('hidden');
    });
  }
  if (dom.btnCloseQrModal) {
    dom.btnCloseQrModal.addEventListener('click', () => {
      dom.modalMobileQr?.classList.add('hidden');
    });
  }
  if (dom.btnDismissQrModal) {
    dom.btnDismissQrModal.addEventListener('click', () => {
      dom.modalMobileQr?.classList.add('hidden');
    });
  }

  // Quick Chips Stepper for Android & Shopfloor Operators (+5m, +15m)
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.btn-loss-chip');
    if (!chip) return;
    e.preventDefault();
    const targetId = chip.getAttribute('data-target');
    const addMinutes = parseInt(chip.getAttribute('data-add'), 10) || 0;
    const targetInput = document.getElementById(targetId);
    if (targetInput) {
      const currentVal = parseInt(targetInput.value, 10) || 0;
      targetInput.value = Math.max(0, currentVal + addMinutes);
      if ('vibrate' in navigator) {
        try { navigator.vibrate(30); } catch (_) {}
      }
      updateLiveOeeCalculations();
    }
  });

  // Step 3 Downtime Loss Dropdown Quick-Selector Chips (+5m, +15m, +30m, +60m)
  document.addEventListener('click', (e) => {
    const chip = e.target.closest('.btn-dropdown-chip');
    if (!chip) return;
    e.preventDefault();
    const addMins = parseInt(chip.getAttribute('data-mins'), 10) || 0;
    const inputMins = dom.inputDropdownLossMins || document.getElementById('input-dropdown-loss-mins');
    if (inputMins) {
      const current = parseInt(inputMins.value, 10) || 0;
      inputMins.value = Math.max(0, current + addMins);
      if ('vibrate' in navigator) {
        try { navigator.vibrate(25); } catch (_) {}
      }
    }
  });

  // Step 3 Downtime Loss Dropdown Change: Highlight corresponding card
  const selectDowntimeLoss = dom.selectDowntimeLoss || document.getElementById('select-downtime-loss');
  if (selectDowntimeLoss) {
    selectDowntimeLoss.addEventListener('change', () => {
      const lossKey = selectDowntimeLoss.value;
      if (!lossKey) return;
      const targetCard = document.getElementById(`card-${lossKey}`);
      if (targetCard) {
        targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        targetCard.classList.remove('highlight-pulse');
        void targetCard.offsetWidth;
        targetCard.classList.add('highlight-pulse');
      }
      const targetInput = document.getElementById(lossKey);
      const inputMins = dom.inputDropdownLossMins || document.getElementById('input-dropdown-loss-mins');
      if (targetInput && inputMins) {
        const val = parseInt(targetInput.value, 10) || 0;
        if (val > 0) {
          inputMins.value = val;
        } else if (!inputMins.value || parseInt(inputMins.value, 10) === 0) {
          inputMins.value = 15;
        }
      }
    });
  }

  // Step 3 Downtime Loss Apply Button
  const btnApplyDropdownLoss = dom.btnApplyDropdownLoss || document.getElementById('btn-apply-dropdown-loss');
  if (btnApplyDropdownLoss) {
    btnApplyDropdownLoss.addEventListener('click', () => {
      const selectLoss = dom.selectDowntimeLoss || document.getElementById('select-downtime-loss');
      const inputMins = dom.inputDropdownLossMins || document.getElementById('input-dropdown-loss-mins');
      const statusEl = dom.lossDropdownStatus || document.getElementById('loss-dropdown-status');

      const lossKey = selectLoss ? selectLoss.value : '';
      if (!lossKey) {
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.style.background = 'rgba(244, 63, 94, 0.15)';
          statusEl.style.color = 'var(--rose-400)';
          statusEl.textContent = '⚠️ Please select a downtime loss category from the dropdown first.';
        }
        return;
      }

      const minsToAdd = parseInt(inputMins ? inputMins.value : 0, 10) || 0;
      if (minsToAdd <= 0) {
        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.style.background = 'rgba(244, 63, 94, 0.15)';
          statusEl.style.color = 'var(--rose-400)';
          statusEl.textContent = '⚠️ Please enter duration in minutes greater than 0.';
        }
        return;
      }

      const targetInput = document.getElementById(lossKey);
      if (targetInput) {
        const currentVal = parseInt(targetInput.value, 10) || 0;
        const newVal = currentVal + minsToAdd;
        targetInput.value = newVal;

        // Card animation
        const targetCard = document.getElementById(`card-${lossKey}`);
        if (targetCard) {
          targetCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          targetCard.classList.remove('highlight-pulse');
          void targetCard.offsetWidth;
          targetCard.classList.add('highlight-pulse');
        }

        const fieldMeta = LOSS_FIELDS.find(f => f.key === lossKey);
        const lossLabel = fieldMeta ? fieldMeta.label : lossKey;

        if (statusEl) {
          statusEl.style.display = 'block';
          statusEl.style.background = 'rgba(6, 182, 212, 0.15)';
          statusEl.style.color = 'var(--cyan-300)';
          statusEl.textContent = `✓ Logged +${minsToAdd}m to "${lossLabel}" (Total: ${newVal}m)`;
        }

        if (dom.inputRemarks && (!dom.inputRemarks.value || dom.inputRemarks.value.trim() === '')) {
          dom.inputRemarks.value = `${lossLabel}: ${newVal} mins downtime`;
        }

        updateLiveOeeCalculations();
        showToast(`Logged ${minsToAdd}m for ${lossLabel}`, 'success');
      }
    });
  }

  // Dashboard Downtime Loss Filter Dropdown
  const dashFilterLoss = dom.dashFilterLoss || document.getElementById('dash-filter-loss');
  if (dashFilterLoss) {
    dashFilterLoss.addEventListener('change', () => {
      state.dashFilterLoss = dashFilterLoss.value;
      if (state.lastPeriodicData) {
        renderLossesParetoChart(state.lastPeriodicData.summary.lossBreakdown, state.lastPeriodicData.summary.lossCounts);
        renderLossesBreakdownTable(state.lastPeriodicData.detailedLossList, state.lastPeriodicData.selectedMachine.name);
      }
    });
  }

  // Supabase Settings Modal
  dom.btnOpenDbSettings.addEventListener('click', () => {
    const cfg = getSupabaseConfig();
    dom.cfgSupabaseUrl.value = cfg.url || '';
    dom.cfgSupabaseKey.value = cfg.key || '';
    dom.supabaseTestResult.style.display = 'none';
    dom.modalSupabase.classList.remove('hidden');
  });

  dom.btnCloseModal.addEventListener('click', () => {
    dom.modalSupabase.classList.add('hidden');
  });

  dom.btnTestSupabase.addEventListener('click', async () => {
    const url = dom.cfgSupabaseUrl.value.trim();
    const key = dom.cfgSupabaseKey.value.trim();
    if (!url || !key) {
      dom.supabaseTestResult.style.display = 'block';
      dom.supabaseTestResult.style.background = 'rgba(244, 63, 94, 0.15)';
      dom.supabaseTestResult.style.color = 'var(--rose-400)';
      dom.supabaseTestResult.textContent = 'Please provide both Project URL and Public Anon Key.';
      return;
    }

    dom.btnTestSupabase.disabled = true;
    dom.btnTestSupabase.textContent = 'Testing...';

    const test = await testSupabaseConnection(url, key);
    dom.btnTestSupabase.disabled = false;
    dom.btnTestSupabase.textContent = 'Test Connection';

    dom.supabaseTestResult.style.display = 'block';
    if (test.success) {
      dom.supabaseTestResult.style.background = 'rgba(16, 185, 129, 0.15)';
      dom.supabaseTestResult.style.color = 'var(--emerald-400)';
      dom.supabaseTestResult.textContent = test.message;
    } else {
      dom.supabaseTestResult.style.background = 'rgba(244, 63, 94, 0.15)';
      dom.supabaseTestResult.style.color = 'var(--rose-400)';
      dom.supabaseTestResult.textContent = test.message;
    }
  });

  dom.btnSaveSupabase.addEventListener('click', async () => {
    const url = dom.cfgSupabaseUrl.value.trim();
    const key = dom.cfgSupabaseKey.value.trim();
    saveSupabaseConfig(url, key);
    await initStorage();
    updateSupabaseStatusIndicator();
    dom.modalSupabase.classList.add('hidden');
    const isConn = isConnectedToSupabase();
    if (isConn) {
      showToast('⚡ Supabase Database successfully connected & active!', 'success');
    } else {
      showToast('Supabase settings saved.', 'info');
    }
    if (state.currentView === 'view-analytics') {
      await renderAnalyticsDashboard();
    }
  });

  // Disconnect Supabase Cloud
  if (dom.btnDisconnectSupabase) {
    dom.btnDisconnectSupabase.addEventListener('click', async () => {
      saveSupabaseConfig('', '');
      await initStorage();
      updateSupabaseStatusIndicator();
      dom.cfgSupabaseUrl.value = '';
      dom.cfgSupabaseKey.value = '';
      dom.supabaseTestResult.style.display = 'none';
      dom.modalSupabase.classList.add('hidden');
      showToast('Supabase disconnected. Switched to local storage mode.', 'info');
      if (state.currentView === 'view-analytics') {
        await renderAnalyticsDashboard();
      }
    });
  }

  // Clear Production Data Button
  if (dom.btnClearData) {
    dom.btnClearData.addEventListener('click', async () => {
      const ok = confirm('⚠️ Clear All Production Data?\n\nThis will wipe all existing shift production records and loss occurrences so you can enter fresh data.');
      if (!ok) return;

      await clearAllProductionEntries();
      setDefaultFormValues();
      updateLiveOeeCalculations();
      if (state.currentView === 'view-analytics') {
        await renderAnalyticsDashboard();
      }
      showToast('All production records have been cleared! Ready for new entries.', 'info');
    });
  }
}

/**
 * Switch to Page 2 (Production Fillup) for a specific machine
 */
function openMachineFillup(machineCode) {
  const machine = MACHINES.find(m => m.code === machineCode) || MACHINES[0];
  state.currentMachine = machine;

  if (dom.activeMachineName) {
    dom.activeMachineName.textContent = machine.name;
  }
  if (dom.activeMachineType) {
    dom.activeMachineType.textContent = `${machine.category} Center`;
  }
  if (dom.selectQuickMachine) {
    dom.selectQuickMachine.value = machine.code;
  }

  setDefaultFormValues();
  updateLiveOeeCalculations();
  switchView('view-fillup');
}

/**
 * Set default values for Page 2 production form
 */
function setDefaultFormValues() {
  const today = new Date().toISOString().split('T')[0];
  if (dom.inputDate) dom.inputDate.value = today;
  if (dom.inputShift) dom.inputShift.value = getCurrentShift();
  if (dom.inputShiftHours) dom.inputShiftHours.value = '8.5';
  if (dom.inputOperator && !dom.inputOperator.value) dom.inputOperator.value = 'Operator 1';

  // Part 1 defaults
  if (dom.inputPart1Name) dom.inputPart1Name.value = 'Pinion-Shaft-45';
  if (dom.inputPart1Cycle) dom.inputPart1Cycle.value = '2.2';
  if (dom.inputPart1Qty) dom.inputPart1Qty.value = '120';

  // Part 2 & 3 optional
  if (dom.inputPart2Name) dom.inputPart2Name.value = '';
  if (dom.inputPart2Cycle) dom.inputPart2Cycle.value = '0';
  if (dom.inputPart2Qty) dom.inputPart2Qty.value = '0';

  if (dom.inputPart3Name) dom.inputPart3Name.value = '';
  if (dom.inputPart3Cycle) dom.inputPart3Cycle.value = '0';
  if (dom.inputPart3Qty) dom.inputPart3Qty.value = '0';

  if (dom.inputRejectedQty) dom.inputRejectedQty.value = '2';

  // Reset 15 losses
  LOSS_FIELDS.forEach(f => {
    const el = document.getElementById(f.key);
    if (el) el.value = '0';
  });

  // Reset dropdown quick-selector
  const selectLoss = dom.selectDowntimeLoss || document.getElementById('select-downtime-loss');
  if (selectLoss) selectLoss.selectedIndex = 0;
  const inputMins = dom.inputDropdownLossMins || document.getElementById('input-dropdown-loss-mins');
  if (inputMins) inputMins.value = '15';
  const statusEl = dom.lossDropdownStatus || document.getElementById('loss-dropdown-status');
  if (statusEl) statusEl.style.display = 'none';

  if (dom.inputRemarks) dom.inputRemarks.value = '';
}

/**
 * Live Auto-Calculated Ribbon on Page 2 (Calculates OEE, Pillars, & Productivity)
 */
function updateLiveOeeCalculations() {
  const shiftHours = parseFloat(dom.inputShiftHours ? dom.inputShiftHours.value : 8.5) || 8.5;

  const parts = [
    {
      name: dom.inputPart1Name ? dom.inputPart1Name.value.trim() : '',
      cycleTime: parseFloat(dom.inputPart1Cycle ? dom.inputPart1Cycle.value : 0) || 0,
      qty: parseInt(dom.inputPart1Qty ? dom.inputPart1Qty.value : 0, 10) || 0
    },
    {
      name: dom.inputPart2Name ? dom.inputPart2Name.value.trim() : '',
      cycleTime: parseFloat(dom.inputPart2Cycle ? dom.inputPart2Cycle.value : 0) || 0,
      qty: parseInt(dom.inputPart2Qty ? dom.inputPart2Qty.value : 0, 10) || 0
    },
    {
      name: dom.inputPart3Name ? dom.inputPart3Name.value.trim() : '',
      cycleTime: parseFloat(dom.inputPart3Cycle ? dom.inputPart3Cycle.value : 0) || 0,
      qty: parseInt(dom.inputPart3Qty ? dom.inputPart3Qty.value : 0, 10) || 0
    }
  ];

  const lossesObj = {};
  LOSS_FIELDS.forEach(f => {
    const el = document.getElementById(f.key);
    lossesObj[f.key] = el ? (parseFloat(el.value) || 0) : 0;
  });

  const rejectedQty = parseInt(dom.inputRejectedQty ? dom.inputRejectedQty.value : 0, 10) || 0;

  const oeeResult = calculateOEE(shiftHours, parts, lossesObj, rejectedQty);

  if (dom.liveCalcPlannedTime) dom.liveCalcPlannedTime.textContent = `${oeeResult.plannedTimeMins}m`;
  if (dom.liveCalcTotalLoss) dom.liveCalcTotalLoss.textContent = `${oeeResult.totalLossesMins}m`;
  if (dom.liveCalcOperatingTime) dom.liveCalcOperatingTime.textContent = `${oeeResult.operatingTimeMins}m`;
  if (dom.liveCalcAvailability) dom.liveCalcAvailability.textContent = `${oeeResult.availabilityRate}%`;
  if (dom.liveCalcPerformance) dom.liveCalcPerformance.textContent = `${oeeResult.performanceRate}%`;
  if (dom.liveCalcQuality) dom.liveCalcQuality.textContent = `${oeeResult.qualityRate}%`;
  if (dom.liveCalcOee) {
    dom.liveCalcOee.textContent = `${oeeResult.oeeRate}%`;
    if (oeeResult.oeeRate >= 85) {
      dom.liveCalcOee.style.color = 'var(--emerald-400)';
    } else if (oeeResult.oeeRate >= 70) {
      dom.liveCalcOee.style.color = 'var(--cyan-400)';
    } else {
      dom.liveCalcOee.style.color = 'var(--rose-400)';
    }
  }

  if (dom.liveCalcProductivity) {
    dom.liveCalcProductivity.textContent = `${oeeResult.productivityRate} pcs/h`;
    if (oeeResult.productivityRate > 0) {
      dom.liveCalcProductivity.style.color = 'var(--amber-400)';
    } else {
      dom.liveCalcProductivity.style.color = 'var(--text-muted)';
    }
  }

  return oeeResult;
}

/**
 * Handle Production Detail Form Submission
 */
async function handleFormSubmit(e) {
  e.preventDefault();

  const shiftHours = parseFloat(dom.inputShiftHours.value) || 8.5;
  const operatorName = dom.inputOperator.value.trim() || 'Operator';
  const logDate = dom.inputDate.value || new Date().toISOString().split('T')[0];
  const shift = dom.inputShift.value || 'Shift A';

  const parts = [
    {
      name: dom.inputPart1Name.value.trim(),
      cycleTime: parseFloat(dom.inputPart1Cycle.value) || 0,
      qty: parseInt(dom.inputPart1Qty.value, 10) || 0
    },
    {
      name: dom.inputPart2Name.value.trim(),
      cycleTime: parseFloat(dom.inputPart2Cycle.value) || 0,
      qty: parseInt(dom.inputPart2Qty.value, 10) || 0
    },
    {
      name: dom.inputPart3Name.value.trim(),
      cycleTime: parseFloat(dom.inputPart3Cycle.value) || 0,
      qty: parseInt(dom.inputPart3Qty.value, 10) || 0
    }
  ];

  const lossesObj = {};
  let primaryLossReason = 'None';
  let maxLossVal = 0;

  LOSS_FIELDS.forEach(f => {
    const el = document.getElementById(f.key);
    const val = el ? (parseFloat(el.value) || 0) : 0;
    lossesObj[f.key] = val;
    if (val > maxLossVal) {
      maxLossVal = val;
      primaryLossReason = f.label;
    }
  });

  const rejectedQty = parseInt(dom.inputRejectedQty.value, 10) || 0;
  const oeeResult = calculateOEE(shiftHours, parts, lossesObj, rejectedQty);

  const entryRecord = {
    machine_code: state.currentMachine.code,
    machine_name: state.currentMachine.name,
    log_date: logDate,
    shift,
    shift_hours: shiftHours,
    operator_name: operatorName,

    part1_name: parts[0].name,
    part1_cycle_time: parts[0].cycleTime,
    part1_qty: parts[0].qty,

    part2_name: parts[1].name,
    part2_cycle_time: parts[1].cycleTime,
    part2_qty: parts[1].qty,

    part3_name: parts[2].name,
    part3_cycle_time: parts[2].cycleTime,
    part3_qty: parts[2].qty,

    total_qty: oeeResult.totalQty,
    rejected_qty: oeeResult.rejectedQty,
    good_qty: oeeResult.goodQty,

    ...lossesObj,
    remarks: dom.inputRemarks.value.trim() || `${primaryLossReason} recorded`,

    total_losses_mins: oeeResult.totalLossesMins,
    planned_time_mins: oeeResult.plannedTimeMins,
    operating_time_mins: oeeResult.operatingTimeMins,
    ideal_run_time_mins: oeeResult.idealRunTimeMins,

    availability_rate: oeeResult.availabilityRate,
    performance_rate: oeeResult.performanceRate,
    quality_rate: oeeResult.qualityRate,
    oee_rate: oeeResult.oeeRate,
    productivity_rate: oeeResult.productivityRate
  };

  const btnSubmit = document.getElementById('btn-submit-entry');
  if (btnSubmit) {
    btnSubmit.disabled = true;
    btnSubmit.textContent = 'Saving Record...';
  }

  try {
    const res = await saveProductionEntry(entryRecord);
    const syncMsg = res.supabaseSynced ? ' (Synced to Cloud)' : ' (Saved Locally)';
    showToast(`✓ Shift logged for ${state.currentMachine.name}! OEE: ${entryRecord.oee_rate}% • Productivity: ${entryRecord.productivity_rate} pcs/h${syncMsg}`, 'success');

    setDefaultFormValues();
    updateLiveOeeCalculations();
    updateEnteredRecordsBadge();

    // Navigate to Analytics & focus this machine
    selectMachine(state.currentMachine.code);
    switchView('view-analytics');
  } catch (err) {
    showToast(`Error saving record: ${err.message}`, 'error');
  } finally {
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
          <polyline points="17 21 17 13 7 13 7 21"></polyline>
          <polyline points="7 3 7 8 15 8"></polyline>
        </svg>
        Save Record & View Dashboard
      `;
    }
  }
}

// ==============================================================================
// ENTERED PRODUCTION LOG RECORDS MODAL & INSPECTOR
// ==============================================================================

async function updateEnteredRecordsBadge() {
  try {
    const entries = await getProductionEntries();
    const count = entries ? entries.length : 0;
    const badge1 = document.getElementById('badge-entered-count');
    if (badge1) badge1.textContent = count;
    const badge2 = document.querySelector('.badge-entered-dash-count');
    if (badge2) badge2.textContent = count;
  } catch (_) { }
}

async function openEnteredDataModal() {
  const modal = document.getElementById('modal-entered-data');
  if (!modal) return;

  // Populate machine filter dropdown if not populated yet
  const selectMach = document.getElementById('filter-entered-machine');
  if (selectMach && selectMach.options.length <= 1) {
    selectMach.innerHTML = '<option value="ALL">All 11 Machines</option>';
    MACHINES.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.code;
      opt.textContent = `${m.name} (${m.category})`;
      selectMach.appendChild(opt);
    });
  }

  modal.classList.remove('hidden');
  await filterAndRenderEnteredData();
}

function closeEnteredDataModal() {
  const modal = document.getElementById('modal-entered-data');
  if (modal) modal.classList.add('hidden');
}

async function filterAndRenderEnteredData() {
  const tbody = document.getElementById('entered-data-tbody');
  if (!tbody) return;

  const entries = await getProductionEntries();
  const searchQ = (document.getElementById('input-search-entered')?.value || '').toLowerCase().trim();
  const machFilter = document.getElementById('filter-entered-machine')?.value || 'ALL';
  const shiftFilter = document.getElementById('filter-entered-shift')?.value || 'ALL';

  let filtered = (entries || []).filter(e => {
    if (machFilter !== 'ALL' && e.machine_code !== machFilter) return false;
    if (shiftFilter !== 'ALL' && e.shift !== shiftFilter) return false;
    if (searchQ) {
      const textBlock = `${e.operator_name || ''} ${e.machine_name || ''} ${e.machine_code || ''} ${e.part1_name || ''} ${e.part2_name || ''} ${e.part3_name || ''} ${e.remarks || ''}`.toLowerCase();
      if (!textBlock.includes(searchQ)) return false;
    }
    return true;
  });

  window._currentFilteredEntries = filtered;

  // Update Ribbon Stats
  const statCount = document.getElementById('stat-entered-count');
  const statGood = document.getElementById('stat-entered-good');
  const statScrap = document.getElementById('stat-entered-scrap');
  const statLosses = document.getElementById('stat-entered-losses');
  const statOee = document.getElementById('stat-entered-oee');

  let totalGood = 0;
  let totalScrap = 0;
  let totalLosses = 0;
  let weightedOeeSum = 0;
  let totalPlannedMins = 0;

  filtered.forEach(e => {
    totalGood += Number(e.good_qty) || 0;
    totalScrap += Number(e.rejected_qty) || 0;
    totalLosses += Number(e.total_losses_mins) || 0;
    const planned = Number(e.planned_time_mins) || 465;
    totalPlannedMins += planned;
    weightedOeeSum += (Number(e.oee_rate) || 0) * planned;
  });

  const avgOee = totalPlannedMins > 0 ? (weightedOeeSum / totalPlannedMins).toFixed(1) : '0.0';

  if (statCount) statCount.textContent = filtered.length;
  if (statGood) statGood.textContent = `${totalGood.toLocaleString()} pcs`;
  if (statScrap) statScrap.textContent = `${totalScrap.toLocaleString()} pcs`;
  if (statLosses) statLosses.textContent = `${totalLosses.toLocaleString()}m`;
  if (statOee) statOee.textContent = `${avgOee}%`;

  tbody.innerHTML = '';

  if (filtered.length === 0) {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td colspan="13">
        <div class="empty-state-wrap">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
          </svg>
          <h4>No Production Records Found</h4>
          <p>No shift records match your current filter. Log production for any machine to check entered data.</p>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
    return;
  }

  filtered.forEach(e => {
    const tr = document.createElement('tr');

    // OEE badge color
    const oeeNum = Number(e.oee_rate) || 0;
    let oeeClass = 'optimal';
    if (oeeNum < 65) oeeClass = 'critical';
    else if (oeeNum < 85) oeeClass = 'warning';

    // Parts details
    const partsArr = [];
    if (e.part1_name) partsArr.push(`${e.part1_name} (${e.part1_qty}pcs @ ${e.part1_cycle_time}m)`);
    if (e.part2_name) partsArr.push(`${e.part2_name} (${e.part2_qty}pcs @ ${e.part2_cycle_time}m)`);
    if (e.part3_name) partsArr.push(`${e.part3_name} (${e.part3_qty}pcs @ ${e.part3_cycle_time}m)`);
    const partsHtml = partsArr.length > 0 ? partsArr.join('<br>') : '<span style="color: var(--text-muted)">-</span>';

    // Losses breakdown
    const lossesArr = [];
    LOSS_FIELDS.forEach(f => {
      const val = Number(e[f.key]) || 0;
      if (val > 0) {
        lossesArr.push(`<span style="color: var(--text-secondary)">${f.label}:</span> <strong>${val}m</strong>`);
      }
    });
    const lossesHtml = lossesArr.length > 0 
      ? `<div style="max-width: 220px; white-space: normal; line-height: 1.35; font-size: 0.78rem;">${lossesArr.join(', ')}</div>` 
      : '<span style="color: var(--emerald-400); font-weight: 600;">0m (Zero Loss)</span>';

    tr.innerHTML = `
      <td>
        <strong style="color: #ffffff;">${e.log_date || '-'}</strong><br>
        <span style="font-size: 0.75rem; color: var(--lemken-blue); font-weight: 700;">${e.shift || '-'}</span>
      </td>
      <td>
        <strong style="color: #ffffff;">${e.machine_name || e.machine_code}</strong><br>
        <span style="font-size: 0.72rem; color: var(--text-muted); font-family: var(--font-mono);">${e.machine_code}</span>
      </td>
      <td>
        <span style="font-weight: 600; color: #f8fafc;">${e.operator_name || 'Operator'}</span>
      </td>
      <td style="font-size: 0.8rem; line-height: 1.4;">
        ${partsHtml}
      </td>
      <td>
        <strong style="color: var(--emerald-400);">${Number(e.good_qty || 0).toLocaleString()}</strong> / 
        <span style="color: var(--rose-400); font-weight: 600;">${Number(e.rejected_qty || 0).toLocaleString()}</span>
      </td>
      <td style="font-family: var(--font-mono); font-size: 0.78rem;">
        <span>${e.planned_time_mins || 0}m</span> / 
        <span style="color: var(--emerald-400);">${e.operating_time_mins || 0}m</span> / 
        <span style="color: var(--rose-400);">${e.total_losses_mins || 0}m</span>
      </td>
      <td style="font-family: var(--font-mono);">${e.availability_rate || 0}%</td>
      <td style="font-family: var(--font-mono);">${e.performance_rate || 0}%</td>
      <td style="font-family: var(--font-mono);">${e.quality_rate || 0}%</td>
      <td>
        <span class="oee-pill-table ${oeeClass}">${e.oee_rate || 0}%</span>
      </td>
      <td>
        ${lossesHtml}
      </td>
      <td>
        <div style="max-width: 160px; white-space: normal; line-height: 1.3; font-size: 0.76rem; color: var(--text-muted);">
          ${e.remarks || 'None'}
        </div>
      </td>
      <td>
        <button type="button" class="btn-table-delete" data-id="${e.id}" title="Delete this entry">
          Delete
        </button>
      </td>
    `;

    const btnDel = tr.querySelector('.btn-table-delete');
    if (btnDel) {
      btnDel.addEventListener('click', async (evt) => {
        evt.stopPropagation();
        const ok = confirm(`Delete entry for ${e.machine_name} on ${e.log_date} (${e.shift})?`);
        if (!ok) return;
        await deleteProductionEntry(e.id);
        showToast('Shift record deleted.', 'info');
        await filterAndRenderEnteredData();
        updateEnteredRecordsBadge();
        if (state.currentView === 'view-analytics') {
          await renderAnalyticsDashboard();
        }
      });
    }

    tbody.appendChild(tr);
  });
}

