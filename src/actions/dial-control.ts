import {
  action,
  SingletonAction,
  type WillAppearEvent,
  type WillDisappearEvent,
  type DidReceiveSettingsEvent,
  type DialRotateEvent,
  type DialDownEvent,
  type DialUpEvent,
  type TouchTapEvent,
  type DialAction,
} from "@elgato/streamdeck";
import { sendHotkey } from "../lib/key-sender";
import { formatTime } from "../lib/format-time";
import {
  CUSTOM_COMMAND_ACTION,
  CUSTOM_HOTKEY_ACTION,
  NONE_ACTION,
  POTPLAYER_COMMANDS,
  isPotPlayerCommandName,
} from "../lib/potplayer-commands";
import { getCurrentTimeMs, getTitle, getTotalTimeMs, getVolume, isRunning, sendCommand } from "../lib/potplayer";
import {
  SCREEN_WIDTH,
  TITLE_GAP,
  TITLE_PAD,
  estimateTextWidth,
  renderTimeBar,
  renderTitle,
  renderVolumeBar,
} from "../lib/render";

const GESTURES = [
  "rotateLeft",
  "rotateRight",
  "holdRotateLeft",
  "holdRotateRight",
  "press",
  "hold",
  "doublePress",
  "touch",
  "touchHold",
] as const;
type Gesture = (typeof GESTURES)[number];

const DEFAULT_GESTURE_ACTIONS: Record<Gesture, string> = {
  rotateLeft: "volumeDown",
  rotateRight: "volumeUp",
  holdRotateLeft: "seekBack5",
  holdRotateRight: "seekFwd5",
  press: "next",
  hold: "stop",
  doublePress: "previous",
  touch: "playPause",
  touchHold: "toggleMute",
};

const FEEDBACK_INTERVAL_MS = 500;
const LAYOUT_PATH = "layouts/dial-control.json";

interface ScreenState {
  feedbackTimer: ReturnType<typeof setInterval>;
  scrollTimer: ReturnType<typeof setInterval> | null;
  titleText: string | null;
  titleDim: boolean;
  titleWidth: number;
  scrollOffset: number;
  scrollPauseUntil: number;
}
// Title marquee: 1px every 50ms (~20px/s), pausing at the start of each loop.
const SCROLL_INTERVAL_MS = 50;
const SCROLL_STEP_PX = 1;
const SCROLL_PAUSE_MS = 2000;

export interface DialControlSettings {
  holdThresholdMs?: number;
  doublePressWindowMs?: number;
  showMuteStatus?: boolean;
  volumeColor?: string;
  progressColor?: string;
  [key: string]: string | number | boolean | undefined;
}

export const DEFAULT_SETTINGS: DialControlSettings = {
  holdThresholdMs: 500,
  doublePressWindowMs: 300,
  showMuteStatus: true,
  volumeColor: "#FFFFFF",
  progressColor: "#FFFFFF",
  ...Object.fromEntries(GESTURES.map((g) => [`${g}Action`, DEFAULT_GESTURE_ACTIONS[g]])),
};

@action({ UUID: "com.desmond-harris.potplayer-dial-control.dial-control" })
export class DialControl extends SingletonAction<DialControlSettings> {
  // Per-dial gesture-timing state. Since this is a SingletonAction shared
  // across all instances of the action, if you ever put this action on more
  // than one dial at once, this simple approach would need to be keyed by
  // ev.action.id instead of being single fields. Fine for one dial.
  private holdTimer: ReturnType<typeof setTimeout> | null = null;
  private holdFired = false;
  private pendingPressTimer: ReturnType<typeof setTimeout> | null = null;
  private feedbackTimer: ReturnType<typeof setInterval> | null = null;
  // PotPlayer's protocol has no "get mute state" query (GET_VOLUME returns
  // the pre-mute slider value even while muted), so this is a best-effort
  // guess based only on toggles sent from this dial — it can drift if mute
  // is changed some other way (PotPlayer's own UI, another remote, etc).
  private mutedGuess = false;
  // Cached so the feedback poll loop (which fires on its own timer, not from
  // an incoming event) always has the latest settings without an extra
  // round-trip to Stream Deck on every tick.
  private currentSettings: DialControlSettings = DEFAULT_SETTINGS;

  // Screen state per visible dial, keyed by action instance id. Kept per
  // dial (not as single fields) because page switches can fire willAppear for
  // one instance before willDisappear for another.
  private screens = new Map<string, ScreenState>();

