use crate::db::types::{AppSettings, AppSettingsPatch};
use sqlx::SqlitePool;

async fn set_defaults(pool: &SqlitePool) -> Result<(), String> {
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

pub(crate) async fn get_settings(pool: &SqlitePool) -> Result<AppSettings, String> {
    set_defaults(pool).await?;
    sqlx::query_as(
        "SELECT movies_folder, commentary_folder, scan_on_startup, theme
         FROM app_settings WHERE id = 1",
    )
    .fetch_one(pool)
    .await
    .map_err(|e| e.to_string())
}

pub(crate) async fn save_settings(
    pool: &SqlitePool,
    settings: AppSettingsPatch,
) -> Result<(), String> {
    set_defaults(pool).await?;

    // Query building fragments for only the fields that exist in the patch
    let mut fragments: Vec<&str> = Vec::new();
    if settings.movies_folder.is_some() {
        fragments.push("movies_folder = ?");
    }
    if settings.commentary_folder.is_some() {
        fragments.push("commentary_folder = ?");
    }
    if settings.scan_on_startup.is_some() {
        fragments.push("scan_on_startup = ?");
    }
    if settings.theme.is_some() {
        fragments.push("theme = ?");
    }

    if fragments.is_empty() {
        return Ok(());
    }

    fragments.push("updated_at = ?");
    let sql = format!(
        "UPDATE app_settings SET {} WHERE id = 1",
        fragments.join(", ")
    );
    let now = chrono::Utc::now().to_rfc3339();

    // Bind values in the same order as the fragments above.
    let mut query = sqlx::query(&sql);
    if let Some(v) = settings.movies_folder {
        query = query.bind(v);
    }
    if let Some(v) = settings.commentary_folder {
        query = query.bind(v);
    }
    if let Some(v) = settings.scan_on_startup {
        query = query.bind(v);
    }
    if let Some(v) = settings.theme {
        query = query.bind(v);
    }
    query = query.bind(&now);

    query.execute(pool).await.map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::setup;

    #[tokio::test]
    async fn get_settings_returns_defaults() {
        let pool = setup().await;
        let s = get_settings(&pool).await.unwrap();
        assert!(s.movies_folder.is_none());
        assert!(s.commentary_folder.is_none());
        assert!(!s.scan_on_startup);
        assert_eq!(s.theme, "dark");
    }

    #[tokio::test]
    async fn get_settings_returns_persisted() {
        let pool = setup().await;
        save_settings(
            &pool,
            AppSettingsPatch {
                movies_folder: Some(Some("/media/movies".to_string())),
                commentary_folder: None,
                scan_on_startup: Some(true),
                theme: None,
            },
        )
        .await
        .unwrap();
        let s = get_settings(&pool).await.unwrap();
        assert_eq!(s.movies_folder.as_deref(), Some("/media/movies"));
        assert!(s.scan_on_startup);
    }

    #[tokio::test]
    async fn save_settings_partial_patch_does_not_overwrite_other_fields() {
        let pool = setup().await;
        save_settings(
            &pool,
            AppSettingsPatch {
                movies_folder: None,
                commentary_folder: None,
                scan_on_startup: Some(true),
                theme: None,
            },
        )
        .await
        .unwrap();
        save_settings(
            &pool,
            AppSettingsPatch {
                movies_folder: Some(Some("/media/movies".to_string())),
                commentary_folder: None,
                scan_on_startup: None,
                theme: None,
            },
        )
        .await
        .unwrap();
        let s = get_settings(&pool).await.unwrap();
        assert_eq!(s.movies_folder.as_deref(), Some("/media/movies"));
        assert!(s.scan_on_startup, "scan_on_startup must not be overwritten");
    }

    #[tokio::test]
    async fn save_settings_null_clears_folder() {
        let pool = setup().await;
        save_settings(
            &pool,
            AppSettingsPatch {
                movies_folder: Some(Some("/media/movies".to_string())),
                commentary_folder: None,
                scan_on_startup: None,
                theme: None,
            },
        )
        .await
        .unwrap();
        save_settings(
            &pool,
            AppSettingsPatch {
                movies_folder: Some(None),
                commentary_folder: None,
                scan_on_startup: None,
                theme: None,
            },
        )
        .await
        .unwrap();
        let s = get_settings(&pool).await.unwrap();
        assert!(
            s.movies_folder.is_none(),
            "movies_folder must be NULL after explicit clear"
        );
    }
}
