package atradio

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// FavoriteRkey is the deterministic record key for a favorite: the first 8
// bytes (64 bits) of sha256(stationID) as lowercase hex — a stable 16-char rkey.
//
// Byte-for-byte identical to the atradio Rust and TypeScript SDKs, so a station
// maps to the same favorite record everywhere and favoriting it is idempotent
// (putRecord overwrites the one record).
func FavoriteRkey(stationID string) string {
	sum := sha256.Sum256([]byte(stationID))
	return hex.EncodeToString(sum[:8])
}

// rkeyFromURI returns the record key (last path segment) of an at:// URI.
func rkeyFromURI(uri string) string {
	i := strings.LastIndexByte(uri, '/')
	if i < 0 {
		return uri
	}
	return uri[i+1:]
}
