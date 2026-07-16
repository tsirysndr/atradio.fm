import type { ReactNode } from "react";
import { useAtom } from "jotai";
import { Modal, useOverlayState } from "@heroui/react";
import {
  ChannelMode,
  CrossfeedMode,
  type RockboxPlayer,
} from "rockbox-wasm";
import { audioSettingsOpenAtom } from "@/atoms/ui";
import {
  EQ_CUTOFFS,
  bassAtom,
  channelModeAtom,
  compRatioAtom,
  compThresholdAtom,
  crossfeedDirectAtom,
  crossfeedModeAtom,
  eqEnabledAtom,
  eqGainsAtom,
  pbeAtom,
  pbePrecutAtom,
  stereoWidthAtom,
  surroundBalanceAtom,
  surroundDelayAtom,
  trebleAtom,
} from "@/atoms/audioSettings";
import { ensureRockboxReady } from "@/lib/audio/rockbox";

/** Apply a change to the (booted) engine — boots it on first use. Settings
 *  are persisted regardless, so they also re-apply on the next station load. */
const apply = (fn: (p: RockboxPlayer) => void) => {
  void ensureRockboxReady()
    .then(fn)
    .catch(() => {});
};

// ── small synthwave-styled primitives ───────────────────────────────────────

function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-white/10 bg-synth-panel/50 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="font-display text-sm font-semibold text-foreground">
          {title}
        </h3>
        {action}
      </div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  );
}

function Field({
  label,
  value,
  children,
}: {
  label: string;
  value?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="flex justify-between text-xs text-foreground/60">
        <span>{label}</span>
        {value != null && (
          <span className="font-mono text-foreground/90">{value}</span>
        )}
      </span>
      {children}
    </label>
  );
}

function Range(props: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <input
      type="range"
      min={props.min}
      max={props.max}
      step={props.step ?? 1}
      value={props.value}
      onChange={(e) => props.onChange(Number(e.target.value))}
      className="accent-synth-pink"
    />
  );
}

