const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  pingTimeout: 60000,
  pingInterval: 25000
});

app.use(express.static(path.join(__dirname, '.')));

// ─── PROMPT PAIRS ────────────────────────────────────────────────
const NEW_PROMPTS = [
  { normal: "What's your favorite TV show?", unc: "What's a TV show you defend way more than you should?" },
  { normal: "What's your go-to comfort food?", unc: "What's a comfort food you pretend is healthier than it is?" },
  { normal: "What song do you know every word to?", unc: "What song do you know every word to but would be embarrassed to sing out loud?" },
  { normal: "What's your dream vacation destination?", unc: "What's a vacation you'd enjoy but would complain about the whole time?" },
  { normal: "What's your guilty pleasure movie?", unc: "What's a movie you act like is bad but secretly love?" },
  { normal: "What hobby could you talk about for hours?", unc: "What hobby do you bring up even when no one asked?" },
  { normal: "What's the last thing you Googled?", unc: "What's something you've Googled that you'd rather not explain?" },
  { normal: "What's your go-to karaoke song?", unc: "What's a karaoke song you'd pick that doesn't match your voice at all?" },
  { normal: "What's your biggest pet peeve?", unc: "What's a pet peeve you have that other people think is unreasonable?" },
  { normal: "What's the weirdest food you actually enjoy?", unc: "What's a weird food you defend like it's normal?" },
  { normal: "What's your most-used emoji?", unc: "What's an emoji you use incorrectly but refuse to stop?" },
  { normal: "What show are you currently binging?", unc: "What show are you watching that you're slightly behind on but pretend you're caught up?" },
  { normal: "What's your favorite fast food order?", unc: "What's a fast food order you'd only admit to around close friends?" },
  { normal: "What app do you waste the most time on?", unc: "What app do you waste time on but always say you 'barely use'?" },
  { normal: "What's your most controversial food opinion?", unc: "What's a food opinion you know will start an argument?" },
  { normal: "What celebrity would you want to meet?", unc: "What celebrity would you meet but have nothing to say to?" },
  { normal: "What's the last movie you watched?", unc: "What's the last movie you watched that you wouldn't recommend but still finished?" },
  { normal: "What's your favorite childhood snack?", unc: "What's a childhood snack you tried again and it wasn't as good?" },
  { normal: "What would you do with a million dollars?", unc: "What's the least responsible thing you'd realistically do with a million dollars?" },
  { normal: "What's your hidden talent?", unc: "What's a 'talent' you claim that might be a stretch?" },
  { normal: "What's the best gift you've ever received?", unc: "What's a gift you liked way more than you expected to?" },
  { normal: "What's your favorite holiday?", unc: "What's a holiday you like mostly for one specific reason?" },
  { normal: "What's the most embarrassing song on your playlist?", unc: "What's a song you'd skip if someone grabbed your phone?" },
  { normal: "What's your favorite video game?", unc: "What's a game you're not that good at but still play a lot?" },
  { normal: "What's your morning routine like?", unc: "What's something in your morning routine that you know is unnecessary?" },
  { normal: "What trend do you secretly love?", unc: "What trend do you pretend to hate but actually enjoy?" },
  { normal: "What's your favorite season and why?", unc: "What's a season you like but always complain about?" },
  { normal: "What would your last meal be?", unc: "What's a last meal that says something questionable about you?" },
  { normal: "What's the best concert you've been to?", unc: "What's a concert you liked even though something went wrong?" },
  { normal: "What's your unpopular opinion?", unc: "What's an opinion you don't fully believe but still argue for?" },
  { normal: "What superpower would you choose?", unc: "What superpower sounds cool but would actually cause problems?" },
  { normal: "What's your favorite ice cream flavor?", unc: "What's an ice cream flavor you defend even when others judge it?" },
  { normal: "What's something you're irrationally afraid of?", unc: "What's a fear you try to justify but can't?" },
  { normal: "What's the best advice you've ever received?", unc: "What's advice you give others but don't follow?" },
  { normal: "What's your favorite board game?", unc: "What's a board game you like but get too competitive about?" },
  { normal: "What fictional world would you live in?", unc: "What fictional world sounds fun but you'd probably struggle in?" },
  { normal: "What's your favorite thing to cook?", unc: "What's something you cook that looks better than it tastes?" },
  { normal: "What's the most rewatchable movie ever?", unc: "What's a movie you've rewatched but don't fully understand why?" },
  { normal: "What's the strangest compliment you've received?", unc: "What's a compliment you weren't sure how to take?" },
  { normal: "What would you rename yourself?", unc: "What's a name you'd choose that people might question?" },
];

