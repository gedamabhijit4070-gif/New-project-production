/**
 * Industrial Production & OEE Loss Tracker - Standalone Universal Bundle
 * Contains Machines Configuration, Storage Layer, OEE Engine, CSV Exporter, and App Controller.
 * Fully compatible with file:/// local execution (no CORS module restrictions) and HTTP/HTTPS.
 */

// ==============================================================================
// 1. MACHINES & 15 DOWNTIME LOSS CATEGORIES CONFIGURATION
// ==============================================================================

const MACHINES = [
  { id: 'm1', code: 'CNC-DX200-1', name: 'CNC DX 200-1', category: 'CNC' },
  { id: 'm2', code: 'CNC-200-2', name: 'CNC 200-2', category: 'CNC' },
  { id: 'm3', code: 'CNC-DX250', name: 'CNC DX 250', category: 'CNC' },
  { id: 'm4', code: 'CNC-DX12B', name: 'CNC DX12B', category: 'CNC' },
  { id: 'm5', code: 'VMC-1050', name: 'VMC 1050', category: 'VMC' },
  { id: 'm6', code: 'VMC-1880', name: 'VMC 1880', category: 'VMC' },
  { id: 'm7', code: 'VMC-850', name: 'VMC 850', category: 'VMC' },
  { id: 'm8', code: 'VMC-HAAS', name: 'VMC HAAS', category: 'VMC' },
  { id: 'm9', code: 'VMC-PX20', name: 'VMC PX 20', category: 'VMC' },
  { id: 'm10', code: 'HMC-1', name: 'HMC 1', category: 'HMC' },
  { id: 'm11', code: 'HMC-2', name: 'HMC 2', category: 'HMC' }
];

const LOSS_FIELDS = [
  { key: 'loss_breakdown', label: 'Breakdown Loss', category: 'Equipment' },
  { key: 'loss_no_plan', label: 'No Plan', category: 'Management' },
  { key: 'loss_no_material', label: 'No Material', category: 'Logistics' },
  { key: 'loss_no_operator', label: 'No Operator', category: 'Manpower' },
  { key: 'loss_startup', label: 'Start Up', category: 'Process' },
  { key: 'loss_setup', label: 'Setup', category: 'Process' },
  { key: 'loss_tool_insert', label: 'Tool & Insert Loss', category: 'Tooling' },
  { key: 'loss_jig_fixture', label: 'Jig & Fixture Issue', category: 'Tooling' },
  { key: 'loss_programming', label: 'Programming Loss', category: 'Process' },
  { key: 'loss_measurement', label: 'Measurement & Adjustment', category: 'Quality' },
  { key: 'loss_document', label: 'Document Loss', category: 'Management' },
  { key: 'loss_speed', label: 'Speed Loss', category: 'Performance' },
  { key: 'loss_quality_insp', label: 'Quality Inspection', category: 'Quality' },
  { key: 'loss_cleaning', label: 'Cleaning', category: 'Maintenance' },
  { key: 'loss_other', label: 'Other Losses', category: 'Other' }
];

const SUPABASE_CONFIG = {
  url: 'https://hqkxzxmpbocsqeurmvjs.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhxa3h6eG1wYm9jc3FldXJtdmpzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg2OTA4OTQsImV4cCI6MjEwNDI2Njg5NH0.ecizDXHhbaRLqswZWhVtzuljN_1Fi41SF2Yr8zazsUA'
};

// ==============================================================================
// 2. STORAGE, OEE ENGINE, & COMPUTATIONS
// ==============================================================================

const STORAGE_KEY_CONFIG = 'prodtracker_supabase_config';
const STORAGE_KEY_MACHINES = 'prodtracker_machines_11';
const STORAGE_KEY_ENTRIES = 'prodtracker_oee_entries';

let supabaseClient = null;
let isSupabaseActive = false;

function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return '10000000-1000-4000-8000-' + Math.random().toString(16).substring(2, 14);
}

function getSupabaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    const localCfg = raw ? JSON.parse(raw) : null;
    const url = (SUPABASE_CONFIG && SUPABASE_CONFIG.url && SUPABASE_CONFIG.url.trim())
      ? SUPABASE_CONFIG.url.trim()
      : (localCfg && localCfg.url ? localCfg.url.trim() : '');
    const key = (SUPABASE_CONFIG && SUPABASE_CONFIG.anonKey && SUPABASE_CONFIG.anonKey.trim())
      ? SUPABASE_CONFIG.anonKey.trim()
      : (localCfg && localCfg.key ? localCfg.key.trim() : '');
    return { url, key };
  } catch (e) {
    return { url: '', key: '' };
  }
}

function saveSupabaseConfig(url, key) {
  try {
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ url: url.trim(), key: key.trim() }));
    supabaseClient = null;
  } catch (e) { }
}

function getOrCreateSupabaseClient() {
  if (supabaseClient) return supabaseClient;
  const config = getSupabaseConfig();
  if (config.url && config.key && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(config.url, config.key);
    } catch (err) {
      console.warn('Supabase createClient error:', err);
    }
  }
  return supabaseClient;
}

async function waitForSupabaseLib(maxWaitMs = 2500) {
  const start = Date.now();
  while (!window.supabase && (Date.now() - start) < maxWaitMs) {
    await new Promise(r => setTimeout(r, 100));
  }
  return !!window.supabase;
}

async function testSupabaseConnection(url, key) {
  if (!window.supabase) {
    return { success: false, message: 'Supabase library not loaded. Check internet connection.' };
  }
  try {
    const tempClient = window.supabase.createClient(url, key);
    const { data, error } = await tempClient
      .from('production_entries')
      .select('id')
      .limit(1);

    if (error && error.code !== 'PGRST116') {
      return { success: false, message: `Database error: ${error.message}` };
    }
    return { success: true, message: 'Supabase Cloud Connected Successfully!' };
  } catch (err) {
    return { success: false, message: `Connection failed: ${err.message}` };
  }
}

async function initStorage() {
  try {
    if (!localStorage.getItem(STORAGE_KEY_MACHINES)) {
      localStorage.setItem(STORAGE_KEY_MACHINES, JSON.stringify(MACHINES));
    }

    // Detect if switching project credentials and flush stale cache
    const activeUrl = (SUPABASE_CONFIG && SUPABASE_CONFIG.url) ? SUPABASE_CONFIG.url.trim() : '';
    const storedCfgRaw = localStorage.getItem(STORAGE_KEY_CONFIG);
    let storedUrl = '';
    try {
      const parsedCfg = storedCfgRaw ? JSON.parse(storedCfgRaw) : null;
      storedUrl = parsedCfg && parsedCfg.url ? parsedCfg.url.trim() : '';
    } catch (_) {}

    if (storedUrl && activeUrl && storedUrl !== activeUrl) {
      console.log('🔄 Switched to new Supabase project. Purging previous cached records.');
      localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify([]));
      localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ url: activeUrl, key: SUPABASE_CONFIG.anonKey.trim() }));
      supabaseClient = null;
    }

    const existingRaw = localStorage.getItem(STORAGE_KEY_ENTRIES);
    if (!existingRaw) {
      localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify([]));
    } else {
      try {
        const parsed = JSON.parse(existingRaw);
        const containsMock = parsed.some(e => e.id === 'entry-101' || e.id === 'entry-102');
        if (containsMock) {
          localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify([]));
        }
      } catch (e) {
        localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify([]));
      }
    }

    await waitForSupabaseLib(2000);
    const client = getOrCreateSupabaseClient();
    if (client) {
      const config = getSupabaseConfig();
      const test = await testSupabaseConnection(config.url, config.key);
      isSupabaseActive = test.success;
      if (isSupabaseActive) {
        console.log(`⚡ Supabase Cloud Connected & Active: ${config.url}`);
      }
    }

    // Eagerly fetch entries from the new Supabase project
    const entries = await getProductionEntries();
    console.log(`✓ Synchronized ${entries.length} shift entries from new database project`);
  } catch (err) {
    console.warn('Storage initialization warning:', err);
  }

  return { isSupabaseActive };
}

function isConnectedToSupabase() {
  return isSupabaseActive;
}

function getMachines() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_MACHINES);
    return raw ? JSON.parse(raw) : MACHINES;
  } catch (e) {
    return MACHINES;
  }
}

async function getProductionEntries() {
  const client = getOrCreateSupabaseClient();
  if (client) {
    try {
      const { data, error } = await client
        .from('production_entries')
        .select('*')
        .order('log_date', { ascending: false })
        .order('created_at', { ascending: false });

      if (!error && Array.isArray(data)) {
        isSupabaseActive = true;
        updateSupabaseStatusIndicator();
        try { localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(data)); } catch (_) { }
        return data;
      } else if (error) {
        console.warn('Supabase fetch error:', error.message, error);
      }
    } catch (err) {
      console.warn('Supabase fetch failed, falling back to local storage:', err);
    }
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENTRIES);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

async function saveProductionEntry(entry) {
  if (!entry.id) entry.id = generateUUID();
  if (!entry.created_at) entry.created_at = new Date().toISOString();

  let currentEntries = [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENTRIES);
    currentEntries = raw ? JSON.parse(raw) : [];
  } catch (_) { }

  const existingIdx = currentEntries.findIndex(e => e.id === entry.id);
  if (existingIdx >= 0) {
    currentEntries[existingIdx] = entry;
  } else {
    currentEntries.unshift(entry);
  }
  try { localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(currentEntries)); } catch (_) { }

  const client = getOrCreateSupabaseClient();
  if (client) {
    try {
      let { data, error } = await client
        .from('production_entries')
        .upsert(entry, { onConflict: 'id' });

      if (error) {
        console.warn('Supabase upsert error:', error.message, error);
        // If column error or schema error (e.g. productivity_rate not yet added in database table)
        if (error.code === '42703' || (error.message && error.message.includes('productivity_rate'))) {
          console.log('Retrying Supabase upsert without productivity_rate column...');
          const { productivity_rate, ...cleanEntry } = entry;
          const retryRes = await client
            .from('production_entries')
            .upsert(cleanEntry, { onConflict: 'id' });
          if (retryRes.error) {
            console.error('Supabase retry failed:', retryRes.error.message);
            showToast(`⚠️ Cloud save error: ${retryRes.error.message}. Saved locally.`, 'warning');
          } else {
            isSupabaseActive = true;
            console.log('✓ Supabase upsert succeeded without productivity_rate');
          }
        } else {
          showToast(`⚠️ Supabase save note: ${error.message}. Stored locally.`, 'info');
        }
      } else {
        isSupabaseActive = true;
        console.log('✓ Successfully saved record to Supabase Cloud Database');
      }
    } catch (err) {
      console.warn('Supabase upsert exception, stored locally:', err);
    }
  }

  return entry;
}

