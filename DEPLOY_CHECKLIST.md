# Deploy Checklist — KE Business Suite v5

Code is verified deployment-ready: build passes, all 61 tests pass, the
edit-save persistence bug is fixed. What's left is filling in *your*
credentials — nothing here needs further coding.

A shared API secret has already been generated and pre-filled into
`apps-script-backend.js` (`CONFIG.API_KEY`) and `.env.example`
(`VITE_API_KEY`) so the two sides match without you doing anything.
Generate your own instead if you'd rather not reuse the one that shipped
in this zip — just make sure both files end up with the *same* value.

## 1. Google Sheet
- [ ] Create a new Google Sheet at sheets.google.com, name it "KE Business Suite"
- [ ] Copy the Sheet ID from the URL (between `/d/` and `/edit`)

## 2. Apps Script backend
- [ ] Open the Sheet → Extensions → Apps Script → delete the default code
- [ ] Paste the full contents of `apps-script-backend.js`
- [ ] In `CONFIG`, set:
  - [ ] `SHEET_ID` → the ID from step 1
  - [ ] `ALERT_EMAIL` → your Gmail address
  - [ ] `COMPANY_GSTIN`, `COMPANY_PAN`, `COMPANY_PHONE` → your real values
  - [ ] `APP_URL` → leave for now, come back after step 5
  - [ ] `API_KEY` → already filled in — leave as is, or swap for your own

## 3. Initialize sheets
- [ ] Apps Script → Run → select `initAllSheets` → Authorize → Run
- [ ] **Write down the 3 role passcodes shown in the one-time dialog** (Admin/Staff/CA) — they're not shown again

## 4. Deploy the Apps Script as a Web App
- [ ] Deploy → New Deployment → type **Web App**
- [ ] Execute as: **Me**, Access: **Anyone**
- [ ] Deploy → copy the Web App URL (ends in `/exec`)

## 5. Connect frontend to backend
- [ ] Copy `.env.example` to `.env`
- [ ] Set `VITE_API_URL` to the URL from step 4
- [ ] Confirm `VITE_API_KEY` matches `CONFIG.API_KEY` in the backend exactly

## 6. Set up daily/monthly alert triggers
- [ ] Apps Script → Triggers (clock icon) → Add Trigger
  - [ ] `dailyAlerts` → time-driven → day timer → 8–9 AM
  - [ ] `monthlyReport` → time-driven → month timer → 1st of month, 9 AM

## 7. Deploy frontend to Vercel
- [ ] Push this project to a GitHub repo
- [ ] Import the repo at vercel.com → it auto-detects Vite
- [ ] In Vercel project settings → Environment Variables, add `VITE_API_URL` and `VITE_API_KEY` (same values as your `.env`)
- [ ] Deploy → copy your live `.vercel.app` URL

## 8. Close the loop
- [ ] Back in `apps-script-backend.js`, set `APP_URL` to your real Vercel URL and redeploy the Apps Script (Deploy → Manage Deployments → Edit → New Version)
- [ ] Open the live site, log in with each of the 3 passcodes, and confirm you can create + edit a record in at least one module (e.g. Jobs) — this exercises the save path end to end
- [ ] Add to Home Screen on your phone (Android: Chrome ⋮ menu; iPhone: Safari Share sheet) to install as a PWA

## Notes
- `VITE_API_KEY` is a deterrent against casual scraping, not real auth — actual access control is the per-request passcode check in `resolveRole()` server-side. Don't reuse Admin/Staff/CA passcodes as the API key.
- If you ever see "Setup incomplete" errors after deploying, it means a placeholder (`SHEET_ID` or `API_KEY`) is still literally in the code — go back and fill it in.
