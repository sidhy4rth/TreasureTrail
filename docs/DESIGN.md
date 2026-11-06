# Design

## How the look was chosen

The first version was a cartoon field guide: thick outlines, sunny colours and a leaf mascot. It worked, but the teacher in charge called it "school-level". Students at a university wanted something **cool, minimal and made for them**.

So eight directions were mocked up side by side, all on the same home screen with the same content, so the only thing being compared was style:

| # | Direction | Idea |
|---|---|---|
| 01 | Field Notes | Editorial magazine: serif type, hairlines, a numbered species index |
| **02** | **After Dark** | **Dark, one neon-lime accent, huge numbers, like a fitness or music app** |
| 03 | Swiss Index | White, black and orange brutalist catalogue |
| 04 | Riso Zine | Risograph club poster, pink and teal duotone |
| 05 | Trailhead | Outdoor trail app: topo lines, species as checkpoints |
| 06 | Glass | Frosted glass over a full-screen plant photo |
| 07 | Film Roll | Disposable camera with film strips and a shutter button |
| 08 | Collectible | Each find is a numbered trading card |

**After Dark** was picked, with one change: the near-black background became **forest green**. Three greens were compared (forest, emerald, moss) and forest won.

<p align="center">
  <img src="screens/join.png" width="24%" alt="Join">
  <img src="screens/journal.png" width="24%" alt="Trail home">
  <img src="screens/board.png" width="24%" alt="Ranks">
  <img src="screens/team.png" width="24%" alt="Crew">
</p>

## Tokens

Every colour is a CSS variable, which is why changing the background to green was a one-line edit.

| Token | Value | Use |
|---|---|---|
| `--bg` | `#10241A` | Forest-green background |
| `--surface` / `--surface-2` | `#183224` / `#142B1F` | Cards and panels |
| `--border` / `--border-2` | `#24402F` / `#33543F` | Hairline borders |
| `--lime` | `#C8FF2E` | The single accent: primary buttons, the score ring, live dots, your pins |
| `--text` / `--muted` | `#F2F5EF` / `#9AA39A` | Body text and labels (both pass 4.5:1 on the background) |
| `--warn` / `--danger` | `#FFC24D` / `#FF7A59` | Waiting for a judge, errors |
| Rarity | `#9AA39A` · `#7DB3FF` · `#F5C451` | Common · rare · legendary (gold) |

**Type:** Geist for everything, Geist Mono for numbers, codes, timers and small caps labels, and Noto Sans Kannada just for ಎಲೆ. Text on lime is always near-black, never white.

**Name:** always **TREASURE TRAIL** in capitals, under a spaced-out **LEAVE THE CLASS** kicker.

## Elegant

<p align="center"><img src="../public/favicon.svg" width="120" alt="Elegant: a leaf wearing a monocle"></p>

The guide is a leaf wearing a monocle. **ELE·gant**: *ele* (ಎಲೆ) is Kannada for leaf. It's drawn as a single inline SVG in `currentColor`, so it takes whatever colour it's placed in (lime on green almost everywhere), and it has small mood variations: wave, think (when the AI is working), cheer (when points land) and snap (viewfinder corners). It's also the favicon and the home-screen icon.

## Signature pieces

- **Score and ring:** a huge Geist score with a lime ring showing species snapped out of 58, and a three-up strip for solo rank, first finds and crew.
- **Snap Nature:** snapped species as photo tiles tagged 1ST, JUDGING or ×2; locked ones as dashed tiles with ??? and their rarity, legendary ones edged in gold.
- **Bounty card:** a dark card with the species photo, a mono countdown and a big lime ×2.
- **Snap button:** a glowing lime pill in the middle of the bottom bar: Trail · Ranks · Snap · Map · Crew.
- **Camera:** a dark viewfinder with lime corner brackets and a GPS chip that's lime when locked, amber while waiting and coral when something's wrong.
- **Reward:** a big lime "+points", a FIRST ON CAMPUS tag, your photo in a clean frame, Elegant's speech bubble and the unlocked fact.
- **Geotag stamp:** a dark-green band burned into every photo with the species, lime coordinates, time, player and crew, and "TREASURE TRAIL · LEAVE THE CLASS".
- **Dark map:** OpenStreetMap tiles inverted into the theme, with dark pins (lime for yours, gold for first finds) and small signboards for landmarks.
- **The CoE headquarters:** room AB 001 is drawn as a lime pencil-style sketch of its octagonal building, traced from satellite imagery and placed at real-world size, so it grows as you zoom. It has a slow radar ring, a small floating **AB 001** tag with Elegant flipping inside it, and a legend in the map's corner, so the map stays uncluttered.
- **Projector:** the same language at 1920×1080, with big Geist numbers, a pulsing LIVE dot, crew ranks with the leader in lime, a "Just found" feed and a dark ticker with a lime DID YOU KNOW label.
- **Poster:** a print-friendly version: a white A4 page with a forest-green header band, a big QR code and small lime accents, so it doesn't waste ink.

## Motion

Small and purposeful, and cheap to run: everything animates only `transform` and `opacity`, so it stays smooth on low-end phones.

- live dots ping
- points pop in
- confetti in lime, white and green
- new pins drop onto the map
- rank rows slide when positions change
- Elegant bobs while the AI thinks
- the HQ tag floats and its radar ring pulses

All of it stops when the phone asks for reduced motion.
