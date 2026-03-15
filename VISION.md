# OneMillionBeers — Project Vision

> *"A proper home for the world's most important collective mission."*

---

## 1. What Is This?

The **One Million Beers** challenge is a grassroots WhatsApp phenomenon. People join a group, post a photo every time they drink a beer, and add one to a shared tally. The goal: collectively reach one million beers — potentially a Guinness World Record for the largest group beer-drinking log.

It's a great idea held back by terrible tooling. Counting is manual and error-prone, analytics are non-existent, and there's no persistent identity or history for participants.

**OneMillionBeers** is the proper version of this. Same soul — casual, social, beer-forward — but with a real backend quietly running behind the WhatsApp groups people are already using.

---

## 2. Core Concept

The experience is frictionless by design:

1. Someone creates a WhatsApp group with their friends
2. They add the OneMillionBeers bot number to the group
3. That's it — everyone just sends photos of their beers as they always would
4. The bot silently collects every photo, identifies who sent it by their phone number, and logs it
5. All the data surfaces on a web dashboard that anyone can visit

**No commands. No setup. No learning curve.** The group carries on as normal — the bot is invisible until you go check the website.

The WhatsApp group is the input. The web platform is where the magic shows up.

---

## 3. The Grand Challenge

A single global mission runs at all times:

> **One Million Beers** — a collective world record attempt, open to everyone.

- Every beer logged in any OneMillionBeers group anywhere in the world counts toward the global tally
- The counter is live and public — anyone can watch it tick up
- When the million is hit: a verified, timestamped log of every single beer exists and can be submitted to Guinness World Records

This shared mission is the heartbeat of the platform. It's what makes logging a beer feel like it means something beyond your own group.

---

## 4. The WhatsApp Experience

### How It Works

Anyone can get started in under a minute:

1. Create a WhatsApp group (or use an existing one)
2. Add the OneMillionBeers number as a participant
3. Everyone in the group sends photos of their beers as they drink them — exactly as they do now in the existing One Million Beers groups
4. The bot logs each photo silently in the background

That's the entire user experience on WhatsApp. Nothing more.

---

## 5. The Web Dashboard

The website is where the data comes alive. Users visit it to see what the WhatsApp group can't show them.

### Global Page (`OneMillionBeers.app`)

- Giant live counter — current global beer total
- Progress bar toward 1,000,000
- Live feed of the most recent beer photos from around the world
- Global leaderboard — top contributors this week / all time
- Country leaderboard

### Group Page (`OneMillionBeers.app/g/[group-name]`)

Every OneMillionBeers group gets its own public page showing:
- Total beers logged by the group
- Progress toward whatever goal they set
- Leaderboard ranked by beers logged
- Photo feed — a scrollable wall of every beer the group has logged
- Github style contibution graph of group activity

### Personal Profile (`OneMillionBeers.app/u/[name]`)

Each participant gets a profile page showing:
- Total beers logged (all time, this month, this year)
- Current streak and longest streak
- Favourite day and time to drink
- Badges and milestones earned
- Which groups they belong to and their rank in each
- Their contribution to the global count
- A shareable **Beer Card** — a generated image summarising their stats, perfect for posting on social media

---

## 6. Gamification & Badges

Badges are earned automatically and shown on profiles. They give people something to chase and brag about.

| Badge | Trigger |
|---|---|
| **First Sip** | Log your first beer |
| **Round Buyer** | 10 beers |
| **Local Regular** | 50 beers |
| **Century Club** | 100 beers |
| **Half Thousand** | 500 beers |
| **The Thousand** | 1,000 beers |
| **Legendary** | 5,000 beers |
| **7-Day Streak** | A beer every day for a week |
| **30-Day Streak** | A beer every day for a month |
| **Early Riser** | A beer before 10am |
| **Night Owl** | A beer after 2am |
| **Globetrotter** | Beers logged from 5+ countries |
| **Milestone Hero** | Log the 10,000th / 100,000th / 1,000,000th global beer |
| **Founder** | Among the first 1,000 users on the platform |

---

## 7. Identity & Privacy

- Users are identified by their WhatsApp phone number — it is **never publicly displayed**
- Public profiles use a chosen display name only
- Photos are stored but users can delete their own logs at any time via the website
- Location is always opt-in — never assumed
- Users self-certify they are of legal drinking age in their country

---

## 10. Guiding Principles

1. **Zero friction** — A photo should be all it takes. The group carries on as normal
2. **Invisible infrastructure** — The bot does its job silently. The website is where the story gets told
3. **Social at the core** — Stats and leaderboards exist to create banter, not anxiety
4. **Trust first** — Assume good faith. Enforce verification at milestones only, not on every log
5. **Built to last** — Every beer logged now is a row in a database that exists when the record is broken

---

*Document status: Draft v0.2 — open for collaborative editing*
*Last updated: 2026-03-12*
