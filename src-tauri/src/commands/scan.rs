use chrono::Utc;
use serde::Serialize;
use sqlx::SqlitePool;
use std::{
    collections::{HashMap, HashSet},
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use strsim::jaro_winkler;
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

const SUPPORTED_EXTENSIONS: &[&str] = &["mp4", "mkv", "m4v", "mov"];

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
    pub segment_file_count: usize,
    pub errors: Vec<String>,
    pub missing_folders: Vec<String>,
    pub match_summary: MatchSummary,
}

// Only used during matching phase
struct SlotMatchRow {
    id: String,
    movie_title: Option<String>,
    movie_aliases_json: Option<String>,
    host_label: Option<String>,
}

struct MediaFileRow {
    id: String,
    filename: String,
    path: String,
    folder_root: String,
    size_bytes: Option<i64>,
    last_seen_at: String,
}

struct WalkResult {
    rows: Vec<MediaFileRow>,
    warnings: Vec<String>,
    /// Set when the root path could not be accessed (does not exist / no permission).
    missing_folder: Option<String>,
}

fn has_video_extension(s: &str) -> bool {
    Path::new(s)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

// normalize_filename
// Strip the file extension and remove parenthesised year tags.
//
// `"The Slumber Party Massacre (1982).mkv"` → `"The Slumber Party Massacre"`
// `"sleepaway_camp_1983.mp4"` → `"sleepaway_camp_1983"`
//
// Original casing is preserved.
pub fn normalize_filename(filename: &str) -> String {
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    strip_year_tags(stem).trim().to_string()
}

fn strip_year_tags(s: &str) -> String {
    let mut result = s.to_string();
    loop {
        match find_year_tag(&result) {
            Some((start, end)) => {
                result.drain(start..end);
            }
            None => break,
        }
    }
    result
}

// Returns the byte range `(start, end)` of the first `(NNNN)` year tag in `s`,
// including any single space immediately before the opening parenthesis.
fn find_year_tag(s: &str) -> Option<(usize, usize)> {
    let bytes = s.as_bytes();
    for i in 0..bytes.len() {
        if bytes[i] == b'('
            && i + 5 < bytes.len()
            && bytes[i + 1].is_ascii_digit()
            && bytes[i + 2].is_ascii_digit()
            && bytes[i + 3].is_ascii_digit()
            && bytes[i + 4].is_ascii_digit()
            && bytes[i + 5] == b')'
        {
            let start = if i > 0 && bytes[i - 1] == b' ' { i - 1 } else { i };
            let end = i + 6;
            return Some((start, end));
        }
    }
    None
}
// TODO: Handle special naming conventions(IE CHUD)
// normalize_for_match
// Level-2 normalisation for fuzzy comparison.
// If the input looks like a video filename, applies normalize_filename first.
// Then: lowercase → underscores/dots → spaces → collapse whitespace.
//
// `"Castle Freak (1995).mkv"` → `"castle freak"`
// `"castle_freak_1995.mkv"` → `"castle freak 1995"`
// `"S01E01A Segments"` → `"s01e01a segments"`
pub fn normalize_for_match(input: &str) -> String {
    let stem = if has_video_extension(input) {
        normalize_filename(input)
    } else {
        input.to_string()
    };
    stem.to_lowercase()
        .replace(['_', '.'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn walk_folder(root: String, folder_root: &'static str) -> WalkResult {
    if !Path::new(&root).is_dir() {
        return WalkResult {
            rows: vec![],
            warnings: vec![],
            missing_folder: Some(root),
        };
    }

    let now = Utc::now().to_rfc3339();
    let mut rows = Vec::new();
    let mut warnings = Vec::new();

    for entry_result in WalkDir::new(&root) {
        let entry = match entry_result {
            Ok(e) => e,
            Err(e) => {
                warnings.push(format!("IO_ERROR: {e}"));
                continue;
            }
        };

        if !entry.file_type().is_file() {
            continue;
        }

        let has_supported_ext = entry
            .path()
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
            .unwrap_or(false);

        if !has_supported_ext {
            continue;
        }

        let path_str = entry.path().to_string_lossy().into_owned();
        let filename = entry
            .path()
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("")
            .to_string();

        let size_bytes = match entry.metadata() {
            Ok(m) => Some(m.len() as i64),
            Err(e) => {
                warnings.push(format!("IO_ERROR: could not stat {path_str}: {e}"));
                None
            }
        };

        rows.push(MediaFileRow {
            id: Uuid::new_v4().to_string(),
            filename,
            path: path_str,
            folder_root: folder_root.to_string(),
            size_bytes,
            last_seen_at: now.clone(),
        });
    }

    WalkResult {
        rows,
        warnings,
        missing_folder: None,
    }
}

// mark_missing — flip is_missing=1 for rows absent from this scan
async fn mark_missing(
    pool: &SqlitePool,
    folder_root: &str,
    seen_paths: &HashSet<String>,
) -> Result<(), String> {
    let db_paths: Vec<(String,)> =
        sqlx::query_as("SELECT path FROM media_file WHERE folder_root = ? AND is_missing = 0")
            .bind(folder_root)
            .fetch_all(pool)
            .await
            .map_err(|e| format!("DB_ERROR: {e}"))?;

    for (path,) in db_paths {
        if !seen_paths.contains(&path) {
            sqlx::query("UPDATE media_file SET is_missing = 1 WHERE path = ?")
                .bind(&path)
                .execute(pool)
                .await
                .map_err(|e| format!("DB_ERROR: {e}"))?;
        }
    }
    Ok(())
}

pub async fn scan_library_inner(
    pool: &SqlitePool,
    scanning: &Arc<AtomicBool>,
) -> Result<ScanResult, String> {
    // Read configured folders.
    let row: (Option<String>, Option<String>) =
        sqlx::query_as("SELECT movies_folder, segments_folder FROM app_settings WHERE id = 1")
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .unwrap_or((None, None));

    let (movies_folder, segments_folder) = match (row.0, row.1) {
        (Some(m), Some(s)) => (m, s),
        _ => {
            return Err("IO_ERROR: movies_folder and segments_folder must both be configured before scanning".to_string());
        }
    };

    // Guard against concurrent scans.
    let already_running =
        scanning.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst);
    if already_running.is_err() {
        return Err("SCAN_IN_PROGRESS: a scan is already running".to_string());
    }

    // Walk both folders on blocking threads
    let movies_folder_clone = movies_folder.clone();
    let movie_walk = tokio::task::spawn_blocking(move || walk_folder(movies_folder_clone, "movies"))
        .await
        .map_err(|e| {
            scanning.store(false, Ordering::SeqCst);
            format!("IO_ERROR: {e}")
        })?;

    let segments_folder_clone = segments_folder.clone();
    let segment_walk =
        tokio::task::spawn_blocking(move || walk_folder(segments_folder_clone, "segments"))
            .await
            .map_err(|e| {
                scanning.store(false, Ordering::SeqCst);
                format!("IO_ERROR: {e}")
            })?;

    let movie_file_count = movie_walk.rows.len();
    let segment_file_count = segment_walk.rows.len();

    let mut errors: Vec<String> = movie_walk
        .warnings
        .into_iter()
        .chain(segment_walk.warnings)
        .collect();

    let missing_folders: Vec<String> = movie_walk
        .missing_folder
        .into_iter()
        .chain(segment_walk.missing_folder)
        .collect();

    // UPSERT all found files.  The candidate UUID is only used for new rows —
    // ON CONFLICT(path) preserves the original id on update.
    let mut seen_movie_paths: HashSet<String> = HashSet::new();
    let mut seen_segment_paths: HashSet<String> = HashSet::new();

    for row in movie_walk.rows.iter().chain(segment_walk.rows.iter()) {
        let display_name = normalize_filename(&row.filename);
        let result = sqlx::query(
            "INSERT INTO media_file (id, filename, display_name, path, folder_root, size_bytes, last_seen_at, is_missing)
             VALUES (?, ?, ?, ?, ?, ?, ?, 0)
             ON CONFLICT(path) DO UPDATE SET
               filename     = excluded.filename,
               display_name = COALESCE(media_file.display_name, excluded.display_name),
               size_bytes   = excluded.size_bytes,
               last_seen_at = excluded.last_seen_at,
               is_missing   = 0",
        )
        .bind(&row.id)
        .bind(&row.filename)
        .bind(&display_name)
        .bind(&row.path)
        .bind(&row.folder_root)
        .bind(row.size_bytes)
        .bind(&row.last_seen_at)
        .execute(pool)
        .await;

        match result {
            Ok(_) => {
                if row.folder_root == "movies" {
                    seen_movie_paths.insert(row.path.clone());
                } else {
                    seen_segment_paths.insert(row.path.clone());
                }
            }
            Err(e) => errors.push(format!("DB_ERROR: could not upsert {}: {e}", row.path)),
        }
    }

    // Mark any previously-seen files that were not found this scan as missing.
    // Note: if the user has changed movies_folder or segments_folder to a different
    // path, all rows from the old path will be marked is_missing=1 — this is
    // intentional; they are preserved for diagnostics.
    if let Err(e) = mark_missing(pool, "movies", &seen_movie_paths).await {
        errors.push(e);
    }
    if let Err(e) = mark_missing(pool, "segments", &seen_segment_paths).await {
        errors.push(e);
    }

    // Run matching pass — non-fatal; errors are appended to the scan errors list.
    let match_summary = match match_media_files(pool).await {
        Ok(s) => s,
        Err(e) => {
            errors.push(e);
            MatchSummary::default()
        }
    };

    let last_scan_at = Utc::now().to_rfc3339();
    let errors_json = serde_json::to_string(&errors).unwrap_or_else(|_| "[]".to_string());
    let missing_folders_json =
        serde_json::to_string(&missing_folders).unwrap_or_else(|_| "[]".to_string());
    let persist_result = sqlx::query(
        "INSERT OR REPLACE INTO scan_summary
         (id, last_scan_at, movie_file_count, segment_file_count, errors_json, missing_folders_json,
          matched_count, low_confidence_count, missing_count)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&last_scan_at)
    .bind(movie_file_count as i64)
    .bind(segment_file_count as i64)
    .bind(&errors_json)
    .bind(&missing_folders_json)
    .bind(match_summary.matched as i64)
    .bind(match_summary.low_confidence as i64)
    .bind(match_summary.missing as i64)
    .execute(pool)
    .await;

    if let Err(e) = persist_result {
        errors.push(format!("DB_ERROR: could not persist scan summary: {e}"));
    }

    scanning.store(false, Ordering::SeqCst);

    Ok(ScanResult {
        last_scan_at,
        movie_file_count,
        segment_file_count,
        errors,
        missing_folders,
        match_summary,
    })
}

pub async fn match_media_files(pool: &SqlitePool) -> Result<MatchSummary, String> {
    let slots: Vec<SlotMatchRow> = sqlx::query_as::<_, (String, Option<String>, Option<String>, Option<String>)>(
        "SELECT id, movie_title, movie_aliases_json, host_label FROM movie_slot",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("DB_ERROR: {e}"))
    .map(|rows| {
        rows.into_iter()
            .map(|(id, movie_title, movie_aliases_json, host_label)| SlotMatchRow {
                id,
                movie_title,
                movie_aliases_json,
                host_label,
            })
            .collect()
    })?;

    if slots.is_empty() {
        return Ok(MatchSummary::default());
    }

    // Load all non-missing media files.
    let all_files: Vec<(String, String, String)> =
        sqlx::query_as("SELECT id, filename, folder_root FROM media_file WHERE is_missing = 0")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("DB_ERROR: {e}"))?;

    let movie_files: Vec<(String, String)> = all_files
        .iter()
        .filter(|(_, _, root)| root == "movies")
        .map(|(id, filename, _)| (id.clone(), filename.clone()))
        .collect();

    let segment_files: Vec<(String, String)> = all_files
        .iter()
        .filter(|(_, _, root)| root == "segments")
        .map(|(id, filename, _)| (id.clone(), filename.clone()))
        .collect();

    let mut movie_candidates: Vec<(f64, String, String)> = Vec::new();

    for (file_id, filename) in &movie_files {
        let norm_file = normalize_for_match(filename);

        for slot in &slots {
            let score = score_movie_match(&norm_file, slot);

            if score > 0.0 {
                movie_candidates.push((score, slot.id.clone(), file_id.clone()));
            }
        }
    }

    let mut segment_candidates: Vec<(f64, String, String)> = Vec::new();

    for (file_id, filename) in &segment_files {
        let norm_file = normalize_for_match(filename);

        for slot in &slots {
            let Some(ref host_label) = slot.host_label else {
                continue;
            };
            let score = jaro_winkler(&norm_file, &normalize_for_match(host_label));

            if score > 0.0 {
                segment_candidates.push((score, slot.id.clone(), file_id.clone()));
            }
        }
    }

    // Assign best-match uniqueness for each file type.
    let movie_assignments = assign_best_matches(movie_candidates);
    let segment_assignments = assign_best_matches(segment_candidates);

    let now = Utc::now().to_rfc3339();
    let mut summary = MatchSummary::default();

    // Persist movie matches.
    for slot in &slots {
        let outcome = movie_assignments.get(&slot.id);
        upsert_file_match(pool, &slot.id, "movie", outcome, &now, &mut summary).await?;
    }

    // Persist segment matches.
    for slot in &slots {
        if slot.host_label.is_none() {
            // No host_label — can't match segments; insert missing.
            upsert_file_match(pool, &slot.id, "segment", None, &now, &mut summary).await?;
            continue;
        }
        let outcome = segment_assignments.get(&slot.id);
        upsert_file_match(pool, &slot.id, "segment", outcome, &now, &mut summary).await?;
    }

    Ok(summary)
}

// Score a normalised filename against a slot's movie title and aliases.
// Returns the best score found; exact alias normalised match is forced to 1.0.
fn score_movie_match(norm_file: &str, slot: &SlotMatchRow) -> f64 {
    let mut best: f64 = 0.0;

    if let Some(ref title) = slot.movie_title {
        let norm_title = normalize_for_match(title);
        let s = jaro_winkler(norm_file, &norm_title);
        if s > best {
            best = s;
        }
    }

    if let Some(ref aliases_json) = slot.movie_aliases_json {
        if let Ok(aliases) = serde_json::from_str::<Vec<String>>(aliases_json) {
            for alias in aliases {
                let norm_alias = normalize_for_match(&alias);
                // Exact normalised alias match → force 1.0
                if norm_alias == norm_file {
                    return 1.0;
                }
                let s = jaro_winkler(norm_file, &norm_alias);
                if s > best {
                    best = s;
                }
            }
        }
    }

    best
}

// Given scored (score, slot_id, file_id) candidates, return the best unique
// assignment as a map of slot_id → (file_id, score).
fn assign_best_matches(mut candidates: Vec<(f64, String, String)>) -> HashMap<String, (String, f64)> {
    // Sort descending by score.
    candidates.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));

    let mut claimed_files: HashSet<String> = HashSet::new();
    let mut claimed_slots: HashSet<String> = HashSet::new();
    let mut assignments: HashMap<String, (String, f64)> = HashMap::new();

    for (score, slot_id, file_id) in candidates {
        if claimed_slots.contains(&slot_id) || claimed_files.contains(&file_id) {
            continue;
        }
        claimed_slots.insert(slot_id.clone());
        claimed_files.insert(file_id.clone());
        assignments.insert(slot_id, (file_id, score));
    }

    assignments
}

