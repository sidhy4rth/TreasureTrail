# The story: why TREASURE TRAIL exists

## The brief

**Leave the Class** is a series at Alliance University, Bengaluru, named by a professor, about getting students out of the classroom and onto campus. For one of its events, the organisers wanted a contest:

> Students go around campus searching for different species of leaves and plants, and upload geotagged photos. A live leaderboard dashboard shows who's winning. Make it fun and interactive.

The event was the next day. TREASURE TRAIL was designed, built, redesigned and deployed in a single day (6 November 2026) to run it.

## Two jobs at once

1. **Get students outside and looking closely at the plants around them.** That needs it to be fun: a game, not a worksheet.
2. **Leave something useful behind:** a record of which species grow where on campus, including the invasive ones. You can't look after green cover you haven't mapped, and a campus full of curious students with phones is a surprisingly good survey team, as long as what they collect can be trusted.

## Why the obvious tools don't work

| The usual approach | What goes wrong |
|---|---|
| A form with photo uploads | No way to check the species is right. No live scores. Someone tallies hundreds of rows by hand afterwards. |
| A WhatsApp group | Photos get lost in the chat. Scoring is guesswork. Nothing is structured. |
| "Upload a geotagged photo" from the gallery | Most phones and browsers **strip GPS data from photos when they're uploaded** (a privacy feature), so the location is usually gone. Gallery uploads also make it easy to reuse old photos or ones taken off campus. |
| Judges checking every photo | Doesn't scale to a hundred students uploading at once, and the leaderboard stalls while judges catch up. |
| A native app | iPhones can't install it outside the App Store, and nobody installs an app for one afternoon. |

## What TREASURE TRAIL does differently

- **The location is captured by the site, not the photo.** When a student takes a picture, the site reads the phone's live GPS at that moment, refuses fuzzy fixes, checks the spot is inside the campus trail zone, and burns a visible geotag stamp onto the image. The stamp isn't the proof; the server-side record is. But it makes every photo a self-describing field record.
- **The camera opens from inside the site.** Photos are taken live, not picked from the gallery.
- **An AI does the first pass, humans make the call.** Every photo goes to Pl@ntNet, a botanical identification service from French research institutes. If its top guesses match the species the student picked, points land instantly. If not, the photo goes to a judge queue with the AI's guess beside it, so judges only look at the doubtful ones.
- **It's a game first.** Three rarity tiers, a First Finder bonus, timed bounties, a Snap Nature collection that fills in as you go, badges, a guide called Elegant, a projector dashboard with celebrations, and a frozen leaderboard revealed at the end.
- **The data is the leftover.** Every accepted find is a row with photo, species, coordinates, accuracy, time, AI confidence and nearest campus landmark. One click exports it as CSV or GeoJSON.

## Constraints that shaped every decision

| Constraint | What it forced |
|---|---|
| **One day to build, event the next morning** | Boring, proven parts. One backend (Supabase) instead of several services. A kill switch for the riskiest dependency (the AI). |
| **Free tiers only** | Vercel Hobby, Supabase free, Pl@ntNet's free quota (500 identifications a day), OpenStreetMap tiles. Photos compressed on the phone. Shared data cached at the edge. |
| **Every phone, no installs** | A mobile website opened from a QR code. Installable to the home screen, but it doesn't need to be. |
| **~100 students on one campus network** | Students sign in with registration number + PIN through our own server, not a hosted auth service, because hosted sign-up limits are per IP address and a whole campus shares a few. |
| **Cheap phones and patchy signal** | Compositor-only animations, no screen redraws when nothing changed, and photos that fail to upload are kept on the phone (with their original GPS and time) and retried automatically. |
| **Trust** | Every write goes through the server. Browsers can only read public game state. Each way of cheating (fake locations, recycled photos, spamming, back-dating) has its own check. |

## How the day went

