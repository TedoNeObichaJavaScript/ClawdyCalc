<div align="center">

<img src="docs/clawds-walking.svg" alt="A parade of pixel Clawds in tiny hats, walking and hopping" width="820">

# ClawdyCalc

**Ever wondered what your Claude Code habit would cost if you paid API prices?**<br>
Me too. So I built a tiny dashboard where little pixel Clawds bounce around while you find out.

![MIT license](https://img.shields.io/badge/license-MIT-D97757)
![Node 18+](https://img.shields.io/badge/node-18%2B-D97757)
![Zero dependencies](https://img.shields.io/badge/dependencies-0-D97757)
![Runs locally](https://img.shields.io/badge/runs-100%25%20locally-D97757)

<img src="docs/screenshot.png" alt="ClawdyCalc in light mode, showing demo data" width="49%">&nbsp;<img src="docs/screenshot-dark.png" alt="ClawdyCalc in dark mode, showing demo data" width="49%">

<sub>(That's demo data. Nobody's real bill is being exposed here, relax.)</sub>

</div>

---

## So what is this?

I'm on a Claude subscription. Flat monthly price, use it as much as you want. Great deal, probably.

But *how* great? Claude Code quietly writes down every token you burn, so I wanted to see the number. Not the plan price. The "if Anthropic sent me an itemized bill at API rates" number.

ClawdyCalc reads those logs, prices every message, and shows you:

- **What you've spent** today, this week, this month and all time, at API list prices
- **How much value you get from your plan.** "You paid $100 and got $412 worth of tokens" hits different
- **Your last 5 hours**, which is the window your usage limits are counted in, plus your burn rate per hour
- **Lifetime spend, including history Claude Code already deleted** (more on that [below](#wait-where-did-my-old-usage-go))
- **Which models ate your budget**, and whether it went to output, cache writes or cache reads
- **Your most expensive projects**, so you know who to blame
- **Fun stats**, like your priciest day and how much prompt caching saved you (spoiler: a lot)
- **CSV export**, for spreadsheet people

And the important part: **every model you've used shows up as a little Clawd.** They walk around, hop, do backflips, and high-five when they bump into each other. Click one to see what it cost you. Grab one and throw it across the screen. When you spend new tokens, that model jumps and drops a coin.

## Meet the cast

| | Who | Wears | Vibe |
|:-:|---|---|---|
| <img src="docs/clawds/fable.svg" width="56"> | **Fable** | wizard hat | the big brain, priced like it |
| <img src="docs/clawds/mythos.svg" width="56"> | **Mythos** | crimson wizard hat | secret-club wizard |
| <img src="docs/clawds/opus-5-5.svg" width="56"> | **Opus 5.5** | crown | the current king |
| <img src="docs/clawds/opus-5.svg" width="56"> | **Opus 5** | grad cap | graduated, still shows up to work |
| <img src="docs/clawds/opus-4.svg" width="56"> | **Opus 4.x** | beanie | the OG |
| <img src="docs/clawds/sonnet.svg" width="56"> | **Sonnet** | headphones | just vibing and shipping |
| <img src="docs/clawds/haiku.svg" width="56"> | **Haiku** | sprout | small but mighty |
| <img src="docs/clawds/mystery.svg" width="56"> | **Anything new** | party hat | welcome to the party |

The more you spend on a model, the bigger its Clawd gets. Chonk reflects spend.

## Get it running

You need [Node.js](https://nodejs.org) 18 or newer. That's it. No `npm install`, because there are no dependencies.

```bash
git clone https://github.com/TedoNeObichaJavaScript/ClawdyCalc.git
cd ClawdyCalc
npm start
```

It starts a little server at `http://localhost:4317` and pops open a small window. On Windows you can also just double-click **`ClawdyCalc.bat`**.

Want to see it without your own data? Open `http://localhost:4317/?demo`.

<details>
<summary>More options</summary>

```bash
node bin/clawdycalc.js --port 5000   # different port
node bin/clawdycalc.js --no-open     # don't open a window, just serve
```

| Environment variable | What it does |
|---|---|
| `PORT` | Same as `--port` |
| `CLAUDE_CONFIG_DIR` | Where your Claude Code config lives, if you moved it |
| `CLAWDYCALC_HOME` | Where ClawdyCalc keeps its archive (default `~/.clawdycalc`) |

</details>

## Wait, where did my old usage go?

Here's the thing nobody tells you: **Claude Code deletes your session logs after 30 days.** That's the default `cleanupPeriodDays` setting. So if you've been using it for a year, your logs only remember the last month, and any usage tracker will tell you that you've barely spent anything.

I found out the hard way. My first version said I'd spent about $400 total. I knew that was nonsense.

So ClawdyCalc goes digging:

1. **Session logs** (`~/.claude/projects`). Exact, message by message, but only the last 30 days.
2. **The `/stats` cache** (`~/.claude/stats-cache.json`). If you ever ran `/stats`, Claude Code saved exact per-model token totals for that window. Old data, recovered.
3. **Last-session totals** (`~/.claude.json`). Claude Code remembers the token usage of the last session in every project, even after the log is gone.
4. **Its own archive** (`~/.clawdycalc`). While ClawdyCalc is running, it copies every message it sees, so once it's tracked something, the data can't disappear on you.

For days where truly nothing survived, you can flip on **"Fill the gaps with an estimate"**. It uses your average daily spend from the days it does know about. It's clearly marked as an estimate, because it is one.

And to stop the bleeding, there's a **Keep logs forever** button that sets `cleanupPeriodDays` to 100 years. It backs up your settings file first. Or do it yourself in `~/.claude/settings.json`:

```json
{ "cleanupPeriodDays": 36500 }
```

## How the math works

Every message in the logs says which model answered and how many tokens went where. ClawdyCalc multiplies those by [Anthropic's API list prices](src/pricing.js):

- **Input** and **output** at each model's own rate
- **Cache writes** at 1.25× the input rate (5-minute cache) or 2× (1-hour cache)
- **Cache reads** at each model's cache-read rate (it's not the same multiplier for every model)
- **Fast mode** at 2×

Claude Code logs one line per chunk of a response, all with the same message ID, so ClawdyCalc dedupes by ID. Otherwise you'd count the same tokens three or four times and feel very rich in the wrong way.

> [!NOTE]
> These are estimates at list prices, not a bill. If you're on a subscription, you pay your plan price no matter what this says. Only Claude Code on this machine is counted. Chats on claude.ai don't write these logs.

## Is my data going anywhere?

Nope. The server listens on `127.0.0.1` only, has no telemetry, and never makes a network request except for loading the Google Fonts the page uses. It reads your files, does math, and shows you a page. That's all.

## Project layout

```
ClawdyCalc/
├── bin/clawdycalc.js        the CLI you run
├── src/
│   ├── server.js            tiny HTTP server + API
│   ├── sources/             where the numbers come from
│   │   ├── logs.js            session logs (exact)
│   │   ├── stats-cache.js     the /stats cache (recovered)
│   │   └── last-sessions.js   ~/.claude.json totals (recovered)
│   ├── ledger.js            ClawdyCalc's own archive
│   ├── report.js            merges everything, works out gaps + estimates
│   ├── pricing.js           the price list
│   └── demo.js              fake data for ?demo
├── public/                  the page (plain HTML/CSS/JS, no build step)
│   └── js/                  app.js, stage.js (the playground), sprites.js (the Clawds)
├── scripts/build-readme-art.js   generates the SVGs in this README
└── docs/                    README images
```

## Contributing

PRs are very welcome. Some ideas if you're looking for one:

- More hats! Every model deserves a look. Hats live in `public/js/sprites.js` as tiny pixel grids.
- A tray or menu-bar version
- Testing on macOS and Linux (I built it on Windows)
- More charts, like spend by hour of day

When a new model comes out, add it to `src/pricing.js` and give it a hat. If you change the sprites, run `npm run art` to regenerate the README art.

One rule: **no dependencies.** Keeping it zero-install is half the charm.

## License

[MIT](LICENSE). Do whatever you want, just don't blame me for what the number says.

<br>

<div align="center">
<sub>ClawdyCalc is an unofficial fan project. It isn't affiliated with or endorsed by Anthropic. Claude and Clawd belong to Anthropic. I just think they're neat.</sub>
</div>