// ─── ROOM MANAGEMENT ─────────────────────────────────────────────
const rooms = new Map();

function generateCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (rooms.has(code));
  return code;
}

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function getPlayerList(room) {
  return room.players.map(p => ({
    id: p.id,
    name: p.name,
    alive: p.alive,
    role: p.roleRevealed ? p.role : null,
    correctVotes: p.correctVotes
  }));
}

function getAliveCount(room) {
  return room.players.filter(p => p.alive).length;
}

function getAliveUncs(room) {
  return room.players.filter(p => p.alive && p.role === 'unc');
}

function checkWinCondition(room) {
  const aliveUncs = getAliveUncs(room);
  if (aliveUncs.length === 0) {
    return { winner: 'players', reason: 'All Secret Uncs have been exposed!' };
  }
  if (room.round >= room.maxRounds) {
    return { winner: 'uncs', reason: `Secret Uncs survived ${room.maxRounds} rounds!` };
  }
  return null;
}

// ─── SOCKET HANDLING ─────────────────────────────────────────────
io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  // ── HOST: Create Room ──
  socket.on('create-room', (callback) => {
    const code = generateCode();
    const room = {
      code,
      hostId: socket.id,
      players: [],
      state: 'LOBBY',
      round: 0,
      maxRounds: 0,
      currentPrompt: null,
      answers: new Map(),
      votes: new Map(),
      usedPromptIndices: new Set(),
      customPrompts: [],
      eliminatedThisRound: null,
    };
    rooms.set(code, room);
    socket.join(code);
    socket.roomCode = code;
    socket.isHost = true;
    console.log(`Room created: ${code}`);
    if (callback) callback({ success: true, code });
  });

  // ── PLAYER: Join Room ──
  socket.on('join-room', ({ code, name }, callback) => {
    const roomCode = code.toUpperCase().trim();
    const room = rooms.get(roomCode);

    if (!room) return callback({ success: false, error: 'Case file not found.' });
    if (room.state !== 'LOBBY') return callback({ success: false, error: 'Investigation already in progress.' });
    if (room.players.length >= 20) return callback({ success: false, error: 'Room is full.' });
    if (room.players.some(p => p.name.toLowerCase() === name.toLowerCase().trim()))
      return callback({ success: false, error: 'That alias is taken.' });

    const player = {
      id: socket.id,
      name: name.trim(),
      role: null,
      alive: true,
      roleRevealed: false,
      correctVotes: 0,
    };
    room.players.push(player);
    socket.join(roomCode);
    socket.roomCode = roomCode;
    socket.playerName = name.trim();

    io.to(room.hostId).emit('player-joined', { players: getPlayerList(room) });
    callback({ success: true, playerCount: room.players.length });
  });

  // ── HOST: End Game Early ──
  socket.on('end-game', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || socket.id !== room.hostId) return;

    room.state = 'GAME_OVER';
    room.players.forEach(p => { p.roleRevealed = true; });

    const result = { winner: 'none', reason: 'The host ended the game early.' };
    socket.emit('game-ended', { result, players: getPlayerList(room) });
    room.players.forEach(p => {
      io.to(p.id).emit('round-results-player', { eliminatedName: '', eliminatedRole: '', wasMe: false, gameOver: result });
    });
  });

  // ── HOST: Start Game ──
  socket.on('start-game', (callback) => {
    const room = rooms.get(socket.roomCode);
    if (!room || socket.id !== room.hostId) return;
    if (room.players.length < 3) return callback({ success: false, error: 'Need at least 3 suspects.' });

    room.state = 'PLAYING';
    room.round = 0;
    room.maxRounds = Math.floor(room.players.length / 2);

    // Assign roles: 1 unc per 3 players, minimum 1
    const numUncs = Math.max(1, Math.floor(room.players.length / 3));
    const shuffled = shuffleArray(room.players);
    shuffled.forEach((p, i) => {
      p.role = i < numUncs ? 'unc' : 'normal';
      p.alive = true;
      p.roleRevealed = false;
      p.correctVotes = 0;
    });

    // Notify players of their roles
    room.players.forEach(p => {
      io.to(p.id).emit('role-assigned', { role: p.role });
    });

    // Notify host
    io.to(room.hostId).emit('game-started', {
      totalRounds: room.maxRounds,
      playerCount: room.players.length,
      uncCount: numUncs,
      players: getPlayerList(room)
    });

    callback({ success: true });

    // Start first round after a delay
    setTimeout(() => startRound(room), 4000);
  });

  // ── PLAYER: Submit Answer ──
  socket.on('submit-answer', ({ answer }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.state !== 'PROMPTING') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.alive) return;

    room.answers.set(socket.id, { name: player.name, answer: answer.trim(), id: socket.id });

    // Check if all alive players have answered
    const aliveCount = getAliveCount(room);
    if (room.answers.size >= aliveCount) {
      revealAnswers(room);
    } else {
      io.to(room.hostId).emit('answer-count', { count: room.answers.size, total: aliveCount });
    }
  });

  // ── HOST: Start Voting Phase ──
  socket.on('start-voting', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || socket.id !== room.hostId || room.state !== 'REVEALING') return;

    room.state = 'VOTING';
    room.votes.clear();

    const alivePlayers = room.players.filter(p => p.alive).map(p => ({ id: p.id, name: p.name }));

    // Tell each alive player to vote (they can't vote for themselves)
    room.players.filter(p => p.alive).forEach(p => {
      const votable = alivePlayers.filter(v => v.id !== p.id);
      io.to(p.id).emit('start-vote', { players: votable });
    });

    io.to(room.hostId).emit('voting-started', { players: alivePlayers });
  });

  // ── PLAYER: Submit Vote ──
  socket.on('submit-vote', ({ targetId }) => {
    const room = rooms.get(socket.roomCode);
    if (!room || room.state !== 'VOTING') return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player || !player.alive) return;

    room.votes.set(socket.id, targetId);

    const aliveCount = getAliveCount(room);
    if (room.votes.size >= aliveCount) {
      tallyVotes(room);
    } else {
      io.to(room.hostId).emit('vote-count', { count: room.votes.size, total: aliveCount });
    }
  });

  // ── HOST: Next Round ──
  socket.on('next-round', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || socket.id !== room.hostId) return;
    startRound(room);
  });

  // ── HOST: Return to Lobby ──
  socket.on('return-to-lobby', () => {
    const room = rooms.get(socket.roomCode);
    if (!room || socket.id !== room.hostId) return;

    room.state = 'LOBBY';
    room.round = 0;
    room.answers.clear();
    room.votes.clear();
    room.usedPromptIndices.clear();
    room.players.forEach(p => {
      p.role = null;
      p.alive = true;
      p.roleRevealed = false;
      p.correctVotes = 0;
    });

    io.to(room.hostId).emit('returned-to-lobby', { players: getPlayerList(room) });
    room.players.forEach(p => {
      io.to(p.id).emit('returned-to-lobby', {});
    });
  });

  // ── Disconnect ──
  socket.on('disconnect', () => {
    console.log(`Disconnected: ${socket.id}`);
    const room = rooms.get(socket.roomCode);
    if (!room) return;

    if (socket.isHost) {
      // Host left — end the game
      room.players.forEach(p => {
        io.to(p.id).emit('host-disconnected');
      });
      rooms.delete(socket.roomCode);
    } else {
      // Player left
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const playerName = room.players[idx].name;
        room.players.splice(idx, 1);
        io.to(room.hostId).emit('player-left', { name: playerName, players: getPlayerList(room) });

        // If in game and waiting for answers/votes, check if we can proceed
        if (room.state === 'PROMPTING') {
          room.answers.delete(socket.id);
          if (room.answers.size >= getAliveCount(room)) revealAnswers(room);
        } else if (room.state === 'VOTING') {
          room.votes.delete(socket.id);
          if (room.votes.size >= getAliveCount(room)) tallyVotes(room);
        }
      }
    }
  });
});

