/**
 * Storage Layer with Supabase Integration and LocalStorage Fallback
 * Handles Production Entries, 15-Loss Breakdowns, and OEE Computations
 */
import { MACHINES, LOSS_FIELDS } from './machines.js';
import { SUPABASE_CONFIG } from './config.js';

const STORAGE_KEY_CONFIG = 'prodtracker_supabase_config';
const STORAGE_KEY_MACHINES = 'prodtracker_machines_11';
const STORAGE_KEY_ENTRIES = 'prodtracker_oee_entries';

let supabaseClient = null;
let isSupabaseActive = false;

/**
 * Generate a RFC-4122 compliant UUID v4 string
 */
function generateUUID() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return '10000000-1000-4000-8000-' + Math.random().toString(16).substring(2, 14);
}

async function waitForSupabaseLib(maxWaitMs = 2500) {
  const start = Date.now();
  while (!window.supabase && (Date.now() - start) < maxWaitMs) {
    await new Promise(r => setTimeout(r, 100));
  }
  return !!window.supabase;
}

export function getOrCreateSupabaseClient() {
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

/**
 * Initialize Storage and Supabase Cloud Client
 * Fresh start: Mock sample data is eliminated for clean real-world entries.
 */
export async function initStorage() {
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

  // Ensure entries storage is initialized without mock data
  const existingRaw = localStorage.getItem(STORAGE_KEY_ENTRIES);
  if (!existingRaw) {
    localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify([]));
  } else {
    // Purge old mock sample entries if they exist
    try {
      const parsed = JSON.parse(existingRaw);
      const containsMock = parsed.some(e => e.id === 'entry-101' || e.id === 'entry-102' || e.id === 'entry-103' || e.id === 'entry-104');
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

  // Eagerly fetch cloud database records
  const entries = await getProductionEntries();
  console.log(`✓ Synchronized ${entries.length} shift entries from database / storage`);

  return { isSupabaseActive };
}

/**
 * Retrieve Supabase Configuration from config.js or localStorage
 */
export function getSupabaseConfig() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CONFIG);
    const localCfg = raw ? JSON.parse(raw) : null;
    
    // Priority: config.js first if specified, otherwise localStorage
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

/**
 * Save Supabase Configuration to localStorage and re-initialize client
 */
export function saveSupabaseConfig(url, key) {
  const cleanUrl = (url || '').trim();
  const cleanKey = (key || '').trim();
  localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify({ url: cleanUrl, key: cleanKey }));
  
  if (cleanUrl && cleanKey && window.supabase) {
    try {
      supabaseClient = window.supabase.createClient(cleanUrl, cleanKey);
      isSupabaseActive = true;
    } catch (e) {
      supabaseClient = null;
      isSupabaseActive = false;
    }
  } else {
    supabaseClient = null;
    isSupabaseActive = false;
  }
}

/**
 * Test Connection to Supabase
 */
export async function testSupabaseConnection(url, key) {
  if (!window.supabase) {
    return { success: false, message: 'Supabase JS library not loaded in browser.' };
  }
  const cleanUrl = (url || '').trim();
  const cleanKey = (key || '').trim();
  if (!cleanUrl || !cleanKey) {
    return { success: false, message: 'Please provide both Project URL and Public Anon Key.' };
  }

  try {
    const client = window.supabase.createClient(cleanUrl, cleanKey);
    // Timeout race after 3s so network delay never blocks application startup
    const queryPromise = client.from('production_entries').select('count', { count: 'exact', head: true });
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Connection timed out (3s)')), 3000)
    );
    const { data, error } = await Promise.race([queryPromise, timeoutPromise]);
    if (error) {
      return { 
        success: false, 
        message: `Connected, but table check failed: ${error.message}. Ensure supabase/schema.sql has run in your Supabase SQL Editor.` 
      };
    }
    isSupabaseActive = true;
    supabaseClient = client;
    return { success: true, message: 'Connected to Supabase Database successfully! Ready for live streaming.' };
  } catch (err) {
    return { success: false, message: err.message || 'Connection failed.' };
  }
}

export function isConnectedToSupabase() {
  return isSupabaseActive && supabaseClient !== null;
}

export function getMachines() {
  return MACHINES;
}

/**
 * Clear All Production Records (Both LocalStorage and Supabase Cloud if active)
 */
