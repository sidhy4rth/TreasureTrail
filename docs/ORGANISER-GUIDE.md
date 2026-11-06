# Organiser guide

How to run a Canopy Quest event, from the night before to the prize ceremony. Everything below happens in the browser; nothing needs installing.

## Roles

| Role | How they get it | What they use |
|---|---|---|
| **Player** | Scan the QR poster and join | The player app |
| **Judge** | Join like a player, then enter the **judge code** on `/judge` | `/judge` on their phone |
| **Admin** | Join, then enter the **admin code** on `/judge` | `/admin` on a phone or laptop |

The judge and admin codes are set by whoever deployed the site. Share them only with organisers. Staff are left off the leaderboards and can test from anywhere (no hunt-zone or GPS checks).

## The day before

1. **Hunt times.** `/admin` → **Event**: set the start and end. Before the start, players can join and form teams but the camera stays locked. "Start now" and "End in 2 h" buttons are there for quick changes.
2. **Hunt zone.** Check the dashed circle covers the whole campus on the map preview. "Use my current location as centre" plus the radius slider fixes it. Keep the GPS accuracy limit around 80 m unless phones are struggling.
3. **Landmarks.** `/admin` → **Campus landmarks**: tap each building on the satellite view, name it (quick buttons for LC 1, LC 2, LC 3, Library, Cafe, Gate, Hostel, Ground, Audi, Admin), and save. For best accuracy, stand at the building and tap **Pin where I'm standing**. Finds are then tagged "near LC 2" everywhere.
4. **Species.** `/admin` → **Species**: switch off any plant that definitely doesn't grow on campus, adjust rarities, or add new ones (an alternative scientific name in "match names" helps the AI recognise it).
5. **Dry run.** Join from two phones (ideally an iPhone and an Android), make a team, snap a few plants, approve one in `/judge`, and watch it on `/live`.
6. **Wipe the test data.** `/admin` → **Danger zone** → type `RESET`. This deletes all players, teams, finds and bounties. Staff accounts, species, landmarks and settings stay.
7. **Print the poster.** `/poster` is an A4 page with the QR code, the three-step how-to and the scoring table.

## On the day

**Setup**
- Open `/live` on the projector laptop and press **F** for fullscreen.
- Put posters at the entrance and at a few landmarks.
- Judges open `/judge` on their phones and keep it open; it refreshes itself.

**Briefing for players (30 seconds)**
- Scan, join with your student ID, pick a 4-digit PIN, and remember it.
- Teams of up to 4, or play solo. Solo scores always count.
- Get close: one leaf or flower filling the frame. Wait for the green GPS chip.
- Not sure what it is? Tap "Ask Sprig".
- First on campus to find a species gets +50%. Watch for WANTED bounties.

**During the hunt**
- **Judging.** Work the queue top to bottom. Approve when the photo clearly shows the claimed species, reject blurry or wrong ones (add a short note; the player sees it), and use **Change species** when the player was close but wrong. Watch for the red "Same photo as another player" flag.
- **Bounties.** Every 15–20 minutes, launch a WANTED bounty from `/admin` → Live controls (×2 for 10–15 minutes works well). Pick a species nobody has found yet to send people somewhere new.
- **Freeze.** About 10–15 minutes before the end, press **Freeze board**. Scores go hidden on phones and the projector while everyone keeps hunting.

**If the plant AI stops working**

The AI has a free daily limit. If it runs out or misbehaves, uploads don't break: photos simply go to the judges. To make the switch cleanly, use `/admin` → Live controls → **Plant AI** → "Switch to judges only". Phones hide "Ask Sprig" and tell players judges are checking by hand. Turn it back on the same way.

**Other hiccups**

| Problem | Fix |
|---|---|
| "Location is blocked" | iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using. Android: tap the lock icon in the address bar → Permissions → Location. Then reload. |
| "GPS is too fuzzy" | Step out from under buildings and trees and wait a few seconds. If everyone has this, raise the accuracy limit in `/admin`. |
| "Outside the campus hunt zone" | The student is outside the circle, or the circle is too small. Check it on `/admin`. |
| Forgot PIN | `/admin` → Players → **PIN** next to their name → type a new 4-digit PIN. |
| No signal | Nothing to do. The find is saved on the phone and uploads itself when the signal returns. |

## The finish

1. Clear the judge queue so pending finds are counted.
2. Press **Reveal results**. The projector counts down the teams from 5th to 1st and fires confetti on the winner. Press **R** on the projector to replay it.
3. The Solo board (toggle on the projector, or `/board` on any phone) gives individual prizes.

## Afterwards

`/admin` → **Campus plant inventory** → download **CSV** and **GeoJSON**. Every accepted find with species, coordinates, GPS accuracy, nearest landmark, time, player, team, photo link and the AI's confidence. The GeoJSON opens directly in QGIS, Google My Maps or geojson.io for a map of what grows where on campus, including where invasive species were spotted.