async function deleteProductionEntry(id) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENTRIES);
    let currentEntries = raw ? JSON.parse(raw) : [];
    currentEntries = currentEntries.filter(e => e.id !== id);
    localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(currentEntries));
  } catch (_) { }

  const client = getOrCreateSupabaseClient();
  if (client) {
    try {
      await client.from('production_entries').delete().eq('id', id);
    } catch (err) {
      console.warn('Supabase delete failed:', err);
    }
  }
}

async function clearAllProductionEntries() {
  try {
    localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify([]));
  } catch (_) { }

  const client = getOrCreateSupabaseClient();
  if (client) {
    try {
      await client.from('production_entries').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    } catch (err) {
      console.warn('Supabase clear failed:', err);
    }
  }
}

function calculateOEE(shiftHours, parts, lossesObj, rejectedQty) {
  const plannedTimeMins = Number(shiftHours) === 8.5 ? 465 : (Number(shiftHours) === 7.0 ? 390 : Math.round((Number(shiftHours) || 8.5) * 60));

  let totalLossesMins = 0;
  LOSS_FIELDS.forEach(f => {
    totalLossesMins += Number(lossesObj[f.key]) || 0;
  });

  const operatingTimeMins = Math.max(0, plannedTimeMins - totalLossesMins);

  let totalQty = 0;
  let idealRunTimeMins = 0;

  parts.forEach(p => {
    const q = Number(p.qty) || 0;
    const ct = Number(p.cycleTime) || 0;
    totalQty += q;
    idealRunTimeMins += (q * ct);
  });

  const rejQty = Number(rejectedQty) || 0;
  const goodQty = Math.max(0, totalQty - rejQty);

  const availabilityRate = plannedTimeMins > 0 ? Number(((operatingTimeMins / plannedTimeMins) * 100).toFixed(1)) : 0;
  const performanceRate = operatingTimeMins > 0 ? Number(Math.min(100, (idealRunTimeMins / operatingTimeMins) * 100).toFixed(1)) : 0;
  const qualityRate = totalQty > 0 ? Number(Math.min(100, (goodQty / totalQty) * 100).toFixed(1)) : 100;
  const oeeRate = Number(((availabilityRate * performanceRate * qualityRate) / 10000).toFixed(1));
  const productivityRate = operatingTimeMins > 0 ? Number(((goodQty * 60) / operatingTimeMins).toFixed(1)) : 0;

  return {
    plannedTimeMins,
    totalLossesMins,
    operatingTimeMins,
    idealRunTimeMins: Number(idealRunTimeMins.toFixed(2)),
    totalQty,
    rejectedQty: rejQty,
    goodQty,
    availabilityRate,
    performanceRate,
    qualityRate,
    oeeRate,
    productivityRate
  };
}

function calculateTimeWeightedOEE(entries) {
  if (!entries || entries.length === 0) {
    const emptyBreakdown = {};
    const emptyCounts = {};
    LOSS_FIELDS.forEach(f => {
      emptyBreakdown[f.key] = 0;
      emptyCounts[f.key] = 0;
    });
    return {
      shiftCount: 0,
      plannedTimeMins: 0,
      operatingTimeMins: 0,
      totalLossesMins: 0,
      idealRunTimeMins: 0,
      totalQty: 0,
      goodQty: 0,
      rejectedQty: 0,
      availabilityRate: 0,
      performanceRate: 0,
      qualityRate: 100,
      oeeRate: 0,
      productivityRate: 0,
      lossBreakdown: emptyBreakdown,
      lossCounts: emptyCounts,
      topLoss: null,
      primaryLossReason: 'None'
    };
  }

  let plannedTimeMins = 0;
  let operatingTimeMins = 0;
  let totalLossesMins = 0;
  let idealRunTimeMins = 0;
  let totalQty = 0;
  let goodQty = 0;
  let rejectedQty = 0;

  const lossBreakdown = {};
  const lossCounts = {};
  LOSS_FIELDS.forEach(f => {
    lossBreakdown[f.key] = 0;
    lossCounts[f.key] = 0;
  });

  entries.forEach(e => {
    plannedTimeMins += Number(e.planned_time_mins) || 465;
    operatingTimeMins += Number(e.operating_time_mins) || 465;
    totalLossesMins += Number(e.total_losses_mins) || 0;
    idealRunTimeMins += Number(e.ideal_run_time_mins) || 0;
    totalQty += Number(e.total_qty) || 0;
    goodQty += Number(e.good_qty) || 0;
    rejectedQty += Number(e.rejected_qty) || 0;

    LOSS_FIELDS.forEach(f => {
      const val = Number(e[f.key]) || 0;
      if (val > 0) {
        lossBreakdown[f.key] += val;
        lossCounts[f.key] += 1;
      }
    });
  });

  const availabilityRate = plannedTimeMins > 0 ? Number(((operatingTimeMins / plannedTimeMins) * 100).toFixed(1)) : 0;
  const performanceRate = operatingTimeMins > 0 ? Number(Math.min(100, (idealRunTimeMins / operatingTimeMins) * 100).toFixed(1)) : 0;
  const qualityRate = totalQty > 0 ? Number(Math.min(100, (goodQty / totalQty) * 100).toFixed(1)) : 100;
  const oeeRate = Number(((availabilityRate * performanceRate * qualityRate) / 10000).toFixed(1));
  const productivityRate = operatingTimeMins > 0 ? Number(((goodQty * 60) / operatingTimeMins).toFixed(1)) : 0;

  let topLoss = null;
  let maxMins = 0;
  LOSS_FIELDS.forEach(f => {
    if (lossBreakdown[f.key] > maxMins) {
      maxMins = lossBreakdown[f.key];
      topLoss = { key: f.key, label: f.label, mins: maxMins, category: f.category };
    }
  });

  return {
    shiftCount: entries.length,
    plannedTimeMins,
    operatingTimeMins,
    totalLossesMins,
    idealRunTimeMins: Number(idealRunTimeMins.toFixed(2)),
    totalQty,
    goodQty,
    rejectedQty,
    availabilityRate,
    performanceRate,
    qualityRate,
    oeeRate,
    productivityRate,
    lossBreakdown,
    lossCounts,
    topLoss,
    primaryLossReason: topLoss ? topLoss.label : 'None'
  };
}

function getISOWeekDetails(dateStr) {
  const d = new Date(dateStr);
  const target = new Date(d.valueOf());
  const dayNr = (d.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay()) + 7) % 7);
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
  const year = new Date(firstThursday).getFullYear();
  return { key: `${year}-W${String(weekNumber).padStart(2, '0')}`, label: `Week ${weekNumber} (${year})` };
}

