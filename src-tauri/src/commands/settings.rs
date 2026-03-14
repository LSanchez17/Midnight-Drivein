use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use tauri::State;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

#[derive(Serialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub movies_folder: Option<String>,
    pub segments_folder: Option<String>,
    pub scan_on_startup: bool,
    pub theme: String,
}

/// Partial patch — only provided fields are written.
/// `Some(None)` means "set to NULL"; `None` means "leave unchanged".
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettingsPatch {
    pub movies_folder: Option<Option<String>>,
    pub segments_folder: Option<Option<String>>,
    pub scan_on_startup: Option<bool>,
    pub theme: Option<String>,
}

// ---------------------------------------------------------------------------
// Inner functions (take &SqlitePool — testable without tauri::State)
// ---------------------------------------------------------------------------

async fn ensure_defaults(pool: &SqlitePool) -> Result<(), String> {
    let now = chrono::Utc::now().to_rfc3339();
    sqlx::query(
        "INSERT OR IGNORE INTO app_settings (id, scan_on_startup, theme, created_at, updated_at)
         VALUES (1, 0, 'dark', ?, ?)",
    )
    .bind(&now)
    .bind(&now)
    .execute(pool)
    .await
    .map_err(|e| e.to_string())?;
    Ok(())
}

pub async fn get_settings_inner(pool: &SqlitePool) -> Result<AppSettings, String> {
    ensure_defaults(pool).await?;
    sqlx::query_as(
        "SELECT movies_folder, segments_folder, scan_on_startup, theme
         FROM app_settings WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

pub async fn save_settings_inner(pool: &SqlitePool, settings: AppSettingsPatch) -> Result<(), String> {
    ensure_defaults(pool).await?;

    // Query building fragments for only the fields that exist in the patch
    let mut fragments: Vec<&str> = Vec::new();
    if settings.movies_folder.is_some()   { fragments.push("movies_folder = ?"); }
    if settings.segments_folder.is_some() { fragments.push("segments_folder = ?"); }
    if settings.scan_on_startup.is_some() { fragments.push("scan_on_startup = ?"); }
    if settings.theme.is_some()           { fragments.push("theme = ?"); }

    if fragments.is_empty() {
        return Ok(());
    }

    fragments.push("updated_at = ?");
    let sql = format!("UPDATE app_settings SET {} WHERE id = 1", fragments.join(", "));
    let now = chrono::Utc::now().to_rfc3339();

    // Bind values in the same order as the fragments above.
    let mut query = sqlx::query(&sql);
    if let Some(v) = settings.movies_folder   { query = query.bind(v); }
    if let Some(v) = settings.segments_folder { query = query.bind(v); }
    if let Some(v) = settings.scan_on_startup { query = query.bind(v); }
    if let Some(v) = settings.theme           { query = query.bind(v); }
    query = query.bind(&now);

    query.execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Tauri commands (thin wrappers)
// ---------------------------------------------------------------------------

#[tauri::command]
pub async fn get_settings(pool: State<'_, SqlitePool>) -> Result<AppSettings, String> {
    get_settings_inner(pool.inner()).await
}

#[tauri::command]
pub async fn save_settings(
    pool: State<'_, SqlitePool>,
    settings: AppSettingsPatch,
) -> Result<(), String> {
    save_settings_inner(pool.inner(), settings).await
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::sqlite::SqlitePoolOptions;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .connect("sqlite::memory:")
            .await
            .expect("in-memory pool");
        sqlx::migrate!("src/db/migrations")
            .run(&pool)
            .await
            .expect("migration");
        pool
    }

    #[tokio::test]
    async fn get_settings_returns_defaults() {
        let pool = test_pool().await;
        let s = get_settings_inner(&pool).await.unwrap();
        assert!(s.movies_folder.is_none());
        assert!(s.segments_folder.is_none());
        assert!(!s.scan_on_startup);
        assert_eq!(s.theme, "dark");
    }

    #[tokio::test]
    async fn get_settings_returns_persisted() {
        let pool = test_pool().await;
        save_settings_inner(&pool, AppSettingsPatch {
            movies_folder: Some(Some("/media/movies".to_string())),
            segments_folder: None,
            scan_on_startup: Some(true),
            theme: None,
        }).await.unwrap();
        let s = get_settings_inner(&pool).await.unwrap();
        assert_eq!(s.movies_folder.as_deref(), Some("/media/movies"));
        assert!(s.scan_on_startup);
    }

    #[tokio::test]
    async fn save_settings_partial_patch_does_not_overwrite_other_fields() {
        let pool = test_pool().await;
        save_settings_inner(&pool, AppSettingsPatch {
            movies_folder: None,
            segments_folder: None,
            scan_on_startup: Some(true),
            theme: None,
        }).await.unwrap();
        save_settings_inner(&pool, AppSettingsPatch {
            movies_folder: Some(Some("/media/movies".to_string())),
            segments_folder: None,
            scan_on_startup: None,
            theme: None,
        }).await.unwrap();
        let s = get_settings_inner(&pool).await.unwrap();
        assert_eq!(s.movies_folder.as_deref(), Some("/media/movies"));
        assert!(s.scan_on_startup, "scan_on_startup must not be overwritten");
    }

    #[tokio::test]
    async fn save_settings_null_clears_folder() {
        let pool = test_pool().await;
        save_settings_inner(&pool, AppSettingsPatch {
            movies_folder: Some(Some("/media/movies".to_string())),
            segments_folder: None,
            scan_on_startup: None,
            theme: None,
        }).await.unwrap();
        save_settings_inner(&pool, AppSettingsPatch {
            movies_folder: Some(None),
            segments_folder: None,
            scan_on_startup: None,
            theme: None,
        }).await.unwrap();
        let s = get_settings_inner(&pool).await.unwrap();
        assert!(s.movies_folder.is_none(), "movies_folder must be NULL after explicit clear");
    }
}