1. **Plan.** Turned the brief into a game design, a data model and a list of risks. Looked up the campus on OpenStreetMap to set a default trail zone.
2. **Database.** Tables, scoring logic and public read functions in Postgres, plus a seeded list of common Bengaluru campus plants with riddles, facts and biodiversity tags.
3. **Server.** Join/login, crews, the photo pipeline (validate → AI → score → store), the judge queue and the admin panel, as Vercel functions.
4. **Screens.** The player app, judge queue, admin panel, projector dashboard and a printable QR poster.
5. **End-to-end test against the real database and AI.** The AI identified a neem photo at 97.5% confidence on the first try. A deliberately mislabelled photo went to the judges. Off-campus and blurry-GPS uploads were refused.
6. **First design and deploy:** a cartoon field-guide look with a leaf mascot, and server functions pinned to Mumbai next to the database.
7. **Campus landmarks.** OpenStreetMap only knows the campus outline, not its buildings, so organisers got a satellite-view tool to drop named landmarks. Every find is tagged "near LC 2" and so on.
8. **Checking the AI's vocabulary.** Every species was tested against the AI with reference photos, and three naming gaps were fixed.
9. **A kill switch.** If the AI's daily quota runs out mid-event, one switch sends every photo to the judges and hides "Ask Elegant". The game keeps going.
10. **The review.** The teacher in charge looked at it and called the cartoon interface "school-level": it needed to feel cool, minimal and made for college students. That evening:
    - **Renamed** to **TREASURE TRAIL**, always in capitals, with no "hunt" wording anywhere, and placed under the **Leave the Class** banner.
    - **The mascot became Elegant**, a leaf in a monocle. *Ele* (ಎಲೆ) is Kannada for leaf.
    - **"Herbarium" became Snap Nature**, and teams became crews.
    - **Eight design directions** were mocked up side by side. **After Dark** won (dark, neon-lime, big type), and the background was moved to **forest green**.
    - **The whole app was rebuilt** in that style the same night.
    - **Scoring was simplified** from four rarity tiers to three: Common 10, Rare 25, Legendary 50, plus +50% for being first on campus.
11. **The CoE headquarters on the map.** The Centre of Excellence for Nature Based Solutions (room AB 001) is drawn as a to-scale sketch of its octagonal building, traced from satellite imagery, with a small floating tag and a legend.
12. **Load prep.** Shared data (leaderboards, feed, map, species) moved behind Vercel's edge cache, so a hundred phones cost the database one query every few seconds. The heaviest per-player query went from 110 ms to 2 ms. Animations were reduced to ones phones can run smoothly.

## Decisions worth remembering

- **Capture GPS in the browser, never trust photo metadata.** It's the only reliable way to get a location across iPhone and Android, and it lets the server check accuracy and geofence at upload time.
- **AI plus judges beats either alone.** AI-only is fast but gameable and occasionally confidently wrong. Judges-only is accurate but slow, and the leaderboard stalls. Together: instant points for clear cases, human eyes on the rest.
- **First Finder goes to whoever uploads first by server time,** not by the photo's timestamp, so it can't be back-dated.
- **No invented numbers.** It would have been easy to show "kg of CO₂ absorbed by the trees you found". Those figures would be made up, so the stats are qualitative and countable: native species, pollinator plants, medicinal plants, invasive species reported.
- **Plan for the dependency you don't control.** The AI is the best part of the game and the one thing that could run out. It has a timeout, a graceful fallback, and a manual switch.
- **Listen to the review.** The first design worked but didn't fit its audience. Mocking eight directions at once made the choice fast, and building the colours as variables made the switch to green a one-line change.

## Results

The first trail runs on **7 November 2026**. Results (players, finds, species recorded, what the inventory showed) will be added here afterwards.

## What could come next

- Season mode: keep Snap Nature open all semester so the campus inventory keeps growing.
- Seasonal species (flowering trees appear in certain months) and a "first bloom of the year" bounty.
- Heatmaps of where invasive species cluster, shared with campus maintenance.
- Letting organisers add species straight from the judge queue when students find something not on the list.
