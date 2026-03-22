const socket = io();

// ─── STATE ───────────────────────────────────────────────────────
let myName = '';
let myRole = null;
let selectedVote = null;
let isAlive = true;

// ─── INIT ────────────────────────────────────────────────────────
(function init() {
  const code = sessionStorage.getItem('joinCode');
  const name = sessionStorage.getItem('joinName');

  if (!code || !name) {
    window.location.href = '/';
    return;
  }

  myName = name;

  socket.emit('join-room', { code, name }, (res) => {
    if (res.success) {
      sessionStorage.removeItem('joinCode');
      sessionStorage.removeItem('joinName');
      showView('view-lobby');
      document.getElementById('my-name').textContent = myName;
    } else {
      document.getElementById('connect-error').textContent = res.error;
      document.getElementById('connect-error').style.display = 'block';
      document.getElementById('btn-retry').style.display = 'inline-block';
    }
  });
})();

// ─── VIEW MANAGEMENT ─────────────────────────────────────────────
function showView(viewId) {
  document.querySelectorAll('[id^="view-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById(viewId).classList.remove('hidden');
}

// ─── ROLE ASSIGNED ───────────────────────────────────────────────
socket.on('role-assigned', ({ role }) => {
  myRole = role;
  isAlive = true;
  showView('view-role');

  const content = document.getElementById('role-content');

  if (role === 'unc') {
    content.innerHTML = `
      <div class="role-icon">🕶️</div>
      <div class="role-title" style="color:var(--crimson-light);">Secret Unc</div>
      <div class="role-desc">
        You're the infiltrator. You'll get a slightly different question.
        Try to blend in with your answer — don't get caught!
      </div>
    `;
  } else {
    content.innerHTML = `
      <div class="role-icon">🔍</div>
      <div class="role-title" style="color:var(--green-light);">Investigator</div>
      <div class="role-desc">
        You're on the case. Answer honestly and spot the one
        whose testimony doesn't quite add up.
      </div>
    `;
  }
});

// ─── PROMPT RECEIVED ─────────────────────────────────────────────
socket.on('new-prompt', ({ prompt, round, maxRounds }) => {
  showView('view-prompt');
  document.getElementById('prompt-round-info').textContent = `Round ${round} of ${maxRounds}`;
  document.getElementById('my-prompt').textContent = prompt;
  document.getElementById('input-answer').value = '';
  document.getElementById('char-count').textContent = '0';
  document.getElementById('btn-submit-answer').disabled = false;
  document.getElementById('btn-submit-answer').textContent = 'Submit Testimony';
});

// Char counter
document.getElementById('input-answer').addEventListener('input', function () {
  document.getElementById('char-count').textContent = this.value.length;
});

// ─── SUBMIT ANSWER ───────────────────────────────────────────────
function submitAnswer() {
  const answer = document.getElementById('input-answer').value.trim();
  if (!answer) return;

  const btn = document.getElementById('btn-submit-answer');
  btn.disabled = true;
  btn.textContent = 'Submitted';

  socket.emit('submit-answer', { answer });
  showView('view-waiting');
}

// ─── ANSWERS REVEALED (look at screen) ───────────────────────────
socket.on('answers-revealed', () => {
  showView('view-look');
});

// ─── VOTING ──────────────────────────────────────────────────────
socket.on('start-vote', ({ players }) => {
  selectedVote = null;
  showView('view-vote');

  const container = document.getElementById('vote-buttons');
  container.innerHTML = players.map(p => `
    <button class="vote-btn" data-id="${p.id}" onclick="selectVote(this, '${p.id}')">
      ${escapeHtml(p.name)}
    </button>
  `).join('');

  document.getElementById('btn-submit-vote').disabled = true;
});

function selectVote(btn, targetId) {
  selectedVote = targetId;
  document.querySelectorAll('.vote-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  document.getElementById('btn-submit-vote').disabled = false;
}

function submitVote() {
  if (!selectedVote) return;

  const btn = document.getElementById('btn-submit-vote');
  btn.disabled = true;
  btn.textContent = 'Accusation Filed';

  socket.emit('submit-vote', { targetId: selectedVote });
  showView('view-vote-waiting');
}

// ─── ROUND RESULTS ───────────────────────────────────────────────
socket.on('round-results-player', ({ eliminatedName, eliminatedRole, wasMe, gameOver }) => {
  if (gameOver) {
    showPlayerGameOver(gameOver, wasMe);
    return;
  }

  if (wasMe) {
    isAlive = false;
    showView('view-spectate');
    return;
  }

  showView('view-results');
  const content = document.getElementById('player-result-content');
  const isUnc = eliminatedRole === 'unc';

  content.innerHTML = `
    <div class="card gold-border" style="padding:2rem;">
      <div style="font-size:2.5rem; margin-bottom:0.5rem;">${isUnc ? '🔍' : '❌'}</div>
      <h3 style="color:${isUnc ? 'var(--green-light)' : 'var(--crimson-light)'}; font-size:1rem;">
        ${escapeHtml(eliminatedName)}
      </h3>
      <p class="mono mt-1">
        was ${isUnc ? 'a Secret Unc!' : 'an innocent suspect.'}
      </p>
      <p class="text-sm text-muted mt-1" style="font-style:italic;">
        Look at the big screen for details.
      </p>
    </div>
  `;
});

// ─── SPECTATE ────────────────────────────────────────────────────
socket.on('spectate-round', ({ round }) => {
  showView('view-spectate');
  document.getElementById('spectate-round').textContent = `Round ${round} in progress...`;
});

// ─── GAME OVER ───────────────────────────────────────────────────
function showPlayerGameOver(result, wasMe) {
  showView('view-gameover');
  const content = document.getElementById('player-gameover-content');
  const isPlayersWin = result.winner === 'players';

  let personalMsg = '';
  if (myRole === 'unc') {
    personalMsg = isPlayersWin ? 'You were caught. Case closed.' : 'You got away with it!';
  } else {
    personalMsg = isPlayersWin ? 'Great detective work!' : 'The Unc slipped through...';
  }

  content.innerHTML = `
    <div class="card gold-border" style="padding:2rem;">
      <div style="font-size:3rem; margin-bottom:0.5rem;">${isPlayersWin ? '🏆' : '🕶️'}</div>
      <h3 style="color:var(--gold); font-size:1.2rem;">
        ${isPlayersWin ? 'Case Closed' : 'Case Gone Cold'}
      </h3>
      <p class="mono mt-1" style="color:${isPlayersWin ? 'var(--green-light)' : 'var(--crimson-light)'};">
        ${isPlayersWin ? 'Investigators win!' : 'Secret Uncs win!'}
      </p>
      <p class="text-sm text-muted mt-1" style="font-style:italic;">${personalMsg}</p>
    </div>
  `;
}

// ─── RETURN TO LOBBY ─────────────────────────────────────────────
socket.on('returned-to-lobby', () => {
  myRole = null;
  isAlive = true;
  selectedVote = null;
  showView('view-lobby');
});

// ─── HOST DISCONNECTED ───────────────────────────────────────────
socket.on('host-disconnected', () => {
  showView('view-disconnected');
});

// ─── UTILS ───────────────────────────────────────────────────────
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
