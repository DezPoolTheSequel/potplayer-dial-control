/**
 * PotPlayer WM_COMMAND ids. These map to entries in PotPlayer's own
 * Preferences > Hotkeys list, but are fired directly via PostMessage instead
 * of relying on a global OS hotkey being bound inside PotPlayer, so they work
 * even while some other window has focus. Cross-checked against two
 * independent community implementations (an AutoHotkey library and Unified
 * Remote's PotPlayer driver).
 */
export const POTPLAYER_COMMANDS = {
  playPause: { label: "Play / Pause", id: 10014 },
  play: { label: "Play", id: 20001 },
  pause: { label: "Pause", id: 20000 },
  stop: { label: "Stop", id: 20002 },
  next: { label: "Next", id: 10124 },
  previous: { label: "Previous", id: 10123 },
  volumeUp: { label: "Volume Up", id: 10035 },
  volumeDown: { label: "Volume Down", id: 10036 },
  toggleMute: { label: "Toggle Mute", id: 10037 },
  seekFwd5: { label: "Seek +5s", id: 10060 },
  seekBack5: { label: "Seek -5s", id: 10059 },
  seekFwd30: { label: "Seek +30s", id: 10062 },
  seekBack30: { label: "Seek -30s", id: 10061 },
  seekFwd60: { label: "Seek +1m", id: 10064 },
  seekBack60: { label: "Seek -1m", id: 10063 },
  seekFwd300: { label: "Seek +5m", id: 10066 },
  seekBack300: { label: "Seek -5m", id: 10065 },
  speedUp: { label: "Playback Speed Up", id: 10248 },
  speedDown: { label: "Playback Speed Down", id: 10247 },
  speedNormal: { label: "Playback Speed Normal (1x)", id: 10246 },
  toggleSubs: { label: "Toggle Subtitles", id: 10126 },
  toggleOsd: { label: "Toggle OSD", id: 10351 },
  togglePlaylist: { label: "Toggle Playlist", id: 10011 },
  toggleControl: { label: "Toggle Control Bar", id: 10383 },
  toggleFullscreen: { label: "Toggle Fullscreen", id: 10013 },
  screenshot: { label: "Screenshot / Capture", id: 10224 },
} as const;

export type PotPlayerCommandName = keyof typeof POTPLAYER_COMMANDS;

/** Special, non-command action values a gesture can be assigned. */
export const NONE_ACTION = "none";
export const CUSTOM_COMMAND_ACTION = "customCommand";
export const CUSTOM_HOTKEY_ACTION = "customHotkey";

export function isPotPlayerCommandName(value: unknown): value is PotPlayerCommandName {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(POTPLAYER_COMMANDS, value);
}
