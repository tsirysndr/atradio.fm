//! Turn a station's `stream_url` into something the Rockbox engine can actually
//! decode — the CLI mirror of the web's `apps/web/src/lib/audio/resolve.ts`.
//!
//! The engine plays a single continuous audio stream (mp3/aac/ogg/flac over
//! HTTP, redirects followed). It can *not* read a playlist file as audio, so
//! TuneIn `Tune.ashx` responses and `.pls` / `.m3u` playlists must be unwrapped
//! into the direct stream URL first. HLS (`.m3u8`) is a segmented manifest the
//! engine can't play at all — we flag it so the caller can report that.

use std::time::Duration;

use futures::StreamExt;

/// A resolved stream: the direct URL plus whether it's an (unsupported) HLS
/// manifest.
pub struct Resolved {
    pub url: String,
    pub is_hls: bool,
}

/// `…/foo.m3u8` or `…/foo.m3u8?x=1` — an HLS manifest.
pub fn is_hls_url(url: &str) -> bool {
    let path = url.split('?').next().unwrap_or(url);
    path.to_lowercase().ends_with(".m3u8")
}

/// Does this URL point at a playlist we must unwrap (rather than a direct
/// stream)? `source == "tunein"` proxies always do; otherwise go by extension /
/// the TuneIn `Tune.ashx` marker.
fn looks_like_playlist(url: &str, source: &str) -> bool {
    if source.eq_ignore_ascii_case("tunein") {
        return true;
    }
    let lower = url.to_lowercase();
    if lower.contains("tune.ashx") {
        return true;
    }
    let path = lower.split('?').next().unwrap_or(&lower);
    path.ends_with(".pls") || path.ends_with(".m3u")
}

/// Pull the first playable stream URL out of a playlist body (`.pls` / `.m3u` /
/// OPML text). Mirrors the web's `firstUrlFromPlaylist`.
fn first_url_from_playlist(body: &str) -> Option<String> {
    let text = body.trim();

    // .pls -> `File1=http://...`
    for line in text.lines() {
        let t = line.trim();
        if let Some(eq) = t.find('=') {
            let (key, val) = t.split_at(eq);
            if key.trim().to_lowercase().starts_with("file") {
                let v = val[1..].trim();
                if v.starts_with("http://") || v.starts_with("https://") {
                    return Some(v.to_string());
                }
            }
        }
    }

    // .m3u / plain text -> first non-comment line that looks like a URL.
    for line in text.lines() {
        let t = line.trim();
        if t.is_empty() || t.starts_with('#') {
            continue;
        }
        if t.starts_with("http://") || t.starts_with("https://") {
            return Some(t.to_string());
        }
    }
    None
}

/// GET a playlist body, capped in size + time so a misdetected live stream can
/// never hang us or blow up memory.
async fn fetch_playlist_body(client: &reqwest::Client, url: &str) -> Option<String> {
    let resp = client.get(url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let mut stream = resp.bytes_stream();
    let mut buf: Vec<u8> = Vec::new();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.ok()?;
        buf.extend_from_slice(&chunk);
        if buf.len() > 256 * 1024 {
            break; // playlists are tiny; this is a safety cap
        }
    }
    Some(String::from_utf8_lossy(&buf).into_owned())
}

/// Resolve a station stream URL to a direct, decodable stream. Unwraps up to two
/// levels of playlist. Network failures fall back to the original URL so the
/// engine still gets a chance (and surfaces its own error).
pub async fn resolve_stream(url: &str, source: &str) -> Resolved {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .user_agent(concat!("atradio-cli/", env!("CARGO_PKG_VERSION")))
        .build()
    {
        Ok(c) => c,
        Err(_) => {
            return Resolved {
                url: url.to_string(),
                is_hls: is_hls_url(url),
            }
        }
    };

    let mut current = url.to_string();
    for i in 0..2 {
        if is_hls_url(&current) {
            break;
        }
        // Only trust `source` on the first hop; a resolved URL is judged by its
        // own extension so we never re-fetch a real stream.
        let is_playlist = if i == 0 {
            looks_like_playlist(&current, source)
        } else {
            looks_like_playlist(&current, "")
        };
        if !is_playlist {
            break;
        }
        match fetch_playlist_body(&client, &current).await {
            Some(body) => match first_url_from_playlist(&body) {
                Some(next) => current = next,
                None => break,
            },
            None => break,
        }
    }

    let is_hls = is_hls_url(&current);
    Resolved {
        url: current,
        is_hls,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_hls() {
        assert!(is_hls_url("https://x/hls.m3u8"));
        assert!(is_hls_url("https://x/hls.m3u8?token=1"));
        assert!(!is_hls_url("https://x/radio.mp3"));
    }

    #[test]
    fn flags_playlists() {
        assert!(looks_like_playlist(
            "https://x/Tune.ashx?id=s1",
            "radio-browser"
        ));
        assert!(looks_like_playlist("https://x/y.pls", ""));
        assert!(looks_like_playlist("https://x/y.m3u", ""));
        assert!(looks_like_playlist("https://x/radio.mp3", "tunein"));
        assert!(!looks_like_playlist("https://x/radio.mp3", "radio-browser"));
    }

    #[test]
    fn parses_pls() {
        let body = "[playlist]\nNumberOfEntries=1\nFile1=http://cdn/stream.mp3\nTitle1=X\n";
        assert_eq!(
            first_url_from_playlist(body).as_deref(),
            Some("http://cdn/stream.mp3")
        );
    }

    #[test]
    fn parses_m3u() {
        let body = "#EXTM3U\n#EXTINF:-1,Radio\nhttps://cdn/live/aac\n";
        assert_eq!(
            first_url_from_playlist(body).as_deref(),
            Some("https://cdn/live/aac")
        );
    }
}
