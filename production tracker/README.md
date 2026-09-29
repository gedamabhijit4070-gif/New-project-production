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
- **Shift & Operator Parameters**: Date, Shift (`Shift A` 6 AM – 2:30 PM, `Shift B` 2:30 PM – 11 PM, `Shift C` 11 PM – 6 AM), Shift Hours (12.0 / 8.5 / 8.0 / 7.5 / 7.0 / 6.0 hrs; auto-selected per shift — **A = 8.5, B = 8.5, C = 7.0**), Operator Name.
- **Smart Log Date**: selecting `Shift C` automatically moves the Log Date to the **previous day** (Shift C starts at 11 PM), while `Shift A` / `Shift B` stamp today's date.
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
- **Shift-Wise Analysis (Row 3 of the Control Console)**: `All Shifts` / `Shift A` / `Shift B` / `Shift C` quick-pills filter **the selected machine** (or the combined 11-machine matrix) so OEE, Availability, Performance, Quality, the 15-loss breakdown, the trend charts and the history table can be read shift by shift.
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

**Easiest:** double-click **`start-server.bat`** — it starts the server and opens the app
at `http://127.0.0.1:8123/index.html`.

Or run the Python HTTP server in this directory:
```bash
python -m http.server 3000
```
Then open your browser to:
```
http://localhost:3000
```

> ⚠️ **Always open the app through a URL (`http://…`), never by double-clicking
> `index.html`.** Opening the file directly uses the `file://` protocol, whose
> origin is `"null"`, so the browser blocks `manifest.json` with a CORS error
> (`Access to manifest … has been blocked by CORS policy`) and then fails to
> resolve the manifest `start_url` (`Unsafe attempt to load URL … index.html`).
> These are PWA-install errors, not app errors — but serving over HTTP is the
> correct way to run the tracker, and it keeps the console clean.

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

## ✈️ Telegram Alerts (broadcast to every subscriber)

Every production record saved on the website is pushed to **every user who has pressed `/start` on the bot** — instantly, with no server or proxy required, because the official Telegram Bot HTTP API (`https://api.telegram.org`) allows direct cross-origin browser requests.

1. Open Telegram, search for **@BotFather**, and send `/newbot` to create a bot (or reuse an existing token).
2. **Each person who wants alerts** opens the bot (e.g. **@lemken_tracker_bot**) and presses **/start**. They immediately receive a ✅ confirmation.
3. In the tracker, click the **"Telegram Alerts"** button (dashboard header, or the footer of the *Entered Records* modal).
4. Paste the **Bot Token**, then click **Sync Subscribers** — everyone who pressed `/start` is added to the list. (Auto-sync also runs on page load, every 60 s, and right before each broadcast, so a `/start` pressed while the tracker was closed still catches the next save.)
5. Click **Send Test** to confirm delivery to all of them, then **Save**.

The subscriber list is shown in the modal with each person's name and chat id, and each row can be **Remove**d. A chat id can be pasted manually if auto-discovery can't see it.

**Nobody is ever dropped from the list.** If Telegram refuses a send (HTTP 403, i.e. the person blocked the bot), that chat is only *paused* for 10 minutes and retried automatically, so alerts resume by themselves the moment they unblock — or immediately when they press `/start` again. Paused chats are marked in the modal (`paused — blocked the bot`), and **Send Test** ignores the pause so you can check right away.

Alert format (sent on every save to all subscribers):

```
-- DATE -, SHIFT-, MACHINE NAME-, OPERATOR NAME-, PART NUMBER-, CYCLE TIME-, QUANTITY, LOSSES OCCURED IN MINS-
```

- Sample/seed data (**Seed Sample Shifts**) never triggers alerts — only real form saves do.
- Config lives in `js/telegram.js` + `localStorage`, and can be toggled on/off from the same modal.
- The subscriber list is stored **per browser**. Every device polls the same Telegram `getUpdates` queue (reading it does not consume it), so any PC/phone that has the tracker open discovers the same people — but Telegram only keeps pending updates for ~24 h, so keep at least one tracker open regularly to pick up new `/start` users.
- ⚠️ The bot token is embedded in client-side code, so anyone who can open the page can read it. Keep the app on a private/local network, or regenerate the token with **@BotFather** if it is ever exposed.

---

## 💬 WhatsApp Alerts & Chat Bot

Same template and same behaviour as the Telegram alerts, but on WhatsApp — **and it really chats**: the moment somebody sends **`hi`** to the bot, they are subscribed and every new production entry is pushed to them in real time.