  override async onWillAppear(ev: WillAppearEvent<DialControlSettings>): Promise<void> {
    const settings = ev.payload.settings;
    if (!settings || Object.keys(settings).length === 0) {
      this.currentSettings = DEFAULT_SETTINGS;
      await ev.action.setSettings(DEFAULT_SETTINGS);
    } else {
      // Backfill any gesture/action fields missing from a settings object
      // saved by an older version of this action, without clobbering
      // anything the user has already configured.
      const merged = { ...DEFAULT_SETTINGS, ...settings };
      this.currentSettings = merged;
      if (Object.keys(merged).length !== Object.keys(settings).length) {
        await ev.action.setSettings(merged);
      }
    }

    // This action only ever declares "Encoder" as a controller in the
    // manifest, so ev.action is always a dial — this narrows the type.
    if (ev.action.isDial()) {
      // Stream Deck can keep serving a layout cached from an older plugin
      // version (e.g. when a dial reappears after a page switch), so always
      // re-apply the current one before drawing into it.
      await ev.action.setFeedbackLayout(LAYOUT_PATH);
      this.startFeedbackLoop(ev.action);
    }
  }

  override onWillDisappear(ev: WillDisappearEvent<DialControlSettings>): void {
    this.stopFeedbackLoop(ev.action.id);
  }

  override onDidReceiveSettings(ev: DidReceiveSettingsEvent<DialControlSettings>): void {
    this.currentSettings = this.mergeSettings(ev.payload.settings);
  }

  override async onDialRotate(ev: DialRotateEvent<DialControlSettings>): Promise<void> {
    const settings = this.mergeSettings(ev.payload.settings);
    const { ticks, pressed } = ev.payload;

    if (ticks === 0) return;

    // NB: empirically, `pressed` reports the opposite of what the SDK docs
    // describe on real Stream Deck+ hardware — swapped here to match.
    const gesture: Gesture =
      ticks > 0 ? (pressed ? "rotateRight" : "holdRotateRight") : pressed ? "rotateLeft" : "holdRotateLeft";

    await this.runGesture(ev.action, settings, gesture);
  }

  override async onDialDown(ev: DialDownEvent<DialControlSettings>): Promise<void> {
    const settings = this.mergeSettings(ev.payload.settings);

    this.holdFired = false;
    this.clearHoldTimer();

    this.holdTimer = setTimeout(async () => {
      this.holdFired = true;
      await this.runGesture(ev.action, settings, "hold");
    }, settings.holdThresholdMs);
  }

  override async onDialUp(ev: DialUpEvent<DialControlSettings>): Promise<void> {
    const settings = this.mergeSettings(ev.payload.settings);
    this.clearHoldTimer();

    if (this.holdFired) {
      // Already fired the "hold" action while the dial was still down —
      // don't also fire a press on release.
      this.holdFired = false;
      return;
    }

    if (this.pendingPressTimer) {
      // A second quick press arrived within the double-press window.
      clearTimeout(this.pendingPressTimer);
      this.pendingPressTimer = null;
      await this.runGesture(ev.action, settings, "doublePress");
      return;
    }

    // First quick press — wait to see if a second one follows before
    // committing to a single "press".
    this.pendingPressTimer = setTimeout(async () => {
      this.pendingPressTimer = null;
      await this.runGesture(ev.action, settings, "press");
    }, settings.doublePressWindowMs);
  }

  override async onTouchTap(ev: TouchTapEvent<DialControlSettings>): Promise<void> {
    const settings = this.mergeSettings(ev.payload.settings);
    const gesture: Gesture = ev.payload.hold ? "touchHold" : "touch";
    await this.runGesture(ev.action, settings, gesture);
  }

  private clearHoldTimer(): void {
    if (this.holdTimer) {
      clearTimeout(this.holdTimer);
      this.holdTimer = null;
    }
  }

  private mergeSettings(settings: Partial<DialControlSettings> | undefined): DialControlSettings {
    return { ...DEFAULT_SETTINGS, ...settings };
  }

  /** Runs whatever action is assigned to a gesture: a PotPlayer command, a custom command id, or a legacy raw hotkey. */
  private async runGesture(
    dial: DialAction<DialControlSettings>,
    settings: DialControlSettings,
    gesture: Gesture
  ): Promise<void> {
    this.currentSettings = settings;
    const assigned = settings[`${gesture}Action`];
    const actionName = typeof assigned === "string" && assigned.length > 0 ? assigned : NONE_ACTION;

    if (actionName === NONE_ACTION) {
      return;
    }

    if (actionName === CUSTOM_COMMAND_ACTION) {
      const id = Number(settings[`${gesture}CustomCommandId`]);
      if (Number.isFinite(id) && id > 0) {
        sendCommand(id);
        if (id === POTPLAYER_COMMANDS.toggleMute.id) this.mutedGuess = !this.mutedGuess;
      }
    } else if (actionName === CUSTOM_HOTKEY_ACTION) {
      await sendHotkey(settings[`${gesture}CustomHotkey`] as string | undefined);
    } else if (isPotPlayerCommandName(actionName)) {
      sendCommand(POTPLAYER_COMMANDS[actionName].id);
      if (actionName === "toggleMute") this.mutedGuess = !this.mutedGuess;
    }

    // Give PotPlayer a moment to apply the change before refreshing the
    // screen, rather than waiting for the next scheduled poll tick.
    setTimeout(() => void this.updateFeedback(dial), 80);
  }

