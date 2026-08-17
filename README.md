# Keshav Enterprises — Business Suite v5

**Zero-cost, full-stack business management app for Keshav Enterprises, Shamli UP**
Steam Turbine Services · B2B Industrial Engineering

---

## What's in v5

### 21 Modules
| Module | Purpose |
|---|---|
| 🏠 Dashboard | Live KPIs, alerts, pipeline, AR aging, seasonal planner |
| ⚙️ Jobs | Work order register with full technical details |
| 📄 Sales Invoices | Full invoice with GST, TDS, bank details, live calc |
| 🛒 Purchase Invoices | Vendor bills, ITC tracking, TDS deduction |
| 📋 Quotations | Quote tracker with follow-up and WA integration |
| 👥 Clients | Full CRM with turbine count, seasonal, WA, follow-up |
| 🏭 Vendors | Supplier register with bank, MSE, product list |
| 📦 Inventory | Stock register with reorder alerts, HSN, pricing |
| 💸 Expenses | Expense tracker with job-linking and GST |
| 💵 Petty Cash | Imprest ledger with category/month summary |
| 📒 Ledger | Accounts ledger with running balance |
| 📅 AR Aging | Receivables with WA/call shortcuts |
| 📈 P&L Summary | Auto P&L from invoices, expenses, purchases, petty cash |
| 🧾 GST Summary | Output vs Input ITC — GSTR-3B reference |
| 🏛️ TDS Register | TDS deducted + received, 26AS guide |
| 🏗️ Fixed Assets | Asset register with SLM depreciation schedule |
| 🏦 FD Tracker | Fixed deposit maturity + DICGC tracking |
| 🗄️ Document Vault | Google Drive link vault with expiry alerts |
| 👷 Attendance | Labour register with job-linked wage calculation |
| 🚗 Vehicle Log | Trip log with fuel efficiency and cost/km |
| ⚙️ Settings | Company info, alerts, passcodes, WA templates |

### 3 Roles
- **Admin (ADMIN2024)** — All 21 modules
- **Staff (STAFF001)** — Operations: Jobs, Invoices, Clients, Inventory, Expenses, Petty Cash
- **CA (CA1234)** — Finance: Purchase Invoices, Ledger, P&L, GST, TDS, Assets

### Financial Year System
- Auto-detects current FY (April 1 = new FY)
- FY dropdown in topbar — switch between any year
- All modules filter data by selected FY
- Historical data preserved — never deleted

---

## Tech Stack — Monthly Cost: ₹0

| Layer | Technology | Cost |
|---|---|---|
| Frontend | React 18 + Vite | Free |
| Hosting | Vercel | Free forever |
| Database | Google Sheets | Free (15 GB) |
| API | Google Apps Script | Free |
| Email Alerts | Gmail via GmailApp | Free (100/day) |
| WhatsApp | wa.me click-to-chat | Free, no API |
| PWA | Service Worker | Free |

---

## Setup — 8 Steps to Go Live

### Step 1: Create Google Sheet
- sheets.google.com → New → Name it "KE Business Suite"
- Copy the Sheet ID from the URL (the long string between `/d/` and `/edit`)

### Step 2: Setup Apps Script
- In your Sheet → **Extensions → Apps Script**
- Delete existing code
- Paste the full `apps-script-backend.js` file
- Replace `YOUR_GOOGLE_SHEET_ID_HERE` with your actual Sheet ID
- Replace `your@gmail.com` with your email

### Step 3: Initialize All Sheets (run once)
- Apps Script → Run → Select `initAllSheets` → Authorize → Run
- This creates all 17 tabs with correct headers, colors, filters

### Step 4: Deploy as Web App
- Apps Script → **Deploy → New Deployment**
- Type: **Web App**
- Execute as: **Me**
- Access: **Anyone**
- Click Deploy → Copy the Web App URL

### Step 5: Connect Frontend
- Open `src/shared/utils.js`
- Replace `YOUR_APPS_SCRIPT_WEB_APP_URL` with your Web App URL
- OR set env variable: `VITE_API_URL=https://script.google.com/...`

### Step 6: Set Alert Triggers (free daily email)
- Apps Script → Triggers (clock icon) → Add Trigger
- Function: `dailyAlerts` → Time-driven → Day timer → **8:00-9:00 AM**
- Add another: `monthlyReport` → Month timer → **1st of month → 9:00 AM**

### Step 7: Deploy to Vercel
```bash
npm install
npm run build
# Push to GitHub → connect at vercel.com → auto-deploy
```

### Step 8: Install as Mobile App
- Android: Chrome → open URL → ⋮ → **Add to Home Screen**
- iPhone: Safari → Share → **Add to Home Screen**

---

## Google Sheets Schema

All 17 sheets initialized automatically by `initAllSheets()`:

```
Jobs              — 32 columns
Sales Invoices    — 37 columns
Purchase Invoices — 31 columns
Quotations        — 21 columns
Clients           — 34 columns
Vendors           — 28 columns
Inventory         — 25 columns
Expenses          — 18 columns
Petty Cash        — 16 columns
Ledger            — 17 columns
TDS               — 18 columns
Fixed Assets      — 23 columns
FD Tracker        — 20 columns
Document Vault    — 14 columns
Attendance        — 16 columns
Vehicles          — 17 columns
Config            — 4 columns
```

Every sheet has:
- First 4 columns: ID, FY, Created At, Created By (auto-filled)
- FY column enables multi-year data in same sheet
- Header row: navy background, white bold text, frozen
- Auto-filter on all columns
- Alternating row colors applied on write

---

## WhatsApp Integration

No API cost. Uses `wa.me` links. Pre-built templates:
- Payment Reminder (AR Aging module)
- Job Status Update (Jobs module)
- Quotation Follow-up (Quotations module)
- Festival Greeting (Settings → Templates)
- Daily Site Report
- Quotation Submitted

---

## Daily Alert Email (Free)

Runs at 8 AM every day via Apps Script trigger. Covers:
- Matured / maturing FDs
- Overdue AR (> 60 days)
- Low stock items
- Expiring documents
- Pending petty cash top-up
- Open quotation follow-ups

---

## Passcodes

`initAllSheets()` generates a random 8-character passcode per role the first
time it seeds the Config sheet, and shows them **once** in a dialog — write
them down (a password manager, not a sticky note). There is no fixed default
anymore; if you're on an older deployment still using `ADMIN2024` / `STAFF001`
/ `CA1234`, change them immediately in **Settings → Passcodes**.

| Role | Access |
|---|---|
| Admin | All 21 modules |
| Staff | Operations (9 modules) |
| CA | Finance read-only (8 modules) |

The backend also throttles failed passcode attempts (global counter, since
Apps Script web apps don't expose caller IPs to server code): after 15 wrong
passcodes in a 5-minute window, further attempts are locked out for 5 minutes.

### `API_KEY` is a deterrent, not a secret

`VITE_API_KEY` ships baked into the client JS bundle, like any static SPA's
"secret" — anyone with view-source access can read it. It stops casual or
automated scraping of the bare Web App URL, but it is **not** real
authentication against a determined actor. The actual access control is the
per-request passcode → role resolution done server-side in `resolveRole()`,
which is what actually gates who can read or write which sheets.

---

## Company Info

**Keshav Enterprises** · Shamli, Uttar Pradesh
- Steam turbine services: overhaul, E&C, balancing, lube oil flushing, alignment
- OEM: Triveni, BHEL, Siemens, KKK, ABB
- MSME + GST + IEC registered
- Clients: Sugar mills, paper mills, power plants, petrochemical
