# Fund tracker — setup

This runs locally on your computer (Node.js, which is already installed). No cloud accounts, no deployment. Data is stored in plain CSV files in the `data/` folder, so you can open/edit them directly in Excel or Google Sheets if you ever need to.

## Run it

Double-click **start.bat**. A console window opens and prints two URLs, e.g.:

```
On this computer:  http://localhost:4247/
On your wifi:       http://192.168.1.42:4247/
Admin login:       add /admin to either URL above
```

- The **localhost** link only works on this computer.
- The **wifi** link works from any phone/laptop connected to the same wifi network as this computer — that's the one to put in a QR code at the bar so people can see how to donate. Keep the server running (leave the console window open) while your event is happening.
- Add `/admin` to either URL to log donations and expenses (e.g. `http://192.168.1.42:3000/admin`).

Closing the console window stops the server.

## First-time setup

1. Run `start.bat` once.
2. Open `data/secrets.json` in Notepad and change `"changeme"` to your own admin password. Save the file. (Restart the server after editing — stop it with Ctrl+C in the console, then double-click start.bat again.)
3. Go to `/admin`, log in, open **Settings**, and fill in your real Venmo, Zelle, and club name (they start as placeholders).

## Where your data lives

- `data/entries.csv` — every donation and expense, one row each
- `data/config.csv` — club name, Venmo, Zelle, message shown on the public page
- `data/secrets.json` — admin password (never sent to visitors' browsers, only checked on the server)

Back up the `data/` folder occasionally (copy it somewhere) since it's the only copy of your ledger.

## Notes

- This is meant to run during your event on a laptop connected to the venue wifi. If you want it reachable from outside that wifi (e.g. a permanent public link), that's a different setup (real hosting) — ask if you want that later.
- There's also an `apps-script/` folder from an earlier Google Sheets–based version of this — it's no longer needed now that this local version exists. Safe to ignore or delete.
