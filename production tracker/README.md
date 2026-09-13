# Industrial Shopfloor Production & OEE Loss Tracker

A web application designed for precision machine shops and CNC/VMC/HMC production lines. It tracks shift output, multi-part cycle times, operator performance, and 13 specific downtime losses across 11 shopfloor machines, featuring an automated OEE & Loss Occurrence Dashboard.

---

## 🏭 11 Shopfloor Machines
1. **CNC DX 200-1** (CNC Turning Center)
2. **CNC 200-2** (CNC Turning Center)
3. **CNC DX 250** (CNC Heavy Lathe)
4. **CNC DX12B** (Precision Lathe)
5. **VMC 1050** (Vertical Machining Center)
6. **VMC 1880** (Heavy Bed Milling Center)
7. **VMC 850** (Vertical Machining Center)
8. **VMC HAAS** (HAAS High Precision Vertical Center)
9. **VMC PX 20** (Compact Milling Center)
10. **HMC 1** (Horizontal Machining Center)
11. **HMC 2** (Horizontal Machining Center)

---

## 🧭 3-Page Workflow

### Page 1: Minimalist Machine Launchpad
- Clean, uncluttered view displaying **only the 11 machine names**.
- Hover lift and glowing accent micro-animations.
- Clicking any machine immediately opens **Page 2** pre-configured for that machine.

### Page 2: Dedicated Machine Production & 15-Loss Fill-up Tab
- **Shift & Operator Parameters**: Date, Shift (`Shift A`, `Shift B`, `Shift C`), Shift Hours (`8.5 hrs / 465 net planned mins` or `7.0 hrs / 390 mins`), Operator Name.
- **Multi-Part Production Details**:
  - **Part Number 1**: Name/Number, Cycle Time (mins), Quantity Produced
  - **Part Number 2**: Name/Number, Cycle Time (mins), Quantity Produced
  - **Part Number 3**: Name/Number, Cycle Time (mins), Quantity Produced
  - Total Scrap / Rejected Quantity
- **Downtime Loss Dropdown Quick-Selector**:
  - Grouped dropdown menu to quickly select any downtime loss category and apply stoppage minutes (`+5m`, `+15m`, `+30m`, `+60m`).
- **15 Standard Loss Categories (in Minutes)**:
  1. `Breakdown Loss` (Equipment)
  2. `No Plan` (Management)
  3. `No Material` (Logistics)
  4. `No Operator` (Manpower)
  5. `Start Up` (Process)
  6. `Setup` (Process)
  7. `Tool & Insert Loss` (Tooling) *(Added)*
  8. `Jig & Fixture Issue` (Tooling)
  9. `Programming Loss` (Process)
  10. `Measurement & Adjustment` (Quality)
  11. `Document Loss` (Management)
  12. `Speed Loss` (Performance)
  13. `Quality Inspection` (Quality)
  14. `Cleaning` (Maintenance)
  15. `Other Losses` (Other / Miscellaneous) *(Added)*
  - **Remarks / Root Cause** ("Why did loss occur") textarea.
- **Live Auto-Calculated Ribbon**: Live calculation of Planned Time, Total Losses, Net Operating Time, Availability (A), Performance (P), Quality (Q), and Overall OEE (%).
- "Save Record & View Dashboard" button saves the entry and transitions directly to Page 3.

### Page 3: Executive OEE & Loss Occurrence Dashboard
- Automated visual analytics powered by **Chart.js**:
  - **Mathematical OEE Standard**:
    $$\text{Availability (A)} = \frac{\text{Operating Time}}{\text{Planned Shift Time}} \times 100$$
    $$\text{Performance (P)} = \frac{\sum (\text{Cycle Time}_i \times \text{Quantity}_i)}{\text{Operating Time}} \times 100$$
    $$\text{Quality (Q)} = \frac{\text{Good Parts}}{\text{Total Parts Produced}} \times 100$$
    $$\text{OEE (\%)} = \frac{A \times P \times Q}{10000}$$
- **4 KPI Metric Cards**: Overall Line OEE, Availability (A), Performance (P), Quality (Q).
- **Downtime Loss Filter Dropdown**: Allows filtering and isolating any of the 15 losses.
- **Pareto Bar Chart**: Duration ranking across all 15 loss categories.
- **Loss Classification Donut Chart**: Breakdown of downtime into functional areas (Equipment, Tooling & Fixtures, Process/Setup, Logistics, Quality, Maintenance & Speed, Other Losses).

- **Line Performance Comparison Bar Chart**: OEE % across all 11 machines.
- **"Why Does Loss Occur?" Root-Cause Log Table**: Qualitative audit of operator remarks and causes by machine and shift.

---

## ⚡ How to Run Locally

Run the Python HTTP server in this directory:
```bash
python -m http.server 3000
```
Then open your browser to:
```
http://localhost:3000
```

---

## 🗄️ Supabase Cloud Database Integration

1. Log into your [Supabase Dashboard](https://supabase.com).
2. Open the **SQL Editor** tab.
3. Paste the contents of `supabase/schema.sql` and click **Run**.
4. Link your Supabase database in either of two ways:
   - **Method A (Config File)**: Open `js/config.js` and set:
     ```javascript
     export const SUPABASE_CONFIG = {
       url: 'https://your-project.supabase.co',
       anonKey: 'your-public-anon-key'
     };
     ```
   - **Method B (In-App Modal)**: Click the **"Supabase: Offline"** button in the header, paste your URL and Public Anon Key, and click **Save & Connect**.
5. Once connected, the header will display **"🟢 Supabase: Connected"**, and every new production entry is stored live in your Supabase PostgreSQL cloud database!

---

## 🧹 Clearing Data for Fresh Production Entry

- Click the **"Clear Data"** button in the header at any time.
- This resets all stored production entries, zeros the live dashboard, and clears the production form so you can immediately begin recording fresh machine shifts without old sample data.
