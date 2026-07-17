//! A tiny locally-cached identity, written on login so `whoami` and
//! personalized AppView reads work without a network round-trip.

use std::path::{Path, PathBuf};

use anyhow::Result;
use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profile {
    pub did: String,
    pub handle: String,
    #[serde(default)]
    pub display_name: Option<String>,
    #[serde(default)]
    pub pds: Option<String>,
    /// "password" | "oauth".
    #[serde(default)]
    pub method: String,
}

impl Profile {
    /// "Display Name (@handle)" when a display name is known, else "@handle".
    pub fn label(&self) -> String {
        match self
            .display_name
            .as_deref()
            .filter(|d| !d.trim().is_empty())
        {
            Some(name) => format!("{name} (@{})", self.handle),
            None => format!("@{}", self.handle),
        }
    }
}

impl Profile {
    fn path(session_path: &Path) -> PathBuf {
        session_path.with_file_name("profile.json")
    }

    pub fn load(session_path: &Path) -> Option<Profile> {
        let bytes = std::fs::read(Self::path(session_path)).ok()?;
        serde_json::from_slice(&bytes).ok()
    }

    pub fn save(&self, session_path: &Path) -> Result<()> {
        let p = Self::path(session_path);
        if let Some(dir) = p.parent() {
            std::fs::create_dir_all(dir)?;
        }
        std::fs::write(p, serde_json::to_vec_pretty(self)?)?;
        Ok(())
    }

    pub fn clear(session_path: &Path) {
        let _ = std::fs::remove_file(Self::path(session_path));
    }
}
