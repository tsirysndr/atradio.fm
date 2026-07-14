import { useState } from "react";
import { useAtom } from "jotai";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { IconAt, IconBrandBluesky } from "@tabler/icons-react";
import { consola } from "consola";
import { loginModalOpenAtom } from "@/atoms/ui";
import { startLogin } from "@/lib/atproto/session";

export function LoginModal() {
  const [isOpen, setOpen] = useAtom(loginModalOpenAtom);
  const state = useOverlayState({ isOpen, onOpenChange: setOpen });
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    const h = handle.trim().replace(/^@/, "");
    if (!h) return;
    setBusy(true);
    setError(null);
    try {
      await startLogin(h); // full-page redirect to the PDS
    } catch (err) {
      consola.error("[auth] login failed", err);
      setBusy(false);
      setError("Couldn't start login. Check your handle and try again.");
    }
  };

  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur">
        <Modal.Container placement="center" size="sm">
          <Modal.Dialog className="mx-4 w-[calc(100vw-2rem)] max-w-sm border border-white/10 bg-synth-surface">
            <Modal.Header className="border-b border-white/10 pb-3">
              <Modal.Heading className="font-display text-lg">
                Log in with Atmosphere account
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4 py-4">
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 rounded-lg border border-white/15 bg-synth-panel px-3 focus-within:border-synth-cyan">
                  <IconAt size={16} className="text-foreground/40" />
                  <input
                    autoFocus
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submit();
                    }}
                    placeholder="atmosphere.handle"
                    className="h-10 w-full bg-transparent text-sm text-foreground placeholder:text-foreground/30 focus:outline-none"
                    autoComplete="username"
                    spellCheck={false}
                  />
                </div>
                {error && <p className="text-xs text-danger">{error}</p>}
                <Button
                  variant="primary"
                  className="w-full"
                  isDisabled={busy || !handle.trim()}
                  onPress={() => void submit()}
                >
                  Log in
                </Button>
              </div>

              {/* Signup */}
              <div className="flex flex-col gap-2 rounded-lg border border-white/10 bg-synth-panel/50 p-3">
                <p className="text-xs text-foreground/60">
                  atradio is part of the Atmosphere. Create an Atmosphere account
                  on Bluesky to get started!
                </p>
                <a
                  href="https://bsky.app"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-center gap-1.5 rounded-full bg-synth-blue/15 px-3 py-2 text-sm font-medium text-synth-blue transition-colors hover:bg-synth-blue/25"
                >
                  <IconBrandBluesky size={16} />
                  Signup via Bluesky
                </a>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
