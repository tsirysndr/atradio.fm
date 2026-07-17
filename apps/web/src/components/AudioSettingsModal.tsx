import type { ReactNode } from "react";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { Modal, Slider, useOverlayState } from "@heroui/react";
import {
  ChannelMode,
  CrossfeedMode,
  type RockboxPlayer,
} from "rockbox-wasm";
import { audioSettingsOpenAtom } from "@/atoms/ui";
import { ModalCloseButton } from "./ModalCloseButton";
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
  "aria-label"?: string;
}) {
  return (
    <Slider
      aria-label={props["aria-label"]}
      minValue={props.min}
      maxValue={props.max}
      step={props.step ?? 1}
      value={[props.value]}
      onChange={(v) => props.onChange(Array.isArray(v) ? v[0] : v)}
    >
      <Slider.Track className="h-1.5 rounded-full bg-white/10">
        <Slider.Fill className="rounded-full bg-gradient-to-r from-synth-pink to-synth-cyan" />
        <Slider.Thumb className="h-3.5 w-3.5 bg-synth-cyan shadow-neon-cyan" />
      </Slider.Track>
    </Slider>
  );
}

/** One vertical EQ band fader (HeroUI Slider, gain in dB). */
function EqBandSlider(props: {
  value: number;
  onChange: (v: number) => void;
  "aria-label": string;
}) {
  return (
    <Slider
      orientation="vertical"
      aria-label={props["aria-label"]}
      minValue={-24}
      maxValue={24}
      step={1}
      value={[props.value]}
      onChange={(v) => props.onChange(Array.isArray(v) ? v[0] : v)}
      className="flex h-28 justify-center"
    >
      <Slider.Track className="h-full w-1.5 rounded-full bg-white/10">
        <Slider.Fill className="rounded-full bg-gradient-to-t from-synth-pink to-synth-cyan" />
        <Slider.Thumb className="h-3.5 w-3.5 bg-synth-cyan shadow-neon-cyan" />
      </Slider.Track>
    </Slider>
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
  const { t } = useTranslation("settings");
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
      {/* Above the fullscreen player (z-60) + emoji portal (z-70) so it isn't
          hidden behind them when opened from the player. */}
      <Modal.Backdrop variant="blur" style={{ zIndex: 200 }}>
        <Modal.Container placement="center" size="lg" scroll="inside">
          <Modal.Dialog className="relative mx-4 max-h-[90vh] w-[calc(100vw-2rem)] max-w-2xl border border-white/10 bg-synth-surface max-sm:!m-0 max-sm:!h-[100dvh] max-sm:!max-h-[100dvh] max-sm:!w-screen max-sm:!max-w-none max-sm:!rounded-none">
            <ModalCloseButton onClose={() => setOpen(false)} />
            <Modal.Header className="border-b border-white/10 pb-3">
              <Modal.Heading className="font-display text-lg">
                {t("title")}
              </Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto py-4">
              <Section
                title={t("equalizer.title")}
                action={
                  <div className="flex items-center gap-2 text-xs text-foreground/60">
                    {eqEnabled ? t("on") : t("off")}
                    <Toggle
                      checked={eqEnabled}
                      onChange={onEqEnabled}
                      label={t("equalizer.enable")}
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
                      <EqBandSlider
                        value={eqGains[i]}
                        aria-label={t("equalizer.bandGain", { hz })}
                        onChange={(v) => onEqBand(i, v)}
                      />
                      <span className="font-mono text-[0.6rem] text-foreground/40">
                        {hz >= 1000 ? `${hz / 1000}k` : hz}
                      </span>
                    </div>
                  ))}
                </div>
              </Section>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Section title={t("tone.title")}>
                  <Field label={t("tone.bass")} value={`${bass} dB`}>
                    <Range
                      aria-label={t("tone.bass")}
                      min={-24}
                      max={24}
                      value={bass}
                      onChange={(v) => {
                        setBass(v);
                        tone(v, treble);
                      }}
                    />
                  </Field>
                  <Field label={t("tone.treble")} value={`${treble} dB`}>
                    <Range
                      aria-label={t("tone.treble")}
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

                <Section title={t("crossfeed.title")}>
                  <Field label={t("crossfeed.mode")}>
                    <SelectBox<CrossfeedMode>
                      value={cfMode}
                      options={[
                        [CrossfeedMode.Off, t("crossfeed.modeOff")],
                        [CrossfeedMode.Meier, t("crossfeed.modeMeier")],
                        [CrossfeedMode.Custom, t("crossfeed.modeCustom")],
                      ]}
                      onChange={(v) => {
                        setCfMode(v);
                        crossfeed(v, cfDirect);
                      }}
                    />
                  </Field>
                  <Field
                    label={t("crossfeed.directGain")}
                    value={`${cfDirect.toFixed(1)} dB`}
                  >
                    <Range
                      aria-label={t("crossfeed.directGain")}
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

                <Section title={t("pbe.title")}>
                  <Field label={t("pbe.strength")} value={`${pbe}%`}>
                    <Range
                      aria-label={t("pbe.strength")}
                      min={0}
                      max={100}
                      value={pbe}
                      onChange={(v) => {
                        setPbe(v);
                        applyPbe(v, pbePrecut);
                      }}
                    />
                  </Field>
                  <Field label={t("pbe.precut")} value={`-${pbePrecut} dB`}>
                    <Range
                      aria-label={t("pbe.precut")}
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

                <Section title={t("surround.title")}>
                  <Field label={t("surround.delay")} value={`${surDelay} ms`}>
                    <Range
                      aria-label={t("surround.delay")}
                      min={0}
                      max={30}
                      value={surDelay}
                      onChange={(v) => {
                        setSurDelay(v);
                        surround(v, surBalance);
                      }}
                    />
                  </Field>
                  <Field label={t("surround.balance")} value={`${surBalance}%`}>
                    <Range
                      aria-label={t("surround.balance")}
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

                <Section title={t("compressor.title")}>
                  <Field
                    label={t("compressor.threshold")}
                    value={`${compThresh} dB`}
                  >
                    <Range
                      aria-label={t("compressor.threshold")}
                      min={-30}
                      max={0}
                      value={compThresh}
                      onChange={(v) => {
                        setCompThresh(v);
                        compressor(v, compRatio);
                      }}
                    />
                  </Field>
                  <Field label={t("compressor.ratio")}>
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

                <Section title={t("stereo.title")}>
                  <Field label={t("stereo.channels")}>
                    <SelectBox<ChannelMode>
                      value={channel}
                      options={[
                        [ChannelMode.Stereo, t("stereo.channelStereo")],
                        [ChannelMode.Mono, t("stereo.channelMono")],
                        [ChannelMode.Custom, t("stereo.channelCustom")],
                        [ChannelMode.MonoLeft, t("stereo.channelMonoLeft")],
                        [ChannelMode.MonoRight, t("stereo.channelMonoRight")],
                        [ChannelMode.Karaoke, t("stereo.channelKaraoke")],
                        [ChannelMode.Swap, t("stereo.channelSwap")],
                      ]}
                      onChange={(v) => {
                        setChannel(v);
                        apply((p) => p.setChannelMode(v));
                      }}
                    />
                  </Field>
                  <Field label={t("stereo.width")} value={`${width}%`}>
                    <Range
                      aria-label={t("stereo.width")}
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
                {t("processingNote")}
              </p>
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