function formatDayLabel(dateStr) {
  try {
    const [y, m, d] = dateStr.split('-');
    const dt = new Date(y, m - 1, d);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (_) {
    return dateStr;
  }
}

function formatMonthLabel(monthKey) {
  try {
    const [y, m] = monthKey.split('-');
    const dt = new Date(y, m - 1, 1);
    return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  } catch (_) {
    return monthKey;
  }
}

async function getPeriodicAnalytics({ machineCode = 'ALL', periodType = 'daily', periodValue = 'LATEST' }) {
  const allEntries = await getProductionEntries();
  const rawDays = new Set();
  const rawWeeksMap = new Map();
  const rawMonths = new Set();

  allEntries.forEach(e => {
    if (!e.log_date) return;
    rawDays.add(e.log_date);
    const wInfo = getISOWeekDetails(e.log_date);
    rawWeeksMap.set(wInfo.key, wInfo.label);
    rawMonths.add(e.log_date.substring(0, 7));
  });

  const availableDays = Array.from(rawDays).sort((a, b) => b.localeCompare(a)).map(d => ({ key: d, label: formatDayLabel(d) }));
  const availableWeeks = Array.from(rawWeeksMap.keys()).sort((a, b) => b.localeCompare(a)).map(k => ({ key: k, label: rawWeeksMap.get(k) }));
  const availableMonths = Array.from(rawMonths).sort((a, b) => b.localeCompare(a)).map(m => ({ key: m, label: formatMonthLabel(m) }));

  let activePeriodValue = periodValue;
  let activePeriodLabel = 'All Time';

  if (periodType === 'daily') {
    if (availableDays.length > 0) {
      if (periodValue === 'LATEST' || !availableDays.some(d => d.key === periodValue)) {
        activePeriodValue = availableDays[0].key;
      }
      activePeriodLabel = activePeriodValue === 'ALL' ? 'All Recorded Days' : formatDayLabel(activePeriodValue);
    } else {
      activePeriodValue = new Date().toISOString().split('T')[0];
      activePeriodLabel = formatDayLabel(activePeriodValue);
    }
  } else if (periodType === 'weekly') {
    if (availableWeeks.length > 0) {
      if (periodValue === 'LATEST' || !availableWeeks.some(w => w.key === periodValue)) {
        activePeriodValue = availableWeeks[0].key;
      }
      activePeriodLabel = activePeriodValue === 'ALL' ? 'All Recorded Weeks' : (rawWeeksMap.get(activePeriodValue) || activePeriodValue);
    } else {
      activePeriodValue = 'ALL';
      activePeriodLabel = 'All Weeks';
    }
  } else if (periodType === 'monthly') {
    if (availableMonths.length > 0) {
      if (periodValue === 'LATEST' || !availableMonths.some(m => m.key === periodValue)) {
        activePeriodValue = availableMonths[0].key;
      }
      activePeriodLabel = activePeriodValue === 'ALL' ? 'All Recorded Months' : formatMonthLabel(activePeriodValue);
    } else {
      activePeriodValue = 'ALL';
      activePeriodLabel = 'All Months';
    }
  } else {
    activePeriodValue = 'ALL';
    activePeriodLabel = 'All-Time Horizon';
  }

  const periodFilteredEntries = allEntries.filter(e => {
    if (!e.log_date) return false;
    if (activePeriodValue === 'ALL') return true;
    if (periodType === 'daily') return e.log_date === activePeriodValue;
    if (periodType === 'weekly') return getISOWeekDetails(e.log_date).key === activePeriodValue;
    if (periodType === 'monthly') return e.log_date.substring(0, 7) === activePeriodValue;
    return true;
  });

  const machineMatrix = MACHINES.map(m => {
    const mEntries = periodFilteredEntries.filter(e => e.machine_code === m.code);
    const metrics = calculateTimeWeightedOEE(mEntries);
    let status = '🔴 Attention';
    if (metrics.oeeRate >= 85) status = '🟢 World Class';
    else if (metrics.oeeRate >= 75) status = '🟡 Good';
    else if (metrics.shiftCount === 0) status = '⚪ Idle';

    return {
      code: m.code,
      name: m.name,
      category: m.category,
      shiftCount: metrics.shiftCount,
      plannedHours: (metrics.plannedTimeMins / 60).toFixed(1),
      operatingHours: (metrics.operatingTimeMins / 60).toFixed(1),
      lossHours: (metrics.totalLossesMins / 60).toFixed(1),
      availability: metrics.availabilityRate,
      performance: metrics.performanceRate,
      quality: metrics.qualityRate,
      oee: metrics.oeeRate,
      productivity: metrics.productivityRate,
      totalOutput: metrics.totalQty,
      goodQty: metrics.goodQty,
      scrapQty: metrics.rejectedQty,
      topLoss: metrics.topLoss,
      status
    };
  });

  const focusedEntries = machineCode === 'ALL' ? periodFilteredEntries : periodFilteredEntries.filter(e => e.machine_code === machineCode);
  const focusedMetrics = calculateTimeWeightedOEE(focusedEntries);

  const selectedMachine = machineCode === 'ALL'
    ? { code: 'ALL', name: 'All 11 Machines Combined', category: 'Plant' }
    : (MACHINES.find(m => m.code === machineCode) || MACHINES[0]);

  const totalPeriodLossMins = focusedMetrics.totalLossesMins;
  const detailedLossList = LOSS_FIELDS.map(f => {
    const mins = focusedMetrics.lossBreakdown[f.key] || 0;
    const count = focusedMetrics.lossCounts[f.key] || 0;
    const pctOfLoss = totalPeriodLossMins > 0 ? Number(((mins / totalPeriodLossMins) * 100).toFixed(1)) : 0;
    const impactOnAvail = focusedMetrics.plannedTimeMins > 0 ? Number(((mins / focusedMetrics.plannedTimeMins) * 100).toFixed(1)) : 0;

    return {
      key: f.key,
      label: f.label,
      category: f.category,
      mins,
      hours: (mins / 60).toFixed(1),
      count,
      pctOfLoss,
      impactOnAvail
    };
  }).sort((a, b) => b.mins - a.mins);

  const machineHistoricalEntries = machineCode === 'ALL' ? allEntries : allEntries.filter(e => e.machine_code === machineCode);
  const trendGroupMap = new Map();

  machineHistoricalEntries.forEach(e => {
    if (!e.log_date) return;
    let groupKey = '';
    let groupLabel = '';

    if (periodType === 'daily') {
      groupKey = e.log_date;
      groupLabel = formatDayLabel(groupKey);
    } else if (periodType === 'weekly') {
      const wInfo = getISOWeekDetails(e.log_date);
      groupKey = wInfo.key;
      groupLabel = wInfo.label;
    } else if (periodType === 'monthly') {
      groupKey = e.log_date.substring(0, 7);
      groupLabel = formatMonthLabel(groupKey);
    } else {
      groupKey = e.log_date;
      groupLabel = formatDayLabel(groupKey);
    }

    if (!trendGroupMap.has(groupKey)) {
      trendGroupMap.set(groupKey, { groupKey, groupLabel, entries: [] });
    }
    trendGroupMap.get(groupKey).entries.push(e);
  });

  const trendPeriods = Array.from(trendGroupMap.keys())
    .sort((a, b) => a.localeCompare(b))
    .map(key => {
      const item = trendGroupMap.get(key);
      const metrics = calculateTimeWeightedOEE(item.entries);
      return {
        key,
        label: item.groupLabel,
        shiftCount: metrics.shiftCount,
        oee: metrics.oeeRate,
        availability: metrics.availabilityRate,
        performance: metrics.performanceRate,
        quality: metrics.qualityRate,
        productivity: metrics.productivityRate,
        operatingMins: metrics.operatingTimeMins,
        plannedMins: metrics.plannedTimeMins,
        lossMins: metrics.totalLossesMins,
        lossBreakdown: metrics.lossBreakdown,
        totalOutput: metrics.totalQty,
        goodQty: metrics.goodQty,
        scrapQty: metrics.rejectedQty,
        topLoss: metrics.topLoss
      };
    });

  const periodicHistory = Array.from(trendGroupMap.keys())
    .sort((a, b) => b.localeCompare(a))
    .map(key => {
      const item = trendGroupMap.get(key);
      const metrics = calculateTimeWeightedOEE(item.entries);
      return {
        key,
        label: item.groupLabel,
        shiftCount: metrics.shiftCount,
        plannedMins: metrics.plannedTimeMins,
        operatingMins: metrics.operatingTimeMins,
        lossMins: metrics.totalLossesMins,
        availabilityRate: metrics.availabilityRate,
        performanceRate: metrics.performanceRate,
        qualityRate: metrics.qualityRate,
        oeeRate: metrics.oeeRate,
        productivityRate: metrics.productivityRate,
        totalQty: metrics.totalQty,
        goodQty: metrics.goodQty,
        rejectedQty: metrics.rejectedQty,
        topLoss: metrics.topLoss
      };
    });

  const lossIncidents = focusedEntries
    .filter(e => (e.remarks && e.remarks.trim().length > 0) || (e.total_losses_mins && e.total_losses_mins > 0))
    .map(e => {
      let dominantLossLabel = 'Multiple Stoppages';
      let maxVal = 0;
      LOSS_FIELDS.forEach(f => {
        const val = Number(e[f.key]) || 0;
        if (val > maxVal) {
          maxVal = val;
          dominantLossLabel = f.label;
        }
      });

      return {
        id: e.id,
        date: e.log_date,
        shift: e.shift,
        machineName: e.machine_name,
        operator: e.operator_name,
        lossLabel: dominantLossLabel,
        remarks: e.remarks || `${dominantLossLabel} recorded without specific operator comment`,
        totalLossMins: e.total_losses_mins,
        category: LOSS_FIELDS.find(f => f.label === dominantLossLabel)?.category || 'Shopfloor'
      };
    });

  return {
    selectedMachine,
    periodType,
    activePeriodValue,
    activePeriodLabel,
    availableDays,
    availableWeeks,
    availableMonths,
    summary: focusedMetrics,
    machineMatrix,
    detailedLossList,
    trendPeriods,
    periodicHistory,
    lossIncidents,
    totalEntriesCount: allEntries.length
  };
}

async function seedDemoShiftData() {
  const generatedRecords = [];
  const now = new Date();

  for (let d = 20; d >= 0; d--) {
    const targetDate = new Date(now);
    targetDate.setDate(targetDate.getDate() - d);
    const dateStr = targetDate.toISOString().split('T')[0];

    for (const machine of MACHINES) {
      const shiftRoll = Math.random();
      const shiftsToRun = shiftRoll > 0.4 ? ['Shift A', 'Shift B'] : ['Shift A'];

      for (const shift of shiftsToRun) {
        const shiftHours = 8.5;
        const plannedTimeMins = 465;

        const partA = { name: `${machine.code}-SHAFT-01`, cycle: 2.2 };
        const partB = { name: `${machine.code}-FLANGE-02`, cycle: 3.5 };

        const qtyA = Math.floor(Math.random() * 40) + 70;
        const qtyB = Math.floor(Math.random() * 25) + 30;
        const totalQty = qtyA + qtyB;
        const rejectedQty = Math.floor(Math.random() * 4);
        const goodQty = totalQty - rejectedQty;

        const lossesObj = {};
        LOSS_FIELDS.forEach(f => { lossesObj[f.key] = 0; });

        let remarks = 'Normal operational run';
        const lossRoll = Math.random();
        if (lossRoll > 0.65) {
          if (machine.category === 'CNC') {
            lossesObj.loss_breakdown = Math.floor(Math.random() * 25) + 15;
            lossesObj.loss_tool_insert = Math.floor(Math.random() * 20) + 15;
            lossesObj.loss_measurement = 10;
            remarks = 'Roughing carbide insert chipped on OD turning tool T03; edge indexed and offset recalibrated';
          } else if (machine.category === 'VMC') {
            lossesObj.loss_tool_insert = Math.floor(Math.random() * 25) + 15;
            lossesObj.loss_jig_fixture = Math.floor(Math.random() * 20) + 15;
            lossesObj.loss_programming = 10;
            remarks = 'Face mill corner inserts worn out during high-speed profiling; replaced and touched off tool';
          } else {
            lossesObj.loss_setup = Math.floor(Math.random() * 35) + 20;
            lossesObj.loss_tool_insert = 15;
            lossesObj.loss_speed = 10;
            remarks = 'B-axis pallet shuttle alignment and twin fixture changeover with tool check';
          }
        } else if (lossRoll > 0.35) {
          lossesObj.loss_setup = 25;
          lossesObj.loss_startup = 15;
          lossesObj.loss_cleaning = 10;
          lossesObj.loss_measurement = 10;
          if (Math.random() > 0.5) {
            lossesObj.loss_other = 15;
            remarks = 'Coolant level top-up, first piece CMM inspection, and swarf clearance';
          } else {
            remarks = 'First piece CMM inspection and chip conveyor cleaning';
          }
        } else {
          lossesObj.loss_startup = 10;
          lossesObj.loss_cleaning = 10;
          lossesObj.loss_measurement = 5;
          remarks = 'Smooth shift; scheduled coolant top-up and inspection';
        }

        let totalLossesMins = 0;
        LOSS_FIELDS.forEach(f => {
          totalLossesMins += (Number(lossesObj[f.key]) || 0);
        });

        const operatingTimeMins = Math.max(0, plannedTimeMins - totalLossesMins);
        const idealRunTimeMins = Number(((qtyA * partA.cycle) + (qtyB * partB.cycle)).toFixed(2));
        const availabilityRate = Number(((operatingTimeMins / plannedTimeMins) * 100).toFixed(1));
        const performanceRate = operatingTimeMins > 0 ? Number(Math.min(100, (idealRunTimeMins / operatingTimeMins) * 100).toFixed(1)) : 0;
        const qualityRate = totalQty > 0 ? Number(Math.min(100, (goodQty / totalQty) * 100).toFixed(1)) : 100;
        const oeeRate = Number(((availabilityRate * performanceRate * qualityRate) / 10000).toFixed(1));
        const productivityRate = operatingTimeMins > 0 ? Number(((goodQty * 60) / operatingTimeMins).toFixed(1)) : 0;

        generatedRecords.push({
          id: generateUUID(),
          machine_code: machine.code,
          machine_name: machine.name,
          log_date: dateStr,
          shift,
          shift_hours: shiftHours,
          operator_name: `Operator ${shift === 'Shift A' ? '1' : '2'}`,
          part1_name: partA.name,
          part1_cycle_time: partA.cycle,
          part1_qty: qtyA,
          part2_name: partB.name,
          part2_cycle_time: partB.cycle,
          part2_qty: qtyB,
          part3_name: '',
          part3_cycle_time: 0,
          part3_qty: 0,
          total_qty: totalQty,
          rejected_qty: rejectedQty,
          good_qty: goodQty,
          ...lossesObj,
          remarks,
          total_losses_mins: totalLossesMins,
          planned_time_mins: plannedTimeMins,
          operating_time_mins: operatingTimeMins,
          ideal_run_time_mins: idealRunTimeMins,
          availability_rate: availabilityRate,
          performance_rate: performanceRate,
          quality_rate: qualityRate,
          oee_rate: oeeRate,
          productivity_rate: productivityRate,
          created_at: new Date(targetDate.getTime() + (shift === 'Shift A' ? 8 : 16) * 3600000).toISOString()
        });
      }
    }
  }

  try {
    localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(generatedRecords));
  } catch (_) { }

  if (isSupabaseActive && supabaseClient) {
    try {
      await supabaseClient.from('production_entries').upsert(generatedRecords, { onConflict: 'id' });
    } catch (err) {
      console.warn('Supabase batch seed error:', err);
    }
  }

  return generatedRecords;
}

