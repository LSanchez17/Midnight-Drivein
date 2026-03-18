use crate::db::{episodes as db_episodes, types::EpisodeRow};
use sqlx::SqlitePool;
use tauri::State;

#[tauri::command]
pub async fn get_episodes(pool: State<'_, SqlitePool>) -> Result<Vec<EpisodeRow>, String> {
    db_episodes::get_episodes(pool.inner()).await
}

#[tauri::command]
pub async fn get_episode_by_id(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<Option<EpisodeRow>, String> {
    db_episodes::get_episode_by_id(pool.inner(), &id).await
}