async fn upsert_file_match(
    pool: &SqlitePool,
    slot_id: &str,
    file_type: &str,
    outcome: Option<&(String, f64)>,
    now: &str,
    summary: &mut MatchSummary,
) -> Result<(), String> {
    let (media_file_id, match_status, confidence): (Option<String>, &str, f64) = match outcome {
        Some((fid, score)) if *score >= 0.85 => {
            summary.matched += 1;
            (Some(fid.clone()), "matched", *score)
        }
        Some((fid, score)) if *score >= 0.50 => {
            summary.low_confidence += 1;
            (Some(fid.clone()), "low-confidence", *score)
        }
        _ => {
            summary.missing += 1;
            (None, "missing", 0.0)
        }
    };

    sqlx::query(
        "INSERT INTO file_match (slot_id, file_type, media_file_id, match_status, confidence,
                                 is_user_overridden, matched_at)
         VALUES (?, ?, ?, ?, ?, 0, ?)
         ON CONFLICT(slot_id, file_type) DO UPDATE SET
             media_file_id  = excluded.media_file_id,
             match_status   = excluded.match_status,
             confidence     = excluded.confidence,
             matched_at     = excluded.matched_at
         WHERE is_user_overridden = 0",
    )
    .bind(slot_id)
    .bind(file_type)
    .bind(&media_file_id)
    .bind(match_status)
    .bind(confidence)
    .bind(now)
    .execute(pool)
    .await
    .map_err(|e| format!("DB_ERROR: {e}"))?;

    Ok(())
}


