// Package atradio is the official Go SDK for atradio.fm, built on the Bluesky
// indigo SDK (github.com/bluesky-social/indigo). It mirrors the Rust and
// TypeScript SDKs: an Agent with high-level record verbs plus a read-only
// AppView client.
package atradio

import (
	"context"
	"fmt"
	"strings"
	"sync"
	"time"

	"github.com/bluesky-social/indigo/xrpc"
)

// LoginOptions configures an app-password login.
type LoginOptions struct {
	// Service is the account's PDS (or an entryway like https://bsky.social).
	Service string
	// Identifier is a handle, DID, or email.
	Identifier string
	Password   string
	// AppView base URL (empty → DefaultAppView).
	AppView string
}

// Agent is the atradio.fm client: an authenticated indigo xrpc.Client plus a
// read-only AppView. Its methods serialize behind a mutex so refresh-token
// rotation can't race (a double-spent refresh token gets the session revoked).
type Agent struct {
	xrpc    *xrpc.Client
	did     string
	AppView *AppView

	mu sync.Mutex
}

type sessionResponse struct {
	AccessJwt  string `json:"accessJwt"`
	RefreshJwt string `json:"refreshJwt"`
	Handle     string `json:"handle"`
	Did        string `json:"did"`
}

// Login authenticates with an app password and returns a ready Agent.
func Login(ctx context.Context, opts LoginOptions) (*Agent, error) {
	host := opts.Service
	if host == "" {
		host = "https://bsky.social"
	}
	client := &xrpc.Client{Host: strings.TrimRight(host, "/")}
	var out sessionResponse
	err := client.Do(ctx, xrpc.Procedure, "application/json", "com.atproto.server.createSession", nil,
		map[string]any{"identifier": opts.Identifier, "password": opts.Password}, &out)
	if err != nil {
		return nil, fmt.Errorf("createSession: %w", err)
	}
	client.Auth = &xrpc.AuthInfo{
		AccessJwt:  out.AccessJwt,
		RefreshJwt: out.RefreshJwt,
		Handle:     out.Handle,
		Did:        out.Did,
	}
	return &Agent{xrpc: client, did: out.Did, AppView: NewAppView(opts.AppView)}, nil
}

// FromClient wraps an already-authenticated indigo xrpc.Client (its Auth.Did is
// used as the acting repo).
func FromClient(client *xrpc.Client, appview string) *Agent {
	did := ""
	if client.Auth != nil {
		did = client.Auth.Did
	}
	return &Agent{xrpc: client, did: did, AppView: NewAppView(appview)}
}

// Did returns the acting account's DID.
func (a *Agent) Did() string { return a.did }

// RefreshSession refreshes the access token using the refresh token and
// persists the rotated tokens on the client. Call it on a timer (and once at
// startup) so writes keep working after a long idle. Returns an error only if
// the refresh token itself is dead (re-login needed).
func (a *Agent) RefreshSession(ctx context.Context) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	if a.xrpc.Auth == nil {
		return fmt.Errorf("not authenticated")
	}
	// refreshSession authenticates with the refresh token, not the access token.
	refresher := &xrpc.Client{
		Host: a.xrpc.Host,
		Auth: &xrpc.AuthInfo{AccessJwt: a.xrpc.Auth.RefreshJwt},
	}
	var out sessionResponse
	if err := refresher.Do(ctx, xrpc.Procedure, "", "com.atproto.server.refreshSession", nil, nil, &out); err != nil {
		return fmt.Errorf("refreshSession: %w", err)
	}
	a.xrpc.Auth.AccessJwt = out.AccessJwt
	a.xrpc.Auth.RefreshJwt = out.RefreshJwt
	return nil
}

func nowRFC3339() string { return time.Now().UTC().Format(time.RFC3339) }

// ---- low-level record ops ----

func (a *Agent) putRecord(ctx context.Context, collection, rkey string, record any) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	in := map[string]any{"repo": a.did, "collection": collection, "rkey": rkey, "record": record}
	return a.xrpc.Do(ctx, xrpc.Procedure, "application/json", "com.atproto.repo.putRecord", nil, in, nil)
}

func (a *Agent) createRecord(ctx context.Context, collection string, record any) (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	in := map[string]any{"repo": a.did, "collection": collection, "record": record}
	var out struct {
		URI string `json:"uri"`
	}
	if err := a.xrpc.Do(ctx, xrpc.Procedure, "application/json", "com.atproto.repo.createRecord", nil, in, &out); err != nil {
		return "", err
	}
	return out.URI, nil
}

func (a *Agent) deleteRecord(ctx context.Context, collection, rkey string) error {
	a.mu.Lock()
	defer a.mu.Unlock()
	in := map[string]any{"repo": a.did, "collection": collection, "rkey": rkey}
	return a.xrpc.Do(ctx, xrpc.Procedure, "application/json", "com.atproto.repo.deleteRecord", nil, in, nil)
}

// ---- write verbs ----

// Favorite favorites a station. Idempotent: the record key is derived from the
// station id (FavoriteRkey), so favoriting twice overwrites one record. It also
// reconciles favorites saved under old random keys — after writing the canonical
// record it deletes any other favorite for the same stationId (matched on the
// record body). Returns the canonical record URI.
func (a *Agent) Favorite(ctx context.Context, station StationInfo) (string, error) {
	canonical := FavoriteRkey(station.StationID)
	rec := favoriteRecord{Type: NSIDFavorite, Station: station, CreatedAt: nowRFC3339()}
	if err := a.putRecord(ctx, NSIDFavorite, canonical, rec); err != nil {
		return "", err
	}
	if rkeys, err := a.favoriteRkeysFor(ctx, station.StationID); err == nil {
		for _, rkey := range rkeys {
			if rkey != canonical {
				_ = a.deleteRecord(ctx, NSIDFavorite, rkey) // best-effort
			}
		}
	}
	return fmt.Sprintf("at://%s/%s/%s", a.did, NSIDFavorite, canonical), nil
}

