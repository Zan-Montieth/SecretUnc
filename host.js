const socket = io();

// ─── STATE ───────────────────────────────────────────────────────
let roomCode = null;

// ─── INIT ────────────────────────────────────────────────────────
(function init() {
  socket.emit('create-room', (res) => {
    if (res.success) {
      roomCode = res.code;
      history.replaceState(null, '', `?code=${roomCode}`);
      setupLobby();
    }
  });
})();

function setupLobby() {
  document.getElementById('room-code').textContent = roomCode;
  document.getElementById('site-url').textContent = window.location.origin;
}

// ─── VIEW MANAGEMENT ─────────────────────────────────────────────
function showView(viewId) {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(viewId).classList.remove('hidden');
}

// ─── LOBBY EVENTS ────────────────────────────────────────────────
socket.on('player-joined', ({ players }) => {
  renderPlayerList(players);
});

socket.on('player-left', ({ name, players }) => {
  renderPlayerList(players);
});

function renderPlayerList(players) {
  const list = document.getElementById('player-list');
  const count = document.getElementById('player-count');
  count.textContent = players.length;

  list.innerHTML = players.map(p => {
    const classes = ['player-tag'];
    if (!p.alive) classes.push('eliminated');
    let badge = '';
    if (p.role) {
      badge = `<span class="role-badge ${p.role}">${p.role === 'unc' ? 'Unc' : 'Clear'}</span>`;
    }
    return `<li class="${classes.join(' ')}">${p.name}${badge}</li>`;
  }).join('');

  const btn = document.getElementById('btn-start');
  const hint = document.getElementById('start-hint');
  if (players.length >= 3) {
    btn.disabled = false;
    const uncCount = Math.max(1, Math.floor(players.length / 3));
    hint.textContent = `${players.length} suspects — ${uncCount} will be Secret Unc${uncCount > 1 ? 's' : ''}`;
  } else {
    btn.disabled = true;
    hint.textContent = `Need at least 3 suspects (${3 - players.length} more)`;
  }
}

// ─── START GAME ──────────────────────────────────────────────────
function startGame() {
  const btn = document.getElementById('btn-start');
  btn.disabled = true;
  btn.textContent = 'Starting...';

  socket.emit('start-game', (res) => {
    if (!res.success) {
      btn.disabled = false;
      btn.textContent = 'Begin Investigation';
      alert(res.error);
    }
  });
}

socket.on('game-started', ({ totalRounds, playerCount, uncCount, players }) => {
  document.getElementById('round-info').textContent =
    `${playerCount} Suspects · ${uncCount} Secret Unc${uncCount > 1 ? 's' : ''} · ${totalRounds} Rounds`;
  document.getElementById('btn-end-game').style.display = '';
  // Stay on lobby briefly, then first round will start via round-started
});

// ─── ROUND EVENTS ────────────────────────────────────────────────
socket.on('round-started', ({ round, maxRounds, aliveCount }) => {
  showView('view-round');
  document.getElementById('round-info').innerHTML =
    `Round <strong style="color:var(--gold)">${round}</strong> of ${maxRounds}`;
  updateAnswerProgress(0, aliveCount);
});

socket.on('answer-count', ({ count, total }) => {
  updateAnswerProgress(count, total);
});

function updateAnswerProgress(count, total) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  document.getElementById('answer-progress-fill').style.width = pct + '%';
  document.getElementById('answer-status').textContent = `${count} / ${total}`;
}

// ─── ANSWERS REVEALED ────────────────────────────────────────────
socket.on('all-answers', ({ answers, prompt, round }) => {
  showView('view-answers');
  document.getElementById('answers-prompt').textContent = prompt;

  const list = document.getElementById('answers-list');
  list.innerHTML = answers.map((a, i) => `
    <div class="answer-card" style="--i:${i}">
      <span class="answer-name">${escapeHtml(a.name)}</span>
      <span class="answer-text">"${escapeHtml(a.answer)}"</span>
    </div>
  `).join('');
});

// ─── VOTING ──────────────────────────────────────────────────────
function startVoting() {
  socket.emit('start-voting');
}

socket.on('voting-started', ({ players }) => {
  showView('view-voting');
  document.getElementById('vote-count').textContent = '0';
  document.getElementById('vote-total').textContent = players.length;
});

socket.on('vote-count', ({ count, total }) => {
  document.getElementById('vote-count').textContent = count;
  document.getElementById('vote-total').textContent = total;
});

