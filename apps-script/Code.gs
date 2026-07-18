const ENTRIES_SHEET_NAME = 'Entries';
const CONFIG_SHEET_NAME = 'Config';

function doGet(e) {
  const page = (e.parameter.page === 'admin') ? 'Admin' : 'Index';
  const template = HtmlService.createTemplateFromFile(page);
  return template.evaluate()
    .setTitle(page === 'Admin' ? 'Fund Admin' : 'Support Our Club')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getEntriesSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(ENTRIES_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ENTRIES_SHEET_NAME);
    sheet.appendRow(['ID', 'Timestamp', 'Type', 'Name', 'Amount', 'Description', 'Status', 'Notes']);
  }
  return sheet;
}

function getConfigSheet_() {
  const ss = getSpreadsheet_();
  let sheet = ss.getSheetByName(CONFIG_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CONFIG_SHEET_NAME);
    sheet.appendRow(['Key', 'Value']);
    sheet.appendRow(['ClubName', 'Our Debate Club']);
    sheet.appendRow(['Venmo', '@your-venmo']);
    sheet.appendRow(['Zelle', 'treasurer@example.com']);
    sheet.appendRow(['Message', 'Thank you for supporting our debate club! Every donation helps cover tournament fees, travel, and materials.']);
    sheet.appendRow(['ShowTotal', 'true']);
  }
  return sheet;
}

// Run once from the Apps Script editor (select this function, click Run) to set the admin password.
function setAdminPassword(password) {
  PropertiesService.getScriptProperties().setProperty('ADMIN_PASSWORD', password);
}

function checkPassword_(password) {
  const stored = PropertiesService.getScriptProperties().getProperty('ADMIN_PASSWORD');
  if (!stored) throw new Error('Admin password not set yet. Open Extensions > Apps Script, select setAdminPassword in the function dropdown, and run it once.');
  return password === stored;
}

function requirePassword_(password) {
  if (!checkPassword_(password)) throw new Error('Incorrect password.');
}

function computeTotals_() {
  const sheet = getEntriesSheet_();
  const values = sheet.getDataRange().getValues();
  let totalDonations = 0, totalReimbursed = 0, totalPending = 0;
  for (let i = 1; i < values.length; i++) {
    const type = values[i][2];
    const amount = Number(values[i][4]) || 0;
    const status = values[i][6];
    if (type === 'Donation') {
      totalDonations += amount;
    } else if (type === 'Expense') {
      if (status === 'Reimbursed') totalReimbursed += amount;
      else totalPending += amount;
    }
  }
  return {
    totalDonations: totalDonations,
    totalReimbursed: totalReimbursed,
    totalPending: totalPending,
    balance: totalDonations - totalReimbursed
  };
}

function getPublicConfig() {
  const sheet = getConfigSheet_();
  const values = sheet.getDataRange().getValues();
  const config = {};
  for (let i = 1; i < values.length; i++) {
    config[values[i][0]] = values[i][1];
  }
  config.totalRaised = computeTotals_().totalDonations;
  return config;
}

function adminGetData(password) {
  requirePassword_(password);
  const sheet = getEntriesSheet_();
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const entries = values.slice(1).map(function (row) {
    const obj = {};
    headers.forEach(function (h, i) { obj[h] = row[i]; });
    return obj;
  }).reverse();
  return {
    entries: entries,
    totals: computeTotals_(),
    config: getPublicConfig()
  };
}

function adminAddEntry(password, entry) {
  requirePassword_(password);
  if (!entry.name || !entry.amount || Number(entry.amount) <= 0) {
    throw new Error('Name and a positive amount are required.');
  }
  const sheet = getEntriesSheet_();
  const id = Utilities.getUuid();
  const status = entry.type === 'Expense' ? 'Pending' : 'N/A';
  sheet.appendRow([
    id,
    new Date(),
    entry.type,
    entry.name,
    Number(entry.amount),
    entry.description || '',
    status,
    entry.notes || ''
  ]);
  return adminGetData(password);
}

function adminMarkReimbursed(password, id) {
  requirePassword_(password);
  const sheet = getEntriesSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.getRange(i + 1, 7).setValue('Reimbursed');
      break;
    }
  }
  return adminGetData(password);
}

function adminDeleteEntry(password, id) {
  requirePassword_(password);
  const sheet = getEntriesSheet_();
  const values = sheet.getDataRange().getValues();
  for (let i = 1; i < values.length; i++) {
    if (values[i][0] === id) {
      sheet.deleteRow(i + 1);
      break;
    }
  }
  return adminGetData(password);
}

function adminUpdateConfig(password, config) {
  requirePassword_(password);
  const sheet = getConfigSheet_();
  const values = sheet.getDataRange().getValues();
  const keys = ['ClubName', 'Venmo', 'Zelle', 'Message', 'ShowTotal'];
  keys.forEach(function (key) {
    let found = false;
    for (let i = 1; i < values.length; i++) {
      if (values[i][0] === key) {
        sheet.getRange(i + 1, 2).setValue(config[key] !== undefined ? config[key] : '');
        found = true;
        break;
      }
    }
    if (!found) sheet.appendRow([key, config[key] || '']);
  });
  return getPublicConfig();
}
