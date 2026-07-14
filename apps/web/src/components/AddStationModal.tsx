import { useState } from "react";
import { useAtom, useSetAtom } from "jotai";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  Modal,
  Button,
  TextField,
  Label,
  Input,
  TextArea,
  FieldError,
  useOverlayState,
} from "@heroui/react";
import { consola } from "consola";
import { InlineLoader } from "./Skeletons";
import { IconPlus, IconBroadcast, IconPhoto } from "@tabler/icons-react";
import { addStationOpenAtom } from "@/atoms/ui";
import { addCustomStationAtom } from "@/atoms/customStations";
import { playStationAtom } from "@/atoms/player";
import {
  stationFormSchema,
  isValidHttpUrl,
  type StationFormValues,
} from "@/lib/validation/stationSchema";

const DEFAULTS: StationFormValues = {
  name: "",
  streamUrl: "",
  genre: "",
  homepage: "",
  logoUrl: "",
  description: "",
  skipStreamCheck: false,
};

const fieldClass = "flex flex-col gap-1.5";
const labelClass = "text-xs font-medium text-foreground/70";
const inputClass =
  "h-10 w-full rounded-lg border border-white/15 bg-synth-panel px-3 text-sm text-foreground placeholder:text-foreground/30 focus:border-synth-cyan focus:outline-none";

export function AddStationModal() {
  const [isOpen, setOpen] = useAtom(addStationOpenAtom);
  const addStation = useSetAtom(addCustomStationAtom);
  const play = useSetAtom(playStationAtom);
  const [logoError, setLogoError] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    watch,
    setValue,
    formState: { errors, isValidating, isSubmitting },
  } = useForm<StationFormValues>({
    resolver: zodResolver(stationFormSchema),
    defaultValues: DEFAULTS,
    mode: "onSubmit",
  });

  const closeAndReset = () => {
    setOpen(false);
    reset(DEFAULTS);
    setLogoError(false);
    setSaveError(null);
  };

  const state = useOverlayState({
    isOpen,
    onOpenChange: (open) => (open ? setOpen(true) : closeAndReset()),
  });

  const persist = async (values: StationFormValues, playNow: boolean) => {
    try {
      const station = await addStation({
        name: values.name,
        description: values.description,
        genre: values.genre,
        streamUrl: values.streamUrl,
        homepage: values.homepage || undefined,
        logoUrl: values.logoUrl || undefined,
      });
      if (playNow) play(station);
      closeAndReset();
    } catch (err) {
      consola.error("[stations] save failed", err);
      setSaveError("Couldn't save the station to your account. Try again.");
    }
  };

  const onSave = handleSubmit((values) => persist(values, false));
  const onSaveAndPlay = handleSubmit((values) => persist(values, true));

  // Offer "add anyway" only when the URL is well-formed but failed the live
  // stream probe (not when it's simply a malformed URL).
  const streamUrl = watch("streamUrl");
  const logoUrl = watch("logoUrl");
  const canAddAnyway =
    !!errors.streamUrl && isValidHttpUrl((streamUrl ?? "").trim());

  const addAnyway = () => {
    setValue("skipStreamCheck", true);
    void onSave();
  };

  const busy = isValidating || isSubmitting;

  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur">
        <Modal.Container placement="center" size="md" scroll="inside">
          <Modal.Dialog className="mx-4 max-h-[88vh] w-[calc(100vw-2rem)] max-w-lg border border-white/10 bg-synth-surface">
          <Modal.Header className="flex items-center gap-2 border-b border-white/10 pb-3">
            <IconBroadcast size={20} className="text-synth-cyan" />
            <Modal.Heading className="font-display text-lg">
              Add your own station
            </Modal.Heading>
          </Modal.Header>

          <Modal.Body className="flex flex-col gap-3 py-4">
            <TextField isRequired isInvalid={!!errors.name} className={fieldClass}>
              <Label className={labelClass}>Name</Label>
              <Input
                className={inputClass}
                placeholder="e.g. Midnight Synthwave FM"
                {...register("name")}
              />
              {errors.name && (
                <FieldError className="text-xs text-danger">
                  {errors.name.message}
                </FieldError>
              )}
            </TextField>

            <TextField
              isRequired
              isInvalid={!!errors.streamUrl}
              className={fieldClass}
            >
              <Label className={labelClass}>Stream URL</Label>
              <Input
                className={inputClass}
                placeholder="https://…/stream.mp3"
                {...register("streamUrl")}
              />
              {errors.streamUrl && (
                <FieldError className="text-xs text-danger">
                  {errors.streamUrl.message}
                </FieldError>
              )}
            </TextField>

            {/* Optional logo/picture with a live preview */}
            <TextField isInvalid={!!errors.logoUrl} className={fieldClass}>
              <Label className={labelClass}>Logo / picture</Label>
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-white/10 bg-synth-panel">
                  {logoUrl && isValidHttpUrl(logoUrl.trim()) && !logoError ? (
                    <img
                      src={logoUrl.trim()}
                      alt="Logo preview"
                      className="h-full w-full object-cover"
                      onError={() => setLogoError(true)}
                    />
                  ) : (
                    <IconPhoto size={20} className="text-synth-magenta" />
                  )}
                </div>
                <Input
                  className={inputClass}
                  placeholder="Optional — https://…/logo.png"
                  {...register("logoUrl", {
                    onChange: () => setLogoError(false),
                  })}
                />
              </div>
              {errors.logoUrl && (
                <FieldError className="text-xs text-danger">
                  {errors.logoUrl.message}
                </FieldError>
              )}
            </TextField>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextField className={fieldClass}>
                <Label className={labelClass}>Genre</Label>
                <Input
                  className={inputClass}
                  placeholder="Optional"
                  {...register("genre")}
                />
              </TextField>
              <TextField isInvalid={!!errors.homepage} className={fieldClass}>
                <Label className={labelClass}>Station page</Label>
                <Input
                  className={inputClass}
                  placeholder="Optional — https://…"
                  {...register("homepage")}
                />
                {errors.homepage && (
                  <FieldError className="text-xs text-danger">
                    {errors.homepage.message}
                  </FieldError>
                )}
              </TextField>
            </div>

            <TextField className={fieldClass}>
              <Label className={labelClass}>Description</Label>
              <TextArea
                className={`${inputClass} h-auto py-2`}
                placeholder="Optional"
                rows={2}
                {...register("description")}
              />
            </TextField>

            {busy && (
              <div className="flex items-center gap-2 text-xs text-synth-cyan">
                <InlineLoader width={90} />
                Verifying the stream is reachable…
              </div>
            )}
            {canAddAnyway && !busy && (
              <button
                type="button"
                onClick={addAnyway}
                className="self-start text-xs text-foreground/50 underline decoration-dotted hover:text-synth-cyan"
              >
                Add it anyway (skip the stream check)
              </button>
            )}
            {saveError && <p className="text-xs text-danger">{saveError}</p>}
          </Modal.Body>

          <Modal.Footer className="flex justify-end gap-2 border-t border-white/10 pt-3">
            <Button variant="ghost" isDisabled={busy} onPress={closeAndReset}>
              Cancel
            </Button>
            <Button
              variant="tertiary"
              className="!bg-white/5 !text-foreground hover:!bg-white/10"
              isDisabled={busy}
              onPress={() => void onSave()}
            >
              <IconPlus size={16} />
              Save
            </Button>
            <Button
              variant="primary"
              isDisabled={busy}
              onPress={() => void onSaveAndPlay()}
            >
              Save &amp; play
            </Button>
          </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
