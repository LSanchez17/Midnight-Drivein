use serde::Serialize;
use sqlx::SqlitePool;
use tauri::State;

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct FileMatchRow {
    pub file_type: String,
    pub filename: Option<String>,
    pub display_name: Option<String>,
    pub path: Option<String>,
    pub confidence: Option<f64>,
    pub status: String,
    pub is_user_overridden: bool,
    pub matched_at: Option<String>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PlaybackCutRow {
    pub id: String,
    pub sort_order: i64,
    pub source_type: String,
    pub start_ms: i64,
    pub end_ms: Option<i64>,
    pub user_offset_ms: i64,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MovieSlotRow {
    pub id: String,
    pub slot: String,
    pub host_label: Option<String>,
    pub movie_title: Option<String>,
    pub movie_year: Option<i64>,
    pub movie_match: FileMatchRow,
    pub segment_match: FileMatchRow,
    pub cuts: Vec<PlaybackCutRow>,
    pub flagged_for_timing: bool,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct EpisodeRow {
    pub id: String,
    pub title: String,
    pub season: Option<i64>,
    pub episode: Option<i64>,
    pub is_special: bool,
    pub air_date: Option<String>,
    pub description: Option<String>,
    pub guests: Option<String>,
    pub slots: Vec<MovieSlotRow>,
}

/// One row from the episode table (no joins).
#[derive(sqlx::FromRow)]
struct EpRow {
    id: String,
    title: String,
    season: Option<i64>,
    episode: Option<i64>,
    is_special: bool,
    air_date: Option<String>,
    description: Option<String>,
    guests_json: Option<String>,
}

/// Flat row from the movie_slot + file_match + playback_override join.
#[derive(sqlx::FromRow)]
struct SlotFileRow {
    slot_id: String,
    episode_id: String,
    slot: String,
    host_label: Option<String>,
    movie_title: Option<String>,
    movie_year: Option<i64>,
    flagged_for_timing: bool,

    // movie match columns (prefixed)
    movie_file_type: Option<String>,
    movie_filename: Option<String>,
    movie_display_name: Option<String>,
    movie_path: Option<String>,
    movie_confidence: Option<f64>,
    movie_status: Option<String>,
    movie_is_user_overridden: Option<bool>,
    movie_matched_at: Option<String>,

    // segment match columns (prefixed)
    segment_file_type: Option<String>,
    segment_filename: Option<String>,
    segment_display_name: Option<String>,
    segment_path: Option<String>,
    segment_confidence: Option<f64>,
    segment_status: Option<String>,
    segment_is_user_overridden: Option<bool>,
    segment_matched_at: Option<String>,
}

#[derive(sqlx::FromRow)]
struct CutRow {
    slot_id: String,
    id: String,
    sort_order: i64,
    source_type: String,
    start_ms: i64,
    end_ms: Option<i64>,
    user_offset_ms: i64,
}

fn missing_match(file_type: &str) -> FileMatchRow {
    FileMatchRow {
        file_type: file_type.to_string(),
        filename: None,
        display_name: None,
        path: None,
        confidence: None,
        status: "missing".to_string(),
        is_user_overridden: false,
        matched_at: None,
    }
}

pub async fn get_episodes_inner(pool: &SqlitePool) -> Result<Vec<EpisodeRow>, String> {
    // fetch episode rows with no joins, preserving the desired order
    let ep_rows: Vec<EpRow> = sqlx::query_as(
        r#"
        SELECT
            e.id,
            e.title,
            e.season,
            e.episode,
            CAST(e.is_special AS BOOLEAN) AS is_special,
            e.air_date,
            e.description,
            e.guests_json
        FROM episode e
        ORDER BY e.season ASC NULLS LAST, e.episode ASC NULLS LAST, e.title ASC
        "#,
    )
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if ep_rows.is_empty() {
        return Ok(vec![]);
    }

    let episode_ids: Vec<String> = ep_rows.iter().map(|r| r.id.clone()).collect();
    let ep_placeholders = episode_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");

    // fetch all slots with their file matches and override flag.
    let slot_sql = format!(
        r#"
        SELECT
            ms.id        AS slot_id,
            ms.episode_id,
            ms.slot,
            ms.host_label,
            ms.movie_title,
            ms.movie_year,
            CAST(COALESCE(po.flagged_for_timing, 0) AS BOOLEAN) AS flagged_for_timing,

            fm_movie.file_type        AS movie_file_type,
            mf_movie.filename         AS movie_filename,
            mf_movie.display_name     AS movie_display_name,
            mf_movie.path             AS movie_path,
            fm_movie.confidence       AS movie_confidence,
            fm_movie.match_status     AS movie_status,
            CAST(fm_movie.is_user_overridden AS BOOLEAN) AS movie_is_user_overridden,
            fm_movie.matched_at       AS movie_matched_at,

            fm_seg.file_type          AS segment_file_type,
            mf_seg.filename           AS segment_filename,
            mf_seg.display_name       AS segment_display_name,
            mf_seg.path               AS segment_path,
            fm_seg.confidence         AS segment_confidence,
            fm_seg.match_status       AS segment_status,
            CAST(fm_seg.is_user_overridden AS BOOLEAN) AS segment_is_user_overridden,
            fm_seg.matched_at         AS segment_matched_at

        FROM movie_slot ms
        LEFT JOIN playback_override po   ON po.slot_id = ms.id
        LEFT JOIN file_match fm_movie    ON fm_movie.slot_id = ms.id AND fm_movie.file_type = 'movie'
        LEFT JOIN media_file mf_movie    ON mf_movie.id = fm_movie.media_file_id
        LEFT JOIN file_match fm_seg      ON fm_seg.slot_id = ms.id AND fm_seg.file_type = 'segment'
        LEFT JOIN media_file mf_seg      ON mf_seg.id = fm_seg.media_file_id
        WHERE ms.episode_id IN ({ep_placeholders})
        ORDER BY ms.episode_id ASC, ms.slot ASC
        "#
    );
    let mut slot_query = sqlx::query_as::<_, SlotFileRow>(&slot_sql);
    for id in &episode_ids {
        slot_query = slot_query.bind(id);
    }
    let slot_rows: Vec<SlotFileRow> = slot_query
        .fetch_all(pool)
        .await
        .map_err(|e| e.to_string())?;

    // Collect all slot IDs for the cuts query.
    let slot_ids: Vec<String> = slot_rows.iter().map(|r| r.slot_id.clone()).collect();

    // fetch all cuts grouped by slot_id.
    let mut cuts_map: std::collections::HashMap<String, Vec<PlaybackCutRow>> =
        std::collections::HashMap::new();

    if !slot_ids.is_empty() {
        let slot_placeholders = slot_ids.iter().map(|_| "?").collect::<Vec<_>>().join(", ");
        let cut_sql = format!(
            "SELECT slot_id, id, sort_order, source_type, start_ms, end_ms, user_offset_ms
             FROM playback_cut WHERE slot_id IN ({slot_placeholders}) ORDER BY sort_order ASC"
        );
        let mut cut_query = sqlx::query_as::<_, CutRow>(&cut_sql);
        for id in &slot_ids {
            cut_query = cut_query.bind(id);
        }
        let all_cuts: Vec<CutRow> = cut_query
            .fetch_all(pool)
            .await
            .map_err(|e| e.to_string())?;

        for cut in all_cuts {
            cuts_map.entry(cut.slot_id.clone()).or_default().push(PlaybackCutRow {
                id: cut.id,
                sort_order: cut.sort_order,
                source_type: cut.source_type,
                start_ms: cut.start_ms,
                end_ms: cut.end_ms,
                user_offset_ms: cut.user_offset_ms,
            });
        }
    }

    // group slot rows by episode_id.
    let mut slots_map: std::collections::HashMap<String, Vec<MovieSlotRow>> =
        std::collections::HashMap::new();

    for row in slot_rows {
        let movie_match = if row.movie_file_type.is_some() {
            FileMatchRow {
                file_type: row.movie_file_type.unwrap(),
                filename: row.movie_filename,
                display_name: row.movie_display_name,
                path: row.movie_path,
                confidence: row.movie_confidence,
                status: row.movie_status.unwrap_or_else(|| "missing".to_string()),
                is_user_overridden: row.movie_is_user_overridden.unwrap_or(false),
                matched_at: row.movie_matched_at,
            }
        } else {
            missing_match("movie")
        };

        let segment_match = if row.segment_file_type.is_some() {
            FileMatchRow {
                file_type: row.segment_file_type.unwrap(),
                filename: row.segment_filename,
                display_name: row.segment_display_name,
                path: row.segment_path,
                confidence: row.segment_confidence,
                status: row.segment_status.unwrap_or_else(|| "missing".to_string()),
                is_user_overridden: row.segment_is_user_overridden.unwrap_or(false),
                matched_at: row.segment_matched_at,
            }
        } else {
            missing_match("segment")
        };

        let cuts = cuts_map.remove(&row.slot_id).unwrap_or_default();

        slots_map.entry(row.episode_id.clone()).or_default().push(MovieSlotRow {
            id: row.slot_id,
            slot: row.slot,
            host_label: row.host_label,
            movie_title: row.movie_title,
            movie_year: row.movie_year,
            movie_match,
            segment_match,
            cuts,
            flagged_for_timing: row.flagged_for_timing,
        });
    }

    // assemble final EpisodeRow, preserving ORDER BY from phase 1.
    let episodes = ep_rows
        .into_iter()
        .map(|row| {
            let slots = slots_map.remove(&row.id).unwrap_or_default();
            EpisodeRow {
                id: row.id,
                title: row.title,
                season: row.season,
                episode: row.episode,
                is_special: row.is_special,
                air_date: row.air_date,
                description: row.description,
                guests: row.guests_json,
                slots,
            }
        })
        .collect();

    Ok(episodes)
}

pub async fn get_episode_by_id_inner(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<EpisodeRow>, String> {
    let all = get_episodes_inner(pool).await?;
    Ok(all.into_iter().find(|e| e.id == id))
}

#[tauri::command]
pub async fn get_episodes(pool: State<'_, SqlitePool>) -> Result<Vec<EpisodeRow>, String> {
    get_episodes_inner(pool.inner()).await
}

#[tauri::command]
pub async fn get_episode_by_id(
    pool: State<'_, SqlitePool>,
    id: String,
) -> Result<Option<EpisodeRow>, String> {
    get_episode_by_id_inner(pool.inner(), &id).await
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

    async fn seed_episode(pool: &SqlitePool, id: &str, title: &str) {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO episode (id, title, is_special, created_at) VALUES (?, ?, 0, ?)",
        )
        .bind(id)
        .bind(title)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn seed_slot(pool: &SqlitePool, episode_id: &str, slot: &str) -> String {
        let slot_id = format!("{}-{}", episode_id, slot);
        sqlx::query(
            "INSERT INTO movie_slot (id, episode_id, slot) VALUES (?, ?, ?)",
        )
        .bind(&slot_id)
        .bind(episode_id)
        .bind(slot)
        .execute(pool)
        .await
        .unwrap();
        slot_id
    }

    #[tokio::test]
    async fn get_episodes_returns_seeded_rows() {
        let pool = setup().await;
        seed_episode(&pool, "ep-1", "Pilot").await;
        seed_episode(&pool, "ep-2", "Sequel").await;

        let episodes = get_episodes_inner(&pool).await.unwrap();
        assert_eq!(episodes.len(), 2);
        assert!(episodes.iter().any(|e| e.title == "Pilot"));
        assert!(episodes.iter().any(|e| e.title == "Sequel"));
    }

    #[tokio::test]
    async fn get_episodes_slots_empty_when_no_slots() {
        let pool = setup().await;
        seed_episode(&pool, "ep-1", "Pilot").await;

        let episodes = get_episodes_inner(&pool).await.unwrap();
        let ep = &episodes[0];
        assert!(ep.slots.is_empty());
    }

    #[tokio::test]
    async fn get_episodes_slot_has_missing_matches() {
        let pool = setup().await;
        seed_episode(&pool, "ep-1", "Pilot").await;
        seed_slot(&pool, "ep-1", "a").await;

        let episodes = get_episodes_inner(&pool).await.unwrap();
        let ep = &episodes[0];
        assert_eq!(ep.slots.len(), 1);
        assert_eq!(ep.slots[0].movie_match.status, "missing");
        assert_eq!(ep.slots[0].segment_match.status, "missing");
        assert!(ep.slots[0].cuts.is_empty());
    }

    #[tokio::test]
    async fn get_episodes_multiple_slots_ordered() {
        let pool = setup().await;
        seed_episode(&pool, "ep-1", "Pilot").await;
        seed_slot(&pool, "ep-1", "b").await;
        seed_slot(&pool, "ep-1", "a").await;

        let episodes = get_episodes_inner(&pool).await.unwrap();
        let ep = &episodes[0];
        assert_eq!(ep.slots.len(), 2);
        // Slots ordered alphabetically by slot letter
        assert_eq!(ep.slots[0].slot, "a");
        assert_eq!(ep.slots[1].slot, "b");
    }

    #[tokio::test]
    async fn get_episode_by_id_returns_none_for_unknown() {
        let pool = setup().await;
        let result = get_episode_by_id_inner(&pool, "no-such-id").await.unwrap();
        assert!(result.is_none());
    }
}
