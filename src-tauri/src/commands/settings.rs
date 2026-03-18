use crate::db::settings as db_settings;
use crate::db::types::{AppSettings, AppSettingsPatch};
use sqlx::SqlitePool;
use tauri::State;

#[tauri::command]
pub async fn get_settings(pool: State<'_, SqlitePool>) -> Result<AppSettings, String> {
    db_settings::get_settings(pool.inner()).await
}

#[tauri::command]
pub async fn save_settings(
    pool: State<'_, SqlitePool>,
    settings: AppSettingsPatch,
) -> Result<(), String> {
    db_settings::save_settings(pool.inner(), settings).await
}