Sending happens straight from your browser through the official **Meta WhatsApp Business Cloud API** (`https://graph.facebook.com`) — verified to answer cross-origin requests, so no server/proxy is needed. **Receiving** is the difference from Telegram: WhatsApp has no `getUpdates`, it only delivers incoming messages to an HTTPS webhook, which is why the webhook lives in your Supabase project as an Edge Function (`supabase/functions/wa-webhook`).

### 1. One-time setup

1. **Supabase table** — open your Supabase Dashboard → **SQL Editor** → paste and run `supabase/whatsapp_subscribers.sql`.
2. **Meta app** — go to [developers.facebook.com](https://developers.facebook.com) → *Create App* → type **Business** → add the **WhatsApp** product. Meta gives you a *test* phone number and a token straight away.
   - Copy the **Phone Number ID** (WhatsApp → API Setup) and a **permanent access token** (WhatsApp → Configuration → System User → *Generate new token*, scope `whatsapp_business_messaging` + `whatsapp_business_manage_metadata`).
3. **Deploy the webhook**

   ```bash
   supabase login
   supabase link --project-ref hqkxzxmpbocsqeurmvjs
   supabase secrets set WA_VERIFY_TOKEN=LEMKEN-WA-VERIFY-2026 WHATSAPP_TOKEN=<your-token> WHATSAPP_PHONE_NUMBER_ID=<phone-number-id>
   supabase functions deploy wa-webhook
   ```

4. **Point Meta at it** — App Dashboard → WhatsApp → Configuration → Webhook →
   **Callback URL**: `https://hqkxzxmpbocsqeurmvjs.supabase.co/functions/v1/wa-webhook`
   **Verify token**: `LEMKEN-WA-VERIFY-2026` → *Verify and save* → subscribe to the **messages** field.
5. In the tracker click **WhatsApp Alerts**, paste the **Access Token** + **Phone Number ID**, then **Verify Connection** → **Save**.

### 2. Using it

- **Each supervisor** saves the bot number in their phone and sends **`hi`**. They instantly get a ✅ welcome and are added to `whatsapp_subscribers` — the number appears in the modal after **Sync Subscribers** (it also auto-refreshes on page load and every 60 s).
- **Chat commands** the bot understands:

  | You send | Bot replies |
  |---|---|
  | `hi`, `hello`, `start` | ✅ welcome + subscribes (starts real-time tracking) |
  | `status`, `latest` | the 5 newest production entries in the alert format |
  | `today` | today's line summary — entries, quantity, good/rejected, avg OEE, losses |
  | `help` | list of commands |
  | `stop` | unsubscribes |

- Every save still broadcasts the standard alert
  `-- DATE -, SHIFT-, MACHINE NAME-, OPERATOR NAME-, PART NUMBER-, CYCLE TIME-, QUANTITY, LOSSES OCCURED IN MINS-`
  to all subscribers. Sample/seed data never triggers alerts.

### 3. The 24-hour rule (WhatsApp-specific — please read)

WhatsApp only allows free-form business messages for **24 h after the customer's own message**. So:

- sending **`hi`** opens the window for a day — the practical routine is one `hi` each morning;
- when a window is closed the send is **skipped, never failed**: the number stays subscribed, is shown in the modal as *(24h window closed — send "hi" to resume)*, and **resumes by itself** the next time they message the bot;
- optional: if Meta approves a utility template for you, type its name in **Approved template** — the bot then uses it for closed windows instead of skipping.

### 4. Optional: push from the cloud (no PC required)

The default mode pushes alerts **from the browser that saved the record**. To deliver them even when the tracker is closed:

1. Supabase Dashboard → **Database Webhooks** → create one on `production_entries` (**INSERT**) → *HTTP request* to
   `https://hqkxzxmpbocsqeurmvjs.supabase.co/functions/v1/wa-webhook?secret=LEMKEN-WA-VERIFY-2026`, method POST.
2. In the **WhatsApp Alerts** modal, untick **Push from this browser** (otherwise subscribers get every entry twice).

### 5. Notes & caveats

- A shared table means **every device sees the same subscriber list** (unlike Telegram's per-browser list).
- Test numbers can only message **5 unique numbers per 24 h** until the WABA is verified — that is a Meta limit, not an app limit.
- ⚠️ The access token sits in client-side code (`js/whatsapp.js` + `localStorage`) exactly like the Telegram token. Fine for a private shopfloor tool; if the app is ever made public, switch off *Push from this browser* and let the webhook do all the sending.
- Files: `js/whatsapp.js` (browser module), `supabase/functions/wa-webhook/index.js` (chat + cloud push), `supabase/whatsapp_subscribers.sql` (table).

---

## 🧹 Clearing Data for Fresh Production Entry

- Click the **"Clear Data"** button in the header at any time.
- This resets all stored production entries, zeros the live dashboard, and clears the production form so you can immediately begin recording fresh machine shifts without old sample data.