  private startFeedbackLoop(dial: DialAction<DialControlSettings>): void {
    this.stopFeedbackLoop(dial.id);
    const screen: ScreenState = {
      feedbackTimer: setInterval(() => void this.updateFeedback(dial), FEEDBACK_INTERVAL_MS),
      scrollTimer: null,
      titleText: null,
      titleDim: false,
      titleWidth: 0,
      scrollOffset: 0,
      scrollPauseUntil: 0,
    };
    this.screens.set(dial.id, screen);
    void this.updateFeedback(dial);
  }

  private stopFeedbackLoop(id: string): void {
    const screen = this.screens.get(id);
    if (!screen) return;
    clearInterval(screen.feedbackTimer);
    if (screen.scrollTimer) clearInterval(screen.scrollTimer);
    this.screens.delete(id);
  }

  /**
   * Called every poll tick. Restarts the marquee only when the title changes,
   * but always returns the current frame so a dropped update self-heals.
   */
  private titleFrame(
    dial: DialAction<DialControlSettings>,
    screen: ScreenState,
    text: string,
    dim: boolean
  ): Record<string, string> {
    if (text !== screen.titleText || dim !== screen.titleDim) {
      screen.titleText = text;
      screen.titleDim = dim;
      screen.titleWidth = estimateTextWidth(text);
      screen.scrollOffset = 0;
      screen.scrollPauseUntil = Date.now() + SCROLL_PAUSE_MS;
      if (screen.scrollTimer) clearInterval(screen.scrollTimer);
      screen.scrollTimer = null;

      if (screen.titleWidth > SCREEN_WIDTH - TITLE_PAD * 2) {
        screen.scrollTimer = setInterval(() => void this.scrollTick(dial, screen), SCROLL_INTERVAL_MS);
      }
    }

    const offset = screen.scrollTimer ? screen.scrollOffset : null;
    return { videoTitle: renderTitle(text, screen.titleWidth, offset, dim) };
  }

  private async scrollTick(dial: DialAction<DialControlSettings>, screen: ScreenState): Promise<void> {
    if (screen.titleText === null || Date.now() < screen.scrollPauseUntil) return;

    screen.scrollOffset += SCROLL_STEP_PX;
    const loopLength = screen.titleWidth + TITLE_GAP;
    if (screen.scrollOffset >= loopLength) {
      // Second copy is now exactly where the first started — snap back and pause.
      screen.scrollOffset = 0;
      screen.scrollPauseUntil = Date.now() + SCROLL_PAUSE_MS;
    }

    try {
      await dial.setFeedback({
        videoTitle: renderTitle(screen.titleText, screen.titleWidth, screen.scrollOffset, screen.titleDim),
      });
    } catch (err) {
      console.error("[dial-control] Failed to scroll title:", err);
    }
  }

  private async updateFeedback(dial: DialAction<DialControlSettings>): Promise<void> {
    const screen = this.screens.get(dial.id);
    if (!screen) return; // dial isn't visible
    try {
      const volumeColor = this.currentSettings.volumeColor || DEFAULT_SETTINGS.volumeColor!;
      const progressColor = this.currentSettings.progressColor || DEFAULT_SETTINGS.progressColor!;

      if (!isRunning()) {
        await dial.setFeedback({
          volumeBar: renderVolumeBar(0, "PotPlayer", volumeColor),
          ...this.titleFrame(dial, screen, "not running", true),
          timeBar: renderTimeBar(0, "--:--", "--:--", progressColor),
        });
        return;
      }

      const volume = getVolume() ?? 0;
      const current = getCurrentTimeMs() ?? 0;
      const total = getTotalTimeMs() ?? 0;
      const progress = total > 0 ? Math.min(100, (current / total) * 100) : 0;
      const title = getTitle() ?? "";

      const showMute = this.currentSettings.showMuteStatus !== false;
      const volumeText = showMute && this.mutedGuess ? "Muted" : `Vol ${volume}%`;

      await dial.setFeedback({
        volumeBar: renderVolumeBar(volume, volumeText, volumeColor),
        ...this.titleFrame(dial, screen, title || "No video open", !title),
        timeBar: renderTimeBar(progress, formatTime(current), formatTime(total), progressColor),
      });
    } catch (err) {
      console.error("[dial-control] Failed to update feedback:", err);
    }
  }
}
