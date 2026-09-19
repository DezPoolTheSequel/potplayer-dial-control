import { keyboard, Key } from "@nut-tree-fork/nut-js";

/**
 * Token -> nut-js Key lookup for combo strings like "ctrl+alt+shift+right".
 * NOTE: I'm recalling these enum member names from memory (Key.LeftControl,
 * Key.Left, Key.F13, etc.) — do a quick sanity check against your editor's
 * autocomplete on the installed `@nut-tree-fork/nut-js` types before relying
 * on the less-common ones (function keys, numpad, etc.).
 */
const BASE_KEY_MAP: Record<string, Key> = {
  ctrl: Key.LeftControl,
  control: Key.LeftControl,
  lctrl: Key.LeftControl,
  rctrl: Key.RightControl,

  alt: Key.LeftAlt,
  lalt: Key.LeftAlt,
  ralt: Key.RightAlt,

  shift: Key.LeftShift,
  lshift: Key.LeftShift,
  rshift: Key.RightShift,

  win: Key.LeftSuper,
  cmd: Key.LeftSuper,
  meta: Key.LeftSuper,
  super: Key.LeftSuper,

  space: Key.Space,
  spacebar: Key.Space,
  enter: Key.Enter,
  return: Key.Enter,
  tab: Key.Tab,
  esc: Key.Escape,
  escape: Key.Escape,

  left: Key.Left,
  right: Key.Right,
  up: Key.Up,
  down: Key.Down,

  pageup: Key.PageUp,
  pgup: Key.PageUp,
  pagedown: Key.PageDown,
  pgdn: Key.PageDown,

  home: Key.Home,
  end: Key.End,
  delete: Key.Delete,
  del: Key.Delete,
  backspace: Key.Backspace,
  insert: Key.Insert,
};

function buildLetterKeys(): Record<string, Key> {
  const map: Record<string, Key> = {};
  for (let i = 0; i < 26; i++) {
    const letter = String.fromCharCode(97 + i); // 'a'..'z'
    const enumKey = letter.toUpperCase() as keyof typeof Key;
    if (Key[enumKey] !== undefined) {
      map[letter] = Key[enumKey] as unknown as Key;
    }
  }
  return map;
}

function buildNumberKeys(): Record<string, Key> {
  const map: Record<string, Key> = {};
  for (let i = 0; i <= 9; i++) {
    const enumKey = `Num${i}` as keyof typeof Key;
    if (Key[enumKey] !== undefined) {
      map[String(i)] = Key[enumKey] as unknown as Key;
    }
  }
  return map;
}

function buildFunctionKeys(): Record<string, Key> {
  const map: Record<string, Key> = {};
  for (let i = 1; i <= 24; i++) {
    const enumKey = `F${i}` as keyof typeof Key;
    if (Key[enumKey] !== undefined) {
      map[`f${i}`] = Key[enumKey] as unknown as Key;
    }
  }
  return map;
}

const KEY_MAP: Record<string, Key> = {
  ...BASE_KEY_MAP,
  ...buildLetterKeys(),
  ...buildNumberKeys(),
  ...buildFunctionKeys(),
};

/**
 * Parses a combo string like "ctrl+alt+shift+right" or "f13" and presses +
 * releases it as a single, real OS-level key event using nut-js. Because
 * this is a genuine key event (not a message posted to a specific window),
 * it will trigger PotPlayer's global hotkeys exactly like a physical
 * keypress would, regardless of which window currently has focus.
 *
 * An empty/undefined combo is treated as "no action assigned" and silently
 * does nothing, so you can leave any of the nine gesture fields blank.
 */
export async function sendHotkey(combo: string | undefined | null): Promise<void> {
  if (!combo || combo.trim().length === 0) {
    return;
  }

  const tokens = combo
    .toLowerCase()
    .split("+")
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  const keys: Key[] = [];
  for (const token of tokens) {
    const key = KEY_MAP[token];
    if (key === undefined) {
      console.error(`[key-sender] Unknown key token "${token}" in combo "${combo}" — check spelling.`);
      return;
    }
    keys.push(key);
  }

  if (keys.length === 0) {
    return;
  }

  try {
    await keyboard.pressKey(...keys);
    await keyboard.releaseKey(...keys);
  } catch (err) {
    console.error(`[key-sender] Failed to send combo "${combo}":`, err);
  }
}
