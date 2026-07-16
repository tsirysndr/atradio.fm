/**
 * Appended to a HeroUI `Modal.Dialog` className to make the modal fill the
 * screen edge-to-edge on mobile (`max-sm`) while leaving the desktop sizing
 * untouched. Pairs with `MOBILE_FULLSCREEN_BODY` on the scrollable body so its
 * content scrolls within the full height instead of overflowing.
 */
export const MOBILE_FULLSCREEN_DIALOG =
  "max-sm:!m-0 max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!w-screen max-sm:!max-w-none max-sm:!rounded-none max-sm:flex max-sm:flex-col";

/** Makes a modal body flex-fill and scroll within a mobile-fullscreen dialog. */
export const MOBILE_FULLSCREEN_BODY = "max-sm:min-h-0 max-sm:flex-1";
