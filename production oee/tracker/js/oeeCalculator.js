// OEE & Shop-Floor Time Calculations Engine
// Strictly follows the user's Supabase database schema & industrial calculation standards

import { DEFAULT_PLANNED_BREAK_MINS } from './config.js';

export function calculateOEE(formData) {
  const shiftHours = parseFloat(formData.shift_hours) || 8.5;
  const totalShiftMins = Math.round(shiftHours * 60);
  const breakMins = DEFAULT_PLANNED_BREAK_MINS[shiftHours] ?? 45;
  
  // Planned Production Time = Shift Duration - Planned Breaks (e.g. 510 - 45 = 465 mins)
  const plannedTimeMins = Math.max(0, totalShiftMins - breakMins);

  // Sum of all 13 loss fields
  const lossKeys = [
    'loss_breakdown', 'loss_no_plan', 'loss_no_material', 'loss_no_operator',
    'loss_startup', 'loss_setup', 'loss_jig_fixture', 'loss_programming',
    'loss_measurement', 'loss_document', 'loss_speed', 'loss_quality_insp',
    'loss_cleaning'
  ];

  let totalLossesMins = 0;
  lossKeys.forEach(key => {
    totalLossesMins += Math.max(0, parseInt(formData[key], 10) || 0);
  });

  // Operating Time = Planned Time - Unplanned Downtime / Losses
  const operatingTimeMins = Math.max(0, plannedTimeMins - totalLossesMins);

  // Multi-Part Production Totals
  const part1Qty = Math.max(0, parseInt(formData.part1_qty, 10) || 0);
  const part1Cycle = Math.max(0, parseFloat(formData.part1_cycle_time) || 0);
  const part1RunTime = +(part1Qty * part1Cycle).toFixed(2);

  const part2Qty = Math.max(0, parseInt(formData.part2_qty, 10) || 0);
  const part2Cycle = Math.max(0, parseFloat(formData.part2_cycle_time) || 0);
  const part2RunTime = +(part2Qty * part2Cycle).toFixed(2);

  const part3Qty = Math.max(0, parseInt(formData.part3_qty, 10) || 0);
  const part3Cycle = Math.max(0, parseFloat(formData.part3_cycle_time) || 0);
  const part3RunTime = +(part3Qty * part3Cycle).toFixed(2);

  const totalQty = part1Qty + part2Qty + part3Qty;
  const rejectedQty = Math.max(0, parseInt(formData.rejected_qty, 10) || 0);
  const goodQty = Math.max(0, totalQty - rejectedQty);

  // Ideal Run Time = Sum of (Qty * Cycle Time in mins)
  const idealRunTimeMins = +(part1RunTime + part2RunTime + part3RunTime).toFixed(2);

  // Rates calculation
  // 1. Availability (%) = (Operating Time / Planned Time) * 100
  let availabilityRate = 0;
  if (plannedTimeMins > 0) {
    availabilityRate = Math.min(100, Math.max(0, (operatingTimeMins / plannedTimeMins) * 100));
  }

  // 2. Performance (%) = (Ideal Run Time / Operating Time) * 100
  let performanceRate = 0;
  if (operatingTimeMins > 0 && idealRunTimeMins > 0) {
    performanceRate = (idealRunTimeMins / operatingTimeMins) * 100;
  }

  // 3. Quality (%) = (Good Qty / Total Qty) * 100
  let qualityRate = 100;
  if (totalQty > 0) {
    qualityRate = Math.min(100, Math.max(0, (goodQty / totalQty) * 100));
  } else if (idealRunTimeMins === 0) {
    qualityRate = 0;
  }

  // 4. Overall OEE (%) = (Availability * Performance * Quality) / 10000
  let oeeRate = 0;
  if (availabilityRate > 0 && performanceRate > 0 && qualityRate > 0) {
    oeeRate = (availabilityRate * performanceRate * qualityRate) / 10000;
  }

  // Time Variance / Balance:
  // Ideal Run Time + Total Losses vs Planned Time
  const accountedTimeMins = idealRunTimeMins + totalLossesMins;
  const timeVarianceMins = +(accountedTimeMins - plannedTimeMins).toFixed(2);

  return {
    totalShiftMins,
    breakMins,
    planned_time_mins: plannedTimeMins,
    total_losses_mins: totalLossesMins,
    operating_time_mins: operatingTimeMins,
    part1_run_time: part1RunTime,
    part2_run_time: part2RunTime,
    part3_run_time: part3RunTime,
    ideal_run_time_mins: idealRunTimeMins,
    total_qty: totalQty,
    good_qty: goodQty,
    rejected_qty: rejectedQty,
    availability_rate: +availabilityRate.toFixed(2),
    performance_rate: +performanceRate.toFixed(2),
    quality_rate: +qualityRate.toFixed(2),
    oee_rate: +oeeRate.toFixed(2),
    time_variance_mins: timeVarianceMins,
    accounted_time_mins: accountedTimeMins
  };
}
