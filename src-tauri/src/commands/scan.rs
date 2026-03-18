use crate::db::scan as db_scan;
use crate::db::types::ScanResult;
use sqlx::SqlitePool;
use std::sync::{atomic::AtomicBool, Arc};
use tauri::State;

#[tauri::command]
pub async fn scan_library(
    pool: State<'_, SqlitePool>,
    scanning: State<'_, Arc<AtomicBool>>,
) -> Result<ScanResult, String> {
    db_scan::scan_library(pool.inner(), scanning.inner()).await
}

#[tauri::command]
pub async fn get_scan_summary(pool: State<'_, SqlitePool>) -> Result<Option<ScanResult>, String> {
    db_scan::get_scan_summary(pool.inner()).await
}
