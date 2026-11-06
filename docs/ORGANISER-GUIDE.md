# Organiser guide

How to run a TREASURE TRAIL event, from the night before to the results. Everything happens in the browser; nothing needs installing. Main address: **https://treasure-trail-au.vercel.app**

## Roles

| Role | How they get it | What they use |
|---|---|---|
| **Player** | Scan the QR poster and join | The player app |
| **Judge** | Join like a player, then enter the **judge code** on `/judge` | `/judge` on their phone |
| **Admin** | Join, then enter the **admin code** on `/judge` | `/admin` on a phone or laptop |

The judge and admin codes are set by whoever deployed the site. Share them only with organisers. Staff are left off the leaderboards and can test from anywhere (no trail-zone or GPS checks).

## The day before

1. **Trail times.** `/admin` → **Event**: set the start and end. Before the start, players can join and form crews, but the camera stays locked. The **Start now** and **End in 2 h** buttons are there for quick changes.
2. **Trail zone.** Check the dashed circle covers the whole campus on the map preview. **Use my current location as centre** plus the radius slider fixes it. Keep the GPS accuracy limit around 80 m unless phones are struggling.
3. **Landmarks.** `/admin` → **Campus landmarks**: tap each building on the satellite view, name it (quick buttons for LC 1, LC 2, LC 3, Library, Cafe, Gate, Hostel, Ground, Audi, Admin), and save. For best accuracy, stand at the building and tap **Pin where I'm standing**. Finds are then tagged "near LC 2" everywhere. The CoE headquarters (**AB 001**) is already on the map as a featured building.
4. **Species.** `/admin` → **Species**: switch off any plant that definitely doesn't grow on campus, adjust rarities, or add new ones (an alternative scientific name in "match names" helps the AI recognise it).
5. **Dry run.** Join from two phones (ideally an iPhone and an Android), make a crew, snap a few plants, approve one in `/judge`, and watch it appear on `/live`.
6. **Wipe the test data.** `/admin` → **Danger zone** → type `RESET`. This deletes all players, crews, finds and bounties. Staff accounts, species, landmarks and settings stay. Also delete any leftover test staff accounts from **Players**.
7. **Print the poster.** Open `/poster` **from the address you want students to use** (the QR code points to whichever address you open it on) and print it on A4. It has the QR code, the three steps, Elegant's intro and the scoring.

## On the day

**Setup**
- Open `/live` on the projector laptop and press **F** for fullscreen.
- Put posters at the entrance and at a few landmarks.
- Judges open `/judge` on their phones and keep it open; it refreshes itself.

**Briefing for players (30 seconds)**
- Scan, join with your student ID, pick a 4-digit PIN, and remember it.
- Crews of up to 4, or go solo. Solo scores always count.
- Get close: one leaf or flower filling the frame. Wait for the GPS chip to turn lime.
- Not sure what it is? Tap **Ask Elegant**.
- First on campus to snap a species gets +50%. Watch for bounties.

**During the trail**
- **Judging.** Work the queue top to bottom. Approve when the photo clearly shows the claimed species. Reject blurry or wrong ones and add a short note; the player sees it. Use **Change species** when the player was close but wrong. Watch for the "Same photo as another player" flag.
- **Bounties.** Every 15–20 minutes, launch a bounty from `/admin` → **Live controls** → **Bounty** (×2 for 10–15 minutes works well). Pick a species nobody has found yet to send people somewhere new.
- **Freeze.** About 10–15 minutes before the end, press **Freeze board**. Scores go hidden on phones and the projector while everyone keeps snapping.

**If the plant AI stops working**

The AI has a free daily limit. If it runs out or misbehaves, uploads don't break: photos simply go to the judges. To switch cleanly, use `/admin` → **Live controls** → **Plant AI** → **Switch to judges only**. Phones hide "Ask Elegant" and tell players judges are checking by hand. **Turn the AI back on** the same way.

**Other hiccups**

| Problem | Fix |
|---|---|
| "Location is blocked" | iPhone: Settings → Privacy & Security → Location Services → Safari Websites → While Using. Android: tap the lock icon in the address bar → Permissions → Location. Then reload. |
| "GPS is too fuzzy" | Step out from under buildings and trees and wait a few seconds. If everyone has this, raise the accuracy limit in `/admin`. |
| "Outside the campus trail zone" | The student is outside the circle, or the circle is too small. Check it on `/admin`. |
| Forgot PIN | `/admin` → **Players** → **PIN** next to their name → type a new 4-digit PIN. |
| No signal | Nothing to do. The find is saved on the phone and uploads itself when the signal returns. |

## The finish

1. Clear the judge queue so pending finds are counted.
2. Press **Reveal results**. The projector counts down the crews from 5th to 1st and fires confetti on the winner. Press **R** on the projector to replay it.
3. For individual prizes, use the Solo board (the projector switches between Crews and Solo, or open Ranks on any phone).

## Afterwards

`/admin` → **Campus plant inventory** → download **CSV** and **GeoJSON**. You get every accepted find with species, coordinates, GPS accuracy, nearest landmark, time, player, crew, photo link and the AI's confidence. The GeoJSON opens directly in QGIS, Google My Maps or geojson.io for a map of what grows where on campus, including where invasive species were spotted.
