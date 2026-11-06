# The story: why Canopy Quest exists

## The brief

The **Centre of Excellence (CoE) for Nature Based Solutions** at Alliance University, Bengaluru, wanted to run a contest on campus:

> Students go around campus searching for different species of leaves and plants, and upload geotagged photos. A live leaderboard dashboard shows who's winning. Make it fun and interactive.

The event was the next day. Canopy Quest was designed, built and deployed in a single day (6 November 2026) to run it.

## Why nature-based solutions and a plant hunt fit together

Nature-based solutions use living systems (trees, green cover, wetlands, healthy soil) to deal with problems like urban heat, flooding, air quality and biodiversity loss. You can't protect or plan green cover you haven't mapped. A campus full of curious students with phones is a surprisingly good survey team, as long as what they collect can be trusted.

So the contest had two jobs at once:

1. **Get students outside and looking closely at the plants around them.** That needs it to be fun: a game, not a worksheet.
2. **Produce something useful for the CoE afterwards:** a record of which species grow where on campus, including the invasive ones.

## Why the obvious tools don't work

| The usual approach | What goes wrong |
|---|---|
| A Google Form with photo uploads | No way to check the species is right. No live scores. Someone tallies hundreds of rows by hand afterwards. |
| A WhatsApp group | Photos get lost in the chat. Scoring is guesswork. Nothing is structured. |
| "Upload a geotagged photo" from the gallery | Most phones and browsers **strip GPS data from photos when they're uploaded** (a privacy feature), so the location is usually gone. Gallery uploads also make it easy to reuse old photos or photos taken off campus. |
| Judges checking every photo | Doesn't scale to a hundred students uploading at once, and the leaderboard stalls while judges catch up. |
| A native app | iPhones can't install it outside the App Store, and nobody wants to install an app for one afternoon. |

## What Canopy Quest does differently

- **The location is captured by the site, not the photo.** When a student takes a picture, the site reads the phone's live GPS at that moment, refuses fuzzy fixes, checks the spot is inside the campus hunt zone, and burns a visible geotag stamp onto the image. The stamp isn't the proof; the server-side record is. But it makes every photo a self-describing field record.
- **The camera opens from inside the site.** Photos are taken live, not picked from the gallery.
- **An AI does the first pass, humans make the call.** Every photo goes to Pl@ntNet, a botanical identification service from French research institutes. If its top guesses match the species the student picked, points land instantly. If not, the photo goes to a judge queue with the AI's guess beside it, so judges only look at the doubtful ones.
- **It's a game first.** Rarity tiers, a First Finder bonus, timed WANTED bounties, a herbarium that fills in as you go, badges, a mascot, a projector dashboard with celebrations, and a frozen leaderboard that's revealed at the end.
- **The data is the leftover.** Every accepted find is a row with photo, species, coordinates, accuracy, time, AI confidence and nearest campus landmark. One click exports it as CSV or GeoJSON for mapping.

## Constraints that shaped every decision

| Constraint | What it forced |
|---|---|
| **One day to build, event the next morning** | Boring, proven parts. A single backend (Supabase) instead of several services. Reuse everything. A kill switch for the riskiest dependency (the AI). |
| **Free tiers only** | Vercel Hobby, Supabase free, Pl@ntNet's free quota (500 identifications a day), OpenStreetMap tiles. Photos compressed on the phone. Polling tuned to stay inside bandwidth limits. |
| **Every phone, no installs** | A mobile website opened from a QR code. Installable to the home screen, but it doesn't need to be. |
| **~100 students on one campus network** | Students sign in with student ID + PIN through our own server, not a hosted auth service, because hosted sign-up limits are per IP address and a whole campus shares a few. |
| **Patchy campus signal** | Photos that fail to upload are kept on the phone, with their original GPS and time, and retried automatically. |
| **Trust** | Every write goes through the server. Browsers can only read public game state. Cheating paths (fake locations, recycled photos, spamming, back-dating) each have a specific check. |

## How the day went

1. **Plan.** Turned the brief into a game design, a data model and a list of risks. Looked up the campus on OpenStreetMap to set a default hunt zone.
2. **Database.** Tables, scoring logic and public read functions in Postgres, plus a seeded list of common Bengaluru campus plants with riddles, facts and nature-based-solution tags.
3. **Server.** Join/login, teams, the photo pipeline (validate → AI → score → store), the judge queue and the admin panel, as Vercel functions.
4. **Screens.** The player app, judge queue, admin panel, projector dashboard and a printable QR poster.
5. **End-to-end test against the real database and AI.** The AI identified a neem photo at 97.5% confidence on the first try; a deliberately mislabelled photo went to the judges; off-campus and blurry-GPS uploads were refused.
6. **Design.** Mockups of seven screens in a cartoon field-guide style with a leaf mascot, Sprig. The whole app was then restyled to match.
7. **Deploy.** Server functions pinned to Mumbai, next to the database, so uploads don't cross the world.
8. **Campus landmarks.** OpenStreetMap only knows the campus outline, not its buildings (Learning Centres 1–3 and so on), so organisers got a satellite-view tool to drop named landmarks. Every find is now tagged "near LC 2".
9. **Checking the AI's vocabulary.** Every species was tested against the AI with reference photos. Three naming gaps were fixed (botanists rename plants more often than you'd think).
10. **A kill switch.** If the AI's daily quota runs out mid-event, one switch sends every photo to the judges and hides the "Ask the AI" option. The game keeps going.
11. **Load test.** A full-size event (100 players, 30 teams, 2,000 finds) simulated inside the database and rolled back: the leaderboard query took about 0.2 s.

## Decisions worth remembering

- **Capture GPS in the browser, never trust photo metadata.** It's the only way to get a location reliably across iPhone and Android, and it lets the server check accuracy and geofence at upload time.
- **AI plus judges beats either alone.** AI-only is fast but gameable and occasionally confidently wrong. Judges-only is accurate but slow and makes the leaderboard stall. Together: instant points for the clear cases, human eyes on the rest.
- **First Finder goes to whoever uploads first by server time,** not by the photo's timestamp, so it can't be back-dated.
- **No invented numbers.** It would have been easy to show "kg of CO₂ absorbed by the trees you found". Those figures would be made up, and this is a CoE event, so the stats are qualitative and countable instead: native species, pollinator plants, medicinal plants, invasive species reported.
- **Plan for the dependency you don't control.** The AI is the best part of the game and the one thing that could run out. It has a timeout, a graceful fallback, and a manual switch.

## Results

The first event is on **7 November 2026**. Results (players, finds, species recorded, what the inventory showed) will be added here afterwards.

## What could come next

- Season mode: keep the herbarium open all semester so the campus inventory keeps growing.
- Seasonal species (flowering trees only show up in certain months) and a "first flowering of the year" bounty.
- Heatmaps of where invasive species cluster, shared with campus maintenance.
- Letting the CoE add species straight from the judge queue when students find something not on the list.