export async function clearAllProductionEntries() {
  localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify([]));

  if (isSupabaseActive && supabaseClient) {
    try {
      // In Supabase, delete all rows from production_entries
      const { error } = await supabaseClient.from('production_entries').delete().neq('machine_code', '___non_existent___');
      if (error) {
        console.warn('Supabase delete all error:', error.message);
      }
    } catch (e) {
      console.warn('Supabase delete all failed:', e);
    }
  }

  return true;
}

/**
 * Fetch Production Entries (Supabase primary source, LocalStorage fallback)
 */
export async function getProductionEntries(machineCode = null) {
  const client = getOrCreateSupabaseClient();
  if (client) {
    try {
      let query = client.from('production_entries').select('*').order('log_date', { ascending: false }).order('created_at', { ascending: false });
      if (machineCode) {
        query = query.eq('machine_code', machineCode);
      }
      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        isSupabaseActive = true;
        if (!machineCode) {
          try { localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(data)); } catch (_) { }
        }
        return data;
      }
      if (error) {
        console.warn('Supabase query error:', error.message);
      }
    } catch (e) {
      console.warn('Supabase fetch failed, falling back to local:', e);
    }
  }

  // Local storage fallback
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ENTRIES);
    const entries = raw ? JSON.parse(raw) : [];
    if (machineCode) {
      return entries.filter(e => e.machine_code === machineCode);
    }
    return entries;
  } catch (e) {
    return [];
  }
}

/**
 * Calculates Availability, Performance, Quality, and OEE
 * Formula Execution:
 *   Availability = (Operating Time / Planned Time) * 100
 *   Performance = (Ideal Run Time / Operating Time) * 100
 *   Quality = (Good Parts / Total Parts) * 100
 *   OEE = (A * P * Q) / 10000
 */
export function calculateOEE(shiftHours, parts, lossesObj, rejectedQty) {
  const plannedTimeMins = Number(shiftHours) === 8.5 
    ? 465 
    : (Number(shiftHours) === 7.0 ? 390 : Math.round((Number(shiftHours) || 8.5) * 60));

  let totalLossesMins = 0;
  LOSS_FIELDS.forEach(f => {
    totalLossesMins += (Number(lossesObj[f.key]) || 0);
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

  const availabilityRate = plannedTimeMins > 0 
    ? (operatingTimeMins / plannedTimeMins) * 100 
    : 0;

  const performanceRate = operatingTimeMins > 0 
    ? Math.min(100, (idealRunTimeMins / operatingTimeMins) * 100) 
    : 0;

  const rejected = Number(rejectedQty) || 0;
  const goodQty = Math.max(0, totalQty - rejected);
  const qualityRate = totalQty > 0 
    ? Math.min(100, (goodQty / totalQty) * 100) 
    : 100;

  // OEE = (A * P * Q) / 10000
  const oeeRate = ((availabilityRate * performanceRate * qualityRate) / 10000);

  return {
    plannedTimeMins,
    totalLossesMins,
    operatingTimeMins,
    idealRunTimeMins: Number(idealRunTimeMins.toFixed(2)),
    totalQty,
    goodQty,
    rejectedQty: rejected,
    availabilityRate: Number(availabilityRate.toFixed(1)),
    performanceRate: Number(performanceRate.toFixed(1)),
    qualityRate: Number(qualityRate.toFixed(1)),
    oeeRate: Number(oeeRate.toFixed(1)),
    productivityRate: operatingTimeMins > 0 ? Number(((goodQty * 60) / operatingTimeMins).toFixed(1)) : 0
  };
}

/**
 * Save New Production Entry
 * Saves to LocalStorage and writes directly to Supabase cloud database if connected.
 */
export async function saveProductionEntry(entryData) {
  const id = entryData.id || generateUUID();
  const nowIso = entryData.created_at || new Date().toISOString();

  const record = {
    ...entryData,
    id,
    created_at: nowIso
  };

  // 1. Local storage save
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY_ENTRIES) || '[]');
  const existingIdx = existing.findIndex(e => e.id === record.id);
  if (existingIdx >= 0) {
    existing[existingIdx] = record;
  } else {
    existing.unshift(record);
  }
  localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(existing));

  // 2. Supabase Cloud save
  let supabaseSynced = false;
  const client = getOrCreateSupabaseClient();
  if (client) {
    try {
      let { data, error } = await client.from('production_entries').upsert(record, { onConflict: 'id' }).select();
      if (!error) {
        supabaseSynced = true;
        isSupabaseActive = true;
      } else {
        console.warn('Supabase upsert error:', error.message);
        if (error.code === '42703' || (error.message && error.message.includes('productivity_rate'))) {
          const { productivity_rate, ...cleanRecord } = record;
          const retryRes = await client.from('production_entries').upsert(cleanRecord, { onConflict: 'id' }).select();
          if (!retryRes.error) {
            supabaseSynced = true;
            isSupabaseActive = true;
          }
        }
      }
    } catch (e) {
      console.warn('Supabase upsert exception:', e);
    }
  }

  return { success: true, record, supabaseSynced };
}

