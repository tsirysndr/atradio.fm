export type StationSource = "radio-browser" | "tunein" | "custom";

/**
 * The unified station shape used across the whole app. Results from every
 * provider (radio-browser, TuneIn) and user-created stations are normalized
 * into this model so the UI never has to care where a station came from.
 */
export interface Station {
  /** Stable, source-prefixed id, e.g. `rb:uuid`, `tunein:s12345`, `custom:...`. */
  id: string;
  name: string;
  description?: string;
  genre?: string;
  /** Direct, playable stream URL (or a resolvable playlist/tune URL). */
  streamUrl: string;
  /** Optional homepage / station page. */
  homepage?: string;
  favicon?: string;
  country?: string;
  language?: string;
  bitrate?: number;
  codec?: string;
  tags?: string[];
  source: StationSource;
}

export interface CustomStationInput {
  name: string;
  description?: string;
  genre?: string;
  streamUrl: string;
  homepage?: string;
  /** Optional logo/picture URL shown as the station artwork. */
  logoUrl?: string;
}