pub async fn get_scan_summary_inner(pool: &SqlitePool) -> Result<Option<ScanResult>, String> {
    let row = sqlx::query_as::<_, (String, i64, i64, String, String, i64, i64, i64)>(
        "SELECT last_scan_at, movie_file_count, segment_file_count, errors_json, missing_folders_json,
                matched_count, low_confidence_count, missing_count
         FROM scan_summary WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("DB_ERROR: {e}"))?;

    match row {
        None => Ok(None),
        Some((last_scan_at, movie_file_count, segment_file_count, errors_json, missing_json,
              matched_count, low_confidence_count, missing_count)) => {
            let errors: Vec<String> = serde_json::from_str(&errors_json)
                .map_err(|e| format!("DB_ERROR: failed to parse errors_json: {e}"))?;
            let missing_folders: Vec<String> = serde_json::from_str(&missing_json)
                .map_err(|e| format!("DB_ERROR: failed to parse missing_folders_json: {e}"))?;
            Ok(Some(ScanResult {
                last_scan_at,
                movie_file_count: movie_file_count as usize,
                segment_file_count: segment_file_count as usize,
                errors,
                missing_folders,
                match_summary: MatchSummary {
                    matched: matched_count as usize,
                    low_confidence: low_confidence_count as usize,
                    missing: missing_count as usize,
                },
            }))
        }
    }
}

