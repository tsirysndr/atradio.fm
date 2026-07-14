/** Display metadata for the keyboard-shortcuts help overlay. */
export interface ShortcutHelp {
  keys: string[];
  description: string;
}

export const SHORTCUTS: ShortcutHelp[] = [
  { keys: ["/"], description: "Open search" },
  { keys: ["Space", "K"], description: "Play / pause" },
  { keys: ["M"], description: "Mute / unmute" },
  { keys: ["F"], description: "Favorite current station" },
  { keys: ["A"], description: "Add your own station" },
  { keys: ["E"], description: "Equalizer & audio settings" },
  { keys: ["↑", "↓"], description: "Volume up / down" },
  { keys: ["?"], description: "Show this help" },
  { keys: ["Esc"], description: "Close dialogs / blur search" },
];
