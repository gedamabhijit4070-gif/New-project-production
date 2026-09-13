-- ==============================================================================
-- INDUSTRIAL PRODUCTION & OEE LOSS TRACKER - SUPABASE DATABASE SCHEMA
-- ==============================================================================
-- Paste this script into your Supabase project's SQL Editor and click "Run".
-- ==============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Create Machines Table (11 Machines)
CREATE TABLE IF NOT EXISTS public.machines (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    category VARCHAR(20) NOT NULL CHECK (category IN ('CNC', 'VMC', 'HMC')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Create Production & Loss Entries Table
CREATE TABLE IF NOT EXISTS public.production_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    machine_code VARCHAR(50) NOT NULL,
    machine_name VARCHAR(100) NOT NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift VARCHAR(10) NOT NULL CHECK (shift IN ('Shift A', 'Shift B', 'Shift C')),
    shift_hours NUMERIC(4, 2) NOT NULL DEFAULT 8.5,
    operator_name VARCHAR(100) NOT NULL,
    
    -- Multi-Part Production Details
    part1_name VARCHAR(100),
    part1_cycle_time NUMERIC(6, 2) DEFAULT 0,
    part1_qty INTEGER DEFAULT 0,
    
    part2_name VARCHAR(100),
    part2_cycle_time NUMERIC(6, 2) DEFAULT 0,
    part2_qty INTEGER DEFAULT 0,
    
    part3_name VARCHAR(100),
    part3_cycle_time NUMERIC(6, 2) DEFAULT 0,
    part3_qty INTEGER DEFAULT 0,
    
    total_qty INTEGER DEFAULT 0,
    rejected_qty INTEGER DEFAULT 0,
    good_qty INTEGER DEFAULT 0,
    
    -- 15 Losses in Minutes
    loss_breakdown INTEGER DEFAULT 0,
    loss_no_plan INTEGER DEFAULT 0,
    loss_no_material INTEGER DEFAULT 0,
    loss_no_operator INTEGER DEFAULT 0,
    loss_startup INTEGER DEFAULT 0,
    loss_setup INTEGER DEFAULT 0,
    loss_tool_insert INTEGER DEFAULT 0,
    loss_jig_fixture INTEGER DEFAULT 0,
    loss_programming INTEGER DEFAULT 0,
    loss_measurement INTEGER DEFAULT 0,
    loss_document INTEGER DEFAULT 0,
    loss_speed INTEGER DEFAULT 0,
    loss_quality_insp INTEGER DEFAULT 0,
    loss_cleaning INTEGER DEFAULT 0,
    loss_other INTEGER DEFAULT 0,
    
    remarks TEXT,
    
    -- OEE & Time Calculations
    total_losses_mins INTEGER DEFAULT 0,
    planned_time_mins INTEGER DEFAULT 465,
    operating_time_mins INTEGER DEFAULT 465,
    ideal_run_time_mins NUMERIC(8, 2) DEFAULT 0,
    availability_rate NUMERIC(5, 2) DEFAULT 0,
    performance_rate NUMERIC(5, 2) DEFAULT 0,
    quality_rate NUMERIC(5, 2) DEFAULT 0,
    oee_rate NUMERIC(5, 2) DEFAULT 0,
    productivity_rate NUMERIC(8, 2) DEFAULT 0,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Indices
CREATE INDEX IF NOT EXISTS idx_prod_entries_machine ON public.production_entries(machine_code);
CREATE INDEX IF NOT EXISTS idx_prod_entries_date ON public.production_entries(log_date);

-- 4. Seed the 11 Machines
INSERT INTO public.machines (code, name, category)
VALUES
    ('CNC-DX200-1', 'CNC DX 200-1', 'CNC'),
    ('CNC-200-2',   'CNC 200-2',   'CNC'),
    ('CNC-DX250',   'CNC DX 250',   'CNC'),
    ('CNC-DX12B',   'CNC DX12B',   'CNC'),
    ('VMC-1050',    'VMC 1050',    'VMC'),
    ('VMC-1880',    'VMC 1880',    'VMC'),
    ('VMC-850',     'VMC 850',     'VMC'),
    ('VMC-HAAS',    'VMC HAAS',    'VMC'),
    ('VMC-PX20',    'VMC PX 20',    'VMC'),
    ('HMC-1',       'HMC 1',       'HMC'),
    ('HMC-2',       'HMC 2',       'HMC')
ON CONFLICT (code) DO UPDATE 
SET name = EXCLUDED.name, category = EXCLUDED.category;

-- 5. Enable Row Level Security (RLS)
ALTER TABLE public.machines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_entries ENABLE ROW LEVEL SECURITY;

-- 6. Permissive Policies for Web App
DROP POLICY IF EXISTS "Allow anon read machines" ON public.machines;
CREATE POLICY "Allow anon read machines" ON public.machines FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow anon all production_entries" ON public.production_entries;
CREATE POLICY "Allow anon all production_entries" ON public.production_entries FOR ALL USING (true) WITH CHECK (true);

-- 7. Migration: Run these if upgrading an existing production_entries table
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS loss_tool_insert INTEGER DEFAULT 0;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS loss_other INTEGER DEFAULT 0;
ALTER TABLE public.production_entries ADD COLUMN IF NOT EXISTS productivity_rate NUMERIC(8, 2) DEFAULT 0;


