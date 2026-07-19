package atradio

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
)

// DefaultAppView is the public atradio.fm AppView base URL.
const DefaultAppView = "https://api.atradio.fm"

// AppView is the read side of the SDK: a thin client over the public atradio.fm
// AppView XRPC (`fm.atradio.*`). Everything here is unauthenticated
// JSON-over-HTTP, so it's usable standalone.
type AppView struct {
	Base   string
	Client *http.Client
}

// NewAppView builds a reader against base (empty → DefaultAppView).
func NewAppView(base string) *AppView {
	if base == "" {
		base = DefaultAppView
	}
	return &AppView{Base: strings.TrimRight(base, "/"), Client: http.DefaultClient}
}

func (a *AppView) query(ctx context.Context, nsid string, params url.Values, out any) error {
	u := fmt.Sprintf("%s/xrpc/%s", a.Base, nsid)
	if len(params) > 0 {
		u += "?" + params.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "atradio-sdk-go")
	res, err := a.Client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	body, _ := io.ReadAll(res.Body)
	if res.StatusCode/100 != 2 {
		return fmt.Errorf("%s -> %d: %s", nsid, res.StatusCode, string(body))
	}
	return json.Unmarshal(body, out)
}

// ---- wire types ----

type ActorInfo struct {
	Did         string `json:"did"`
	Handle      string `json:"handle,omitempty"`
	DisplayName string `json:"displayName,omitempty"`
	Avatar      string `json:"avatar,omitempty"`
}

type StationView struct {
	URI       string      `json:"uri"`
	Station   StationInfo `json:"station"`
	CreatedAt string      `json:"createdAt,omitempty"`
}

type PlayView struct {
	Station  StationInfo `json:"station"`
	PlayedAt string      `json:"playedAt,omitempty"`
	Actor    *ActorInfo  `json:"actor,omitempty"`
}

type CommentView struct {
	URI       string       `json:"uri"`
	Author    *ActorInfo   `json:"author,omitempty"`
	Station   *StationInfo `json:"station,omitempty"`
	Text      string       `json:"text"`
	CreatedAt string       `json:"createdAt,omitempty"`
}

type NotificationView struct {
	URI       string       `json:"uri"`
	Reason    string       `json:"reason"`
	Author    ActorInfo    `json:"author"`
	Station   *StationInfo `json:"station,omitempty"`
	Text      string       `json:"text,omitempty"`
	CreatedAt string       `json:"createdAt,omitempty"`
	IsRead    bool         `json:"isRead"`
}

type ListenerCount struct {
	StationID string `json:"stationId"`
	Listeners int    `json:"listeners"`
}

// PopularItem is a most-favorited station with its favorite count.
type PopularItem struct {
	Station StationInfo `json:"station"`
	Count   int         `json:"count"`
}

// StationList is the paged output of the favorites / stations endpoints.
type StationList struct {
	Cursor string        `json:"cursor,omitempty"`
	Total  int           `json:"total,omitempty"`
	Items  []StationView `json:"items"`
}

// CommentList is the paged output of getComments.
type CommentList struct {
	Cursor string        `json:"cursor,omitempty"`
	Total  int           `json:"total,omitempty"`
	Items  []CommentView `json:"items"`
}

// NotificationList is the paged output of getNotifications.
type NotificationList struct {
	Cursor      string             `json:"cursor,omitempty"`
	UnreadCount int                `json:"unreadCount"`
	Items       []NotificationView `json:"items"`
}

func limitParams(limit int) url.Values {
	return url.Values{"limit": {strconv.Itoa(limit)}}
}

// RecentStations returns the newest stations platform-wide.
func (a *AppView) RecentStations(ctx context.Context, limit int) ([]StationView, error) {
	var out struct {
		Items []StationView `json:"items"`
	}
	err := a.query(ctx, "fm.atradio.getRecentStations", limitParams(limit), &out)
	return out.Items, err
}

// PopularStations returns the most-favorited stations platform-wide.
func (a *AppView) PopularStations(ctx context.Context, limit int) ([]PopularItem, error) {
	var out struct {
		Items []PopularItem `json:"items"`
	}
	err := a.query(ctx, "fm.atradio.getPopularStations", limitParams(limit), &out)
	return out.Items, err
}

// GlobalRecentlyPlayed returns the platform-wide "who's listening" feed.
func (a *AppView) GlobalRecentlyPlayed(ctx context.Context, limit int) ([]PlayView, error) {
	var out struct {
		Items []PlayView `json:"items"`
	}
	err := a.query(ctx, "fm.atradio.getGlobalRecentlyPlayed", limitParams(limit), &out)
	return out.Items, err
}

// RecentlyPlayed returns an actor's recently played stations.
func (a *AppView) RecentlyPlayed(ctx context.Context, actor string, limit int) ([]PlayView, error) {
	var out struct {
		Items []PlayView `json:"items"`
	}
	p := limitParams(limit)
	p.Set("actor", actor)
	err := a.query(ctx, "fm.atradio.getRecentlyPlayed", p, &out)
	return out.Items, err
}

// Favorites returns an actor's favorited stations.
func (a *AppView) Favorites(ctx context.Context, actor string, limit int) (*StationList, error) {
	var out StationList
	p := limitParams(limit)
	p.Set("actor", actor)
	err := a.query(ctx, "fm.atradio.getFavorites", p, &out)
	return &out, err
}

// Stations returns an actor's own created (custom) stations.
func (a *AppView) Stations(ctx context.Context, actor string, limit int) (*StationList, error) {
	var out StationList
	p := limitParams(limit)
	p.Set("actor", actor)
	err := a.query(ctx, "fm.atradio.getStations", p, &out)
	return &out, err
}

// Comments returns the comments on a station, newest first.
func (a *AppView) Comments(ctx context.Context, stationID string, limit int) (*CommentList, error) {
	var out CommentList
	p := limitParams(limit)
	p.Set("station", stationID)
	err := a.query(ctx, "fm.atradio.getComments", p, &out)
	return &out, err
}

// ListenerCounts returns unique-listener counts for up to 100 station ids.
func (a *AppView) ListenerCounts(ctx context.Context, stationIDs []string) ([]ListenerCount, error) {
	if len(stationIDs) == 0 {
		return nil, nil
	}
	var out struct {
		Counts []ListenerCount `json:"counts"`
	}
	p := url.Values{"stations": {strings.Join(stationIDs, ",")}}
	err := a.query(ctx, "fm.atradio.getListenerCounts", p, &out)
	return out.Counts, err
}

// Notifications returns an actor's notifications.
func (a *AppView) Notifications(ctx context.Context, actor string, limit int) (*NotificationList, error) {
	var out NotificationList
	p := limitParams(limit)
	p.Set("actor", actor)
	err := a.query(ctx, "fm.atradio.getNotifications", p, &out)
	return &out, err
}
