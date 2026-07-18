(function () {
  let STATE = null;
  let activeTab = 'log';
  let pointsTouched = false;
  let editingEntry = null;

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatMoney(n) {
    const num = Number(n) || 0;
    return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function formatDate(d) {
    const date = new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function rankBadge(rank) {
    const top = rank <= 3 ? ' top' : '';
    return '<span class="rank-badge' + top + '">' + rank + '</span>';
  }

  async function api(path, opts) {
    const res = await fetch(path, Object.assign({ headers: { 'Content-Type': 'application/json' } }, opts));
    const data = await res.json().catch(function () { return {}; });
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // ---------- login ----------

  function renderLogin(errorMsg) {
    document.getElementById('app').innerHTML =
      '<div class="brand-bar"></div>' +
      '<h1>Chancellery Fund Admin</h1>' +
      '<div class="card">' +
        '<label for="pw">Admin password</label>' +
        '<input id="pw" type="password" placeholder="Enter password">' +
        (errorMsg ? '<p class="error">' + escapeHtml(errorMsg) + '</p>' : '') +
        '<button type="button" data-action="login">Log in</button>' +
      '</div>';
    const pw = document.getElementById('pw');
    pw.focus();
  }

  function doLogin() {
    const pw = document.getElementById('pw').value;
    api('/api/login', { method: 'POST', body: JSON.stringify({ password: pw }) })
      .then(loadAndRenderDashboard)
      .catch(function (err) { renderLogin(err.message); });
  }

  function logout() {
    api('/api/logout', { method: 'POST' }).then(function () { renderLogin(); });
  }

  function loadAndRenderDashboard() {
    return api('/api/admin/data').then(function (data) {
      STATE = data;
      renderDashboard();
    }).catch(function () {
      renderLogin();
    });
  }

  // ---------- dashboard shell ----------

  function renderDashboard() {
    const t = STATE.totals;
    const app = document.getElementById('app');
    app.innerHTML =
      '<div class="row" style="align-items:center;">' +
        '<div style="flex:3;"><div class="brand-bar"></div><h1>' + escapeHtml(STATE.config.ClubName || 'Chancellery') + '</h1></div>' +
        '<button class="secondary" type="button" style="flex:1;margin-top:0;" data-action="logout">Log out</button>' +
      '</div>' +
      '<div class="row card">' +
        '<div class="stat"><div class="value">' + formatMoney(t.totalReceived) + '</div><div class="label">Received</div></div>' +
        '<div class="stat"><div class="value">' + formatMoney(t.totalInProgress) + '</div><div class="label">In progress / On hold</div></div>' +
        '<div class="stat"><div class="value">' + Math.round(t.totalPoints) + '</div><div class="label">Points awarded</div></div>' +
      '</div>' +
      '<div class="tabs">' +
        tabBtn('log', 'Ledger') +
        tabBtn('add', 'Add entry') +
        tabBtn('leaderboard', 'Leaderboard') +
        tabBtn('settings', 'Settings') +
      '</div>' +
      '<div id="tabContent"></div>';
    renderTab();
  }

  function tabBtn(id, label) {
    return '<button class="' + (activeTab === id ? '' : 'inactive') + '" type="button" data-action="set-tab" data-tab="' + id + '">' + label + '</button>';
  }

  function setTab(id) {
    editingEntry = null;
    activeTab = id;
    renderDashboard();
  }

  function renderTab() {
    const el = document.getElementById('tabContent');
    if (activeTab === 'log') el.innerHTML = ledgerHtml();
    else if (activeTab === 'add') el.innerHTML = addEntryHtml();
    else if (activeTab === 'leaderboard') el.innerHTML = leaderboardHtml();
    else el.innerHTML = settingsHtml();
  }

  // ---------- ledger ----------

  function ledgerHtml() {
    if (!STATE.entries.length) {
      return '<div class="card"><p class="muted">No entries yet. Add a donation from the "Add entry" tab.</p></div>';
    }
    const rows = STATE.entries.map(function (e) {
      const received = e.Status === 'Received';
      const statusBadge = '<span class="badge ' + (received ? 'paid' : 'pending') + '">' + escapeHtml(e.Status) + '</span>';
      const pointsCell = '<span class="points-cell">' + Math.round(Number(e.Points) || 0) + ' pts</span>';
      const receiveAction = !received
        ? '<button class="secondary" type="button" style="margin:0;padding:4px 10px;font-size:0.78rem;" data-action="mark-received" data-id="' + escapeHtml(e.ID) + '">Mark received</button>'
        : '';
      return '<tr>' +
        '<td>' + formatDate(e.Timestamp) + '</td>' +
        '<td>' + escapeHtml(e.Name) + '</td>' +
        '<td>' + escapeHtml(e.Description) + '</td>' +
        '<td>' + formatMoney(e.Amount) + '</td>' +
        '<td>' + pointsCell + '</td>' +
        '<td>' + statusBadge + '</td>' +
        '<td style="white-space:nowrap;">' +
          '<button class="secondary" type="button" style="margin:0;padding:4px 10px;font-size:0.78rem;" data-action="edit-entry" data-id="' + escapeHtml(e.ID) + '">Edit</button> ' +
          receiveAction + ' ' +
          '<button class="danger" type="button" style="margin:0;padding:4px 10px;font-size:0.78rem;" data-action="delete-entry" data-id="' + escapeHtml(e.ID) + '">Delete</button>' +
        '</td>' +
      '</tr>';
    }).join('');
    return '<div class="card" style="overflow-x:auto;">' +
      '<table><thead><tr><th>Date</th><th>Name</th><th>Note</th><th>Amount</th><th>Points</th><th>Status</th><th></th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  // ---------- add entry ----------

  function addEntryHtml() {
    const e = editingEntry;
    pointsTouched = !!e;
    const status = e ? e.Status : 'Received';
    return '<div class="card">' +
      (e ? '<h2 style="margin-top:0;">Editing entry</h2>' : '') +
      '<label>Donor name</label>' +
      '<input id="entryName" placeholder="e.g. Jane Doe" value="' + escapeHtml(e ? e.Name : '') + '">' +
      '<label>Amount</label>' +
      '<input id="entryAmount" type="number" step="0.01" min="0" placeholder="0.00" value="' + (e ? escapeHtml(e.Amount) : '') + '">' +
      '<label>Status</label>' +
      '<select id="entryStatus">' +
        '<option value="Received"' + (status === 'Received' ? ' selected' : '') + '>Received</option>' +
        '<option value="In progress / On hold"' + (status === 'In progress / On hold' ? ' selected' : '') + '>In progress / On hold</option>' +
      '</select>' +
      '<div id="pointsField">' +
        '<label>Chancellery points to award <span class="muted">(defaults to $1 = 1pt, editable)</span></label>' +
        '<input id="entryPoints" type="number" step="1" min="0" placeholder="0" value="' + (e ? escapeHtml(e.Points) : '') + '">' +
      '</div>' +
      '<label>Note (optional)</label>' +
      '<input id="entryDesc" placeholder="e.g. general donation" value="' + escapeHtml(e ? e.Description : '') + '">' +
      '<div id="entryError" class="error"></div>' +
      '<div class="row">' +
        '<button type="button" data-action="submit-entry">' + (e ? 'Update entry' : 'Save entry') + '</button>' +
        (e ? '<button type="button" class="secondary" data-action="cancel-edit">Cancel</button>' : '') +
      '</div>' +
    '</div>';
  }

  function syncPointsFromAmount() {
    if (pointsTouched) return;
    const amount = document.getElementById('entryAmount').value;
    document.getElementById('entryPoints').value = amount;
  }

  function submitEntry() {
    const entry = {
      name: document.getElementById('entryName').value.trim(),
      amount: document.getElementById('entryAmount').value,
      description: document.getElementById('entryDesc').value.trim(),
      status: document.getElementById('entryStatus').value,
      points: document.getElementById('entryPoints').value
    };
    document.getElementById('entryError').textContent = '';
    const request = editingEntry
      ? api('/api/admin/entries/' + encodeURIComponent(editingEntry.ID), { method: 'PUT', body: JSON.stringify(entry) })
      : api('/api/admin/entries', { method: 'POST', body: JSON.stringify(entry) });
    request
      .then(function () { editingEntry = null; return loadAndRenderDashboard(); })
      .then(function () { activeTab = 'log'; renderDashboard(); })
      .catch(function (err) { document.getElementById('entryError').textContent = err.message; });
  }

  function editEntry(id) {
    const entry = STATE.entries.find(function (e) { return e.ID === id; });
    if (!entry) return;
    editingEntry = entry;
    activeTab = 'add';
    renderDashboard();
  }

  function cancelEdit() {
    editingEntry = null;
    activeTab = 'log';
    renderDashboard();
  }

  function markReceived(id) {
    api('/api/admin/entries/' + encodeURIComponent(id) + '/receive', { method: 'POST' })
      .then(function () { return loadAndRenderDashboard(); });
  }

  function deleteEntry(id) {
    if (!confirm('Delete this entry? This cannot be undone.')) return;
    api('/api/admin/entries/' + encodeURIComponent(id), { method: 'DELETE' })
      .then(function () { return loadAndRenderDashboard(); });
  }

  // ---------- leaderboard ----------

  function leaderboardHtml() {
    const list = STATE.leaderboard || [];
    if (!list.length) {
      return '<div class="card"><p class="muted">No donations logged yet.</p></div>';
    }
    const rows = list.map(function (entry, i) {
      return '<tr>' +
        '<td>' + rankBadge(i + 1) + '</td>' +
        '<td>' + escapeHtml(entry.name) + '</td>' +
        '<td class="points-cell">' + Math.round(entry.points) + ' pts</td>' +
        '<td>' + formatMoney(entry.totalDonated) + '</td>' +
        '<td>' + entry.donationCount + '</td>' +
      '</tr>';
    }).join('');
    return '<div class="card" style="overflow-x:auto;">' +
      '<p class="muted" style="font-size:0.85rem;margin-top:0;">This is also what donors see on the public page.</p>' +
      '<table><thead><tr><th>Rank</th><th>Name</th><th>Points</th><th>Total donated</th><th># Donations</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table></div>';
  }

  // ---------- settings ----------

  function settingsHtml() {
    const c = STATE.config;
    return '<div class="card">' +
      '<label>Club name</label>' +
      '<input id="cfgName" value="' + escapeHtml(c.ClubName || '') + '">' +
      '<label>Venmo</label>' +
      '<input id="cfgVenmo" value="' + escapeHtml(c.Venmo || '') + '">' +
      '<label>Zelle</label>' +
      '<input id="cfgZelle" value="' + escapeHtml(c.Zelle || '') + '">' +
      '<label>Message shown on donate page</label>' +
      '<textarea id="cfgMessage" rows="3">' + escapeHtml(c.Message || '') + '</textarea>' +
      '<label><input type="checkbox" id="cfgShowTotal" style="width:auto;display:inline-block;" ' + (String(c.ShowTotal).toLowerCase() !== 'false' ? 'checked' : '') + '> Show total raised on public page</label>' +
      '<div id="cfgError" class="error"></div>' +
      '<button type="button" data-action="save-settings">Save settings</button>' +
    '</div>' +
    '<div class="card">' +
      '<h2>Public donate page</h2>' +
      '<p class="muted" style="font-size:0.85rem;">Share this link with donors:</p>' +
      '<input id="publicUrlInput" readonly value="' + escapeHtml(window.location.origin + '/') + '">' +
    '</div>';
  }

  function saveSettings() {
    const config = {
      ClubName: document.getElementById('cfgName').value.trim(),
      Venmo: document.getElementById('cfgVenmo').value.trim(),
      Zelle: document.getElementById('cfgZelle').value.trim(),
      Message: document.getElementById('cfgMessage').value.trim(),
      ShowTotal: document.getElementById('cfgShowTotal').checked ? 'true' : 'false'
    };
    document.getElementById('cfgError').textContent = '';
    api('/api/admin/config', { method: 'POST', body: JSON.stringify(config) })
      .then(function () { return loadAndRenderDashboard(); })
      .catch(function (err) { document.getElementById('cfgError').textContent = err.message; });
  }

  // ---------- event delegation (no inline handlers, so a strict CSP can block injected scripts) ----------

  document.body.addEventListener('click', function (e) {
    let el;
    if ((el = e.target.closest('[data-action="login"]'))) doLogin();
    else if ((el = e.target.closest('[data-action="logout"]'))) logout();
    else if ((el = e.target.closest('[data-action="set-tab"]'))) setTab(el.getAttribute('data-tab'));
    else if ((el = e.target.closest('[data-action="submit-entry"]'))) submitEntry();
    else if ((el = e.target.closest('[data-action="edit-entry"]'))) editEntry(el.getAttribute('data-id'));
    else if ((el = e.target.closest('[data-action="cancel-edit"]'))) cancelEdit();
    else if ((el = e.target.closest('[data-action="mark-received"]'))) markReceived(el.getAttribute('data-id'));
    else if ((el = e.target.closest('[data-action="delete-entry"]'))) deleteEntry(el.getAttribute('data-id'));
    else if ((el = e.target.closest('[data-action="save-settings"]'))) saveSettings();
  });

  document.body.addEventListener('input', function (e) {
    if (e.target.id === 'entryAmount') syncPointsFromAmount();
    if (e.target.id === 'entryPoints') pointsTouched = true;
  });

  document.body.addEventListener('keydown', function (e) {
    if (e.target.id === 'pw' && e.key === 'Enter') doLogin();
  });

  document.body.addEventListener('focusin', function (e) {
    if (e.target.id === 'publicUrlInput') e.target.select();
  });

  loadAndRenderDashboard();
})();
