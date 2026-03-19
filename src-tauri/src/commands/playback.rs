use crate::db::{
    episodes as db_episodes, playback as db_playback,
    types::{MediaFileListRow, PlaybackEntryRow},
};
use sqlx::SqlitePool;
use tauri::State;

#[tauri::command]
pub async fn save_cut_offset(
    pool: State<'_, SqlitePool>,
    cut_id: String,
    offset_ms: i64,
) -> Result<(), String> {
    db_playback::save_cut_offset(pool.inner(), &cut_id, offset_ms).await
}

#[tauri::command]
pub async fn save_playback_override(
    pool: State<'_, SqlitePool>,
    slot_id: String,
    flagged_for_timing: bool,
) -> Result<(), String> {
    db_playback::save_playback_override(pool.inner(), &slot_id, flagged_for_timing).await
}

#[tauri::command]
pub async fn remap_file(
    pool: State<'_, SqlitePool>,
    slot_id: String,
    file_type: String,
    media_file_id: String,
) -> Result<(), String> {
    db_playback::remap_file(pool.inner(), &slot_id, &file_type, &media_file_id).await
}

#[tauri::command]
pub async fn list_media_files(
    pool: State<'_, SqlitePool>,
    folder_root: String,
) -> Result<Vec<MediaFileListRow>, String> {
    db_playback::list_media_files(pool.inner(), &folder_root).await
}

#[tauri::command]
pub async fn get_playback_plan(
    pool: State<'_, SqlitePool>,
    episode_id: String,
    slot: String,
) -> Result<Vec<PlaybackEntryRow>, String> {
    let slot_id = format!("{}-{}", episode_id, slot);
    db_episodes::get_playback_plan_for_slot(pool.inner(), &slot_id).await
}
