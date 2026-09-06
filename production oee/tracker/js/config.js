// Configuration & Master Machine Catalog
// Matching the Supabase SQL schema: public.machines & public.production_entries

// ==============================================================================
// 1. SUPABASE DATABASE CONFIGURATION
// ==============================================================================
// You can enter your Supabase Project URL and Anon Key directly here,
// OR click "⚡ Connect Supabase Database" in the app interface.
// ==============================================================================
export const SUPABASE_CONFIG = {
  url: '',      // e.g. 'https://your-project-ref.supabase.co'
  anonKey: ''   // e.g. 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...'
};

export const MACHINES = [
  {
    code: 'CNC-DX200-1',
    name: 'CNC DX 200-1',
    category: 'CNC',
    type: 'CNC Turning Center',
    specs: 'Max Dia: 200mm | Spindle: 4000 RPM | 8-Station Turret',
    icon: 'lathe',
    status: 'Operational'
  },
  {
    code: 'CNC-200-2',
    name: 'CNC 200-2',
    category: 'CNC',
    type: 'CNC Turning Center',
    specs: 'Max Dia: 200mm | Spindle: 4500 RPM | High Precision',
    icon: 'lathe',
    status: 'Operational'
  },
  {
    code: 'CNC-DX250',
    name: 'CNC DX 250',
    category: 'CNC',
    type: 'Heavy Duty CNC Lathe',
    specs: 'Max Dia: 250mm | Spindle: 3500 RPM | 12-Station Turret',
    icon: 'lathe',
    status: 'Operational'
  },
  {
    code: 'CNC-DX12B',
    name: 'CNC DX12B',
    category: 'CNC',
    type: 'Compact Precision CNC Lathe',
    specs: 'Sliding Head / Chucking | High Speed Spindle',
    icon: 'lathe',
    status: 'Operational'
  },
  {
    code: 'VMC-1050',
    name: 'VMC 1050',
    category: 'VMC',
    type: 'Vertical Machining Center',
    specs: 'X: 1050mm Y: 600mm Z: 600mm | BT40 | 24 ATC',
    icon: 'mill',
    status: 'Operational'
  },
  {
    code: 'VMC-1880',
    name: 'VMC 1880',
    category: 'VMC',
    type: 'Heavy Duty VMC Center',
    specs: 'X: 1800mm Y: 800mm Z: 800mm | BT50 Heavy Cutting',
    icon: 'mill',
    status: 'Operational'
  },
  {
    code: 'VMC-850',
    name: 'VMC 850',
    category: 'VMC',
    type: 'High Speed VMC Center',
    specs: 'X: 850mm Y: 500mm Z: 550mm | 10000 RPM Spindle',
    icon: 'mill',
    status: 'Operational'
  },
  {
    code: 'VMC-HAAS',
    name: 'VMC HAAS',
    category: 'VMC',
    type: 'HAAS Precision Machining Center',
    specs: 'HAAS Vector Drive | 12000 RPM | Ultra Rigidity',
    icon: 'mill',
    status: 'Operational'
  },
  {
    code: 'VMC-PX20',
    name: 'VMC PX 20',
    category: 'VMC',
    type: 'High Production VMC',
    specs: 'Direct Drive Spindle | High Speed Rigid Tapping',
    icon: 'mill',
    status: 'Operational'
  },
  {
    code: 'HMC-1',
    name: 'HMC 1',
    category: 'HMC',
    type: 'Horizontal Machining Center',
    specs: 'Dual Pallet Changer (500x500) | 4-Axis B-Table',
    icon: 'hmc',
    status: 'Operational'
  },
  {
    code: 'HMC-2',
    name: 'HMC 2',
    category: 'HMC',
    type: 'Horizontal Machining Center',
    specs: 'Twin Pallet (630x630) | High Torque | 40 ATC',
    icon: 'hmc',
    status: 'Operational'
  }
];

export const SHIFTS = [
  { id: 'Shift A', label: 'Shift A (Morning)', defaultStart: '07:00', defaultEnd: '15:30', standardHrs: 8.5 },
  { id: 'Shift B', label: 'Shift B (Evening)', defaultStart: '15:30', defaultEnd: '00:00', standardHrs: 8.5 },
  { id: 'Shift C', label: 'Shift C (Night)',   defaultStart: '00:00', defaultEnd: '07:00', standardHrs: 7.0 }
];

export const LOSS_DEFINITIONS = [
  { key: 'loss_breakdown', label: 'Breakdown Loss', icon: 'wrench', color: '#EF4444', desc: 'Mechanical/Electrical machine breakdown' },
  { key: 'loss_no_plan', label: 'No Plan', icon: 'calendar-x', color: '#F97316', desc: 'No production scheduled / planned shutdown' },
  { key: 'loss_no_material', label: 'No Material', icon: 'box', color: '#F59E0B', desc: 'Raw material or blank unavailability' },
  { key: 'loss_no_operator', label: 'No Operator', icon: 'user-x', color: '#EAB308', desc: 'Operator absenteeism or shortage' },
  { key: 'loss_startup', label: 'Start Up Loss', icon: 'power', color: '#84CC16', desc: 'Machine warm-up & initial calibration' },
  { key: 'loss_setup', label: 'Setup / Changeover', icon: 'sliders', color: '#06B6D4', desc: 'Part changeover, tooling & fixture change' },
  { key: 'loss_jig_fixture', label: 'Jig & Fixture Issue', icon: 'tool', color: '#3B82F6', desc: 'Clamping trouble, misalignment or wear' },
  { key: 'loss_programming', label: 'Programming Loss', icon: 'code', color: '#6366F1', desc: 'G-code edits, offsets & dry runs' },
  { key: 'loss_measurement', label: 'Measurement & Adjustment', icon: 'compass', color: '#8B5CF6', desc: 'Dimension checks, dial & micrometer checks' },
  { key: 'loss_document', label: 'Document Loss', icon: 'file-text', color: '#A855F7', desc: 'Waiting for drawing, SOP, or route card' },
  { key: 'loss_speed', label: 'Speed Loss', icon: 'gauge', color: '#EC4899', desc: 'Reduced feed/speed due to chatter or tool wear' },
  { key: 'loss_quality_insp', label: 'Quality Inspection', icon: 'check-circle', color: '#14B8A6', desc: 'First-off / line quality inspector approval' },
  { key: 'loss_cleaning', label: 'Cleaning & 5S', icon: 'sparkles', color: '#10B981', desc: 'Chip clearance, coolant tank & 5S routine' }
];

export const DEFAULT_PLANNED_BREAK_MINS = {
  8.5: 45, // 510 - 45 = 465 mins (standard default in user schema)
  7.0: 45  // 420 - 45 = 375 mins
};
