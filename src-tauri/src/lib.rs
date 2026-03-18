mod commands;
mod constants;
mod db;
#[cfg(test)]
pub mod test_support;
mod utils;

use std::sync::{atomic::AtomicBool, Arc};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app.path().app_data_dir().expect("app data dir unavailable");
            std::fs::create_dir_all(&data_dir)?;

            let pool = tauri::async_runtime::block_on(db::init_pool(
                &data_dir.join("midnight-drivein.db"),
            ))
            .expect("failed to initialise database");

            let json_path = app
                .path()
                .resource_dir()
                .expect("resource dir unavailable")
                .join("resources")
                .join("episodes.json");

            tauri::async_runtime::block_on(db::seed::seed_episodes_if_empty(&pool, &json_path))
                .expect("episode seed failed");

            app.manage(pool);
            app.manage(Arc::new(AtomicBool::new(false)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::settings::get_settings,
            commands::settings::save_settings,
            commands::episodes::get_episodes,
            commands::episodes::get_episode_by_id,
            commands::scan::scan_library,
            commands::scan::get_scan_summary,
            commands::playback::save_cut_offset,
            commands::playback::save_playback_override,
            commands::playback::remap_file,
            commands::playback::list_media_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
