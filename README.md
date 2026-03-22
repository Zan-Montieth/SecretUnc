# Secret Unc 🕶️

A Jackbox-style party deception game. One screen hosts the game while players join from their phones.

## How It Works

1. **Host** opens the game on a computer/TV and creates a room
2. **Players** join on their phones using the room code
3. Each round, everyone gets a prompt — but **Secret Uncs** get a *slightly different* version
4. Answers are revealed on the big screen. Discuss, then vote out who seems suspicious
5. **Players win** if all Secret Uncs are found. **Uncs win** by surviving `⌊players ÷ 2⌋` rounds

## Roles

- **Investigator** — Answer your prompt honestly. Spot the odd one out.
- **Secret Unc** — You get a different prompt (e.g., "What's your *parent's* favorite show?" instead of "What's *your* favorite show?"). Blend in or get caught.

1 out of every 3 players is secretly assigned as a Secret Unc.

## Local Development

```bash
npm install
npm start
# Open http://localhost:3000
```

## Deploy to Render

1. Push this repo to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Connect your repo
4. Render auto-detects settings from `render.yaml`, or configure manually:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Environment:** Node
5. Deploy — your game will be live at `https://your-app.onrender.com`

Players join by visiting the same URL on their phones.

## Custom Prompts

The host can add custom prompt pairs from the lobby before starting a game.
Each pair needs a **normal** prompt (for investigators) and an **unc** prompt (for Secret Uncs).

## Tech Stack

- **Server:** Node.js + Express + Socket.io
- **Frontend:** Vanilla HTML/CSS/JS (no build step needed)
- **Real-time:** WebSocket connections via Socket.io