// ==============================================================================
// 3. CSV EXPORT UTILITIES
// ==============================================================================

function triggerDownload(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function exportEntriesToCSV(entries, filename = 'Production_Entries_Export') {
  if (!entries || entries.length === 0) {
    alert('No production records available to export.');
    return;
  }

  const baseHeaders = [
    'Record ID', 'Date', 'Shift', 'Shift Hours', 'Machine Code', 'Machine Name',
    'Operator Name', 'Part 1 Name', 'Part 1 Cycle Time (min)', 'Part 1 Qty',
    'Part 2 Name', 'Part 2 Cycle Time (min)', 'Part 2 Qty', 'Part 3 Name',
    'Part 3 Cycle Time (min)', 'Part 3 Qty', 'Total Produced Qty',
    'Scrap / Rejected Qty', 'Good Produced Qty', 'Planned Shift Time (min)',
    'Operating Time (min)', 'Total Losses (min)', 'Ideal Run Time (min)',
    'Availability %', 'Performance %', 'Quality %', 'OEE %', 'Productivity (Parts/Hr)'
  ];

  const lossHeaders = LOSS_FIELDS.map(f => f.label + ' (min)');
  const allHeaders = [...baseHeaders, ...lossHeaders, 'Remarks / Root Cause', 'Created At'];

  const escapeField = (val) => {
    if (val === null || val === undefined) return '""';
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const rows = entries.map(e => {
    const productivityRate = e.productivity_rate !== undefined
      ? e.productivity_rate
      : (Number(e.operating_time_mins) > 0 ? Number(((Number(e.good_qty) * 60) / Number(e.operating_time_mins)).toFixed(1)) : 0);

    const baseRow = [
      escapeField(e.id), escapeField(e.log_date), escapeField(e.shift), e.shift_hours,
      escapeField(e.machine_code), escapeField(e.machine_name), escapeField(e.operator_name),
      escapeField(e.part1_name), e.part1_cycle_time, e.part1_qty,
      escapeField(e.part2_name), e.part2_cycle_time, e.part2_qty,
      escapeField(e.part3_name), e.part3_cycle_time, e.part3_qty,
      e.total_qty, e.rejected_qty, e.good_qty, e.planned_time_mins,
      e.operating_time_mins, e.total_losses_mins, e.ideal_run_time_mins,
      e.availability_rate, e.performance_rate, e.quality_rate, e.oee_rate,
      productivityRate
    ];

    const lossRow = LOSS_FIELDS.map(f => Number(e[f.key]) || 0);
    const endRow = [escapeField(e.remarks), escapeField(e.created_at || '')];
    return [...baseRow, ...lossRow, ...endRow].join(',');
  });

  const csvContent = [allHeaders.map(escapeField).join(','), ...rows].join('\r\n');
  triggerDownload(csvContent, filename);
}

function exportPeriodicReportToCSV(periodicData, filename = 'Shopfloor_Periodic_Report') {
  if (!periodicData) return;

  const escapeField = (val) => {
    if (val === null || val === undefined) return '""';
    return `"${String(val).replace(/"/g, '""')}"`;
  };

  const lines = [];
  lines.push(`"REPORT TITLE","Shopfloor OEE & 15-Loss Periodic Analysis"`);
  lines.push(`"HORIZON TYPE","${periodicData.periodType.toUpperCase()}"`);
  lines.push(`"SELECTED PERIOD","${escapeField(periodicData.activePeriodLabel)}"`);
  lines.push(`"SELECTED TARGET","${escapeField(periodicData.selectedMachine.name)} (${periodicData.selectedMachine.code})"`);
  lines.push(`"EXPORT TIMESTAMP","${new Date().toISOString()}"`);
  lines.push('');

  lines.push('"SECTION 1: 11-MACHINE PERFORMANCE MATRIX (SEPARATE MACHINE EVALUATION)"');
  const matrixHeaders = [
    'Machine Code', 'Machine Name', 'Type', 'Shifts', 'Planned Hours', 'Operating Hours',
    'Loss Hours', 'Availability %', 'Performance %', 'Quality %', 'OEE %',
    'Productivity (Parts/Hr)', 'Total Produced', 'Good Units', 'Scrap Units', 'Top Loss Category', 'Status'
  ];
  lines.push(matrixHeaders.map(escapeField).join(','));

  (periodicData.machineMatrix || []).forEach(m => {
    lines.push([
      escapeField(m.code), escapeField(m.name), escapeField(m.category), m.shiftCount,
      m.plannedHours, m.operatingHours, m.lossHours, m.availability, m.performance,
      m.quality, m.oee, m.productivity, m.totalOutput, m.goodQty, m.scrapQty,
      escapeField(m.topLoss ? `${m.topLoss.label} (${m.topLoss.mins}m)` : 'None'), escapeField(m.status)
    ].join(','));
  });

  lines.push('');
  lines.push(`"SECTION 2: 15-LOSS BREAKDOWN FOR ${escapeField(periodicData.selectedMachine.name)}"`);
  const lossHeaders = [
    'Loss Name', 'Category', 'Total Downtime (Mins)', 'Total Downtime (Hours)',
    'Incident Count', '% of Downtime', 'Impact on Availability %'
  ];
  lines.push(lossHeaders.map(escapeField).join(','));

  (periodicData.detailedLossList || []).forEach(l => {
    lines.push([
      escapeField(l.label), escapeField(l.category), l.mins, l.hours, l.count, l.pctOfLoss, l.impactOnAvail
    ].join(','));
  });

  lines.push('');
  lines.push(`"SECTION 3: HISTORICAL HORIZON ARCHIVE"`);
  const historyHeaders = [
    'Period Interval', 'Shifts Logged', 'Planned Mins', 'Operating Mins', 'Loss Mins',
    'Availability %', 'Performance %', 'Quality %', 'OEE %', 'Productivity',
    'Total Produced', 'Good Units', 'Scrap Units', 'Top Stoppage Reason'
  ];
  lines.push(historyHeaders.map(escapeField).join(','));

  (periodicData.periodicHistory || []).forEach(h => {
    lines.push([
      escapeField(h.label), h.shiftCount, h.plannedMins, h.operatingMins, h.lossMins,
      h.availabilityRate, h.performanceRate, h.qualityRate, h.oeeRate, h.productivityRate,
      h.totalQty, h.goodQty, h.rejectedQty,
      escapeField(h.topLoss ? `${h.topLoss.label} (${h.topLoss.mins}m)` : 'None')
    ].join(','));
  });

  triggerDownload(lines.join('\r\n'), filename);
}

// ==============================================================================
// 4. MAIN APP CONTROLLER & UI ORCHESTRATION
// ==============================================================================

const state = {
  currentView: 'view-machines',
  currentMachine: MACHINES[0],
  dashFilterMachine: 'ALL',
  dashFilterLoss: 'ALL',
  periodType: 'daily',
  periodValue: 'LATEST',
  chartTrendOee: null,
  chartTrendLosses: null,
  chartLossesPareto: null,
  chartLossesDonut: null,
  lastPeriodicData: null
};

// DOM Cache
const dom = {
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

  minimalMachinesGrid: document.getElementById('minimal-machines-grid'),

  activeMachineName: document.getElementById('active-machine-name'),
  activeMachineType: document.getElementById('active-machine-type'),
  selectQuickMachine: document.getElementById('select-quick-machine'),
  form: document.getElementById('production-detail-form'),
  inputDate: document.getElementById('input-date'),
  inputShift: document.getElementById('input-shift'),
  inputShiftHours: document.getElementById('input-shift-hours'),
  inputOperator: document.getElementById('input-operator'),

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

  selectDowntimeLoss: document.getElementById('select-downtime-loss'),
  inputDropdownLossMins: document.getElementById('input-dropdown-loss-mins'),
  btnApplyDropdownLoss: document.getElementById('btn-apply-dropdown-loss'),
  lossDropdownStatus: document.getElementById('loss-dropdown-status'),
  dashFilterLoss: document.getElementById('dash-filter-loss'),

  liveCalcPlannedTime: document.getElementById('live-calc-planned-time'),
  liveCalcTotalLoss: document.getElementById('live-calc-total-loss'),
  liveCalcOperatingTime: document.getElementById('live-calc-operating-time'),
  liveCalcAvailability: document.getElementById('live-calc-availability'),
  liveCalcPerformance: document.getElementById('live-calc-performance'),
  liveCalcQuality: document.getElementById('live-calc-quality'),
  liveCalcOee: document.getElementById('live-calc-oee'),
  liveCalcProductivity: document.getElementById('live-calc-productivity'),

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

// Application Initialization
async function initApp() {
  try {
    startLiveClock();
    populateMachineSelectors();
    setupEventListeners();
    setDefaultFormValues();
    updateLiveOeeCalculations();
    updateEnteredRecordsBadge();
    await renderMinimalMachines();
  } catch (err) {
    console.error('Core UI render failed:', err);
  }

  try {
    await initStorage();
    updateSupabaseStatusIndicator();
    updateEnteredRecordsBadge();
    // Re-render machine launchpad with cloud records!
    await renderMinimalMachines();
  } catch (err) {
    console.warn('Storage initialization warning:', err);
  }

  setInterval(async () => {
    if (state.currentView === 'view-analytics') {
      await renderAnalyticsDashboard();
    } else if (state.currentView === 'view-machines') {
      await renderMinimalMachines();
    }
    updateEnteredRecordsBadge();
  }, 10000);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

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

function switchView(targetViewId) {
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

function populateMachineSelectors() {
  if (dom.selectQuickMachine) {
    dom.selectQuickMachine.innerHTML = '';
    MACHINES.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.code;
      opt.textContent = `${m.name} (${m.category})`;
      dom.selectQuickMachine.appendChild(opt);
    });
  }

  if (dom.dashFilterMachine) {
    dom.dashFilterMachine.innerHTML = '<option value="ALL">All 11 Machines (Combined Plant)</option>';
    MACHINES.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.code;
      opt.textContent = m.name;
      dom.dashFilterMachine.appendChild(opt);
    });
  }
}

function selectMachine(code) {
  state.dashFilterMachine = code;
  if (dom.dashFilterMachine) {
    dom.dashFilterMachine.value = code;
  }
  renderAnalyticsDashboard();
}

async function renderAnalyticsDashboard() {
  const data = await getPeriodicAnalytics({
    machineCode: state.dashFilterMachine,
    periodType: state.periodType,
    periodValue: state.periodValue
  });

  state.lastPeriodicData = data;

  if (dom.periodTabsGroup) {
    dom.periodTabsGroup.querySelectorAll('.period-tab-btn').forEach(btn => {
      if (btn.dataset.period === state.periodType) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

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

  if (dom.targetKickerName) {
    dom.targetKickerName.textContent = `${data.selectedMachine.name} • ${data.periodType.toUpperCase()} ANALYSIS`;
  }
  if (dom.targetMainTitle) {
    dom.targetMainTitle.textContent = `${data.selectedMachine.name} (${data.activePeriodLabel})`;
  }
  if (dom.targetOeeSub) {
    dom.targetOeeSub.textContent = `${data.selectedMachine.name} OEE Score`;
  }

  if (dom.dashMetricOee) dom.dashMetricOee.textContent = data.summary.oeeRate;
  if (dom.dashMetricProductivity) dom.dashMetricProductivity.textContent = data.summary.productivityRate;
  if (dom.dashMetricAvail) dom.dashMetricAvail.textContent = data.summary.availabilityRate;
  if (dom.dashMetricPerf) dom.dashMetricPerf.textContent = data.summary.performanceRate;
  if (dom.dashMetricQual) dom.dashMetricQual.textContent = data.summary.qualityRate;

  if (dom.dashTotalLosses) dom.dashTotalLosses.textContent = `${data.summary.totalLossesMins.toLocaleString()}m`;
  if (dom.dashTotalOutput) dom.dashTotalOutput.textContent = `${data.summary.totalQty.toLocaleString()} pcs`;
  if (dom.dashGoodOutput) dom.dashGoodOutput.textContent = `${data.summary.goodQty.toLocaleString()} pcs`;
  if (dom.dashScrapOutput) dom.dashScrapOutput.textContent = `${data.summary.rejectedQty.toLocaleString()} pcs`;

  const elOpTimeDisplay = document.getElementById('dash-op-time-display');
  if (elOpTimeDisplay) elOpTimeDisplay.textContent = `${data.summary.operatingTimeMins.toLocaleString()}m`;

  const elIdealTimeDisplay = document.getElementById('dash-ideal-time-display');
  if (elIdealTimeDisplay) elIdealTimeDisplay.textContent = `${Math.round(data.summary.idealRunTimeMins).toLocaleString()}m`;

  const oeeNum = Number(data.summary.oeeRate) || 0;
  const isZeroState = (data.summary.totalQty === 0 && data.summary.totalLossesMins === 0);
  const ringFill = document.getElementById('oee-ring-fill');
  const elOeeStatus = document.getElementById('dash-oee-status-text');

  if (ringFill) {
    const circumference = 377;
    const progress = Math.min(100, Math.max(0, oeeNum));
    const offset = circumference - (progress / 100) * circumference;
    ringFill.style.strokeDashoffset = offset;

    if (isZeroState) {
      ringFill.style.stroke = 'rgba(255, 255, 255, 0.2)';
    } else if (oeeNum >= 85) {
      ringFill.style.stroke = 'var(--emerald-400)';
    } else if (oeeNum >= 70) {
      ringFill.style.stroke = 'var(--cyan-400)';
    } else {
      ringFill.style.stroke = 'var(--rose-400)';
    }
  }

  if (dom.oeeRatingBadge) {
    if (isZeroState) {
      dom.oeeRatingBadge.textContent = 'NO DATA';
      dom.oeeRatingBadge.style.color = 'var(--text-muted)';
      dom.oeeRatingBadge.style.borderColor = 'var(--border-subtle)';
      dom.oeeRatingBadge.style.background = 'rgba(255, 255, 255, 0.05)';
    } else if (oeeNum >= 85) {
      dom.oeeRatingBadge.textContent = 'WORLD CLASS';
      dom.oeeRatingBadge.style.color = 'var(--emerald-400)';
      dom.oeeRatingBadge.style.borderColor = 'rgba(16, 185, 129, 0.4)';
      dom.oeeRatingBadge.style.background = 'rgba(16, 185, 129, 0.15)';
    } else if (oeeNum >= 75) {
      dom.oeeRatingBadge.textContent = 'ACCEPTABLE';
      dom.oeeRatingBadge.style.color = 'var(--cyan-400)';
      dom.oeeRatingBadge.style.borderColor = 'rgba(6, 182, 212, 0.4)';
      dom.oeeRatingBadge.style.background = 'rgba(6, 182, 212, 0.15)';
    } else {
      dom.oeeRatingBadge.textContent = 'ATTENTION REQUIRED';
      dom.oeeRatingBadge.style.color = 'var(--rose-400)';
      dom.oeeRatingBadge.style.borderColor = 'rgba(244, 63, 94, 0.4)';
      dom.oeeRatingBadge.style.background = 'rgba(244, 63, 94, 0.15)';
    }
  }

  if (elOeeStatus) {
    if (isZeroState) {
      elOeeStatus.textContent = '⚪ No shift records logged for this period';
    } else if (oeeNum >= 85) {
      elOeeStatus.textContent = '🟢 World-Class Performance Standard (>=85%)';
    } else if (oeeNum >= 70) {
      elOeeStatus.textContent = '🟡 Steady Operation / Moderate Speed Losses';
    } else {
      elOeeStatus.textContent = '🔴 High Downtime / Action Required';
    }
  }

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

  renderMachineMatrixTable(data.machineMatrix, data.activePeriodLabel);
  renderTrendOeeChart(data.trendPeriods, data.periodType);
  renderTrendLossesChart(data.trendPeriods, data.periodType);

  syncLossFilterDropdown();
  renderLossesParetoChart(data.summary.lossBreakdown, data.summary.lossCounts);
  renderLossClassificationDonut(data.summary.lossBreakdown);
  renderLossesBreakdownTable(data.detailedLossList, data.selectedMachine.name);

  renderPeriodHistoryTable(data.periodicHistory, data.selectedMachine.name, data.periodType);
  renderRootCauseTable(data.lossIncidents);
}

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

function renderMachineMatrixTable(matrixData, periodLabel) {
  if (!dom.machineMatrixTbody) return;
  if (dom.matrixPeriodSubtitle) {
    dom.matrixPeriodSubtitle.textContent = `Interval Snapshot: ${periodLabel}`;
  }
  dom.machineMatrixTbody.innerHTML = '';

  if (!matrixData || matrixData.length === 0) {
    dom.machineMatrixTbody.innerHTML = '<tr><td colspan="12" style="text-align:center; padding: 20px;">No machine records logged for this period.</td></tr>';
    return;
  }

  matrixData.forEach(row => {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';

    tr.innerHTML = `
      <td>
        <strong style="color: var(--text-primary); font-size: 0.92rem;">${row.name}</strong>
        <div style="font-size: 0.74rem; color: var(--text-muted);">${row.code}</div>
      </td>
      <td><span class="machine-type-tag tag-${row.category.toLowerCase()}">${row.category}</span></td>
      <td style="font-family: var(--font-mono);">${row.shiftCount}</td>
      <td style="font-family: var(--font-mono);">${row.operatingHours}h</td>
      <td style="font-family: var(--font-mono); color: ${Number(row.lossHours) > 0 ? 'var(--rose-400)' : 'var(--text-muted)'};">${row.lossHours}h</td>
      <td style="font-family: var(--font-mono);">${row.availability}%</td>
      <td style="font-family: var(--font-mono);">${row.performance}%</td>
      <td style="font-family: var(--font-mono);">${row.quality}%</td>
      <td>
        <span class="matrix-oee-pill ${row.oee >= 85 ? 'oee-pill-green' : row.oee >= 70 ? 'oee-pill-yellow' : row.shiftCount === 0 ? 'oee-pill-gray' : 'oee-pill-red'}">
          ${row.oee}%
        </span>
      </td>
      <td style="font-family: var(--font-mono);">${row.totalOutput.toLocaleString()} pcs</td>
      <td style="font-size: 0.82rem; color: ${row.topLoss ? 'var(--rose-400)' : 'var(--text-muted)'};">
        ${row.topLoss ? `${row.topLoss.label} (${row.topLoss.mins}m)` : 'None'}
      </td>
      <td>
        <button type="button" class="btn-matrix-inspect" data-code="${row.code}">
          Inspect Machine
        </button>
      </td>
    `;

    tr.addEventListener('click', (e) => {
      e.stopPropagation();
      selectMachine(row.code);
    });

    dom.machineMatrixTbody.appendChild(tr);
  });
}

function renderTrendOeeChart(trendPeriods, periodType) {
  const ctx = document.getElementById('chart-trend-oee');
  if (!ctx || !window.Chart) return;

  const targetName = state.dashFilterMachine === 'ALL' ? 'Combined Line (All Machines)' : (MACHINES.find(m => m.code === state.dashFilterMachine)?.name || state.dashFilterMachine);
  if (dom.titleTrendOee) {
    dom.titleTrendOee.textContent = `${targetName}: OEE Progression Over Time`;
  }
  if (dom.badgeTrendPeriodType) {
    dom.badgeTrendPeriodType.textContent = periodType.toUpperCase();
  }

  const labels = trendPeriods.map(p => p.label);
  const dataOee = trendPeriods.map(p => p.oee);
  const dataAvail = trendPeriods.map(p => p.availability);
  const dataPerf = trendPeriods.map(p => p.performance);
  const dataQual = trendPeriods.map(p => p.quality);

  if (state.chartTrendOee) {
    state.chartTrendOee.destroy();
  }

  state.chartTrendOee = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Overall OEE %',
          data: dataOee,
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6, 182, 212, 0.12)',
          borderWidth: 3,
          tension: 0.35,
          fill: true,
          pointRadius: 4,
          pointHoverRadius: 6,
          pointBackgroundColor: '#22d3ee'
        },
        {
          label: 'Availability %',
          data: dataAvail,
          borderColor: '#10b981',
          borderWidth: 2,
          borderDash: [5, 5],
          tension: 0.3,
          fill: false,
          pointRadius: 2.5
        },
        {
          label: 'Performance %',
          data: dataPerf,
          borderColor: '#f59e0b',
          borderWidth: 2,
          borderDash: [3, 3],
          tension: 0.3,
          fill: false,
          pointRadius: 2.5
        },
        {
          label: 'Quality %',
          data: dataQual,
          borderColor: '#818cf8',
          borderWidth: 1.5,
          tension: 0.2,
          fill: false,
          pointRadius: 2
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
          labels: { color: '#94a3b8', font: { size: 11, family: 'Plus Jakarta Sans' }, boxWidth: 14 }
        },
        tooltip: {
          callbacks: { label: (c) => ` ${c.dataset.label}: ${c.parsed.y}%` }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 10, family: 'Plus Jakarta Sans' }, maxRotation: 45 },
          grid: { color: 'rgba(255, 255, 255, 0.04)' }
        },
        y: {
          min: 0,
          max: 100,
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' }, callback: (v) => `${v}%` },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        }
      }
    }
  });
}

