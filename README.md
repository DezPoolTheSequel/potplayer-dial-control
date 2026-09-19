# PotPlayer Dial Control

A Stream Deck+ plugin that controls [PotPlayer](https://potplayer.daum.net/) directly from a dial —
in the background, without stealing focus from whatever you're doing (gaming, coding, etc.), and
without needing any hotkeys configured inside PotPlayer.

It talks to PotPlayer's window directly via Windows messages (an undocumented but well-established
protocol used by several community remote-control tools), which is why it works even while PotPlayer
isn't focused. **Windows only** — PotPlayer doesn't exist on other platforms.

## Features

- Assign any of PotPlayer's playback/volume/seek/speed/interface commands to each of the dial's 9
  gestures (rotate, hold+rotate, press, hold, double-press, touch, touch-hold) — no hotkeys required.
- A "Custom PotPlayer Command ID" option for anything not in the built-in list.
- A "Custom OS Hotkey" fallback for the rare case you want to trigger something outside PotPlayer.
- Live feedback on the dial's screen: current volume (or "Muted") and elapsed/total playback time,
  each with their own progress bar and configurable color.

## Requirements

- Windows 10+
- [Stream Deck+](https://www.elgato.com/stream-deck-plus) (this plugin only targets the dial/encoder)
- [PotPlayer](https://potplayer.daum.net/) installed and running
- [Node.js](https://nodejs.org/) 20+

## Setup

```sh
git clone https://github.com/DezPoolTheSequel/potplayer-dial-control.git
cd potplayer-dial-control
npm install
npm run build
```

Then enable Stream Deck's developer mode (one-time) and link the plugin so Stream Deck picks it up:

```sh
npx streamdeck dev
npx streamdeck link com.desmond-harris.potplayer-dial-control.sdPlugin
```

Add the "Dial Control" action to a Stream Deck+ dial from the "PotPlayer Dial Control" category, and
configure each gesture from its property inspector.

While actively editing the code, use `npm run watch` instead — it rebuilds on save and restarts the
plugin automatically.

## How it works

PotPlayer accepts two kinds of Windows messages on its main window handle, regardless of whether it's
focused or minimized:

- `WM_COMMAND` (0x0111) — fires one of PotPlayer's built-in command IDs (play, seek, volume step, etc).
- A private `WM_USER` (0x0400) sub-protocol for reading/writing state: volume, playback position,
  duration, and play/pause/stop status.

See [src/lib/potplayer.ts](src/lib/potplayer.ts) and
[src/lib/potplayer-commands.ts](src/lib/potplayer-commands.ts) for the implementation. Because this
protocol is undocumented by PotPlayer's developer, a future PotPlayer update could change or break it.

## License

Do whatever you want with it.
