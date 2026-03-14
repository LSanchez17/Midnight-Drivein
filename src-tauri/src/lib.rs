mod commands;
mod db;

use std::sync::{atomic::AtomicBool, Arc};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app data dir unavailable");
            std::fs::create_dir_all(&data_dir)?;

            let pool = tauri::async_runtime::block_on(db::init_pool(
                &data_dir.join("midnight-drivein.db"),
            ))
            .expect("failed to initialise database");

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
            commands::playback::save_cut_offset,
            commands::playback::save_playback_override,
            commands::playback::remap_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