/**
 * Delete a Single Production Entry
 */
export async function deleteProductionEntry(entryId) {
  const existing = JSON.parse(localStorage.getItem(STORAGE_KEY_ENTRIES) || '[]');
  const filtered = existing.filter(e => e.id !== entryId);
  localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(filtered));

  if (isSupabaseActive && supabaseClient) {
    try {
      await supabaseClient.from('production_entries').delete().eq('id', entryId);
    } catch (e) {
      console.warn('Supabase delete failed:', e);
    }
  }

  return true;
}

/**
 * Aggregate Analytics for Executive Dashboard
 * Handles 0 entries gracefully with clear empty-state KPIs.
 */
export async function getDashboardAnalytics(machineCode = null) {
  const entries = await getProductionEntries(machineCode);

  if (!entries || entries.length === 0) {
    const emptyBreakdown = {};
    const emptyCounts = {};
    LOSS_FIELDS.forEach(f => {
      emptyBreakdown[f.key] = 0;
      emptyCounts[f.key] = 0;
    });

    const emptyMachineOeeList = MACHINES.map(m => ({ name: m.name, oee: 0 }));

    return {
      avgOEE: '0.0',
      avgAvailability: '0.0',
      avgPerformance: '0.0',
      avgQuality: '0.0',
      totalLossesMins: 0,
      totalLossIncidents: 0,
      totalPlannedTimeMins: 0,
      totalOperatingTimeMins: 0,
      totalIdealRunTimeMins: 0,
      totalOutput: 0,
      totalGood: 0,
      totalScrap: 0,
      lossBreakdown: emptyBreakdown,
      lossCounts: emptyCounts,
      machineOeeList: emptyMachineOeeList,
      lossOccurrenceList: []
    };
  }

  let sumOee = 0;
  let sumAvail = 0;
  let sumPerf = 0;
  let sumQual = 0;
  let totalLossesMins = 0;
  let totalPlannedTimeMins = 0;
  let totalOperatingTimeMins = 0;
  let totalIdealRunTimeMins = 0;
  let totalOutput = 0;
  let totalGood = 0;
  let totalScrap = 0;

  // Initialize loss tallies (minutes) and frequency counts (times occurred)
  const lossTally = {};
  const lossCounts = {};
  LOSS_FIELDS.forEach(f => {
    lossTally[f.key] = 0;
    lossCounts[f.key] = 0;
  });

  let totalLossIncidents = 0;
  const lossOccurrences = [];

  entries.forEach(e => {
    sumOee += Number(e.oee_rate) || 0;
    sumAvail += Number(e.availability_rate) || 0;
    sumPerf += Number(e.performance_rate) || 0;
    sumQual += Number(e.quality_rate) || 0;
    totalLossesMins += Number(e.total_losses_mins) || 0;
    totalPlannedTimeMins += Number(e.planned_time_mins) || 0;
    totalOperatingTimeMins += Number(e.operating_time_mins) || 0;
    totalIdealRunTimeMins += Number(e.ideal_run_time_mins) || 0;
    totalOutput += Number(e.total_qty) || 0;
    totalGood += Number(e.good_qty) || 0;
    totalScrap += Number(e.rejected_qty) || 0;

    // Sum 15 losses duration and count occurrences
    LOSS_FIELDS.forEach(f => {
      const val = Number(e[f.key]) || 0;
      if (val > 0) {
        lossTally[f.key] += val;
        lossCounts[f.key] += 1;
        totalLossIncidents += 1;
      }
    });

    // Record detailed "Why & How Loss Occurred" log
    if (e.remarks || e.total_losses_mins > 0) {
      let topCategory = 'Standard Stoppage';
      let topWhy = 'Operational Pause';
      let maxVal = 0;

      LOSS_FIELDS.forEach(f => {
        const val = Number(e[f.key]) || 0;
        if (val > maxVal) {
          maxVal = val;
          topCategory = f.label;
          topWhy = f.category || 'General';
        }
      });

      lossOccurrences.push({
        id: e.id,
        date: e.log_date,
        shift: e.shift,
        machineName: e.machine_name,
        operator: e.operator_name,
        primaryLoss: topCategory,
        whyCategory: topWhy,
        lossMins: maxVal,
        totalLossMins: e.total_losses_mins,
        howItOccurred: e.remarks || `${topCategory} incident reported during shift execution`
      });
    }
  });

  const count = entries.length;

  // Machine-level OEE comparison across all 11 machines
  const machineOeeMap = {};
  MACHINES.forEach(m => {
    machineOeeMap[m.name] = { totalOee: 0, count: 0 };
  });

  entries.forEach(e => {
    if (machineOeeMap[e.machine_name]) {
      machineOeeMap[e.machine_name].totalOee += (Number(e.oee_rate) || 0);
      machineOeeMap[e.machine_name].count += 1;
    }
  });

  const machineOeeList = MACHINES.map(m => {
    const item = machineOeeMap[m.name];
    const avg = item && item.count > 0 ? (item.totalOee / item.count).toFixed(1) : 0;
    return { name: m.name, oee: Number(avg) };
  });

  return {
    avgOEE: (sumOee / count).toFixed(1),
    avgAvailability: (sumAvail / count).toFixed(1),
    avgPerformance: (sumPerf / count).toFixed(1),
    avgQuality: (sumQual / count).toFixed(1),
    totalLossesMins,
    totalLossIncidents,
    totalPlannedTimeMins,
    totalOperatingTimeMins,
    totalIdealRunTimeMins: Math.round(totalIdealRunTimeMins),
    totalOutput,
    totalGood,
    totalScrap,
    lossBreakdown: lossTally,
    lossCounts,
    machineOeeList,
    lossOccurrenceList: lossOccurrences.slice(0, 25)
  };
}

