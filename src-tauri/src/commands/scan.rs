use sqlx::SqlitePool;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use tauri::State;

// ---------------------------------------------------------------------------
// Inner function
// ---------------------------------------------------------------------------

pub async fn scan_library_inner(
    pool: &SqlitePool,
    scanning: &Arc<AtomicBool>,
) -> Result<(), String> {
    // Validate that both folders are configured.
    let row: (Option<String>, Option<String>) =
        sqlx::query_as("SELECT movies_folder, segments_folder FROM app_settings WHERE id = 1")
            .fetch_optional(pool)
            .await
            .map_err(|e| e.to_string())?
            .unwrap_or((None, None));

    if row.0.is_none() || row.1.is_none() {
        return Err("IO_ERROR: movies_folder and segments_folder must both be configured before scanning".to_string());
    }

    // Guard against double-call.
    let already_running = scanning.compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst);
    if already_running.is_err() {
        return Err("SCAN_IN_PROGRESS: a scan is already running".to_string());
    }

    // TODO (spec 0007): spawn actual file-scan task that emits Tauri events and
    // resets `scanning` to false when complete.  For now we immediately release
    // the flag so the function is still testable without hanging.
    scanning.store(false, Ordering::SeqCst);

    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri command wrapper
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn scan_library(
    pool: State<'_, SqlitePool>,
    scanning: State<'_, Arc<AtomicBool>>,
) -> Result<(), String> {
    scan_library_inner(pool.inner(), scanning.inner()).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

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

    fn flag() -> Arc<AtomicBool> {
        Arc::new(AtomicBool::new(false))
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
        let pool = setup().await;
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO app_settings (id, movies_folder, segments_folder, scan_on_startup, theme, created_at, updated_at)
             VALUES (1, '/movies', '/segments', 0, 'dark', ?, ?)",
        )
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let result = scan_library_inner(&pool, &flag()).await;
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn scan_library_returns_scan_in_progress_on_double_call() {
        let pool = setup().await;
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO app_settings (id, movies_folder, segments_folder, scan_on_startup, theme, created_at, updated_at)
             VALUES (1, '/movies', '/segments', 0, 'dark', ?, ?)",
        )
        .bind(&now)
        .bind(&now)
        .execute(&pool)
        .await
        .unwrap();

        let scanning = flag();
        // Simulate a scan already running by setting flag manually.
        scanning.store(true, Ordering::SeqCst);

        let result = scan_library_inner(&pool, &scanning).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("SCAN_IN_PROGRESS"));
    }
}
