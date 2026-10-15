import { useEffect } from 'react';

export interface ShortcutHandlers {
  /** Toggle the command palette. */
  onCommandPalette: () => void;
  /** Create a new top-level page. */
  onNewPage: () => void;
  /** Toggle dark mode. */
  onToggleDark: () => void;
}

/**
 * Global workspace shortcuts.
 *
 * - Cmd/Ctrl+K — command palette
 * - Cmd/Ctrl+N — new page
 * - Cmd/Ctrl+D — toggle dark mode (preventDefault stops the browser's
 *   bookmark shortcut; reserved combos like Cmd/Ctrl+N or T may still win
 *   in some browsers — the desktop app is unaffected)
 *
 * All three fire anywhere in the app, including inside the editor, because
 * they are workspace-level actions.
 */
export function useShortcuts({ onCommandPalette, onNewPage, onToggleDark }: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.altKey) return;
      switch (event.key.toLowerCase()) {
        case 'k':
          event.preventDefault();
          onCommandPalette();
          break;
        case 'n':
          event.preventDefault();
          onNewPage();
          break;
        case 'd':
          event.preventDefault();
          onToggleDark();
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onCommandPalette, onNewPage, onToggleDark]);
}

/** True on macOS/iOS — used to render ⌘ instead of Ctrl in shortcut hints. */
export function isMacPlatform(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform);
}

/** Renderable label for a key with the platform's modifier (e.g. "⌘K" / "Ctrl K"). */
export function shortcutLabel(key: string): string {
  const mod = isMacPlatform() ? '⌘' : 'Ctrl';
  return `${mod} ${key.toUpperCase()}`;
}
