# OneMillionBeers — Product Vision

> Last updated: 2026-03-16

---

## 1. Elevator Pitch

OneMillionBeers is a platform that sits invisibly behind WhatsApp groups. A bot joins the group, silently logs every beer photo posted, and surfaces the data on a public web dashboard. The goal: collectively reach one million beers across all groups worldwide — a verifiable, timestamped world record attempt. Users do nothing differently. The group carries on as normal. The platform does the rest.

---

## 2. The Problem

The One Million Beers challenge already exists as a grassroots WhatsApp phenomenon. People join a group, post a photo every time they drink a beer, and add one to a shared tally. The concept is solid. The tooling is not:

- Counting is manual and error-prone
- There are no persistent stats, streaks, or history
- Participants have no identity or profile beyond a phone number
- There is no shared mission connecting groups to each other

OneMillionBeers is the proper version. Same soul — casual, social, beer-forward — built on infrastructure that makes the data mean something.

---

## 3. How It Works

The user journey has three steps:

1. **Create or use an existing WhatsApp group** — add the OneMillionBeers bot number as a participant. That is the entire setup.
2. **Everyone sends beer photos as normal** — the bot logs each photo silently. No commands, no replies, no learning curve.
3. **Visit the website** — see the group's stats, the global counter, leaderboards, and individual profiles.

The WhatsApp group is the input. The web platform is where the data surfaces.

---

## 4. The Grand Challenge

A single global mission runs at all times:

> **One Million Beers** — a collective world record attempt, open to every group.

- Every beer logged in any OneMillionBeers group anywhere in the world counts toward the global tally
- The counter is live and public — anyone can watch it tick up in real time
- When the million is reached: a complete, timestamped log of every beer exists and can be submitted to Guinness World Records

This shared mission is the heartbeat of the platform. It makes logging a beer feel like it contributes to something beyond the group.

---

## 5. Key Features

### Global Dashboard (`onemillionbeers.app`)

- Live counter — current global beer total with progress toward 1,000,000
- Live feed of the most recent beer photos from around the world
- Global leaderboard — top contributors this week and all time
- Country leaderboard

### Group Page (`onemillionbeers.app/g/[slug]`)

Every connected WhatsApp group gets a public page showing:
- Total beers logged and progress toward a group goal
- Leaderboard ranked by beers logged
- Scrollable photo feed of every beer the group has logged
- Contribution graph showing group activity over time (GitHub-style heatmap)

### Personal Profile (`onemillionbeers.app/u/[slug]`)

Each participant gets a profile page showing:
- Total beers logged — all time, this month, this year
- Current streak and longest streak
- Favourite day and time to drink
- Personal contribution to the global count

### Beer Logging

- Triggered entirely by posting a photo in a connected WhatsApp group
- No commands, no keywords, no confirmation messages from the bot
- The bot is invisible in the group

---

## 6. Identity and Privacy

- Users are identified by their WhatsApp phone number — it is **never publicly displayed** and never stored in plaintext (SHA-256 hash only)
- Users can delete their own beer logs at any time via the website

---

## 7. Product Principles

1. **Zero friction** — A photo should be all it takes. The group carries on exactly as it would without the bot.
2. **Invisible infrastructure** — The bot does its job silently. The website is where the story gets told.
3. **Social at the core** — Stats and leaderboards exist to create banter and shared pride, not competition anxiety.
4. **Trust first** — Assume good faith
5. **Built to last** — Every beer logged now is a row in a database that exists when the record is broken.
6. **MVP first** — Ship the core loop. Add complexity only when a real problem at real scale demands it.
