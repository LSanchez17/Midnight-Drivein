use chrono::Utc;
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};

pub async fn setup() -> SqlitePool {
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

pub async fn setup_episode(pool: &SqlitePool, episode_id: &str, title: Option<&str>) {
    let now = Utc::now().to_rfc3339();
    let title = title.unwrap_or("T");

    sqlx::query(
        "
        INSERT OR IGNORE INTO episode (id, title, is_special, created_at) VALUES (?, ?, 0, ?)
    ",
    )
    .bind(episode_id)
    .bind(title)
    .bind(&now)
    .execute(pool)
    .await
    .unwrap();
}

pub async fn setup_movie_slot(
    pool: &SqlitePool,
    episode_id: &str,
    slot: &str,
    title: &str,
    movie_aliases: Option<&[&str]>,
) -> String {
    setup_episode(pool, episode_id, None).await;
    let slot_id = format!("{}-{}", episode_id, slot);

    sqlx::query(
        "
        INSERT OR IGNORE INTO movie_slot (id, episode_id, slot, movie_title, commentary, movie_aliases_json) VALUES (?, ?, ?, ?, ?, ?)
    ",
    )
    .bind(&slot_id)
    .bind(episode_id)
    .bind(slot)
    .bind(title)
    .bind("S01E01A Commentary")
    .bind(movie_aliases.map(|aliases| serde_json::to_string(aliases).unwrap()))
    .execute(pool)
    .await
    .unwrap();

    slot_id
}

pub async fn setup_media_file(pool: &SqlitePool, id: &str, filename: &str, folder_root: &str) {
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "
        INSERT OR IGNORE INTO media_file (id, filename, path, folder_root, last_seen_at, is_missing) 
        VALUES (?, ?, ?, ?, ?, 0)
    ",
    )
    .bind(id)
    .bind(filename)
    .bind(format!("/fake/{}", filename))
    .bind(folder_root)
    .bind(&now)
    .execute(pool)
    .await
    .unwrap();
}

pub async fn setup_missing_media_file(
    pool: &SqlitePool,
    id: &str,
    filename: &str,
    folder_root: &str,
) {
    let now = Utc::now().to_rfc3339();

    sqlx::query(
        "
        INSERT OR IGNORE INTO media_file (id, filename, path, folder_root, last_seen_at, is_missing) 
        VALUES (?, ?, ?, ?, ?, 1)
    ",
    )
    .bind(id)
    .bind(filename)
    .bind(format!("/fake/{}", filename))
    .bind(folder_root)
    .bind(&now)
    .execute(pool)
    .await
    .unwrap();
}

pub async fn setup_playback_cut(
    pool: &SqlitePool,
    slot_id: &str,
    sort_order: i64,
    source_type: &str,
    start_ms: i64,
    end_ms: i64,
    user_offset_ms: i64,
) -> String {
    // Construct the cut id manually here
    let cut_id = format!("{}-c{}", slot_id, sort_order);

    sqlx::query(
        "
        INSERT OR IGNORE INTO playback_cut (id, slot_id, sort_order, source_type, start_ms, end_ms, user_offset_ms) 
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ",
    )
    .bind(&cut_id)
    .bind(slot_id)
    .bind(sort_order)
    .bind(source_type)
    .bind(start_ms)
    .bind(end_ms)
    .bind(user_offset_ms)
    .execute(pool)
    .await
    .unwrap();

    cut_id
}