// ─── RESULTS ─────────────────────────────────────────────────────
socket.on('round-results', ({ eliminated, voteBreakdown, players, round, maxRounds, gameOver, aliveUncs }) => {
  if (gameOver) {
    showGameOver(gameOver, players, eliminated);
    return;
  }

  showView('view-results');

  // Result header
  const isUnc = eliminated.role === 'unc';
  const content = document.getElementById('results-content');
  content.innerHTML = `
    <div style="font-size:3rem; margin-bottom:0.5rem;">${isUnc ? '🔍' : '❌'}</div>
    <h2 style="color:${isUnc ? 'var(--green-light)' : 'var(--crimson-light)'}; font-size:1.5rem; margin-bottom:0.25rem;">
      ${escapeHtml(eliminated.name)}
    </h2>
    <p class="mono" style="font-size:1.1rem; margin-bottom:0.5rem;">
      was ${isUnc
        ? '<span style="color:var(--crimson-light)">a Secret Unc!</span>'
        : '<span style="color:var(--green-light)">an innocent suspect.</span>'}
    </p>
    <p class="text-sm text-muted">${isUnc ? 'Good work, detectives.' : 'An innocent has been wrongly accused.'}</p>
    ${aliveUncs > 0 ? `<p class="text-sm text-muted mt-1" style="font-style:italic;">${aliveUncs} Secret Unc${aliveUncs > 1 ? 's' : ''} still at large...</p>` : ''}
  `;

  // Vote breakdown bars
  const breakdownEl = document.getElementById('vote-breakdown');
  const entries = Object.entries(voteBreakdown).sort((a, b) => b[1].votes - a[1].votes);
  const maxVotes = Math.max(...entries.map(([, d]) => d.votes), 1);

  breakdownEl.innerHTML = entries.map(([id, data]) => {
    const pct = (data.votes / maxVotes) * 100;
    const isElim = id === eliminated.id;
    return `
      <div class="vote-bar-container">
        <div class="vote-bar-label">
          <span>${escapeHtml(data.name)}${isElim ? ' 💀' : ''}</span>
          <span>${data.votes} vote${data.votes !== 1 ? 's' : ''}</span>
        </div>
        <div class="vote-bar-track">
          <div class="vote-bar-fill${isElim ? ' eliminated' : ''}" style="width:${pct}%"></div>
        </div>
      </div>
    `;
  }).join('');

  // Scoreboard
  renderScoreboard('scoreboard', players, false);

  // Actions
  const actions = document.getElementById('results-actions');
  actions.innerHTML = `<button class="btn btn-large" onclick="nextRound()">Next Round</button>`;
});

function nextRound() {
  socket.emit('next-round');
}

// ─── GAME OVER ───────────────────────────────────────────────────
function showGameOver(result, players, lastEliminated) {
  showView('view-gameover');

  const content = document.getElementById('gameover-content');
  const isPlayersWin = result.winner === 'players';
  const isEarlyEnd = result.winner === 'none';

  content.innerHTML = `
    <div style="font-size:4rem; margin-bottom:1rem;">${isEarlyEnd ? '🛑' : isPlayersWin ? '🏆' : '🕶️'}</div>
    <h1>${isEarlyEnd ? 'Investigation Closed' : isPlayersWin ? 'Case Closed' : 'Case Gone Cold'}</h1>
    <p class="subtitle">${escapeHtml(result.reason)}</p>
    ${!isEarlyEnd ? `<p class="mono mt-2" style="color:${isPlayersWin ? 'var(--green-light)' : 'var(--crimson-light)'}; font-size:1.2rem;">
      ${isPlayersWin ? 'The investigators win!' : 'The Secret Uncs win!'}
    </p>` : ''}
  `;

  // Final scoreboard with all roles revealed
  const revealedPlayers = players.map(p => {
    const original = players.find(pl => pl.id === p.id);
    return { ...p, role: p.role || (original ? original.role : null), roleRevealed: true };
  });
  renderScoreboard('final-scoreboard', revealedPlayers, true);
}

function renderScoreboard(tableId, players, showRole) {
  const tbody = document.querySelector(`#${tableId} tbody`);
  tbody.innerHTML = players.map(p => {
    const rowClass = p.alive ? '' : 'eliminated';
    const status = p.alive ? '🟢 Active' : '🔴 Exposed';
    const roleBadge = p.role
      ? `<span class="role-badge ${p.role}">${p.role === 'unc' ? 'Secret Unc' : 'Innocent'}</span>`
      : '—';

    if (showRole) {
      return `<tr class="${rowClass}">
        <td>${escapeHtml(p.name)}</td>
        <td>${roleBadge}</td>
        <td>${status}</td>
        <td>${p.correctVotes || 0}</td>
      </tr>`;
    }
    return `<tr class="${rowClass}">
      <td>${escapeHtml(p.name)}</td>
      <td>${p.alive ? status : `${status} ${roleBadge}`}</td>
      <td>${p.correctVotes || 0}</td>
    </tr>`;
  }).join('');
}

function returnToLobby() {
  socket.emit('return-to-lobby');
}

socket.on('returned-to-lobby', ({ players }) => {
  showView('view-lobby');
  document.getElementById('round-info').textContent = '';
  document.getElementById('btn-end-game').style.display = 'none';
  const btn = document.getElementById('btn-start');
  btn.disabled = false;
  btn.textContent = 'Begin Investigation';
  renderPlayerList(players);
});

// ─── END GAME ────────────────────────────────────────────────────
function endGame() {
  if (!confirm('End the game early?')) return;
  socket.emit('end-game');
}

socket.on('game-ended', ({ result, players }) => {
  document.getElementById('btn-end-game').style.display = 'none';
  showGameOver(result, players, null);
});

// ─── UTILS ───────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
