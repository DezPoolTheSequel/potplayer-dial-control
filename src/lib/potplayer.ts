import koffi, { type LibraryHandle } from "koffi";

/**
 * PotPlayer accepts two kinds of Windows messages on its main window handle,
 * regardless of whether it's focused, minimized, or sitting behind a
 * fullscreen game — this is standard Win32 SendMessage/PostMessage behavior,
 * it does not require the target window to be foreground:
 *
 *  - WM_COMMAND (0x0111): fire one of PotPlayer's ~thousand menu/hotkey
 *    command IDs (play, seek, volume step, toggle mute, etc). One-way, so we
 *    PostMessage it.
 *  - A private WM_USER (0x0400) sub-protocol for reading/writing state:
 *    volume, position, duration, and play/pause/stop status. Two-way (the
 *    return value carries the answer), so we SendMessage it.
 *
 * Neither is officially documented by Daum, but both are exercised by
 * several long-running community remote-control tools (Unified Remote's
 * PotPlayer driver, various AutoHotkey libraries), and the command/status
 * codes below were cross-checked against two independent implementations
 * and confirmed live against a running PotPlayer instance.
 */

const WM_COMMAND = 0x0111;
const WM_USER_POT = 0x0400;

const POT = {
  GET_VOLUME: 0x5000,
  SET_VOLUME: 0x5001,
  GET_TOTAL_TIME: 0x5002,
  GET_CURRENT_TIME: 0x5004,
  SET_CURRENT_TIME: 0x5005,
  GET_PLAY_STATUS: 0x5006,
  SET_PLAY_STATUS: 0x5007,
} as const;

export enum PlayStatus {
  Stopped = -1,
  Paused = 1,
  Running = 2,
}

// Class name changed at some point around PotPlayer's 64-bit transition;
// try both so this works across versions.
const WINDOW_CLASS_NAMES = ["PotPlayer64", "PotPlayer"];

type KoffiFn = (...args: any[]) => any;

let user32: LibraryHandle | null = null;
let FindWindowW: KoffiFn | null = null;
let IsWindow: KoffiFn | null = null;
let SendMessageW: KoffiFn | null = null;
let PostMessageW: KoffiFn | null = null;

function ensureBindings(): boolean {
  if (user32) return true;
  if (process.platform !== "win32") return false;

  try {
    user32 = koffi.load("user32.dll");
    FindWindowW = user32.func("void *FindWindowW(str16 lpClassName, str16 lpWindowName)");
    IsWindow = user32.func("bool IsWindow(void *hWnd)");
    SendMessageW = user32.func(
      "intptr_t SendMessageW(void *hWnd, uint32_t Msg, uintptr_t wParam, intptr_t lParam)"
    );
    PostMessageW = user32.func(
      "bool PostMessageW(void *hWnd, uint32_t Msg, uintptr_t wParam, intptr_t lParam)"
    );
    return true;
  } catch (err) {
    console.error("[potplayer] Failed to load user32.dll bindings:", err);
    user32 = null;
    return false;
  }
}

let cachedHwnd: unknown = null;

/** Finds (and caches) PotPlayer's main window handle. Returns null if it isn't running. */
function findWindow(): unknown {
  if (!ensureBindings() || !FindWindowW || !IsWindow) return null;

  if (cachedHwnd !== null && IsWindow(cachedHwnd)) {
    return cachedHwnd;
  }

  for (const className of WINDOW_CLASS_NAMES) {
    const hwnd = FindWindowW(className, null);
    if (hwnd) {
      cachedHwnd = hwnd;
      return hwnd;
    }
  }

  cachedHwnd = null;
  return null;
}

export function isRunning(): boolean {
  return findWindow() !== null;
}

function queryState(sub: number, param = 0): number | null {
  const hwnd = findWindow();
  if (!hwnd || !SendMessageW) return null;
  try {
    return Number(SendMessageW(hwnd, WM_USER_POT, sub, param));
  } catch (err) {
    console.error(`[potplayer] SendMessage(0x${sub.toString(16)}) failed:`, err);
    return null;
  }
}

/** Fire-and-forget a WM_COMMAND (play/pause/seek/volume-step/etc). */
export function sendCommand(commandId: number): void {
  const hwnd = findWindow();
  if (!hwnd || !PostMessageW) return;
  try {
    PostMessageW(hwnd, WM_COMMAND, commandId, 0);
  } catch (err) {
    console.error(`[potplayer] PostMessage(command ${commandId}) failed:`, err);
  }
}

/** Current volume, 0-100 (0 if muted), or null if PotPlayer isn't running. */
export function getVolume(): number | null {
  return queryState(POT.GET_VOLUME);
}

/** Sets absolute volume, 0-100. */
export function setVolume(volume: number): void {
  const hwnd = findWindow();
  if (!hwnd || !SendMessageW) return;
  const clamped = Math.max(0, Math.min(100, Math.round(volume)));
  SendMessageW(hwnd, WM_USER_POT, POT.SET_VOLUME, clamped);
}

/** Current playback position in milliseconds, or null if unavailable. */
export function getCurrentTimeMs(): number | null {
  return queryState(POT.GET_CURRENT_TIME);
}

/** Total media duration in milliseconds, or null if unavailable. */
export function getTotalTimeMs(): number | null {
  return queryState(POT.GET_TOTAL_TIME);
}

/** Seeks to an absolute position in milliseconds. */
export function seekTo(ms: number): void {
  const hwnd = findWindow();
  if (!hwnd || !SendMessageW) return;
  SendMessageW(hwnd, WM_USER_POT, POT.SET_CURRENT_TIME, Math.max(0, Math.round(ms)));
}

export function getPlayStatus(): PlayStatus | null {
  const value = queryState(POT.GET_PLAY_STATUS);
  if (value === null) return null;
  if (value === PlayStatus.Stopped || value === PlayStatus.Paused || value === PlayStatus.Running) {
    return value;
  }
  return null;
}

/** 0 = toggle play/pause, 1 = pause, 2 = play. */
export function setPlayStatus(status: 0 | 1 | 2): void {
  const hwnd = findWindow();
  if (!hwnd || !SendMessageW) return;
  SendMessageW(hwnd, WM_USER_POT, POT.SET_PLAY_STATUS, status);
}