function SelectBox<T extends string | number>(props: {
  value: T;
  options: [T, string][];
  onChange: (v: T) => void;
}) {
  return (
    <select
      value={String(props.value)}
      onChange={(e) => {
        const opt = props.options.find(([v]) => String(v) === e.target.value);
        if (opt) props.onChange(opt[0]);
      }}
      className="rounded-lg border border-white/15 bg-synth-panel px-2 py-1.5 text-sm text-foreground focus:border-synth-cyan focus:outline-none"
    >
      {props.options.map(([v, label]) => (
        <option key={String(v)} value={String(v)}>
          {label}
        </option>
      ))}
    </select>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (on: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
        checked ? "bg-synth-pink shadow-neon" : "bg-white/15"
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-synth-bg transition-transform ${
          checked ? "translate-x-4.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

// ── the modal ───────────────────────────────────────────────────────────────

export function AudioSettingsModal() {
  const [isOpen, setOpen] = useAtom(audioSettingsOpenAtom);
  const state = useOverlayState({ isOpen, onOpenChange: setOpen });

  const [eqEnabled, setEqEnabled] = useAtom(eqEnabledAtom);
  const [eqGains, setEqGains] = useAtom(eqGainsAtom);
  const [bass, setBass] = useAtom(bassAtom);
  const [treble, setTreble] = useAtom(trebleAtom);
  const [cfMode, setCfMode] = useAtom(crossfeedModeAtom);
  const [cfDirect, setCfDirect] = useAtom(crossfeedDirectAtom);
  const [pbe, setPbe] = useAtom(pbeAtom);
  const [pbePrecut, setPbePrecut] = useAtom(pbePrecutAtom);
  const [surDelay, setSurDelay] = useAtom(surroundDelayAtom);
  const [surBalance, setSurBalance] = useAtom(surroundBalanceAtom);
  const [compThresh, setCompThresh] = useAtom(compThresholdAtom);
  const [compRatio, setCompRatio] = useAtom(compRatioAtom);
  const [channel, setChannel] = useAtom(channelModeAtom);
  const [width, setWidth] = useAtom(stereoWidthAtom);

  const onEqEnabled = (on: boolean) => {
    setEqEnabled(on);
    apply((p) => p.setEqEnabled(on));
  };
  const onEqBand = (i: number, gain: number) => {
    setEqGains((g) => g.map((x, j) => (j === i ? gain : x)));
    const enable = !eqEnabled;
    if (enable) setEqEnabled(true);
    apply((p) => {
      p.setEqBand(i, EQ_CUTOFFS[i], 1.0, gain);
      if (enable) p.setEqEnabled(true);
    });
  };
  const tone = (b: number, t: number) => apply((p) => p.setTone(b, t));
  const crossfeed = (mode: CrossfeedMode, direct: number) =>
    apply((p) => p.setCrossfeed(mode, Math.round(direct * 10)));
  const applyPbe = (strength: number, precut: number) =>
    apply((p) => p.setPbe(strength, -Math.round(precut * 10)));
  const surround = (delay: number, balance: number) =>
    apply((p) => p.setSurround(delay, balance, 0, 0));
  const compressor = (thr: number, ratio: number) =>
    apply((p) => p.setCompressor(thr, 0, ratio, 0, 0, 0));

  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur">
        <Modal.Container placement="center" size="lg" scroll="inside">
          <Modal.Dialog className="mx-4 max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl border border-white/10 bg-synth-surface max-sm:!m-0 max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!w-screen max-sm:!max-w-none max-sm:!rounded-none">
            <Modal.Header className="border-b border-white/10 pb-3">
              <Modal.Heading className="font-display text-lg">
                Audio settings
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto py-4">
              <Section
                title="Equalizer"
                action={
                  <div className="flex items-center gap-2 text-xs text-foreground/60">
                    {eqEnabled ? "On" : "Off"}
                    <Toggle
                      checked={eqEnabled}
                      onChange={onEqEnabled}
                      label="Enable equalizer"
                    />
                  </div>
                }
              >
                <div className="flex justify-between gap-1">
                  {EQ_CUTOFFS.map((hz, i) => (
                    <div
                      key={hz}
                      className="flex flex-1 flex-col items-center gap-1.5"
                    >
                      <span className="font-mono text-[0.65rem] text-foreground/80">
                        {eqGains[i] > 0 ? `+${eqGains[i]}` : eqGains[i]}
                      </span>
                      <input
                        type="range"
                        min={-24}
                        max={24}
                        step={1}
                        value={eqGains[i]}
                        aria-label={`${hz} Hz band gain`}
                        onChange={(e) => onEqBand(i, Number(e.target.value))}
                        className="eq-slider accent-synth-pink"
                      />
                      <span className="font-mono text-[0.6rem] text-foreground/40">
                        {hz >= 1000 ? `${hz / 1000}k` : hz}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Section title="Tone">
                  <Field label="Bass" value={`${bass} dB`}>
                    <Range
                      min={-24}
                      max={24}
                      value={bass}
                      onChange={(v) => {
                        setBass(v);
                        tone(v, treble);
                      }}
                    />
                  </Field>
                  <Field label="Treble" value={`${treble} dB`}>
                    <Range
                      min={-24}
                      max={24}
                      value={treble}
                      onChange={(v) => {
                        setTreble(v);
                        tone(bass, v);
                      }}
                    />
                  </Field>
                </Section>

                <Section title="Crossfeed (headphones)">
                  <Field label="Mode">
                    <SelectBox<CrossfeedMode>
                      value={cfMode}
                      options={[
                        [CrossfeedMode.Off, "Off"],
                        [CrossfeedMode.Meier, "Meier"],
                        [CrossfeedMode.Custom, "Custom"],
                      ]}
                      onChange={(v) => {
                        setCfMode(v);
                        crossfeed(v, cfDirect);
                      }}
                    />
                  </Field>
                  <Field label="Direct gain" value={`${cfDirect.toFixed(1)} dB`}>
                    <Range
                      min={-6}
                      max={0}
                      step={0.5}
                      value={cfDirect}
                      onChange={(v) => {
                        setCfDirect(v);
                        crossfeed(cfMode, v);
                      }}
                    />
                  </Field>
                </Section>

                <Section title="Perceptual bass (PBE)">
                  <Field label="Strength" value={`${pbe}%`}>
                    <Range
                      min={0}
                      max={100}
                      value={pbe}
                      onChange={(v) => {
                        setPbe(v);
                        applyPbe(v, pbePrecut);
                      }}
                    />
                  </Field>
                  <Field label="Pre-cut" value={`-${pbePrecut} dB`}>
                    <Range
                      min={0}
                      max={24}
                      value={pbePrecut}
                      onChange={(v) => {
                        setPbePrecut(v);
                        applyPbe(pbe, v);
                      }}
                    />
                  </Field>
                </Section>

                <Section title="Haas surround">
                  <Field label="Delay (0 = off)" value={`${surDelay} ms`}>
                    <Range
                      min={0}
                      max={30}
                      value={surDelay}
                      onChange={(v) => {
                        setSurDelay(v);
                        surround(v, surBalance);
                      }}
                    />
                  </Field>
                  <Field label="Balance" value={`${surBalance}%`}>
                    <Range
                      min={0}
                      max={100}
                      value={surBalance}
                      onChange={(v) => {
                        setSurBalance(v);
                        surround(surDelay, v);
                      }}
                    />
                  </Field>
                </Section>

                <Section title="Compressor">
                  <Field label="Threshold (0 = off)" value={`${compThresh} dB`}>
                    <Range
                      min={-30}
                      max={0}
                      value={compThresh}
                      onChange={(v) => {
                        setCompThresh(v);
                        compressor(v, compRatio);
                      }}
                    />
                  </Field>
                  <Field label="Ratio">
                    <SelectBox<number>
                      value={compRatio}
                      options={[
                        [2, "2:1"],
                        [4, "4:1"],
                        [6, "6:1"],
                        [10, "10:1"],
                      ]}
                      onChange={(v) => {
                        setCompRatio(v);
                        compressor(compThresh, v);
                      }}
                    />
                  </Field>
                </Section>

                <Section title="Stereo">
                  <Field label="Channels">
                    <SelectBox<ChannelMode>
                      value={channel}
                      options={[
                        [ChannelMode.Stereo, "Stereo"],
                        [ChannelMode.Mono, "Mono"],
                        [ChannelMode.Custom, "Custom"],
                        [ChannelMode.MonoLeft, "Mono left"],
                        [ChannelMode.MonoRight, "Mono right"],
                        [ChannelMode.Karaoke, "Karaoke"],
                        [ChannelMode.Swap, "Swap L/R"],
                      ]}
                      onChange={(v) => {
                        setChannel(v);
                        apply((p) => p.setChannelMode(v));
                      }}
                    />
                  </Field>
                  <Field label="Stereo width" value={`${width}%`}>
                    <Range
                      min={0}
                      max={255}
                      value={width}
                      onChange={(v) => {
                        setWidth(v);
                        apply((p) => p.setStereoWidth(v));
                      }}
                    />
                  </Field>
                </Section>
              </div>

              <p className="px-1 text-[0.7rem] leading-relaxed text-foreground/40">
                Processing runs in the Rockbox wasm engine, which decodes most
                stations. HLS streams use the browser decoder and skip the DSP
                chain.
              </p>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
