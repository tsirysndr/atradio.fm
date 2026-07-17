import { useState } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Modal, useOverlayState } from "@heroui/react";
import { IconCheck, IconCopy, IconTerminal2 } from "@tabler/icons-react";
import { cliInstallOpenAtom } from "@/atoms/ui";
import { ModalCloseButton } from "./ModalCloseButton";

/** A single labelled, copy-to-clipboard install command. */
function CommandBlock({ label, command }: { label: string; command: string }) {
  const { t } = useTranslation("cli");
  const [copied, setCopied] = useState(false);

  const copy = () => {
    void navigator.clipboard.writeText(command).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium text-foreground/60">{label}</span>
      <div className="group flex items-stretch overflow-hidden rounded-xl border border-white/10 bg-synth-panel/60">
        <code className="flex-1 overflow-x-auto whitespace-pre px-3 py-2.5 font-mono text-sm text-synth-cyan">
          {command}
        </code>
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? t("copied") : t("copy")}
          title={copied ? t("copied") : t("copy")}
          className="flex w-11 shrink-0 items-center justify-center border-l border-white/10 text-foreground/50 transition-colors hover:bg-white/5 hover:text-foreground"
        >
          {copied ? (
            <IconCheck size={16} className="text-synth-cyan" />
          ) : (
            <IconCopy size={16} />
          )}
        </button>
      </div>
    </div>
  );
}

export function CliInstallModal() {
  const { t } = useTranslation("cli");
  const [isOpen, setOpen] = useAtom(cliInstallOpenAtom);
  const state = useOverlayState({ isOpen, onOpenChange: setOpen });

  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur" style={{ zIndex: 200 }}>
        <Modal.Container placement="center" size="lg" scroll="inside">
          <Modal.Dialog className="relative mx-4 max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg border border-white/10 bg-synth-surface max-sm:!m-0 max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!w-screen max-sm:!max-w-none max-sm:!rounded-none">
            <ModalCloseButton onClose={() => setOpen(false)} />
            <Modal.Header className="border-b border-white/10 pb-3">
              <Modal.Heading className="flex items-center gap-2 font-display text-lg">
                <IconTerminal2 size={20} className="text-synth-pink" />
                {t("title")}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex max-h-[70vh] flex-col gap-4 overflow-y-auto py-4">
              <p className="text-sm leading-relaxed text-foreground/60">
                {t("intro")}
              </p>

              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
                  {t("macosLinux")}
                </h3>
                <CommandBlock
                  label={t("homebrew")}
                  command="brew install tsirysndr/tap/atradio"
                />
                <CommandBlock
                  label={t("nix")}
                  command={
                    "cachix use atradio # optional, speeds up the build\nnix profile install github:tsirysndr/atradio.fm"
                  }
                />
                <CommandBlock
                  label={t("cargo")}
                  command="cargo install --git https://github.com/tsirysndr/atradio.fm --bin atradio"
                />
              </div>

              <div className="flex flex-col gap-3">
                <h3 className="text-xs font-semibold uppercase tracking-wide text-foreground/40">
                  {t("linux")}
                </h3>
                <CommandBlock
                  label={t("debian")}
                  command={
                    'echo "deb [trusted=yes] https://apt.fury.io/tsiry/ /" | sudo tee /etc/apt/sources.list.d/tsiry.list\nsudo apt update && sudo apt install atradio'
                  }
                />
                <CommandBlock
                  label={t("fedora")}
                  command="sudo dnf install https://github.com/tsirysndr/atradio.fm/releases/latest/download/atradio-0.1.0-1.x86_64.rpm"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-foreground/60">
                  {t("run")}
                </span>
                <div className="rounded-xl border border-white/10 bg-synth-panel/60 px-3 py-2.5">
                  <code className="font-mono text-sm text-synth-cyan">
                    atradio
                  </code>
                </div>
              </div>

              <a
                href="https://github.com/tsirysndr/atradio.fm/releases/latest"
                target="_blank"
                rel="noreferrer"
                className="text-xs text-foreground/50 underline-offset-2 transition-colors hover:text-synth-cyan hover:underline"
              >
                {t("allReleases")}
              </a>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