// Unfavorite deletes every favorite record for the station's stationId.
func (a *Agent) Unfavorite(ctx context.Context, station StationInfo) error {
	rkeys, err := a.favoriteRkeysFor(ctx, station.StationID)
	if err != nil {
		return err
	}
	for _, rkey := range rkeys {
		if err := a.deleteRecord(ctx, NSIDFavorite, rkey); err != nil {
			return err
		}
	}
	return nil
}

// Comment posts a comment on a station. Returns the record URI.
func (a *Agent) Comment(ctx context.Context, station StationInfo, text string) (string, error) {
	rec := commentRecord{Type: NSIDComment, Station: station, Text: text, CreatedAt: nowRFC3339()}
	return a.createRecord(ctx, NSIDComment, rec)
}

// CreateStation creates a custom station. Returns the record URI.
func (a *Agent) CreateStation(ctx context.Context, draft StationDraft) (string, error) {
	rec := stationRecord{
		Type:      NSIDStation,
		Name:      draft.Name,
		StreamURL: draft.StreamURL,
		Genre:     draft.Genre,
		Homepage:  draft.Homepage,
		Logo:      draft.Logo,
		CreatedAt: nowRFC3339(),
	}
	return a.createRecord(ctx, NSIDStation, rec)
}

// SetPlayStatus updates the actor's play-status singleton (rkey `self`).
func (a *Agent) SetPlayStatus(ctx context.Context, station StationInfo) error {
	rec := actorStatusRecord{Type: NSIDActorStatus, Station: station, PlayedAt: nowRFC3339()}
	return a.putRecord(ctx, NSIDActorStatus, selfRkey, rec)
}

// DeletePlayStatus removes the actor's play-status singleton. Idempotent.
func (a *Agent) DeletePlayStatus(ctx context.Context) error {
	if err := a.deleteRecord(ctx, NSIDActorStatus, selfRkey); err != nil && !isNotFound(err) {
		return err
	}
	return nil
}

// GetAudioSettings fetches the synced audio-settings singleton, or nil if none
// exists yet (first run on this account).
func (a *Agent) GetAudioSettings(ctx context.Context) (*AudioSettings, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	var out struct {
		Value AudioSettings `json:"value"`
	}
	params := map[string]any{"repo": a.did, "collection": NSIDAudioSettings, "rkey": selfRkey}
	if err := a.xrpc.Do(ctx, xrpc.Query, "", "com.atproto.repo.getRecord", params, nil, &out); err != nil {
		if isNotFound(err) {
			return nil, nil
		}
		return nil, err
	}
	return &out.Value, nil
}

// PutAudioSettings upserts the audio-settings singleton (rkey `self`).
func (a *Agent) PutAudioSettings(ctx context.Context, settings AudioSettings) error {
	settings.Type = NSIDAudioSettings
	settings.UpdatedAt = nowRFC3339()
	return a.putRecord(ctx, NSIDAudioSettings, selfRkey, settings)
}

// MintServiceAuth mints an atproto service-auth JWT bound to aud (the AppView's
// DID service reference) and lxm (the lexicon method).
func (a *Agent) MintServiceAuth(ctx context.Context, aud, lxm string) (string, error) {
	a.mu.Lock()
	defer a.mu.Unlock()
	var out struct {
		Token string `json:"token"`
	}
	params := map[string]any{"aud": aud, "lxm": lxm, "exp": time.Now().Unix() + 60}
	if err := a.xrpc.Do(ctx, xrpc.Query, "", "com.atproto.server.getServiceAuth", params, nil, &out); err != nil {
		return "", err
	}
	return out.Token, nil
}

// favoriteRkeysFor returns the rkeys of every favorite whose body stationId
// matches. The rkey isn't the join key (schemes differ), so we read the
// stationId out of each record. Paginates the repo.
func (a *Agent) favoriteRkeysFor(ctx context.Context, stationID string) ([]string, error) {
	var rkeys []string
	cursor := ""
	for {
		a.mu.Lock()
		var out struct {
			Cursor  string `json:"cursor"`
			Records []struct {
				URI   string `json:"uri"`
				Value struct {
					Station struct {
						StationID string `json:"stationId"`
					} `json:"station"`
				} `json:"value"`
			} `json:"records"`
		}
		params := map[string]any{"repo": a.did, "collection": NSIDFavorite, "limit": 100}
		if cursor != "" {
			params["cursor"] = cursor
		}
		err := a.xrpc.Do(ctx, xrpc.Query, "", "com.atproto.repo.listRecords", params, nil, &out)
		a.mu.Unlock()
		if err != nil {
			return nil, err
		}
		for _, r := range out.Records {
			if r.Value.Station.StationID == stationID {
				rkeys = append(rkeys, rkeyFromURI(r.URI))
			}
		}
		if out.Cursor == "" || len(out.Records) == 0 {
			break
		}
		cursor = out.Cursor
	}
	return rkeys, nil
}

func isNotFound(err error) bool {
	return err != nil && strings.Contains(err.Error(), "RecordNotFound")
}