/**
 * ISO 8601 Week Number & Date Range Calculator
 * Standard: Monday is first day of week. Week 1 is week with first Thursday of year.
 */
export function getISOWeekDetails(dateInput) {
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) {
    return { key: 'N/A', weekNum: 0, year: 2026, label: 'Invalid Date', startDay: '', endDay: '' };
  }
  const dateCopy = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNr = (dateCopy.getUTCDay() + 6) % 7; // Monday = 0, Sunday = 6
  dateCopy.setUTCDate(dateCopy.getUTCDate() - dayNr + 3); // Thursday of same week
  const firstThursday = dateCopy.getTime();
  dateCopy.setUTCMonth(0, 1);
  if (dateCopy.getUTCDay() !== 4) {
    dateCopy.setUTCMonth(0, 1 + ((4 - dateCopy.getUTCDay()) + 7) % 7);
  }
  const weekNum = 1 + Math.ceil((firstThursday - dateCopy.getTime()) / 604800000);
  const year = new Date(firstThursday).getUTCFullYear();
  const padWeek = String(weekNum).padStart(2, '0');
  const key = `${year}-W${padWeek}`;

  // Monday & Sunday bounds
  const rawDate = new Date(dateInput);
  const curDay = (rawDate.getDay() + 6) % 7;
  const monDate = new Date(rawDate);
  monDate.setDate(rawDate.getDate() - curDay);
  const sunDate = new Date(monDate);
  sunDate.setDate(monDate.getDate() + 6);

  const monStr = monDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  const sunStr = sunDate.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const label = `Week ${padWeek} (${monStr} - ${sunStr})`;

  return {
    key,
    weekNum,
    year,
    label,
    startDay: monDate.toISOString().split('T')[0],
    endDay: sunDate.toISOString().split('T')[0]
  };
}

/**
 * Format helper for day labels
 */
