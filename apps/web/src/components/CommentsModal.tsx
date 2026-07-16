import { useAtom } from "jotai";
import { Modal, useOverlayState } from "@heroui/react";
import { IconMessage2 } from "@tabler/icons-react";
import { commentsStationAtom } from "@/atoms/ui";
import { StationLogo } from "./StationLogo";
import { CommentsPanel } from "./CommentsPanel";

/** Comments for any station, opened from station cards + the miniplayer. */
export function CommentsModal() {
  const [station, setStation] = useAtom(commentsStationAtom);
  const state = useOverlayState({
    isOpen: station !== null,
    onOpenChange: (open) => {
      if (!open) setStation(null);
    },
  });

  return (
    <Modal state={state}>
      <Modal.Backdrop variant="blur">
        <Modal.Container placement="center" size="md">
          <Modal.Dialog className="mx-4 flex max-h-[85vh] w-[calc(100vw-2rem)] max-w-lg flex-col border border-white/10 bg-synth-surface">
            {station && (
              <>
                <Modal.Header className="flex items-center gap-3 border-b border-white/10 pb-3">
                  <StationLogo station={station} size={40} />
                  <div className="min-w-0">
                    <Modal.Heading className="flex items-center gap-1.5 truncate font-display text-base">
                      <IconMessage2 size={16} className="text-synth-pink" />
                      Comments
                    </Modal.Heading>
                    <p className="truncate text-xs text-foreground/50">
                      {station.name}
                    </p>
                  </div>
                </Modal.Header>
                <Modal.Body className="overflow-y-auto py-4">
                  <CommentsPanel station={station} />
                </Modal.Body>
              </>
            )}
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