function renderTrendLossesChart(trendPeriods, periodType) {
  const ctx = document.getElementById('chart-trend-losses');
  if (!ctx || !window.Chart) return;

  const targetName = state.dashFilterMachine === 'ALL' ? 'Combined Line (All Machines)' : (MACHINES.find(m => m.code === state.dashFilterMachine)?.name || state.dashFilterMachine);
  if (dom.titleTrendLosses) {
    dom.titleTrendLosses.textContent = `${targetName}: Downtime Losses Evolution (${periodType.toUpperCase()})`;
  }

  const labels = trendPeriods.map(p => p.label);
  const dataTotalLoss = trendPeriods.map(p => p.lossMins);

  if (state.chartTrendLosses) {
    state.chartTrendLosses.destroy();
  }

  state.chartTrendLosses = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: 'Total Downtime (Mins)',
          data: dataTotalLoss,
          backgroundColor: 'rgba(244, 63, 94, 0.65)',
          borderColor: '#f43f5e',
          borderWidth: 1.5,
          borderRadius: 4
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
          labels: { color: '#94a3b8', font: { size: 11, family: 'Plus Jakarta Sans' }, boxWidth: 14 }
        },
        tooltip: {
          callbacks: { label: (c) => ` Total Losses: ${c.parsed.y} mins` }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 10, family: 'Plus Jakarta Sans' }, maxRotation: 45 },
          grid: { display: false }
        },
        y: {
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' }, callback: (v) => `${v}m` },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        }
      }
    }
  });
}

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
          labels: { color: '#94a3b8', font: { size: 11, family: 'Plus Jakarta Sans' }, boxWidth: 14 }
        },
        tooltip: {
          callbacks: {
            label: (context) => {
              if (context.datasetIndex === 0) return ` ${context.parsed.y} mins lost`;
              return ` Occurred ${context.parsed.y} times`;
            }
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#94a3b8', font: { size: 9.5, family: 'Plus Jakarta Sans' }, maxRotation: 45, minRotation: 30 },
          grid: { display: false }
        },
        y: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Minutes Lost', color: '#94a3b8', font: { size: 10 } },
          ticks: { color: '#94a3b8', font: { family: 'JetBrains Mono' } },
          grid: { color: 'rgba(255, 255, 255, 0.06)' }
        },
        y1: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: 'Times Occurred', color: '#06b6d4', font: { size: 10 } },
          ticks: { color: '#06b6d4', font: { family: 'JetBrains Mono' }, stepSize: 1 },
          grid: { drawOnChartArea: false }
        }
      }
    }
  });
}

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
          labels: { color: '#94a3b8', font: { size: 10, family: 'Plus Jakarta Sans' }, boxWidth: 12, padding: 8 }
        }
      },
      cutout: '62%'
    }
  });
}

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
      <td><strong style="color: var(--text-primary);">${loss.label}</strong></td>
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
    tr.innerHTML = `
      <td><strong style="color: var(--text-primary);">${h.label}</strong></td>
      <td style="font-family: var(--font-mono); font-weight: 600;">${h.shiftCount}</td>
      <td style="font-family: var(--font-mono);">${(h.plannedMins / 60).toFixed(1)}h</td>
      <td style="font-family: var(--font-mono);">${(h.operatingMins / 60).toFixed(1)}h</td>
      <td style="font-family: var(--font-mono); color: ${h.lossMins > 0 ? 'var(--rose-400)' : 'var(--text-muted)'};">${(h.lossMins / 60).toFixed(1)}h</td>
      <td style="font-family: var(--font-mono);">${h.availabilityRate}%</td>
      <td style="font-family: var(--font-mono);">${h.performanceRate}%</td>
      <td style="font-family: var(--font-mono);">${h.qualityRate}%</td>
      <td>
        <span class="matrix-oee-pill ${h.oeeRate >= 85 ? 'oee-pill-green' : h.oeeRate >= 70 ? 'oee-pill-yellow' : 'oee-pill-red'}">
          ${h.oeeRate}%
        </span>
      </td>
      <td style="font-family: var(--font-mono); color: var(--amber-400);">${h.productivityRate} pcs/h</td>
      <td style="font-family: var(--font-mono);">${h.totalQty.toLocaleString()}</td>
      <td style="font-family: var(--font-mono); color: var(--emerald-400);">${h.goodQty.toLocaleString()}</td>
      <td style="font-family: var(--font-mono); color: ${h.rejectedQty > 0 ? 'var(--rose-400)' : 'var(--text-muted)'};">${h.rejectedQty.toLocaleString()}</td>
      <td style="font-size: 0.82rem; color: ${h.topLoss ? 'var(--rose-400)' : 'var(--text-muted)'};">
        ${h.topLoss ? `${h.topLoss.label} (${h.topLoss.mins}m)` : 'None'}
      </td>
    `;
    dom.periodHistoryTbody.appendChild(tr);
  });
}

