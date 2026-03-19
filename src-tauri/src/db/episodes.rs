use crate::db::types::{EpisodeRow, FileMatchRow, MovieSlotRow, PlaybackCutRow, PlaybackEntryRow};
use sqlx::SqlitePool;

// Represents an episode row from the db
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

// Flat row from the movie_slot + file_match + playback_override join.
#[derive(sqlx::FromRow)]
struct SlotFileRow {
    slot_id: String,
    episode_id: String,
    slot: String,
    commentary: Option<String>,
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

    // commentary match columns (prefixed)
    commentary_file_type: Option<String>,
    commentary_filename: Option<String>,
    commentary_display_name: Option<String>,
    commentary_path: Option<String>,
    commentary_confidence: Option<f64>,
    commentary_status: Option<String>,
    commentary_is_user_overridden: Option<bool>,
    commentary_matched_at: Option<String>,
}

#[derive(sqlx::FromRow)]
struct CutRow {
    slot_id: String,
    id: String,
    sort_order: i64,
    source_type: String,
    start_ms: i64,
    end_ms: i64,
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

pub(crate) async fn get_episodes(pool: &SqlitePool) -> Result<Vec<EpisodeRow>, String> {
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
    let ep_placeholders = episode_ids
        .iter()
        .map(|_| "?")
        .collect::<Vec<_>>()
        .join(", ");

    // fetch all slots with their file matches and override flag.
    let slot_sql = format!(
        r#"
        SELECT
            ms.id        AS slot_id,
            ms.episode_id,
            ms.slot,
            ms.commentary,
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

            fm_com.file_type          AS commentary_file_type,
            mf_com.filename           AS commentary_filename,
            mf_com.display_name       AS commentary_display_name,
            mf_com.path               AS commentary_path,
            fm_com.confidence         AS commentary_confidence,
            fm_com.match_status       AS commentary_status,
            CAST(fm_com.is_user_overridden AS BOOLEAN) AS commentary_is_user_overridden,
            fm_com.matched_at         AS commentary_matched_at

        FROM movie_slot ms
        LEFT JOIN playback_override po   ON po.slot_id = ms.id
        LEFT JOIN file_match fm_movie    ON fm_movie.slot_id = ms.id AND fm_movie.file_type = 'movie'
        LEFT JOIN media_file mf_movie    ON mf_movie.id = fm_movie.media_file_id
        LEFT JOIN file_match fm_com      ON fm_com.slot_id = ms.id AND fm_com.file_type = 'commentary'
        LEFT JOIN media_file mf_com      ON mf_com.id = fm_com.media_file_id
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
        let all_cuts: Vec<CutRow> = cut_query.fetch_all(pool).await.map_err(|e| e.to_string())?;

        for cut in all_cuts {
            cuts_map
                .entry(cut.slot_id.clone())
                .or_default()
                .push(PlaybackCutRow {
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

        let commentary_match = if row.commentary_file_type.is_some() {
            FileMatchRow {
                file_type: row.commentary_file_type.unwrap(),
                filename: row.commentary_filename,
                display_name: row.commentary_display_name,
                path: row.commentary_path,
                confidence: row.commentary_confidence,
                status: row
                    .commentary_status
                    .unwrap_or_else(|| "missing".to_string()),
                is_user_overridden: row.commentary_is_user_overridden.unwrap_or(false),
                matched_at: row.commentary_matched_at,
            }
        } else {
            missing_match("commentary")
        };

        let cuts = cuts_map.remove(&row.slot_id).unwrap_or_default();

        slots_map
            .entry(row.episode_id.clone())
            .or_default()
            .push(MovieSlotRow {
                id: row.slot_id,
                slot: row.slot,
                commentary: row.commentary,
                movie_title: row.movie_title,
                movie_year: row.movie_year,
                movie_match,
                commentary_match,
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

pub(crate) async fn get_episode_by_id(
    pool: &SqlitePool,
    id: &str,
) -> Result<Option<EpisodeRow>, String> {
    let all = get_episodes(pool).await?;
    Ok(all.into_iter().find(|e| e.id == id))
}

pub(crate) async fn get_playback_plan_for_slot(
    pool: &SqlitePool,
    slot_id: &str,
) -> Result<Vec<PlaybackEntryRow>, String> {
    let cuts: Vec<PlaybackCutRow> = sqlx::query_as(
        "SELECT id, sort_order, source_type, start_ms, end_ms, user_offset_ms
         FROM playback_cut WHERE slot_id = ? ORDER BY sort_order ASC",
    )
    .bind(slot_id)
    .fetch_all(pool)
    .await
    .map_err(|e| e.to_string())?;

    if cuts.is_empty() {
        return Ok(vec![]);
    }

    let movie_path: Option<String> = sqlx::query_scalar(
        "SELECT mf.path FROM file_match fm
         JOIN media_file mf ON fm.media_file_id = mf.id
         WHERE fm.slot_id = ? AND fm.file_type = 'movie' AND mf.is_missing = 0
         LIMIT 1",
    )
    .bind(slot_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let commentary_path: Option<String> = sqlx::query_scalar(
        "SELECT mf.path FROM file_match fm
         JOIN media_file mf ON fm.media_file_id = mf.id
         WHERE fm.slot_id = ? AND fm.file_type = 'commentary' AND mf.is_missing = 0
         LIMIT 1",
    )
    .bind(slot_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| e.to_string())?;

    let needs_movie = cuts.iter().any(|c| c.source_type == "movie");
    let needs_commentary = cuts.iter().any(|c| c.source_type == "commentary");

    if needs_movie && movie_path.is_none() {
        return Err(format!(
            "NOT_FOUND: no matched movie file for slot '{slot_id}'"
        ));
    }
    if needs_commentary && commentary_path.is_none() {
        return Err(format!(
            "NOT_FOUND: no matched commentary file for slot '{slot_id}'"
        ));
    }

    let entries = cuts
        .into_iter()
        .map(|cut| {
            let file_path = if cut.source_type == "movie" {
                movie_path.clone().unwrap()
            } else {
                commentary_path.clone().unwrap()
            };
            let effective_start_ms = std::cmp::max(0, cut.start_ms + cut.user_offset_ms);
            let effective_end_ms = std::cmp::max(effective_start_ms, cut.end_ms + cut.user_offset_ms);

            PlaybackEntryRow {
                order: cut.sort_order,
                source: cut.source_type,
                file_path,
                start_ms: cut.start_ms,
                end_ms: cut.end_ms,
                effective_start_ms,
                effective_end_ms,
                cut_id: cut.id,
            }
        })
        .collect();

    Ok(entries)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::test_support::{
        setup, setup_episode, setup_media_file, setup_movie_slot, setup_playback_cut,
    };

    async fn seed_file_match(
        pool: &SqlitePool,
        slot_id: &str,
        file_type: &str,
        media_file_id: &str,
    ) {
        let now = chrono::Utc::now().to_rfc3339();
        sqlx::query(
            "INSERT INTO file_match (slot_id, file_type, media_file_id, match_status, confidence, is_user_overridden, matched_at)
             VALUES (?, ?, ?, 'matched', 0.95, 0, ?)",
        )
        .bind(slot_id)
        .bind(file_type)
        .bind(media_file_id)
        .bind(&now)
        .execute(pool)
        .await
        .unwrap();
    }

    #[tokio::test]
    async fn get_episodes_returns_seeded_rows() {
        let pool = setup().await;
        setup_episode(&pool, "ep-1", Some("Pilot")).await;
        setup_episode(&pool, "ep-2", Some("Sequel")).await;

        let episodes = get_episodes(&pool).await.unwrap();
        assert_eq!(episodes.len(), 2);
        assert!(episodes.iter().any(|e| e.title == "Pilot"));
        assert!(episodes.iter().any(|e| e.title == "Sequel"));
    }

    #[tokio::test]
    async fn get_episodes_slots_empty_when_no_slots() {
        let pool = setup().await;
        setup_episode(&pool, "ep-1", Some("Pilot")).await;

        let episodes = get_episodes(&pool).await.unwrap();
        let ep = &episodes[0];
        assert!(ep.slots.is_empty());
    }

    #[tokio::test]
    async fn get_episodes_slot_has_missing_matches() {
        let pool = setup().await;
        setup_episode(&pool, "ep-1", Some("Pilot")).await;
        setup_movie_slot(&pool, "ep-1", "a", "C.H.U.D", None).await;

        let episodes = get_episodes(&pool).await.unwrap();
        let ep = &episodes[0];
        assert_eq!(ep.slots.len(), 1);
        assert_eq!(ep.slots[0].movie_match.status, "missing");
        assert_eq!(ep.slots[0].commentary_match.status, "missing");
        assert!(ep.slots[0].cuts.is_empty());
    }

    #[tokio::test]
    async fn get_episodes_multiple_slots_ordered() {
        let pool = setup().await;
        setup_episode(&pool, "ep-1", Some("Pilot")).await;
        setup_movie_slot(&pool, "ep-1", "b", "Q: Winger Serpent", None).await;
        setup_movie_slot(&pool, "ep-1", "a", "The Stuff", None).await;

        let episodes = get_episodes(&pool).await.unwrap();
        let ep = &episodes[0];
        assert_eq!(ep.slots.len(), 2);
        // Slots ordered alphabetically by slot letter
        assert_eq!(ep.slots[0].slot, "a");
        assert_eq!(ep.slots[1].slot, "b");
    }

    #[tokio::test]
    async fn get_episode_by_id_returns_none_for_unknown() {
        let pool = setup().await;
        let result = get_episode_by_id(&pool, "no-such-id").await.unwrap();
        assert!(result.is_none());
    }

    #[tokio::test]
    async fn get_playback_plan_empty_cuts_returns_empty_vec() {
        let pool = setup().await;
        setup_episode(&pool, "ep-1", None).await;
        let slot_id = setup_movie_slot(&pool, "ep-1", "a", "Deathgasm", None).await;

        let result = get_playback_plan_for_slot(&pool, &slot_id).await.unwrap();
        assert!(result.is_empty());
    }

    #[tokio::test]
    async fn get_playback_plan_returns_err_when_movie_file_missing() {
        let pool = setup().await;
        setup_episode(&pool, "ep-1", None).await;
        let slot_id = setup_movie_slot(&pool, "ep-1", "a", "Deathgasm", None).await;
        setup_playback_cut(&pool, &slot_id, 0, "movie", 1, 0, 1000).await;
        // No file_match row for movie.

        let result = get_playback_plan_for_slot(&pool, &slot_id).await;
        assert!(result.is_err());
        assert!(result.unwrap_err().contains("NOT_FOUND"));
    }

    #[tokio::test]
    async fn get_playback_plan_happy_path() {
        let pool = setup().await;
        setup_episode(&pool, "ep-1", None).await;
        let slot_id = setup_movie_slot(&pool, "ep-1", "a", "Deathgasm", None).await;

        setup_media_file(&pool, "mf-movie", "deathgasm.mkv", "movies").await;
        setup_media_file(&pool, "mf-com", "deathgasm_commentary.mkv", "commentary").await;

        seed_file_match(&pool, &slot_id, "movie", "mf-movie").await;
        seed_file_match(&pool, &slot_id, "commentary", "mf-com").await;

        setup_playback_cut(&pool, &slot_id, 0, "commentary", 1, 0, 1000).await;
        setup_playback_cut(&pool, &slot_id, 1, "movie", 2, 60_000, 150_000).await;
        setup_playback_cut(&pool, &slot_id, 2, "commentary", 3, 150_000, 210_000).await;
        setup_playback_cut(&pool, &slot_id, 3, "movie", 4, 4_920_000, 0).await;

        let entries = get_playback_plan_for_slot(&pool, &slot_id).await.unwrap();
        assert_eq!(entries.len(), 4);
        assert_eq!(entries[0].order, 0);
        assert_eq!(entries[0].source, "commentary");
        assert!(entries[0].file_path.contains("deathgasm_commentary.mkv"));
        assert_eq!(entries[1].source, "movie");
        assert!(entries[1].file_path.contains("deathgasm.mkv"));
        assert_eq!(entries[3].end_ms, 4_920_000);
    }
}
