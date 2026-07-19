package atradio

// Lexicon collection NSIDs for the fm.atradio.* records this SDK writes.
const (
	NSIDStation       = "fm.atradio.station"
	NSIDFavorite      = "fm.atradio.favorite"
	NSIDComment       = "fm.atradio.comment"
	NSIDReaction      = "fm.atradio.reaction"
	NSIDActorStatus   = "fm.atradio.actor.status"
	NSIDAudioSettings = "fm.atradio.audio.settings"

	// actorStatus + audioSettings are singletons keyed `self`.
	selfRkey = "self"
)

// StationInfo is the self-contained station snapshot embedded in records
// (`fm.atradio.defs#stationInfo`). It's also the input to the write verbs.
type StationInfo struct {
	StationID   string   `json:"stationId"`
	Name        string   `json:"name"`
	StreamURL   string   `json:"streamUrl"`
	Source      string   `json:"source"`
	Description string   `json:"description,omitempty"`
	Genre       string   `json:"genre,omitempty"`
	Homepage    string   `json:"homepage,omitempty"`
	Logo        string   `json:"logo,omitempty"`
	Country     string   `json:"country,omitempty"`
	Language    string   `json:"language,omitempty"`
	Bitrate     int      `json:"bitrate,omitempty"`
	Codec       string   `json:"codec,omitempty"`
	Tags        []string `json:"tags,omitempty"`
}

// StationDraft is user input for creating a custom station.
type StationDraft struct {
	Name      string
	StreamURL string
	Genre     string
	Homepage  string
	Logo      string
}

type favoriteRecord struct {
	Type      string      `json:"$type"`
	Station   StationInfo `json:"station"`
	CreatedAt string      `json:"createdAt"`
}

type commentRecord struct {
	Type      string      `json:"$type"`
	Station   StationInfo `json:"station"`
	Text      string      `json:"text"`
	CreatedAt string      `json:"createdAt"`
}

type stationRecord struct {
	Type      string `json:"$type"`
	Name      string `json:"name"`
	StreamURL string `json:"streamUrl"`
	Genre     string `json:"genre,omitempty"`
	Homepage  string `json:"homepage,omitempty"`
	Logo      string `json:"logo,omitempty"`
	CreatedAt string `json:"createdAt"`
}

type actorStatusRecord struct {
	Type     string      `json:"$type"`
	Station  StationInfo `json:"station"`
	PlayedAt string      `json:"playedAt"`
}

// AudioSettings is the synced DSP/EQ singleton (`fm.atradio.audio.settings`).
// Gains are integers and crossfeedDirect is in tenths of a dB, matching the
// lexicon (and the Rust/web clients).
type AudioSettings struct {
	Type            string `json:"$type,omitempty"`
	EqEnabled       bool   `json:"eqEnabled"`
	EqGains         []int  `json:"eqGains"`
	Bass            int    `json:"bass"`
	Treble          int    `json:"treble"`
	CrossfeedMode   string `json:"crossfeedMode"`
	CrossfeedDirect int    `json:"crossfeedDirect"`
	Pbe             int    `json:"pbe"`
	PbePrecut       int    `json:"pbePrecut"`
	SurroundDelay   int    `json:"surroundDelay"`
	SurroundBalance int    `json:"surroundBalance"`
	CompThreshold   int    `json:"compThreshold"`
	CompRatio       int    `json:"compRatio"`
	ChannelMode     string `json:"channelMode"`
	StereoWidth     int    `json:"stereoWidth"`
	UpdatedAt       string `json:"updatedAt,omitempty"`
}
