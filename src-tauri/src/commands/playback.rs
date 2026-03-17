use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

const OFFSET_LIMIT_MS: i64 = 3_600_000; // ±1 hour

pub async fn save_cut_offset_inner(
    pool: &SqlitePool,
    cut_id: &str,
    offset_ms: i64,
) -> Result<(), String> {
    if offset_ms < -OFFSET_LIMIT_MS || offset_ms > OFFSET_LIMIT_MS {
        return Err(format!(
            "INVALID_INPUT: offsetMs must be in range −3600000..3600000, got {offset_ms}"
        ));
    }

    let rows_affected = sqlx::query(
        "UPDATE playback_cut SET user_offset_ms = ? WHERE id = ?",
    )
    .bind(offset_ms)
    .bind(cut_id)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?
    .rows_affected();

    if rows_affected == 0 {
        return Err(format!("NOT_FOUND: playback_cut with id '{cut_id}' does not exist"));
    }

    Ok(())
}

pub async fn save_playback_override_inner(
    pool: &SqlitePool,
    slot_id: &str,
    flagged_for_timing: bool,
) -> Result<(), String> {
    // Verify the slot exists.
    let exists: Option<(String,)> =
        sqlx::query_as("SELECT id FROM movie_slot WHERE id = ?")
            .bind(slot_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    if exists.is_none() {
        return Err(format!(
            "NOT_FOUND: movie_slot with id '{slot_id}' does not exist"
        ));
    }

    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT INTO playback_override (slot_id, flagged_for_timing, created_at, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (slot_id) DO UPDATE SET
             flagged_for_timing = excluded.flagged_for_timing,
             updated_at = excluded.updated_at",
    )
    .bind(slot_id)
    .bind(flagged_for_timing)
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

pub async fn remap_file_inner(
    pool: &SqlitePool,
    slot_id: &str,
    file_type: &str,
    media_file_id: &str,
) -> Result<(), String> {
    // Validate file_type.
    if file_type != "movie" && file_type != "segment" {
        return Err(format!(
            "INVALID_INPUT: file_type must be 'movie' or 'segment', got '{file_type}'"
        ));
    }

    // Verify slot exists.
    let slot_exists: Option<(String,)> =
        sqlx::query_as("SELECT id FROM movie_slot WHERE id = ?")
            .bind(slot_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    if slot_exists.is_none() {
        return Err(format!(
            "NOT_FOUND: movie_slot with id '{slot_id}' does not exist"
        ));
    }

    // Verify media_file exists and is not missing.
    let mf_row: Option<(String, i64)> =
        sqlx::query_as("SELECT id, is_missing FROM media_file WHERE id = ?")
            .bind(media_file_id)
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?;

    match mf_row {
        None => return Err(format!(
            "NOT_FOUND: media_file with id '{media_file_id}' does not exist"
        )),
        Some((_, is_missing)) if is_missing == 1 => return Err(format!(
            "NOT_FOUND: media_file with id '{media_file_id}' is marked missing"
        )),
        _ => {}
    }

    let now = chrono::Utc::now().to_rfc3339();

    // Upsert the file_match row with is_user_overridden = true and status = 'matched'.
    sqlx::query(
        "INSERT INTO file_match (slot_id, file_type, media_file_id, match_status, confidence, is_user_overridden, matched_at)
         VALUES (?, ?, ?, 'matched', 1.0, 1, ?)
         ON CONFLICT (slot_id, file_type) DO UPDATE SET
             media_file_id      = excluded.media_file_id,
             match_status       = 'matched',
             confidence         = 1.0,
             is_user_overridden = 1,
             matched_at         = excluded.matched_at",
    )
    .bind(slot_id)
    .bind(file_type)
    .bind(media_file_id)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn save_cut_offset(
    pool: State<'_, SqlitePool>,
    cut_id: String,
    offset_ms: i64,
) -> Result<(), String> {
    save_cut_offset_inner(pool.inner(), &cut_id, offset_ms).await
}

#[tauri::command]
pub async fn save_playback_override(
    pool: State<'_, SqlitePool>,
    slot_id: String,
    flagged_for_timing: bool,
) -> Result<(), String> {
    save_playback_override_inner(pool.inner(), &slot_id, flagged_for_timing).await
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

pub async fn list_media_files_inner(
    pool: &SqlitePool,
    folder_root: &str,
) -> Result<Vec<MediaFileListRow>, String> {
    if folder_root != "movies" && folder_root != "segments" {
        return Err(format!(
            "INVALID_INPUT: folder_root must be 'movies' or 'segments', got '{folder_root}'"
        ));
    }

    let rows: Vec<(String, String, Option<String>, String, Option<i64>, String)> =
        sqlx::query_as(
            "SELECT id, filename, display_name, path, size_bytes, last_seen_at
             FROM media_file
             WHERE folder_root = ? AND is_missing = 0
             ORDER BY filename ASC",
        )
        .bind(folder_root)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("DB_ERROR: {e}"))?;

    Ok(rows
        .into_iter()
        .map(|(id, filename, display_name, path, size_bytes, last_seen_at)| MediaFileListRow {
            id,
            filename,
            display_name,
            path,
            size_bytes,
            last_seen_at,
        })
        .collect())
}

#[tauri::command]
pub async fn remap_file(
    pool: State<'_, SqlitePool>,
    slot_id: String,
    file_type: String,
    media_file_id: String,
) -> Result<(), String> {
    remap_file_inner(pool.inner(), &slot_id, &file_type, &media_file_id).await
}

#[tauri::command]
pub async fn list_media_files(
    pool: State<'_, SqlitePool>,
    folder_root: String,
) -> Result<Vec<MediaFileListRow>, String> {
    list_media_files_inner(pool.inner(), &folder_root).await
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

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

    async fn seed_episode(pool: &SqlitePool, id: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO episode (id, title, is_special, created_at) VALUES (?, 'Test', 0, ?)",
        )
        .bind(id)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn seed_slot(pool: &SqlitePool, episode_id: &str, slot: &str) -> String {
        let slot_id = format!("{}-{}", episode_id, slot);
        sqlx::query(
            "INSERT INTO movie_slot (id, episode_id, slot) VALUES (?, ?, ?)",
        )
        .bind(&slot_id)
        .bind(episode_id)
        .bind(slot)
        .execute(pool)
        .await
        .unwrap();
        slot_id
    }

    async fn seed_cut(pool: &SqlitePool, slot_id: &str, cut_id: &str) {
        sqlx::query(
            "INSERT INTO playback_cut (id, slot_id, sort_order, source_type, start_ms, end_ms, user_offset_ms)
             VALUES (?, ?, 1, 'movie', 0, 1000, 0)",
        )
        .bind(cut_id)
        .bind(slot_id)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn seed_media_file(pool: &SqlitePool, id: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO media_file (id, filename, path, folder_root, last_seen_at, is_missing)
             VALUES (?, 'test.mp4', '/test/test.mp4', 'movies', ?, 0)",
        )
        .bind(id)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn save_cut_offset_persists() {
        let pool = setup().await;
        seed_episode(&pool, "ep-1").await;
        let slot_id = seed_slot(&pool, "ep-1", "a").await;
        seed_cut(&pool, &slot_id, "cut-1").await;

        save_cut_offset_inner(&pool, "cut-1", 500).await.unwrap();

        let offset: (i64,) =
            sqlx::query_as("SELECT user_offset_ms FROM playback_cut WHERE id = ?")
                .bind("cut-1")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(offset.0, 500);
    }

    #[tokio::test]
    async fn save_cut_offset_not_found() {
        let pool = setup().await;
        let result = save_cut_offset_inner(&pool, "no-such-cut", 0).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("NOT_FOUND"));
    }

    #[tokio::test]
    async fn save_cut_offset_rejects_out_of_range() {
        let pool = setup().await;
        let result = save_cut_offset_inner(&pool, "any", OFFSET_LIMIT_MS + 1).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("INVALID_INPUT"));
    }

    #[tokio::test]
    async fn save_playback_override_upserts() {
        let pool = setup().await;
        seed_episode(&pool, "ep-1").await;
        let slot_id = seed_slot(&pool, "ep-1", "a").await;

        save_playback_override_inner(&pool, &slot_id, true).await.unwrap();
        let row: (bool,) =
            sqlx::query_as("SELECT CAST(flagged_for_timing AS BOOLEAN) FROM playback_override WHERE slot_id = ?")
                .bind(&slot_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(row.0);

        // Upsert again — should update, not duplicate.
        save_playback_override_inner(&pool, &slot_id, false).await.unwrap();
        let row2: (bool,) =
            sqlx::query_as("SELECT CAST(flagged_for_timing AS BOOLEAN) FROM playback_override WHERE slot_id = ?")
                .bind(&slot_id)
                .fetch_one(&pool)
                .await
                .unwrap();
        assert!(!row2.0);
    }

    #[tokio::test]
    async fn remap_file_sets_user_overridden() {
        let pool = setup().await;
        seed_episode(&pool, "ep-1").await;
        let slot_id = seed_slot(&pool, "ep-1", "a").await;
        seed_media_file(&pool, "mf-1").await;

        remap_file_inner(&pool, &slot_id, "movie", "mf-1").await.unwrap();

        let row: (bool, String) =
            sqlx::query_as(
                "SELECT CAST(is_user_overridden AS BOOLEAN), match_status FROM file_match WHERE slot_id = ? AND file_type = 'movie'",
            )
            .bind(&slot_id)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert!(row.0, "is_user_overridden should be true");
        assert_eq!(row.1, "matched");
    }

    #[tokio::test]
    async fn remap_file_rejects_invalid_file_type() {
        let pool = setup().await;
        seed_episode(&pool, "ep-1").await;
        let slot_id = seed_slot(&pool, "ep-1", "a").await;
        seed_media_file(&pool, "mf-1").await;

        let result = remap_file_inner(&pool, &slot_id, "unknown", "mf-1").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("INVALID_INPUT"));
    }

    #[tokio::test]
    async fn remap_file_rejects_missing_media_file() {
        let pool = setup().await;
        seed_episode(&pool, "ep-1").await;
        let slot_id = seed_slot(&pool, "ep-1", "a").await;

        // Insert a file that is marked missing.
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO media_file (id, filename, path, folder_root, last_seen_at, is_missing)
             VALUES ('mf-gone', 'gone.mp4', '/test/gone.mp4', 'movies', ?, 1)",
        )
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let result = remap_file_inner(&pool, &slot_id, "movie", "mf-gone").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("NOT_FOUND"));
    }

    #[tokio::test]
    async fn list_media_files_returns_non_missing() {
        let pool = setup().await;
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO media_file (id, filename, path, folder_root, last_seen_at, is_missing)
             VALUES ('mf-a', 'present.mkv', '/test/present.mkv', 'movies', ?, 0)",
        )
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO media_file (id, filename, path, folder_root, last_seen_at, is_missing)
             VALUES ('mf-b', 'gone.mkv', '/test/gone.mkv', 'movies', ?, 1)",
        )
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let rows = list_media_files_inner(&pool, "movies").await.unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].id, "mf-a");
    }

    #[tokio::test]
    async fn list_media_files_rejects_invalid_root() {
        let pool = setup().await;
        let result = list_media_files_inner(&pool, "other").await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("INVALID_INPUT"));
    }
}