function renderRootCauseTable(incidents) {
  if (!dom.rootCauseTbody) return;
  dom.rootCauseTbody.innerHTML = '';

  if (!incidents || incidents.length === 0) {
    dom.rootCauseTbody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; padding: 24px;">
          <div style="color: var(--text-muted); font-size: 0.9rem;">
            No downtime loss root cause incidents logged for this period.
          </div>
        </td>
      </tr>
    `;
    return;
  }

  incidents.forEach(inc => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-family: var(--font-mono); font-size: 0.82rem;">${inc.date}</td>
      <td><span class="shift-tag">${inc.shift}</span></td>
      <td><strong>${inc.machineName}</strong></td>
      <td style="color: var(--text-secondary);">${inc.operator}</td>
      <td><span class="why-category-badge">${inc.lossLabel}</span></td>
      <td style="color: var(--text-muted); font-size: 0.84rem;">${inc.category} Issue</td>
      <td style="color: var(--text-primary); font-weight: 500;">${inc.remarks}</td>
      <td style="font-family: var(--font-mono); font-weight: 700; color: ${inc.totalLossMins > 0 ? 'var(--rose-400)' : 'var(--emerald-400)'};">${inc.totalLossMins}m</td>
    `;
    dom.rootCauseTbody.appendChild(tr);
  });
}