export function formatDayLabel(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/**
 * Format helper for month labels (e.g. 2026-09 -> September 2026)
 */
export function formatMonthLabel(monthKey) {
  if (!monthKey) return '';
  const parts = monthKey.split('-');
  if (parts.length < 2) return monthKey;
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

/**
 * True Time-Weighted OEE Calculation for Multi-Shift / Periodic Aggregations
 * Conforms to ISO standard:
 *   A = sum(operating_time) / sum(planned_time) * 100
 *   P = sum(ideal_run_time) / sum(operating_time) * 100
 *   Q = sum(good_qty) / sum(total_qty) * 100
 *   OEE = (A * P * Q) / 10000
 */
export function calculateTimeWeightedOEE(entries) {
  const emptyBreakdown = {};
  const emptyCounts = {};
  LOSS_FIELDS.forEach(f => {
    emptyBreakdown[f.key] = 0;
    emptyCounts[f.key] = 0;
  });

  if (!entries || entries.length === 0) {
    return {
      shiftCount: 0,
      plannedTimeMins: 0,
      totalLossesMins: 0,
      operatingTimeMins: 0,
      idealRunTimeMins: 0,
      totalQty: 0,
      goodQty: 0,
      rejectedQty: 0,
      availabilityRate: 0,
      performanceRate: 0,
      qualityRate: 0,
      oeeRate: 0,
      lossBreakdown: emptyBreakdown,
      lossCounts: emptyCounts,
      topLoss: null
    };
  }

  let totalPlannedMins = 0;
  let totalLossesMins = 0;
  let totalOperatingMins = 0;
  let totalIdealRunMins = 0;
  let totalQty = 0;
  let totalGood = 0;
  let totalRejected = 0;
  const lossBreakdown = { ...emptyBreakdown };
  const lossCounts = { ...emptyCounts };

  entries.forEach(e => {
    totalPlannedMins += Number(e.planned_time_mins) || 0;
    totalLossesMins += Number(e.total_losses_mins) || 0;
    totalOperatingMins += Number(e.operating_time_mins) || 0;
    totalIdealRunMins += Number(e.ideal_run_time_mins) || 0;
    totalQty += Number(e.total_qty) || 0;
    totalGood += Number(e.good_qty) || 0;
    totalRejected += Number(e.rejected_qty) || 0;

    LOSS_FIELDS.forEach(f => {
      const val = Number(e[f.key]) || 0;
      if (val > 0) {
        lossBreakdown[f.key] += val;
        lossCounts[f.key] += 1;
      }
    });
  });

  const availabilityRate = totalPlannedMins > 0 
    ? Math.min(100, (totalOperatingMins / totalPlannedMins) * 100) 
    : 0;
  const performanceRate = totalOperatingMins > 0 
    ? Math.min(100, (totalIdealRunMins / totalOperatingMins) * 100) 
    : 0;
  const qualityRate = totalQty > 0 
    ? Math.min(100, (totalGood / totalQty) * 100) 
    : 100;
  const oeeRate = (availabilityRate * performanceRate * qualityRate) / 10000;

  // Find top loss
  let topLoss = null;
  let maxLossVal = 0;
  LOSS_FIELDS.forEach(f => {
    const mins = lossBreakdown[f.key] || 0;
    if (mins > maxLossVal) {
      maxLossVal = mins;
      topLoss = { key: f.key, label: f.label, category: f.category, mins, count: lossCounts[f.key] };
    }
  });

  return {
    shiftCount: entries.length,
    plannedTimeMins: Math.round(totalPlannedMins),
    totalLossesMins: Math.round(totalLossesMins),
    operatingTimeMins: Math.round(totalOperatingMins),
    idealRunTimeMins: Number(totalIdealRunMins.toFixed(1)),
    totalQty,
    goodQty: totalGood,
    rejectedQty: totalRejected,
    availabilityRate: Number(availabilityRate.toFixed(1)),
    performanceRate: Number(performanceRate.toFixed(1)),
    qualityRate: Number(qualityRate.toFixed(1)),
    oeeRate: Number(oeeRate.toFixed(1)),
    productivityRate: totalOperatingMins > 0 ? Number(((totalGood * 60) / totalOperatingMins).toFixed(1)) : 0,
    lossBreakdown,
    lossCounts,
    topLoss
  };
}

/**
 * Periodic Analytics Engine
 * Supports: Each Day (daily), Weekly (ISO weeks), Monthly, and Overall Horizons
 * Across All 11 Machines together and Each Machine separately.
 */
export async function getPeriodicAnalytics({ machineCode = 'ALL', periodType = 'daily', periodValue = 'LATEST' } = {}) {
  const allEntries = await getProductionEntries();

  // 1. Discover all unique Days, ISO Weeks, and Months
  const daysMap = new Map();
  const weeksMap = new Map();
  const monthsMap = new Map();

  allEntries.forEach(e => {
    if (!e.log_date) return;
    const dayKey = e.log_date;
    daysMap.set(dayKey, (daysMap.get(dayKey) || 0) + 1);

    const weekInfo = getISOWeekDetails(e.log_date);
    if (weekInfo && weekInfo.key !== 'N/A') {
      if (!weeksMap.has(weekInfo.key)) {
        weeksMap.set(weekInfo.key, { label: weekInfo.label, count: 0, startDay: weekInfo.startDay, endDay: weekInfo.endDay });
      }
      weeksMap.get(weekInfo.key).count += 1;
    }

    const monthKey = e.log_date.substring(0, 7);
    if (!monthsMap.has(monthKey)) {
      monthsMap.set(monthKey, { label: formatMonthLabel(monthKey), count: 0 });
    }
    monthsMap.get(monthKey).count += 1;
  });

  const availableDays = Array.from(daysMap.keys())
    .sort((a, b) => b.localeCompare(a))
    .map(key => ({ key, label: formatDayLabel(key), count: daysMap.get(key) }));

  const availableWeeks = Array.from(weeksMap.keys())
    .sort((a, b) => b.localeCompare(a))
    .map(key => ({ key, label: weeksMap.get(key).label, count: weeksMap.get(key).count, startDay: weeksMap.get(key).startDay, endDay: weeksMap.get(key).endDay }));

  const availableMonths = Array.from(monthsMap.keys())
    .sort((a, b) => b.localeCompare(a))
    .map(key => ({ key, label: monthsMap.get(key).label, count: monthsMap.get(key).count }));

  // 2. Determine active periodValue and human-friendly label
  let activePeriodValue = periodValue;
  let activePeriodLabel = 'All Time Records';

  if (periodType === 'daily') {
    if (activePeriodValue === 'LATEST' || !activePeriodValue) {
      activePeriodValue = availableDays.length > 0 ? availableDays[0].key : 'ALL';
    }
    const found = availableDays.find(d => d.key === activePeriodValue);
    activePeriodLabel = found ? found.label : (activePeriodValue === 'ALL' ? 'All Recorded Days' : activePeriodValue);
  } else if (periodType === 'weekly') {
    if (activePeriodValue === 'LATEST' || !activePeriodValue) {
      activePeriodValue = availableWeeks.length > 0 ? availableWeeks[0].key : 'ALL';
    }
    const found = availableWeeks.find(w => w.key === activePeriodValue);
    activePeriodLabel = found ? found.label : (activePeriodValue === 'ALL' ? 'All Recorded Weeks' : activePeriodValue);
  } else if (periodType === 'monthly') {
    if (activePeriodValue === 'LATEST' || !activePeriodValue) {
      activePeriodValue = availableMonths.length > 0 ? availableMonths[0].key : 'ALL';
    }
    const found = availableMonths.find(m => m.key === activePeriodValue);
    activePeriodLabel = found ? found.label : (activePeriodValue === 'ALL' ? 'All Recorded Months' : activePeriodValue);
  } else {
    activePeriodValue = 'ALL';
    activePeriodLabel = 'All-Time Comprehensive Plant Overview';
  }

  // 3. Filter entries matching active period
  const periodFilteredEntries = allEntries.filter(e => {
    if (activePeriodValue === 'ALL' || periodType === 'overall') return true;
    if (periodType === 'daily') return e.log_date === activePeriodValue;
    if (periodType === 'weekly') return getISOWeekDetails(e.log_date).key === activePeriodValue;
    if (periodType === 'monthly') return (e.log_date || '').startsWith(activePeriodValue);
    return true;
  });

  // 4. Multi-Machine Comparison Matrix for this active period
  // Evaluates each of the 11 machines separately
  const machineMatrix = MACHINES.map(m => {
    const mEntries = periodFilteredEntries.filter(e => e.machine_code === m.code);
    const metrics = calculateTimeWeightedOEE(mEntries);

    let status = 'Inactive';
    if (metrics.shiftCount > 0) {
      if (metrics.oeeRate >= 85) status = 'Optimal';
      else if (metrics.oeeRate >= 70) status = 'Normal';
      else status = 'Warning';
    }

    return {
      id: m.id,
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

  // 5. Focused Analysis for the selected machine (or combined if 'ALL')
  const focusedEntries = machineCode === 'ALL'
    ? periodFilteredEntries
    : periodFilteredEntries.filter(e => e.machine_code === machineCode);

  const focusedMetrics = calculateTimeWeightedOEE(focusedEntries);

  // Detailed 15 Losses Table with percentages and impact on availability
  const totalPeriodLossMins = focusedMetrics.totalLossesMins;
  const detailedLossList = LOSS_FIELDS.map(f => {
    const mins = focusedMetrics.lossBreakdown[f.key] || 0;
    const count = focusedMetrics.lossCounts[f.key] || 0;
    const pctOfLoss = totalPeriodLossMins > 0 ? Number(((mins / totalPeriodLossMins) * 100).toFixed(1)) : 0;
    const impactOnAvail = focusedMetrics.plannedTimeMins > 0 
      ? Number(((mins / focusedMetrics.plannedTimeMins) * 100).toFixed(1)) 
      : 0;

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

  // 6. Chronological Trend Series (Days, Weeks, or Months)
  // For the selected machine, trace progression across all recorded intervals
  const machineHistoricalEntries = machineCode === 'ALL'
    ? allEntries
    : allEntries.filter(e => e.machine_code === machineCode);

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
      // Overall: group by day
      groupKey = e.log_date;
      groupLabel = formatDayLabel(groupKey);
    }

    if (!trendGroupMap.has(groupKey)) {
      trendGroupMap.set(groupKey, { groupKey, groupLabel, entries: [] });
    }
    trendGroupMap.get(groupKey).entries.push(e);
  });

  // Sort chronologically (oldest to newest for charts)
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

  // Reverse chronological list for table display (newest to oldest)
  const periodicHistory = [...trendPeriods].reverse();

  // Selected machine metadata
  const selectedMachineMeta = machineCode === 'ALL'
    ? { code: 'ALL', name: 'All 11 Machines (Combined Line)', category: 'Combined Plant' }
    : MACHINES.find(m => m.code === machineCode) || MACHINES[0];

  // Loss incidents with root cause diagnosis
  const lossIncidents = focusedEntries
    .filter(e => (e.remarks && e.remarks.trim().length > 0) || (e.total_losses_mins && e.total_losses_mins > 0))
    .map(e => {
      let topCategory = 'Standard Stoppage';
      let topWhy = 'Operational Pause';
      let maxVal = 0;
      LOSS_FIELDS.forEach(f => {
        const val = Number(e[f.key]) || 0;
        if (val > maxVal) {
          maxVal = val;
          topCategory = f.label;
          topWhy = f.category || 'General';
        }
      });
      return {
        id: e.id,
        date: e.log_date,
        shift: e.shift,
        machineName: e.machine_name,
        operator: e.operator_name,
        primaryLoss: topCategory,
        whyCategory: topWhy,
        lossMins: maxVal,
        totalLossMins: e.total_losses_mins,
        howItOccurred: e.remarks || `${topCategory} stoppage reported during shift`
      };
    });

  return {
    periodType,
    activePeriodValue,
    activePeriodLabel,
    availableDays,
    availableWeeks,
    availableMonths,
    selectedMachine: selectedMachineMeta,
    summary: focusedMetrics,
    detailedLossList,
    machineMatrix,
    trendPeriods,
    periodicHistory,
    lossIncidents: lossIncidents.slice(0, 30)
  };
}

/**
 * Seed Realistic Demo Shift Data for 11 Machines & Multi-Week Time Horizons
 * Enables immediate verification of Daily, Weekly, and Monthly analytics without manual entry.
 */
export async function seedDemoShiftData() {
  const sampleParts = [
    { name: 'Pinion-Shaft-45', cycle: 2.2 },
    { name: 'Flange-Ring-120', cycle: 3.5 },
    { name: 'Housing-Cover-M8', cycle: 4.8 },
    { name: 'Spindle-Collet-32', cycle: 1.8 },
    { name: 'Hydraulic-Block-20', cycle: 5.5 },
    { name: 'Gear-Blank-90', cycle: 2.8 }
  ];

  const operators = ['Ramesh Kumar', 'Sunil Patel', 'Amit Verma', 'Vikas Sharma', 'Deepak Singh', 'Rajesh Rao'];
  const generatedRecords = [];

  // Generate 21 consecutive days of shifts (spans 3 ISO weeks and August/September 2026)
  const baseDate = new Date('2026-08-17T00:00:00');

  for (let d = 0; d < 21; d++) {
    const curDate = new Date(baseDate);
    curDate.setDate(baseDate.getDate() + d);
    const dateStr = curDate.toISOString().split('T')[0];

    // Pick 4 to 6 random machines each day
    const activeMachinesCount = 5;
    const shuffledMachines = [...MACHINES].sort(() => 0.5 - Math.random()).slice(0, activeMachinesCount);

    shuffledMachines.forEach((machine, idx) => {
      const shift = (idx % 3 === 0) ? 'Shift A' : ((idx % 3 === 1) ? 'Shift B' : 'Shift C');
      const shiftHours = 8.5;
      const plannedTimeMins = 465;

      const partA = sampleParts[Math.floor(Math.random() * sampleParts.length)];
      const partB = sampleParts[Math.floor(Math.random() * sampleParts.length)];

      const qtyA = Math.floor(Math.random() * 60) + 70;
      const qtyB = Math.floor(Math.random() * 30) + 15;
      const totalQty = qtyA + qtyB;

      // Realistic defect rate ~ 1-3%
      const rejectedQty = Math.floor(Math.random() * 4);
      const goodQty = totalQty - rejectedQty;

      // Select 1 to 3 dominant losses for this shift
      const lossesObj = {};
      LOSS_FIELDS.forEach(f => { lossesObj[f.key] = 0; });

      let primaryLossName = 'Standard';
      let remarks = 'Normal operational run';

      const lossRoll = Math.random();
      if (lossRoll > 0.65) {
        // Equipment or Tooling incident
        if (machine.category === 'CNC') {
          lossesObj.loss_breakdown = Math.floor(Math.random() * 25) + 15;
          lossesObj.loss_tool_insert = Math.floor(Math.random() * 20) + 15;
          lossesObj.loss_measurement = 10;
          primaryLossName = 'Tool & Insert Wear / Breakdown';
          remarks = 'Roughing carbide insert chipped on OD turning tool T03; edge indexed and offset recalibrated';
        } else if (machine.category === 'VMC') {
          lossesObj.loss_tool_insert = Math.floor(Math.random() * 25) + 15;
          lossesObj.loss_jig_fixture = Math.floor(Math.random() * 20) + 15;
          lossesObj.loss_programming = 10;
          primaryLossName = 'Tool & Insert Loss';
          remarks = 'Face mill corner inserts worn out during high-speed profiling; replaced and touched off tool';
        } else {
          lossesObj.loss_setup = Math.floor(Math.random() * 35) + 20;
          lossesObj.loss_tool_insert = 15;
          lossesObj.loss_speed = 10;
          primaryLossName = 'Pallet Setup & Tooling';
          remarks = 'B-axis pallet shuttle alignment and twin fixture changeover with tool check';
        }
      } else if (lossRoll > 0.35) {
        // Process, Maintenance, & Other losses
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
        primaryLossName = 'Job Setup & Cleaning';
      } else {
        // Minor routine pauses
        lossesObj.loss_startup = 10;
        lossesObj.loss_cleaning = 10;
        lossesObj.loss_measurement = 5;
        remarks = 'Smooth shift; scheduled coolant top-up and inspection';
      }

      // Sum losses
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

      generatedRecords.push({
        id: generateUUID(),
        machine_code: machine.code,
        machine_name: machine.name,
        log_date: dateStr,
        shift,
        shift_hours: shiftHours,
        operator_name: operators[Math.floor(Math.random() * operators.length)],

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
        productivity_rate: operatingTimeMins > 0 ? Number(((goodQty * 60) / operatingTimeMins).toFixed(1)) : 0,
        created_at: new Date(curDate.getTime() + (idx * 3600000)).toISOString()
      });
    });
  }

  localStorage.setItem(STORAGE_KEY_ENTRIES, JSON.stringify(generatedRecords));
  return generatedRecords;
}