#[tauri::command]
pub async fn scan_library(
    pool: State<'_, SqlitePool>,
    scanning: State<'_, Arc<AtomicBool>>,
) -> Result<ScanResult, String> {
    scan_library_inner(pool.inner(), scanning.inner()).await
}

#[tauri::command]
pub async fn get_scan_summary(pool: State<'_, SqlitePool>) -> Result<Option<ScanResult>, String> {
    get_scan_summary_inner(pool.inner()).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;
    use tempfile::TempDir;

    async fn setup() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .unwrap();
        sqlx::migrate!("src/db/migrations")
            .run(&pool)
            .await
            .unwrap();
        pool
    }

    async fn setup_with_folders(movies: &str, segments: &str) -> SqlitePool {
        let pool = setup().await;
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO app_settings (id, movies_folder, segments_folder, scan_on_startup, theme, created_at, updated_at)
             VALUES (1, ?, ?, 0, 'dark', ?, ?)",
        )
        .bind(movies)
        .bind(segments)
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();
        pool
    }

    async fn seed_slot_with_title(pool: &SqlitePool, episode_id: &str, slot: &str, title: &str) -> String {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO episode (id, title, is_special, created_at) VALUES (?, 'T', 0, ?)",
        )
        .bind(episode_id)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
        let slot_id = format!("{}-{}", episode_id, slot);
        sqlx::query(
            "INSERT INTO movie_slot (id, episode_id, slot, movie_title) VALUES (?, ?, ?, ?)",
        )
        .bind(&slot_id)
        .bind(episode_id)
        .bind(slot)
        .bind(title)
        .execute(pool)
        .await
        .unwrap();
        slot_id
    }

    async fn seed_slot_with_host(pool: &SqlitePool, episode_id: &str, slot: &str, title: &str, host_label: &str) -> String {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT OR IGNORE INTO episode (id, title, is_special, created_at) VALUES (?, 'T', 0, ?)",
        )
        .bind(episode_id)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
        let slot_id = format!("{}-{}", episode_id, slot);
        sqlx::query(
            "INSERT INTO movie_slot (id, episode_id, slot, movie_title, host_label) VALUES (?, ?, ?, ?, ?)",
        )
        .bind(&slot_id)
        .bind(episode_id)
        .bind(slot)
        .bind(title)
        .bind(host_label)
        .execute(pool)
        .await
        .unwrap();
        slot_id
    }

    async fn seed_media_file_named(pool: &SqlitePool, id: &str, filename: &str, folder_root: &str) {
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO media_file (id, filename, path, folder_root, last_seen_at, is_missing)
             VALUES (?, ?, ?, ?, ?, 0)",
        )
        .bind(id)
        .bind(filename)
        .bind(format!("/fake/{}", filename))
        .bind(folder_root)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
    }

    fn flag() -> Arc<AtomicBool> {
        Arc::new(AtomicBool::new(false))
    }

    fn touch(dir: &TempDir, name: &str) -> std::path::PathBuf {
        let path = dir.path().join(name);
        std::fs::write(&path, b"").unwrap();
        path
    }

    #[test]
    fn normalize_filename_strips_extension() {
        assert_eq!(normalize_filename("film.mkv"), "film");
    }

    #[test]
    fn normalize_filename_strips_year_tag() {
        assert_eq!(
            normalize_filename("The Slumber Party Massacre (1982).mkv"),
            "The Slumber Party Massacre"
        );
    }

    #[test]
    fn normalize_filename_preserves_casing() {
        assert_eq!(normalize_filename("Castle Freak.mkv"), "Castle Freak");
    }

    #[test]
    fn normalize_filename_trims_whitespace() {
        assert_eq!(normalize_filename("The Thing (1982).mkv"), "The Thing");
    }

    #[test]
    fn normalize_filename_no_year_unchanged() {
        assert_eq!(
            normalize_filename("sleepaway_camp_1983.mp4"),
            "sleepaway_camp_1983"
        );
    }

    #[tokio::test]
    async fn scan_library_errors_when_folders_unset() {
        let pool = setup().await;
        let result = scan_library_inner(&pool, &flag()).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("IO_ERROR"));
    }

    #[tokio::test]
    async fn scan_library_succeeds_when_folders_set() {
        // Non-existent folders → ScanResult with missing_folders, still Ok.
        let pool = setup_with_folders("/nonexistent_movies", "/nonexistent_segments").await;
        let result = scan_library_inner(&pool, &flag()).await;
        assert!(result.is_ok());
        let r = result.unwrap();
        assert_eq!(r.movie_file_count, 0);
        assert_eq!(r.missing_folders.len(), 2);
    }

    #[tokio::test]
    async fn scan_library_returns_scan_in_progress_on_double_call() {
        let pool = setup_with_folders("/movies", "/segments").await;
        let scanning = flag();
        scanning.store(true, Ordering::SeqCst);
        let result = scan_library_inner(&pool, &scanning).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("SCAN_IN_PROGRESS"));
    }

    #[tokio::test]
    async fn scan_library_indexes_video_files() {
        let movies_dir = TempDir::new().unwrap();
        let segments_dir = TempDir::new().unwrap();
        touch(&movies_dir, "film.mkv");
        touch(&movies_dir, "another.mp4");

        let pool = setup_with_folders(
            movies_dir.path().to_str().unwrap(),
            segments_dir.path().to_str().unwrap(),
        )
        .await;

        let result = scan_library_inner(&pool, &flag()).await.unwrap();
        assert_eq!(result.movie_file_count, 2);
        assert_eq!(result.segment_file_count, 0);

        let count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM media_file WHERE folder_root = 'movies'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(count.0, 2);
    }

    #[tokio::test]
    async fn scan_library_ignores_non_video_files() {
        let movies_dir = TempDir::new().unwrap();
        let segments_dir = TempDir::new().unwrap();
        touch(&movies_dir, "film.mkv");
        touch(&movies_dir, "info.nfo");
        touch(&movies_dir, "cover.jpg");
        touch(&movies_dir, "subtitles.srt");

        let pool = setup_with_folders(
            movies_dir.path().to_str().unwrap(),
            segments_dir.path().to_str().unwrap(),
        )
        .await;

        let result = scan_library_inner(&pool, &flag()).await.unwrap();
        assert_eq!(result.movie_file_count, 1);

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM media_file")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1);
    }

    #[tokio::test]
    async fn scan_library_walks_subdirectories() {
        let movies_dir = TempDir::new().unwrap();
        let segments_dir = TempDir::new().unwrap();

        let sub = movies_dir.path().join("subfolder");
        std::fs::create_dir_all(&sub).unwrap();
        std::fs::write(sub.join("nested.mkv"), b"").unwrap();
        touch(&movies_dir, "top_level.mp4");

        let pool = setup_with_folders(
            movies_dir.path().to_str().unwrap(),
            segments_dir.path().to_str().unwrap(),
        )
        .await;

        let result = scan_library_inner(&pool, &flag()).await.unwrap();
        assert_eq!(result.movie_file_count, 2);
    }

    #[tokio::test]
    async fn scan_library_is_idempotent() {
        let movies_dir = TempDir::new().unwrap();
        let segments_dir = TempDir::new().unwrap();
        touch(&movies_dir, "film.mkv");

        let pool = setup_with_folders(
            movies_dir.path().to_str().unwrap(),
            segments_dir.path().to_str().unwrap(),
        )
        .await;

        scan_library_inner(&pool, &flag()).await.unwrap();
        scan_library_inner(&pool, &flag()).await.unwrap();

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM media_file")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1);
    }

    #[tokio::test]
    async fn scan_library_marks_removed_file_missing() {
        let movies_dir = TempDir::new().unwrap();
        let segments_dir = TempDir::new().unwrap();
        let file_path = touch(&movies_dir, "film.mkv");

        let pool = setup_with_folders(
            movies_dir.path().to_str().unwrap(),
            segments_dir.path().to_str().unwrap(),
        )
        .await;

        scan_library_inner(&pool, &flag()).await.unwrap();
        let missing: (i64,) =
            sqlx::query_as("SELECT is_missing FROM media_file WHERE filename = 'film.mkv'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(missing.0, 0, "file should not be missing after first scan");

        std::fs::remove_file(&file_path).unwrap();
        scan_library_inner(&pool, &flag()).await.unwrap();

        let missing: (i64,) =
            sqlx::query_as("SELECT is_missing FROM media_file WHERE filename = 'film.mkv'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(missing.0, 1, "file should be marked missing after deletion");
    }

    #[tokio::test]
    async fn scan_library_handles_missing_folder() {
        let pool =
            setup_with_folders("/does_not_exist_movies", "/does_not_exist_segments").await;
        let result = scan_library_inner(&pool, &flag()).await;
        assert!(result.is_ok(), "missing folders should not return Err");
        let r = result.unwrap();
        assert!(r.missing_folders.contains(&"/does_not_exist_movies".to_string()));
        assert!(r.missing_folders.contains(&"/does_not_exist_segments".to_string()));
    }

    #[tokio::test]
    async fn get_scan_summary_returns_none_before_scan() {
        let pool = setup().await;
        let result = get_scan_summary_inner(&pool).await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn get_scan_summary_returns_result_after_scan() {
        let movies_dir = TempDir::new().unwrap();
        let segments_dir = TempDir::new().unwrap();
        touch(&movies_dir, "a.mkv");
        touch(&segments_dir, "b.mp4");

        let pool = setup_with_folders(
            movies_dir.path().to_str().unwrap(),
            segments_dir.path().to_str().unwrap(),
        )
        .await;

        scan_library_inner(&pool, &flag()).await.unwrap();

        let summary = get_scan_summary_inner(&pool).await.unwrap();
        assert!(summary.is_some());
        let s = summary.unwrap();
        assert_eq!(s.movie_file_count, 1);
        assert_eq!(s.segment_file_count, 1);
        assert!(s.missing_folders.is_empty());
        assert!(s.errors.is_empty());
    }

    #[test]
    fn normalize_for_match_lowercases() {
        assert_eq!(normalize_for_match("Castle Freak"), "castle freak");
    }

    #[test]
    fn normalize_for_match_replaces_underscores() {
        assert_eq!(
            normalize_for_match("castle_freak_1995.mkv"),
            "castle freak 1995"
        );
    }

    #[test]
    fn normalize_for_match_replaces_dots() {
        assert_eq!(normalize_for_match("C.H.U.D..mkv"), "c h u d");
    }

    #[test]
    fn normalize_for_match_collapses_whitespace() {
        assert_eq!(normalize_for_match("The  Thing"), "the thing");
    }

    #[test]
    fn normalize_for_match_strips_year_and_lowercases() {
        assert_eq!(normalize_for_match("Film (1982).mkv"), "film");
    }

    #[tokio::test]
    async fn match_media_files_exact_title() {
        let pool = setup().await;
        let slot_id = seed_slot_with_title(&pool, "ep-1", "a", "Castle Freak").await;
        seed_media_file_named(&pool, "mf-1", "Castle Freak (1995).mkv", "movies").await;

        let summary = match_media_files(&pool).await.unwrap();
        assert_eq!(summary.matched, 1);

        let row: (Option<String>, String, f64) = sqlx::query_as(
            "SELECT media_file_id, match_status, confidence FROM file_match WHERE slot_id = ? AND file_type = 'movie'",
        )
        .bind(&slot_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0.as_deref(), Some("mf-1"));
        assert_eq!(row.1, "matched");
        assert!(row.2 >= 0.85);
    }

    #[tokio::test]
    async fn match_media_files_underscore_title() {
        let pool = setup().await;
        let slot_id = seed_slot_with_title(&pool, "ep-1", "a", "Castle Freak").await;
        seed_media_file_named(&pool, "mf-1", "castle_freak_1995.mkv", "movies").await;

        let summary = match_media_files(&pool).await.unwrap();
        assert_eq!(summary.matched, 1);

        let row: (String,) = sqlx::query_as(
            "SELECT match_status FROM file_match WHERE slot_id = ? AND file_type = 'movie'",
        )
        .bind(&slot_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0, "matched");
    }

    #[tokio::test]
    async fn match_media_files_alias_exact() {
        let pool = setup().await;
        // Alias normalises to the same string as the filename.
        let now = Utc::now().to_rfc3339();
        sqlx::query("INSERT INTO episode (id, title, is_special, created_at) VALUES ('ep-1', 'T', 0, ?)")
            .bind(&now)
            .execute(&pool)
            .await
            .unwrap();
        sqlx::query(
            "INSERT INTO movie_slot (id, episode_id, slot, movie_title, movie_aliases_json)
             VALUES ('ep-1-a', 'ep-1', 'a', 'Castle Freak', '[\"castle freak 95\"]')",
        )
        .execute(&pool)
        .await
        .unwrap();
        // File normalises to "castle freak 95"
        seed_media_file_named(&pool, "mf-1", "castle_freak_95.mkv", "movies").await;

        let summary = match_media_files(&pool).await.unwrap();
        assert_eq!(summary.matched, 1);

        let row: (f64,) = sqlx::query_as(
            "SELECT confidence FROM file_match WHERE slot_id = 'ep-1-a' AND file_type = 'movie'",
        )
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0, 1.0, "exact alias match should force confidence to 1.0");
    }

    #[tokio::test]
    async fn match_media_files_no_match_is_missing() {
        let pool = setup().await;
        let slot_id = seed_slot_with_title(&pool, "ep-1", "a", "Castle Freak").await;
        // No media files inserted.

        let summary = match_media_files(&pool).await.unwrap();
        // Slot has movie_title but no host_label → movie: missing + segment: missing = 2.
        assert_eq!(summary.missing, 2);

        let row: (String,) = sqlx::query_as(
            "SELECT match_status FROM file_match WHERE slot_id = ? AND file_type = 'movie'",
        )
        .bind(&slot_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0, "missing");
    }

    #[tokio::test]
    async fn match_media_files_uniqueness() {
        let pool = setup().await;
        // Two slots, one file — only the best-scoring slot gets it.
        seed_slot_with_title(&pool, "ep-1", "a", "Castle Freak").await;
        seed_slot_with_title(&pool, "ep-2", "a", "Castle Freak 2").await;
        seed_media_file_named(&pool, "mf-1", "Castle Freak (1995).mkv", "movies").await;

        let summary = match_media_files(&pool).await.unwrap();
        // Each slot also gets a segment match (both missing, no host_label).
        // Movie: 1 matched/low-confidence + 1 missing. Segment: 2 missing. Total missing = 3.
        assert_eq!(summary.matched + summary.low_confidence, 1);
        assert_eq!(summary.missing, 3);
    }

    #[tokio::test]
    async fn match_media_files_respects_user_override() {
        let pool = setup().await;
        let slot_id = seed_slot_with_title(&pool, "ep-1", "a", "Castle Freak").await;
        seed_media_file_named(&pool, "mf-user", "user_choice.mkv", "movies").await;
        seed_media_file_named(&pool, "mf-auto", "Castle Freak (1995).mkv", "movies").await;

        // Manually override the slot to point at mf-user.
        let now = Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO file_match (slot_id, file_type, media_file_id, match_status, confidence, is_user_overridden, matched_at)
             VALUES (?, 'movie', 'mf-user', 'matched', 1.0, 1, ?)",
        )
        .bind(&slot_id)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        // Run matcher — should NOT overwrite the user's row.
        match_media_files(&pool).await.unwrap();

        let row: (Option<String>, i64) = sqlx::query_as(
            "SELECT media_file_id, is_user_overridden FROM file_match WHERE slot_id = ? AND file_type = 'movie'",
        )
        .bind(&slot_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0.as_deref(), Some("mf-user"), "user override must not be replaced");
        assert_eq!(row.1, 1);
    }

    #[tokio::test]
    async fn match_media_files_segment_by_host_label() {
        let pool = setup().await;
        let slot_id = seed_slot_with_host(&pool, "ep-1", "a", "Castle Freak", "S01E01A Segments").await;
        seed_media_file_named(&pool, "sf-1", "S01E01A Segments.mkv", "segments").await;

        let summary = match_media_files(&pool).await.unwrap();
        assert_eq!(summary.matched, 1);

        let row: (Option<String>, String) = sqlx::query_as(
            "SELECT media_file_id, match_status FROM file_match WHERE slot_id = ? AND file_type = 'segment'",
        )
        .bind(&slot_id)
        .fetch_one(&pool)
        .await
        .unwrap();
        assert_eq!(row.0.as_deref(), Some("sf-1"));
        assert_eq!(row.1, "matched");
    }
}