function showToast(message, type = 'info') {
  if (!dom.toastContainer) return;
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

  if (dom.tabMachines) dom.tabMachines.addEventListener('click', () => switchView('view-machines'));
  if (dom.tabFillup) dom.tabFillup.addEventListener('click', () => switchView('view-fillup'));
  if (dom.tabAnalytics) dom.tabAnalytics.addEventListener('click', () => switchView('view-analytics'));
  if (dom.btnBackToMachines) dom.btnBackToMachines.addEventListener('click', () => switchView('view-machines'));
  if (dom.btnCancelEntry) dom.btnCancelEntry.addEventListener('click', () => switchView('view-machines'));

  if (dom.selectQuickMachine) {
    dom.selectQuickMachine.addEventListener('change', (e) => {
      openMachineFillup(e.target.value);
    });
  }

  if (dom.dashFilterMachine) {
    dom.dashFilterMachine.addEventListener('change', () => {
      selectMachine(dom.dashFilterMachine.value);
    });
  }

  if (dom.periodTabsGroup) {
    dom.periodTabsGroup.addEventListener('click', (e) => {
      const btn = e.target.closest('.period-tab-btn');
      if (!btn) return;
      state.periodType = btn.dataset.period;
      state.periodValue = 'LATEST';
      renderAnalyticsDashboard();
    });
  }

  if (dom.selectPeriodInterval) {
    dom.selectPeriodInterval.addEventListener('change', (e) => {
      state.periodValue = e.target.value;
      renderAnalyticsDashboard();
    });
  }

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

  if (dom.machineRosterPills) {
    dom.machineRosterPills.addEventListener('click', (e) => {
      const btn = e.target.closest('.machine-pill-btn');
      if (!btn) return;
      const code = btn.dataset.machineCode;
      selectMachine(code);
    });
  }

  if (dom.btnExportPeriodCsv) {
    dom.btnExportPeriodCsv.addEventListener('click', () => {
      if (state.lastPeriodicData) {
        exportPeriodicReportToCSV(state.lastPeriodicData, `${state.dashFilterMachine}_Periodic_Analysis`);
      } else {
        showToast('No periodic report available to export.', 'error');
      }
    });
  }

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

  // Automatically select Shift Hours based on Shift:
  // Shift A & Shift B -> 8.5 Hours
  // Shift C           -> 7.0 Hours
  if (dom.inputShift) {
    const handleShiftAutoSelect = () => {
      const shift = dom.inputShift.value;
      if (dom.inputShiftHours) {
        if (shift === 'Shift A' || shift === 'Shift B') {
          dom.inputShiftHours.value = '8.5';
        } else if (shift === 'Shift C') {
          dom.inputShiftHours.value = '7.0';
        }
      }
      updateLiveOeeCalculations();
    };
    dom.inputShift.addEventListener('change', handleShiftAutoSelect);
    dom.inputShift.addEventListener('input', handleShiftAutoSelect);
  }

  if (dom.form) dom.form.addEventListener('submit', handleFormSubmit);

  if (dom.btnGlobalExport) {
    dom.btnGlobalExport.addEventListener('click', async () => {
      const entries = await getProductionEntries();
      exportEntriesToCSV(entries, 'Shopfloor_OEE_11_Machines');
    });
  }

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
        try { navigator.vibrate(30); } catch (_) { }
      }
      updateLiveOeeCalculations();
    }
  });

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
        try { navigator.vibrate(25); } catch (_) { }
      }
    }
  });

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

  if (dom.btnOpenDbSettings) {
    dom.btnOpenDbSettings.addEventListener('click', () => {
      const cfg = getSupabaseConfig();
      if (dom.cfgSupabaseUrl) dom.cfgSupabaseUrl.value = cfg.url || '';
      if (dom.cfgSupabaseKey) dom.cfgSupabaseKey.value = cfg.key || '';
      if (dom.supabaseTestResult) dom.supabaseTestResult.style.display = 'none';
      dom.modalSupabase?.classList.remove('hidden');
    });
  }

  if (dom.btnCloseModal) {
    dom.btnCloseModal.addEventListener('click', () => {
      dom.modalSupabase?.classList.add('hidden');
    });
  }

  if (dom.btnTestSupabase) {
    dom.btnTestSupabase.addEventListener('click', async () => {
      const url = dom.cfgSupabaseUrl?.value.trim() || '';
      const key = dom.cfgSupabaseKey?.value.trim() || '';
      if (!url || !key) {
        if (dom.supabaseTestResult) {
          dom.supabaseTestResult.style.display = 'block';
          dom.supabaseTestResult.style.background = 'rgba(244, 63, 94, 0.15)';
          dom.supabaseTestResult.style.color = 'var(--rose-400)';
          dom.supabaseTestResult.textContent = 'Please provide both Project URL and Public Anon Key.';
        }
        return;
      }

      dom.btnTestSupabase.disabled = true;
      dom.btnTestSupabase.textContent = 'Testing...';

      const test = await testSupabaseConnection(url, key);
      dom.btnTestSupabase.disabled = false;
      dom.btnTestSupabase.textContent = 'Test Connection';

      if (dom.supabaseTestResult) {
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
      }
    });
  }

  if (dom.btnSaveSupabase) {
    dom.btnSaveSupabase.addEventListener('click', async () => {
      const url = dom.cfgSupabaseUrl?.value.trim() || '';
      const key = dom.cfgSupabaseKey?.value.trim() || '';
      saveSupabaseConfig(url, key);
      await initStorage();
      updateSupabaseStatusIndicator();
      dom.modalSupabase?.classList.add('hidden');
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
  }

  if (dom.btnDisconnectSupabase) {
    dom.btnDisconnectSupabase.addEventListener('click', async () => {
      saveSupabaseConfig('', '');
      await initStorage();
      updateSupabaseStatusIndicator();
      if (dom.cfgSupabaseUrl) dom.cfgSupabaseUrl.value = '';
      if (dom.cfgSupabaseKey) dom.cfgSupabaseKey.value = '';
      if (dom.supabaseTestResult) dom.supabaseTestResult.style.display = 'none';
      dom.modalSupabase?.classList.add('hidden');
      showToast('Supabase disconnected. Switched to local storage mode.', 'info');
      if (state.currentView === 'view-analytics') {
        await renderAnalyticsDashboard();
      }
    });
  }

  if (dom.btnClearData) {
    dom.btnClearData.addEventListener('click', async () => {
      const ok = confirm('⚠️ Clear All Production Data?\n\nThis will wipe all existing shift production records and loss occurrences so you can enter fresh data.');
      if (!ok) return;

      await clearAllProductionEntries();
      setDefaultFormValues();
      updateLiveOeeCalculations();
      await renderMinimalMachines();
      updateEnteredRecordsBadge();
      if (state.currentView === 'view-analytics') {
        await renderAnalyticsDashboard();
      }
      showToast('All production records have been cleared! Ready for new entries.', 'info');
    });
  }

  const btnPlantAll = document.getElementById('btn-plant-all-analytics');
  if (btnPlantAll) {
    btnPlantAll.addEventListener('click', () => {
      selectMachine('ALL');
      switchView('view-analytics');
    });
  }

  const btnSyncCloud = document.getElementById('btn-sync-cloud-records');
  if (btnSyncCloud) {
    btnSyncCloud.addEventListener('click', async () => {
      btnSyncCloud.disabled = true;
      const originalHtml = btnSyncCloud.innerHTML;
      btnSyncCloud.textContent = 'Syncing...';
      const entries = await getProductionEntries();
      btnSyncCloud.disabled = false;
      btnSyncCloud.innerHTML = originalHtml;
      showToast(`⚡ Pulled ${entries.length} shift entries from database!`, 'success');
      await renderMinimalMachines();
      updateEnteredRecordsBadge();
      await filterAndRenderEnteredData();
      if (state.currentView === 'view-analytics') {
        await renderAnalyticsDashboard();
      }
    });
  }

  const btnSeedSample = document.getElementById('btn-seed-sample-records');
  if (btnSeedSample) {
    btnSeedSample.addEventListener('click', async () => {
      const ok = confirm('Populate realistic sample production shifts across all 11 machines for today, last week, and last month?\n\nThis will immediately demonstrate Daily, Weekly, and Monthly charts, trend progressions, and root cause logs.');
      if (!ok) return;
      btnSeedSample.disabled = true;
      btnSeedSample.textContent = 'Generating...';
      await seedSampleShiftsForDemo();
      btnSeedSample.disabled = false;
      btnSeedSample.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
        Seed Sample Shifts (Demo)
      `;
      await filterAndRenderEnteredData();
    });
  }
}

async function seedSampleShiftsForDemo() {
  const sampleOperators = ['Rajesh K.', 'Amit S.', 'Suresh P.', 'Vikram M.', 'Dinesh V.', 'Pooja R.'];
  const shifts = ['Shift A', 'Shift B', 'Shift C'];
  const partsCatalog = [
    { name: 'LEMKEN Shaft 45-B', cycle: 4.5 },
    { name: 'Flange Ring 120', cycle: 6.2 },
    { name: 'Plow Blade Mount', cycle: 8.0 },
    { name: 'Pinion Gear M4', cycle: 5.0 },
    { name: 'Hydraulic Piston 80', cycle: 7.2 },
    { name: 'Spindle Sleeve 55', cycle: 6.0 }
  ];

  const today = new Date();
  const sampleRecords = [];

  for (let i = 0; i < MACHINES.length; i++) {
    const machine = MACHINES[i];
    const daysAgoList = [0, 1, 3, 7, 14, 28];
    const daysToLog = daysAgoList.slice(i % 3, (i % 3) + 3);

    daysToLog.forEach((daysAgo, sIdx) => {
      const logDt = new Date(today);
      logDt.setDate(today.getDate() - daysAgo);
      const dateStr = logDt.toISOString().split('T')[0];
      const shift = shifts[sIdx % shifts.length];
      const operator = sampleOperators[(i + sIdx) % sampleOperators.length];

      const p1 = partsCatalog[i % partsCatalog.length];
      const p2 = partsCatalog[(i + 1) % partsCatalog.length];
      const p1Qty = 30 + Math.floor(Math.random() * 25);
      const p2Qty = 20 + Math.floor(Math.random() * 20);
      const rejectedQty = Math.floor(Math.random() * 3);

      const losses = {};
      LOSS_FIELDS.forEach(f => { losses[f.key] = 0; });
      const lossKey1 = LOSS_FIELDS[(i * 2) % LOSS_FIELDS.length].key;
      losses[lossKey1] = 15 + Math.floor(Math.random() * 30);
      if (Math.random() > 0.4) {
        const lossKey2 = LOSS_FIELDS[(i * 3 + 1) % LOSS_FIELDS.length].key;
        losses[lossKey2] = 10 + Math.floor(Math.random() * 20);
      }

      const parts = [
        { name: p1.name, cycleTime: p1.cycle, qty: p1Qty },
        { name: p2.name, cycleTime: p2.cycle, qty: p2Qty },
        { name: '', cycleTime: 0, qty: 0 }
      ];

      const oeeResult = calculateOEE(8.5, parts, losses, rejectedQty);

      const dominantLossObj = LOSS_FIELDS.find(f => losses[f.key] > 0) || LOSS_FIELDS[0];

      const record = {
        id: generateUUID(),
        created_at: new Date(logDt.getTime() + (sIdx * 3600000)).toISOString(),
        machine_code: machine.code,
        machine_name: machine.name,
        log_date: dateStr,
        shift: shift,
        shift_hours: 8.5,
        operator_name: operator,
        part1_name: p1.name,
        part1_cycle_time: p1.cycle,
        part1_qty: p1Qty,
        part2_name: p2.name,
        part2_cycle_time: p2.cycle,
        part2_qty: p2Qty,
        part3_name: '',
        part3_cycle_time: 0,
        part3_qty: 0,
        total_qty: oeeResult.totalQty,
        rejected_qty: oeeResult.rejectedQty,
        good_qty: oeeResult.goodQty,
        ...losses,
        remarks: `${dominantLossObj.label} handled during ${shift}. Normal operation resumed.`,
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

      sampleRecords.push(record);
    });
  }

  for (const rec of sampleRecords) {
    await saveProductionEntry(rec);
  }

  showToast(`✓ Generated & saved ${sampleRecords.length} shift records across all machines!`, 'success');
  await renderMinimalMachines();
  updateEnteredRecordsBadge();
  if (state.currentView === 'view-analytics') {
    await renderAnalyticsDashboard();
  }
}

function openMachineFillup(machineCode) {
  const machine = MACHINES.find(m => m.code === machineCode) || MACHINES[0];
  state.currentMachine = machine;

  if (dom.activeMachineName) dom.activeMachineName.textContent = machine.name;
  if (dom.activeMachineType) dom.activeMachineType.textContent = `${machine.category} Center`;
  if (dom.selectQuickMachine) dom.selectQuickMachine.value = machine.code;

  setDefaultFormValues();
  updateLiveOeeCalculations();
  switchView('view-fillup');
}

function setDefaultFormValues() {
  // Set today's date automatically (the only sensible default)
  const today = new Date().toISOString().split('T')[0];
  if (dom.inputDate) dom.inputDate.value = today;

  // Clear all selects / inputs — no pre-filled dummy data
  if (dom.inputShift) dom.inputShift.value = '';
  if (dom.inputShiftHours) dom.inputShiftHours.value = '';
  if (dom.inputOperator) dom.inputOperator.value = '';

  if (dom.inputPart1Name) dom.inputPart1Name.value = '';
  if (dom.inputPart1Cycle) dom.inputPart1Cycle.value = '';
  if (dom.inputPart1Qty) dom.inputPart1Qty.value = '';

  if (dom.inputPart2Name) dom.inputPart2Name.value = '';
  if (dom.inputPart2Cycle) dom.inputPart2Cycle.value = '';
  if (dom.inputPart2Qty) dom.inputPart2Qty.value = '';

  if (dom.inputPart3Name) dom.inputPart3Name.value = '';
  if (dom.inputPart3Cycle) dom.inputPart3Cycle.value = '';
  if (dom.inputPart3Qty) dom.inputPart3Qty.value = '';

  if (dom.inputRejectedQty) dom.inputRejectedQty.value = '';

  // Reset all 15 loss fields to 0
  LOSS_FIELDS.forEach(f => {
    const el = document.getElementById(f.key);
    if (el) el.value = '0';
  });

  // Reset dropdown quick-selector
  const selectLoss = dom.selectDowntimeLoss || document.getElementById('select-downtime-loss');
  if (selectLoss) selectLoss.selectedIndex = 0;
  const inputMins = dom.inputDropdownLossMins || document.getElementById('input-dropdown-loss-mins');
  if (inputMins) inputMins.value = '';
  const statusEl = dom.lossDropdownStatus || document.getElementById('loss-dropdown-status');
  if (statusEl) statusEl.style.display = 'none';

  if (dom.inputRemarks) dom.inputRemarks.value = '';
}

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

// ==============================================================================
// EMAILJS BACKGROUND ALERT — fires silently when critical loss > 90 mins
// Uses EmailJS public CDN (no server required, works from file:// and http://)
// Service ID & Template must match your EmailJS dashboard
// ==============================================================================

const EMAIL_CONFIG = {
  // ─────────────────────────────────────────────────────────────────────
  // STEP: Sign up free at https://emailjs.com, create a service and
  //       template, then replace the three values below.
  // ─────────────────────────────────────────────────────────────────────
  serviceId: 'service_prodtrack',   // Your EmailJS Service ID
  templateId: 'template_1ekvs05',   // Your EmailJS Template ID
  publicKey: 'Ev55sXxAA4E5n8dIF'      // Your EmailJS Public Key
};

// Loss keys that trigger email when any single one > 90 mins
const CRITICAL_LOSS_KEYS = [
  'loss_breakdown',
  'loss_no_operator'
];

/**
 * Send a silent background email via EmailJS when critical downtime > 90 mins.
 * No alert or notification is shown on the UI.
 * @param {object} entry  The production entry record that was saved
 */
async function sendDowntimeAlertEmail(entry) {
  // Check if EmailJS SDK is loaded
  if (typeof emailjs === 'undefined') {
    console.warn('[Alert] EmailJS SDK not loaded — skipping alert email.');
    return;
  }

  // Find which critical losses breached the 90-min threshold
  const breachedLosses = [];
  CRITICAL_LOSS_KEYS.forEach(key => {
    const mins = Number(entry[key]) || 0;
    if (mins > 90) {
      const meta = LOSS_FIELDS.find(f => f.key === key);
      breachedLosses.push({ label: meta ? meta.label : key, mins });
    }
  });

  if (breachedLosses.length === 0) return; // Nothing breached threshold

  const breachSummary = breachedLosses.map(b => `${b.label}: ${b.mins} mins`).join(', ');
  const nowStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', hour12: true });

  const templateParams = {
    to_email: 'gedamabhijit4070@gmail.com',
    machine_name: entry.machine_name || entry.machine_code,
    machine_code: entry.machine_code,
    log_date: entry.log_date,
    shift: entry.shift,
    operator: entry.operator_name || 'N/A',
    breach_summary: breachSummary,
    breakdown_mins: Number(entry.loss_breakdown) || 0,
    no_operator_mins: Number(entry.loss_no_operator) || 0,
    total_loss_mins: Number(entry.total_losses_mins) || 0,
    availability: entry.availability_rate,
    oee: entry.oee_rate,
    remarks: entry.remarks || '',
    timestamp: nowStr
  };

  try {
    emailjs.init({ publicKey: EMAIL_CONFIG.publicKey });
    await emailjs.send(EMAIL_CONFIG.serviceId, EMAIL_CONFIG.templateId, templateParams);
    console.log('[Alert] Downtime alert email sent silently for', entry.machine_name);
  } catch (err) {
    // Fail silently — never show error to operator
    console.warn('[Alert] Email send failed (non-critical):', err);
  }
}

async function handleFormSubmit(e) {
  e.preventDefault();

  const shiftHours = parseFloat(dom.inputShiftHours ? dom.inputShiftHours.value : 8.5) || 8.5;
  const operatorName = dom.inputOperator ? dom.inputOperator.value.trim() || 'Operator' : 'Operator';
  const logDate = (dom.inputDate && dom.inputDate.value) ? dom.inputDate.value : new Date().toISOString().split('T')[0];
  const shift = (dom.inputShift && dom.inputShift.value) ? dom.inputShift.value : 'Shift A';

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

  const rejectedQty = parseInt(dom.inputRejectedQty ? dom.inputRejectedQty.value : 0, 10) || 0;
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
    remarks: (dom.inputRemarks && dom.inputRemarks.value.trim()) ? dom.inputRemarks.value.trim() : `${primaryLossReason} recorded`,

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

  try {
    await saveProductionEntry(entryRecord);
    showToast(`✓ Shift record saved for ${state.currentMachine.name}! (OEE: ${oeeResult.oeeRate}%)`, 'success');

    // Fire background email alert silently — no UI notification
    sendDowntimeAlertEmail(entryRecord);

    await renderMinimalMachines();
    updateEnteredRecordsBadge();
    selectMachine(state.currentMachine.code);
    switchView('view-analytics');
  } catch (err) {
    console.error('Save failed:', err);
    showToast('Failed to save record.', 'error');
  }
}

// ==============================================================================
// 5. ENTERED PRODUCTION LOG RECORDS MODAL & INSPECTOR
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
        await renderMinimalMachines();
        if (state.currentView === 'view-analytics') {
          await renderAnalyticsDashboard();
        }
      });
    }

    tbody.appendChild(tr);
  });
}

