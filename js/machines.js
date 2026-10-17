/**
 * Machine Roster & Configuration
 * Exactly 11 Shopfloor CNC, VMC, and HMC Machines
 */

export const MACHINES = [
  { id: 'm1',  code: 'CNC-DX200-1', name: 'CNC DX 200-1', category: 'CNC' },
  { id: 'm2',  code: 'CNC-200-2',   name: 'CNC 200-2',   category: 'CNC' },
  { id: 'm3',  code: 'CNC-DX250',   name: 'CNC DX 250',   category: 'CNC' },
  { id: 'm4',  code: 'CNC-DX12B',   name: 'CNC DX12B',   category: 'CNC' },
  { id: 'm5',  code: 'VMC-1050',    name: 'VMC 1050',    category: 'VMC' },
  { id: 'm6',  code: 'VMC-1880',    name: 'VMC 1880',    category: 'VMC' },
  { id: 'm7',  code: 'VMC-850',     name: 'VMC 850',     category: 'VMC' },
  { id: 'm8',  code: 'VMC-HAAS',    name: 'VMC HAAS',    category: 'VMC' },
  { id: 'm9',  code: 'VMC-PX20',    name: 'VMC PX 20',    category: 'VMC' },
  { id: 'm10', code: 'HMC-1',       name: 'HMC 1',       category: 'HMC' },
  { id: 'm11', code: 'HMC-2',       name: 'HMC 2',       category: 'HMC' }
];

export const LOSS_FIELDS = [
  { key: 'loss_breakdown',      label: 'Breakdown Loss',           category: 'Equipment' },
  { key: 'loss_no_plan',        label: 'No Plan',                  category: 'Management' },
  { key: 'loss_no_material',    label: 'No Material',              category: 'Logistics' },
  { key: 'loss_no_operator',    label: 'No Operator',              category: 'Manpower' },
  { key: 'loss_startup',        label: 'Start Up',                 category: 'Process' },
  { key: 'loss_setup',          label: 'Setup',                    category: 'Process' },
  { key: 'loss_tool_insert',    label: 'Tool & Insert Loss',       category: 'Tooling' },
  { key: 'loss_jig_fixture',    label: 'Jig & Fixture Issue',      category: 'Tooling' },
  { key: 'loss_programming',    label: 'Programming Loss',         category: 'Process' },
  { key: 'loss_measurement',    label: 'Measurement & Adjustment', category: 'Quality' },
  { key: 'loss_document',       label: 'Document Loss',            category: 'Management' },
  { key: 'loss_speed',          label: 'Speed Loss',               category: 'Performance' },
  { key: 'loss_quality_insp',   label: 'Quality Inspection',       category: 'Quality' },
  { key: 'loss_cleaning',       label: 'Cleaning',                 category: 'Maintenance' },
  { key: 'loss_other',          label: 'Other Losses',             category: 'Other' }
];

