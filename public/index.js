(function () {
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  function formatMoney(n) {
    const num = Number(n) || 0;
    return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function copyText(text, btn) {
    navigator.clipboard.writeText(text).then(function () {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(function () { btn.textContent = original; }, 1200);
    });
  }

  function rankBadge(rank) {
    const top = rank <= 3 ? ' top' : '';
    return '<span class="rank-badge' + top + '">' + rank + '</span>';
  }

  function leaderboardHtml(list) {
    if (!list.length) {
      return '<p class="muted" style="font-size:0.88rem;">Be the first to donate and top the leaderboard!</p>';
    }
    const rows = list.slice(0, 25).map(function (entry, i) {
      return '<tr>' +
        '<td>' + rankBadge(i + 1) + '</td>' +
        '<td>' + escapeHtml(entry.name) + '</td>' +
        '<td class="points-cell">' + Math.round(entry.points) + ' pts</td>' +
      '</tr>';
    }).join('');
    return '<table><thead><tr><th>Rank</th><th>Name</th><th>Points</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function render(config, leaderboard) {
    const showTotal = String(config.ShowTotal).toLowerCase() !== 'false';
    document.title = config.ClubName || 'Chancellery';
    document.getElementById('app').innerHTML =
      '<div class="brand-bar"></div>' +
      '<h1>' + escapeHtml(config.ClubName || 'Chancellery') + '</h1>' +
      '<p class="muted">' + escapeHtml(config.Message || '') + '</p>' +
      (showTotal ? (
        '<div class="card stat">' +
          '<div class="value">' + formatMoney(config.totalRaised) + '</div>' +
          '<div class="label">Raised so far</div>' +
        '</div>'
      ) : '') +
      '<div class="card">' +
        '<h2>Donate</h2>' +
        '<div class="info-line">' +
          '<span>Venmo</span>' +
          '<span><strong>' + escapeHtml(config.Venmo || '') + '</strong> ' +
            '<button class="copy-btn" type="button" data-action="copy" data-value="' + escapeHtml(config.Venmo || '') + '">Copy</button></span>' +
        '</div>' +
        '<div class="info-line">' +
          '<span>Zelle</span>' +
          '<span><strong>' + escapeHtml(config.Zelle || '') + '</strong> ' +
            '<button class="copy-btn" type="button" data-action="copy" data-value="' + escapeHtml(config.Zelle || '') + '">Copy</button></span>' +
        '</div>' +
        '<p class="muted" style="margin-top:14px;font-size:0.85rem;">Every donation earns you Chancellery points — redeemable for perks down the line.</p>' +
      '</div>' +
      '<div class="card">' +
        '<h2>Chancellery Points Leaderboard</h2>' +
        leaderboardHtml(leaderboard) +
      '</div>';
  }

  document.body.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-action="copy"]');
    if (btn) copyText(btn.getAttribute('data-value'), btn);
  });

  Promise.all([
    fetch('/api/public-config').then(function (r) { if (!r.ok) throw new Error('Server error'); return r.json(); }),
    fetch('/api/leaderboard').then(function (r) { if (!r.ok) throw new Error('Server error'); return r.json(); })
  ]).then(function (results) {
    render(results[0], results[1]);
  }).catch(function (err) {
    document.getElementById('app').innerHTML = '<p class="error">Could not load page: ' + escapeHtml(err.message) + '</p>';
  });
})();
