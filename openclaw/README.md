# SnapRender — OpenClaw Skill

Give [OpenClaw](https://github.com/nicepkg/openclaw) the ability to capture website screenshots using SnapRender.

## Setup

### 1. Copy the skill file

```bash
mkdir -p ~/.openclaw/skills/snaprender
cp SKILL.md ~/.openclaw/skills/snaprender/SKILL.md
```

### 2. Enable in config

Add to `~/.openclaw/openclaw.json`:

```json
{
  "skills": {
    "entries": {
      "snaprender": {
        "enabled": true,
        "env": { "SNAPRENDER_API_KEY": "sk_live_your_key_here" }
      }
    }
  }
}
```

### 3. Test

```bash
# Start the gateway (first time only)
openclaw gateway

# In another terminal
openclaw agent --session-id test --message "Screenshot stripe.com on iPhone and describe what you see"
```

## How It Works

OpenClaw Skills are markdown files that teach the agent how to use an API. The agent reads the skill instructions and calls `curl` via bash to hit the SnapRender API. The response includes a base64 image that the vision model can analyze.

## Get an API Key

Sign up free at [app.snap-render.com](https://app.snap-render.com/auth/signup) — 50 screenshots/month, no credit card required.
