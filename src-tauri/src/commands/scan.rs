use chrono::Utc;
use serde::Serialize;
use sqlx::SqlitePool;
use std::{
    collections::HashSet,
    path::Path,
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc,
    },
};
use tauri::State;
use uuid::Uuid;
use walkdir::WalkDir;

const SUPPORTED_EXTENSIONS: &[&str] = &["mp4", "mkv", "m4v", "mov"];

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ScanResult {
    pub last_scan_at: String,
    pub movie_file_count: usize,
    pub segment_file_count: usize,
    pub errors: Vec<String>,
    pub missing_folders: Vec<String>,
}

// ---------------------------------------------------------------------------
// Internal types
// ---------------------------------------------------------------------------

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

// normalize_filename
// Strip the file extension and remove parenthesised year tags.
//
// `"The Slumber Party Massacre (1982).mkv"` → `"The Slumber Party Massacre"`
// `"sleepaway_camp_1983.mp4"` → `"sleepaway_camp_1983"`
//
// Original casing is preserved. The output is not persisted in this phase —
// it is groundwork for the matching phase.
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
        let result = sqlx::query(
            "INSERT INTO media_file (id, filename, path, folder_root, size_bytes, last_seen_at, is_missing)
             VALUES (?, ?, ?, ?, ?, ?, 0)
             ON CONFLICT(path) DO UPDATE SET
               filename     = excluded.filename,
               size_bytes   = excluded.size_bytes,
               last_seen_at = excluded.last_seen_at,
               is_missing   = 0",
        )
        .bind(&row.id)
        .bind(&row.filename)
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

    let last_scan_at = Utc::now().to_rfc3339();
    let errors_json = serde_json::to_string(&errors).unwrap_or_else(|_| "[]".to_string());
    let missing_folders_json =
        serde_json::to_string(&missing_folders).unwrap_or_else(|_| "[]".to_string());
    let persist_result = sqlx::query(
        "INSERT OR REPLACE INTO scan_summary
         (id, last_scan_at, movie_file_count, segment_file_count, errors_json, missing_folders_json)
         VALUES (1, ?, ?, ?, ?, ?)",
    )
    .bind(&last_scan_at)
    .bind(movie_file_count as i64)
    .bind(segment_file_count as i64)
    .bind(&errors_json)
    .bind(&missing_folders_json)
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
    })
}


pub async fn get_scan_summary_inner(pool: &SqlitePool) -> Result<Option<ScanResult>, String> {
    let row = sqlx::query_as::<_, (String, i64, i64, String, String)>(
        "SELECT last_scan_at, movie_file_count, segment_file_count, errors_json, missing_folders_json
         FROM scan_summary WHERE id = 1",
    )
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("DB_ERROR: {e}"))?;

    match row {
        None => Ok(None),
        Some((last_scan_at, movie_file_count, segment_file_count, errors_json, missing_json)) => {
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
            }))
        }
    }
}

// ---------------------------------------------------------------------------
// Tauri command wrappers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

    // -----------------------------------------------------------------------
    // get_scan_summary
    // -----------------------------------------------------------------------

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
}
