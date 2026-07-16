import { useEffect, useRef, useState } from "react";
import { useAtom } from "jotai";
import { Modal, Button, useOverlayState } from "@heroui/react";
import { IconAt, IconBrandBluesky } from "@tabler/icons-react";
import { consola } from "consola";
import { loginModalOpenAtom } from "@/atoms/ui";
import { startLogin, startSignup } from "@/lib/atproto/session";

export function LoginModal() {
  const [isOpen, setOpen] = useAtom(loginModalOpenAtom);
  const state = useOverlayState({ isOpen, onOpenChange: setOpen });
  const [handle, setHandle] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Anti-autofill: keep the field `readonly` (Safari/iCloud skip readonly fields
  // during their autofill scan), and only make it editable on focus. Managed via
  // the DOM so React's controlled `value` doesn't fight the attribute.
  useEffect(() => {
    inputRef.current?.setAttribute("readonly", "");
  }, []);

  // Focus the field when the modal opens (still readonly -> no autofill prompt).
  useEffect(() => {
    if (isOpen) requestAnimationFrame(() => inputRef.current?.focus());
  }, [isOpen]);

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

  const signup = async () => {
    setBusy(true);
    setError(null);
    try {
      await startSignup(); // redirect to bsky.social create-account flow
    } catch (err) {
      consola.error("[auth] signup failed", err);
      setBusy(false);
      setError("Couldn't start signup. Please try again.");
    }
  };

  return (
    <Modal state={state}>
      {/* Above the fullscreen player (z-60) + emoji portal (z-70) so a login
          prompt triggered from there isn't hidden behind them. */}
      <Modal.Backdrop variant="blur" style={{ zIndex: 200 }}>
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
                    ref={inputRef}
                    value={handle}
                    onChange={(e) => setHandle(e.target.value)}
                    onFocus={(e) => {
                      // Editable once focused; the autofill scan already skipped it.
                      const el = e.currentTarget;
                      requestAnimationFrame(() => el.removeAttribute("readonly"));
                    }}
                    onBlur={(e) => e.currentTarget.setAttribute("readonly", "")}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") void submit();
                    }}
                    placeholder="atmosphere.handle"
                    className="h-10 w-full bg-transparent text-sm text-foreground placeholder:text-foreground/30 focus:outline-none"
                    type="text"
                    name="atproto-handle"
                    autoComplete="off"
                    autoCorrect="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    data-1p-ignore
                    data-lpignore="true"
                    data-form-type="other"
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
                  atradio.fm is part of the Atmosphere. Create an Atmosphere
                  account on Bluesky to get started!
                </p>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void signup()}
                  className="flex items-center justify-center gap-1.5 rounded-full bg-synth-blue/15 px-3 py-2 text-sm font-medium text-synth-blue transition-colors hover:bg-synth-blue/25 disabled:opacity-50"
                >
                  <IconBrandBluesky size={16} />
                  Signup via Bluesky
                </button>
              </div>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
