use serde::{Deserialize, Serialize};

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub movies_folder: Option<String>,
    pub commentary_folder: Option<String>,
    pub scan_on_startup: bool,
    pub theme: String,
    pub auto_advance_slots: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsPatch {
    pub movies_folder: Option<Option<String>>,
    pub commentary_folder: Option<Option<String>>,
    pub scan_on_startup: Option<bool>,
    pub theme: Option<String>,
    pub auto_advance_slots: Option<bool>,
}

#[derive(Debug, Serialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct MatchSummary {
    pub matched: usize,
    pub low_confidence: usize,
    pub missing: usize,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub last_scan_at: String,
    pub movie_file_count: usize,
    pub commentary_file_count: usize,
    pub errors: Vec<String>,
    pub missing_folders: Vec<String>,
    pub match_summary: MatchSummary,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFileListRow {
    pub id: String,
    pub filename: String,
    pub display_name: Option<String>,
    pub path: String,
    pub size_bytes: Option<i64>,
    pub last_seen_at: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileMatchRow {
    pub file_type: String,
    pub filename: Option<String>,
    pub display_name: Option<String>,
    pub path: Option<String>,
    pub confidence: Option<f64>,
    pub status: String,
    pub is_user_overridden: bool,
    pub matched_at: Option<String>,
}

#[derive(Serialize, Clone, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackCutRow {
    pub id: String,
    pub sort_order: i64,
    pub source_type: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub user_offset_ms: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MovieSlotRow {
    pub id: String,
    pub slot: String,
    pub commentary: Option<String>,
    pub movie_title: Option<String>,
    pub movie_year: Option<i64>,
    pub movie_match: FileMatchRow,
    pub commentary_match: FileMatchRow,
    pub cuts: Vec<PlaybackCutRow>,
    pub flagged_for_timing: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackEntryRow {
    pub order: i64,
    pub source: String,
    pub file_path: String,
    pub start_ms: i64,
    pub end_ms: i64,
    pub effective_start_ms: i64,
    pub effective_end_ms: i64,
    pub cut_id: String,
    pub global_start_ms: i64,
    pub global_end_ms: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeRow {
    pub id: String,
    pub title: String,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    pub is_special: bool,
    pub air_date: Option<String>,
    pub description: Option<String>,
    pub guests: Option<String>,
    pub slots: Vec<MovieSlotRow>,
}
