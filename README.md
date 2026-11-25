# KindHRM 2026 · Check-in

Check-in website and confirmation emails for the KindHRM 2026 event (28/11/2026).

- **Website** (GitHub Pages): guests enter their check-in code (their Tally Submission ID), confirm their details, pick a lunch and get a boarding-pass style confirmation. They can change the meal until 11:00 on event day if the meal still has sets left.
- **Google Sheet** "Đăng ký KindHRM 2026" is the database:
  - `Sheet1`: Tally registrations. The script only reads it.
  - `Event`: all text and settings shown on the website and in the email. Edit column C. Live stats are at the bottom.
  - `CheckIn`: check-in time, meal choice, meal changes, email status and "email received" confirmations. The script writes here.
- **Apps Script** (bound to the sheet) does two jobs: it is the website's API, and it adds a **KindHRM** menu that sends the designed confirmation email from the organiser's Gmail.

```
Guest phone ──► GitHub Pages (index.html) ──► Apps Script Web App ──► Google Sheet
Organiser ──► Sheet menu "KindHRM" ──► Gmail (Send mail as: mom's address) ──► Guests
```

## Files

| Path | What it is |
|---|---|
| `index.html`, `assets/style.css`, `assets/app.js` | The website |
| `assets/config.js` | Holds the Apps Script Web App URL. Empty = demo mode |
| `assets/logo.png`, `assets/logo-email.png` | **Placeholder** logos. Replace with the real brand files (keep the file names) |
| `apps-script/Code.gs` | API + email sender, paste into Apps Script |
| `apps-script/Email.html` | Email template, paste into Apps Script as an HTML file named `Email` |
| `apps-script/appsscript.json` | Optional manifest (time zone, scopes) |
| `email/preview.html` | The email rendered with a fictional guest, to check the design in a browser |
| `tools/gas-test.js` | Local test suite for the script: `node tools/gas-test.js <registrations.csv>` |

## Setup (about 15 minutes)

### 1. Add the script to the sheet
1. Open the sheet → **Extensions → Apps Script**.
2. Replace the content of `Code.gs` with `apps-script/Code.gs`.
3. **+ → HTML**, name it `Email` (exactly), paste `apps-script/Email.html`.
4. Save. Reload the sheet. A **KindHRM** menu appears. Click any item once and approve the permissions. Google shows an "unverified app" screen for personal scripts: **Advanced → Go to project (unsafe)** is expected here, because it is your own script.

### 2. Deploy the API
1. Apps Script → **Deploy → New deployment → Web app**.
2. *Execute as*: **Me**. *Who has access*: **Anyone**.
3. Copy the URL ending in `/exec` and paste it into `assets/config.js` (`API_URL: '...'`). You can edit the file directly on GitHub. The site leaves demo mode as soon as this is set.
4. Later code changes: **Deploy → Manage deployments → ✏️ → Version: New version → Deploy**. The URL stays the same.

### 3. Send from mom's Gmail ("Send mail as")
The script runs on your account and sends *as* her address. You keep control, and she only has to verify once.

1. In **your** Gmail on a computer: ⚙ → **See all settings → Accounts and Import → Send mail as → Add another email address**.
2. Name: `KindHRM - Nghề nhân sự tử tế`. Email: her Gmail address. Keep **Treat as an alias** ticked → **Next step**.
3. Gmail sends a confirmation email to **her** inbox. She clicks the link, or reads you the code to type in. Done.
   - If Gmail instead asks for an SMTP server: `smtp.gmail.com`, port `587`, username = her Gmail, password = an **App Password** created in her Google Account (needs 2-Step Verification). If that is a hassle, use the fallback below.
4. Put her address in **Event → `email_from`**. Replies go to her too, unless you set `email_reply_to`.
5. **KindHRM → Kiểm tra cấu hình gửi email** should say "Sẵn sàng gửi".

**Fallback (option A):** she opens the sheet on her own account and does step 1–2 above herself, leaving `email_from` empty. Emails then come from her account directly.

**Daily limit:** personal Gmail allows about **100 recipients per day** from Apps Script, counted on the account that runs the script. `email_batch_limit` is 90, so ~177 guests need two days: send one batch today and the rest tomorrow. The menu always shows how many are left and how much quota remains.

### 4. Before sending
1. Tick **Qualify check** (column D of Sheet1) for every confirmed guest. Only qualified guests can check in or receive the email.
2. Fill in the `[Cập nhật ...]` cells in the **Event** tab (theme, time, venue, map link, hotline, speakers, agenda). Placeholders in brackets are hidden from guests until filled.
3. **KindHRM → Xem trước email** shows the email with a real guest's data. **Gửi email thử cho tôi** sends one to you.
4. Test the website with the test code `0VqYzM9` (the "Testing Test" row). It can check in any time and does not need Qualify. Clear its row in `CheckIn` afterwards.

### 5. Send
**KindHRM → Gửi email xác nhận (đợt tiếp theo)**. It skips anyone already marked "Đã gửi". **Gửi lại email theo mã…** resends to specific Submission IDs (comma separated).

## Event day
- Check-in opens `checkin_open` (06:00 28/11) and closes `checkin_close` (18:00). Before opening, guests can still enter their code to see their details, but cannot check in.
- Meals: Cơm Gà rán 100, Burger Tôm 50, plus "Tôi không dùng bữa trưa" (unlimited). A sold-out meal greys out. Changing frees the old set immediately. Changes stop at `meal_change_deadline` (11:00). A guest checking in after 11:00 can still pick a meal that has sets left.
- Live numbers: bottom of the **Event** tab (checked in, sets left per meal, emails sent, emails confirmed).
- Concurrency is handled with a script lock, so two people cannot take the last set at the same time.

## "Email received" confirmation
Personal Gmail has no read receipts (and tracking pixels are unreliable). Instead, the email has a **"Tôi đã nhận được email"** button. It opens the website, which records the time in `CheckIn → Đã xác nhận nhận email lúc`.

## Email copy button
Email apps block scripts, so a real copy button cannot work inside an email. The email shows the code in a large box (long-press to copy; Apple Mail selects it with one tap). The **"Mở trang check-in"** button opens the website with the code already filled in, and the website has a working copy button on the pass.

## Privacy
The website only shows name, company, title, a masked phone (`0939•••886`) and a masked email (`nh•••@gmail.com`). Full contact details never leave the sheet. No registrant data is stored in this repository.