// ─── GAME FUNCTIONS ──────────────────────────────────────────────

function startRound(room) {
  room.round++;
  room.state = 'PROMPTING';
  room.answers.clear();
  room.votes.clear();
  room.eliminatedThisRound = null;

  // Pick a prompt
  const allPrompts = [...DEFAULT_PROMPTS, ...room.customPrompts];
  let promptIndex;
  const availableIndices = [];
  for (let i = 0; i < allPrompts.length; i++) {
    if (!room.usedPromptIndices.has(i)) availableIndices.push(i);
  }
  if (availableIndices.length === 0) {
    room.usedPromptIndices.clear();
    promptIndex = Math.floor(Math.random() * allPrompts.length);
  } else {
    promptIndex = availableIndices[Math.floor(Math.random() * availableIndices.length)];
  }
  room.usedPromptIndices.add(promptIndex);
  room.currentPrompt = allPrompts[promptIndex];

  // Send prompts to players
  room.players.filter(p => p.alive).forEach(p => {
    const prompt = p.role === 'unc' ? room.currentPrompt.unc : room.currentPrompt.normal;
    io.to(p.id).emit('new-prompt', { prompt, round: room.round, maxRounds: room.maxRounds });
  });

  // Tell eliminated players to spectate
  room.players.filter(p => !p.alive).forEach(p => {
    io.to(p.id).emit('spectate-round', { round: room.round });
  });

  // Tell host
  io.to(room.hostId).emit('round-started', {
    round: room.round,
    maxRounds: room.maxRounds,
    normalPrompt: room.currentPrompt.normal,
    aliveCount: getAliveCount(room),
    players: getPlayerList(room)
  });
}

