import { IconX } from "@tabler/icons-react";

/**
 * Close (✕) button shown only on mobile, where modals go fullscreen and there's
 * no backdrop to tap. Hidden from `sm` up so the desktop modals stay untouched.
 * Position it inside a `relative` Modal.Dialog.
 */
export function ModalCloseButton({ onClose }: { onClose: () => void }) {
  return (
    <button
      type="button"
      onClick={onClose}
      aria-label="Close"
      className="absolute right-3 top-3 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-white/5 text-foreground/70 transition-colors hover:bg-white/10 hover:text-foreground sm:hidden"
    >
      <IconX size={18} />
    </button>
  );
}
