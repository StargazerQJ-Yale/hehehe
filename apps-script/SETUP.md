# Setup (one-time, ~5 minutes)

1. Go to [sheets.google.com](https://sheets.google.com) and create a new blank spreadsheet. Name it something like "Debate Club Fund".

2. In the Sheet, go to **Extensions > Apps Script**. This opens a code editor tied to your sheet.

3. Delete the default `Code.gs` contents. Copy in the contents of `Code.gs` from this folder.

4. In the Apps Script editor, add four more files matching the ones in this folder:
   - Click the **+** next to "Files" > **Script** > name it `nothing` — actually for HTML files use **+** > **HTML**, and name them exactly:
     - `Index` (paste contents of `Index.html`)
     - `Admin` (paste contents of `Admin.html`)
     - `Stylesheet` (paste contents of `Stylesheet.html`)

   (Apps Script adds the `.html` extension automatically — just use the base name when naming the file.)

5. Set your admin password. At the bottom of `Code.gs`, temporarily add:
   ```
   function setPassword_ONCE() {
     setAdminPassword('choose-a-password-here');
   }
   ```
   Select `setPassword_ONCE` in the function dropdown at the top of the editor, click **Run**, and approve the permissions prompt (click through "Advanced > Go to project (unsafe)" — this is normal and expected for your own scripts). After it runs once successfully, delete the `setPassword_ONCE` function — the password is now saved server-side.

6. Click **Deploy > New deployment**. Click the gear icon next to "Select type" and choose **Web app**.
   - Description: anything
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Click **Deploy**, then **Authorize access** and approve (same "unsafe" click-through as above — expected for personal scripts).

7. Copy the **Web app URL** you're given. That's your public donate page.
   - Public page: the URL as-is
   - Admin page: same URL + `?page=admin`

8. Open the admin page, log in with the password you set, and go to **Settings** to fill in your real Venmo/Zelle info and club name (these start as placeholders).

## Notes

- All data lives in the Sheet itself (tabs "Entries" and "Config") — you can always open the spreadsheet directly to double check or export a copy.
- If you ever change the Apps Script code later, you need to **Deploy > Manage deployments > Edit (pencil) > New version** for changes to go live — saving alone isn't enough.
- The admin password is stored server-side (Script Properties), not in the sheet, so it's not visible to anyone who just views the spreadsheet.
- Bookmark or share the `?page=admin` link only with people who should log entries; the base URL is safe to share publicly (e.g. in a QR code at your bar).