function revealAnswers(room) {
  room.state = 'REVEALING';
  const answers = Array.from(room.answers.values());
  const shuffledAnswers = shuffleArray(answers);

  io.to(room.hostId).emit('all-answers', {
    answers: shuffledAnswers,
    prompt: room.currentPrompt.normal,
    round: room.round
  });

  // Tell players to look at host screen
  room.players.filter(p => p.alive).forEach(p => {
    io.to(p.id).emit('answers-revealed', {});
  });
}

function tallyVotes(room) {
  room.state = 'RESULTS';

  // Count votes
  const voteCounts = {};
  room.players.filter(p => p.alive).forEach(p => { voteCounts[p.id] = 0; });
  room.votes.forEach((targetId) => { voteCounts[targetId] = (voteCounts[targetId] || 0) + 1; });

  // Find max votes
  const maxVotes = Math.max(...Object.values(voteCounts));
  const tied = Object.entries(voteCounts).filter(([, v]) => v === maxVotes).map(([id]) => id);

  // Random among ties
  const eliminatedId = tied[Math.floor(Math.random() * tied.length)];
  const eliminated = room.players.find(p => p.id === eliminatedId);
  eliminated.alive = false;
  eliminated.roleRevealed = true;
  room.eliminatedThisRound = eliminated;

  // Award correct votes
  room.votes.forEach((targetId, voterId) => {
    const target = room.players.find(p => p.id === targetId);
    const voter = room.players.find(p => p.id === voterId);
    if (target && target.role === 'unc' && voter) {
      voter.correctVotes++;
    }
  });

  // Build vote breakdown
  const voteBreakdown = {};
  room.players.filter(p => p.alive || p.id === eliminatedId).forEach(p => {
    voteBreakdown[p.id] = { name: p.name, votes: voteCounts[p.id] || 0 };
  });

  const winResult = checkWinCondition(room);

  const resultData = {
    eliminated: { name: eliminated.name, role: eliminated.role, id: eliminated.id },
    voteBreakdown,
    players: getPlayerList(room),
    round: room.round,
    maxRounds: room.maxRounds,
    gameOver: winResult,
    aliveUncs: getAliveUncs(room).length,
  };

  io.to(room.hostId).emit('round-results', resultData);

  // Notify players
  room.players.forEach(p => {
    io.to(p.id).emit('round-results-player', {
      eliminatedName: eliminated.name,
      eliminatedRole: eliminated.role,
      wasMe: p.id === eliminatedId,
      gameOver: winResult,
    });
  });

  if (winResult) {
    room.state = 'GAME_OVER';
  }
}

// ─── START SERVER ────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Secret Unc server running on port ${PORT}`);
});
