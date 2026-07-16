import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Modal, useOverlayState } from "@heroui/react";
import { IconKeyboard } from "@tabler/icons-react";
import { shortcutsOpenAtom } from "@/atoms/ui";
import { SHORTCUTS } from "@/lib/shortcuts";
import { ModalCloseButton } from "./ModalCloseButton";

/** Maps each shortcut's English description to its translation key. */
const DESCRIPTION_KEYS: Record<string, string> = {
  "Open search": "openSearch",
  "Play / pause": "playPause",
  "Mute / unmute": "muteUnmute",
  "Favorite current station": "favorite",
  "Add your own station": "addStation",
  "Equalizer & audio settings": "audioSettings",
  "Fullscreen player": "fullscreen",
  "Volume up / down": "volume",
  "Show this help": "showHelp",
  "Close dialogs / blur search": "close",
};

export function ShortcutsHelp() {
  const { t } = useTranslation("shortcuts");
  const [isOpen, setOpen] = useAtom(shortcutsOpenAtom);
  const state = useOverlayState({ isOpen, onOpenChange: setOpen });

  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur">
        <Modal.Container placement="center" size="md" scroll="inside">
          <Modal.Dialog className="relative mx-4 max-h-[88vh] w-[calc(100vw-2rem)] max-w-md border border-white/10 bg-synth-surface max-sm:!m-0 max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!w-screen max-sm:!max-w-none max-sm:!rounded-none">
            <ModalCloseButton onClose={() => setOpen(false)} />
          <Modal.Header className="flex items-center gap-2 border-b border-white/10 pb-3">
            <IconKeyboard size={20} className="text-synth-cyan" />
            <Modal.Heading className="font-display text-lg">
              {t("title")}
            </Modal.Heading>
          </Modal.Header>
          <Modal.Body className="py-4">
            <ul className="flex flex-col divide-y divide-white/5">
              {SHORTCUTS.map((s) => (
                <li
                  key={s.description}
                  className="flex items-center justify-between py-2.5"
                >
                  <span className="text-sm text-foreground/70">
                    {t(DESCRIPTION_KEYS[s.description] ?? s.description)}
                  </span>
                  <span className="flex gap-1.5">
                    {s.keys.map((k) => (
                      <kbd
                        key={k}
                        className="min-w-7 rounded-md border border-white/15 bg-synth-panel px-2 py-1 text-center text-xs font-medium text-synth-cyan shadow-[0_1px_0_rgba(255,255,255,0.05)]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
