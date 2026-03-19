use log::info;
use serde::Deserialize;
use sqlx::SqlitePool;
use std::path::Path;

// Structs only used for deserialising the seed JSON
#[derive(Deserialize)]
struct EpisodeJson {
    id: String,
    season: Option<i64>,
    episode: Option<i64>,
    is_special: bool,
    title: String,
    description: Option<String>,
    air_date: Option<String>,
    #[serde(default)]
    guests: Vec<String>,
    movies: Vec<SlotJson>,
}

#[derive(Deserialize)]
struct SlotJson {
    slot: String,
    commentary: Option<String>,
    movie: Option<MovieJson>,
    #[serde(default)]
    cuts: Vec<CutJson>,
}

#[derive(Deserialize)]
struct MovieJson {
    title: String,
    year: Option<i64>,
    aliases: Vec<String>,
}

#[derive(Deserialize)]
struct CutJson {
    source: String, // "commentary" | "movie"
    start_ms: i64,
    end_ms: Option<i64>, // null = play to end of file
}

// Seed episodes from `json_path` if the episode table is empty.
// Idempotent — safe to call on every startup; exits early when rows exist.
pub async fn seed_episodes_if_empty(
    pool: &SqlitePool,
    json_path: &Path,
) -> Result<(), Box<dyn std::error::Error>> {
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM episode")
        .fetch_one(pool)
        .await?;

    if count.0 > 0 {
        info!("seed skipped — {} episodes already in DB", count.0);
        return Ok(());
    }

    let contents = std::fs::read_to_string(json_path)?;
    let episodes: Vec<EpisodeJson> = serde_json::from_str(&contents)?;
    let n = episodes.len();

    let mut tx = pool.begin().await?;
    let now = chrono::Utc::now().to_rfc3339();

    for ep in episodes {
        let description = ep.description.filter(|s| !s.is_empty());
        let guests_json = serde_json::to_string(&ep.guests)?;

        sqlx::query(
            r#"
            INSERT OR IGNORE INTO episode
                (id, title, season, episode, is_special, description,
                 air_date, guests_json, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&ep.id)
        .bind(&ep.title)
        .bind(ep.season)
        .bind(ep.episode)
        .bind(ep.is_special as i64)
        .bind(&description)
        .bind(&ep.air_date)
        .bind(&guests_json)
        .bind(&now)
        .execute(&mut *tx)
        .await?;

        for slot_entry in &ep.movies {
            let slot_id = format!("{}-{}", ep.id, slot_entry.slot);

            let (movie_title, movie_year, movie_aliases_json) = match &slot_entry.movie {
                Some(m) => {
                    let aliases = serde_json::to_string(&m.aliases)?;
                    (Some(m.title.clone()), m.year, Some(aliases))
                }
                None => (None, None, None),
            };

            sqlx::query(
                r#"
                INSERT OR IGNORE INTO movie_slot
                    (id, episode_id, slot, commentary,
                     movie_title, movie_year, movie_aliases_json)
                VALUES (?, ?, ?, ?, ?, ?, ?)
                "#,
            )
            .bind(&slot_id)
            .bind(&ep.id)
            .bind(&slot_entry.slot)
            .bind(&slot_entry.commentary)
            .bind(&movie_title)
            .bind(movie_year)
            .bind(&movie_aliases_json)
            .execute(&mut *tx)
            .await?;

            for (i, cut) in slot_entry.cuts.iter().enumerate() {
                let sort_order = i as i64;
                let cut_id = format!("{}-c{}", slot_id, sort_order);

                sqlx::query(
                    r#"
                    INSERT OR IGNORE INTO playback_cut
                        (id, slot_id, sort_order, source_type, start_ms, end_ms, user_offset_ms)
                    VALUES (?, ?, ?, ?, ?, ?, 0)
                    "#,
                )
                .bind(&cut_id)
                .bind(&slot_id)
                .bind(sort_order)
                .bind(&cut.source)
                .bind(cut.start_ms)
                .bind(cut.end_ms)
                .execute(&mut *tx)
                .await?;
            }
        }
    }

    tx.commit().await?;
    info!("seeded {} episodes", n);
    Ok(())
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use crate::test_support::setup;

    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn write_fixture(json: &str) -> NamedTempFile {
        let mut f = NamedTempFile::new().unwrap();
        f.write_all(json.as_bytes()).unwrap();
        f
    }

    const FIXTURE: &str = r#"[
      {
        "id": "s01e01",
        "season": 1,
        "episode": 1,
        "is_special": false,
        "title": "Test Episode",
        "description": "A test.",
        "air_date": "2019-03-29",
        "guests": ["Felissa Rose"],
        "movies": [
          {
            "slot": "a",
            "commentary": "S01E01A Commentary",
            "movie": { "title": "Tourist Trap", "year": 1979, "aliases": ["Tourist Trap 1979"] },
            "cuts": [
              { "source": "commentary", "start_ms": 0,      "end_ms": 185000  },
              { "source": "movie",      "start_ms": 0,      "end_ms": 4120000 },
              { "source": "commentary", "start_ms": 185000, "end_ms": null    }
            ]
          },
          {
            "slot": "b",
            "commentary": "S01E01B Commentary",
            "movie": { "title": "Castle Freak", "year": 1995, "aliases": [] },
            "cuts": []
          }
        ]
      }
    ]"#;

    #[tokio::test]
    async fn seeds_episodes_and_slots_from_json() {
        let pool = setup().await;
        let file = write_fixture(FIXTURE);

        seed_episodes_if_empty(&pool, file.path()).await.unwrap();

        let ep_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM episode")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(ep_count.0, 1);

        let slot_count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM movie_slot")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(slot_count.0, 2);

        // Slot IDs are deterministic
        let slot_id: (String,) =
            sqlx::query_as("SELECT id FROM movie_slot WHERE episode_id = 's01e01' AND slot = 'a'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(slot_id.0, "s01e01-a");

        // 3 cuts on slot a, 0 on slot b
        let cut_count: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM playback_cut WHERE slot_id = 's01e01-a'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(cut_count.0, 3);

        // One cut has end_ms IS NULL
        let null_cut: (i64,) =
            sqlx::query_as("SELECT COUNT(*) FROM playback_cut WHERE end_ms IS NULL")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(null_cut.0, 1);
    }

    #[tokio::test]
    async fn seed_is_idempotent() {
        let pool = setup().await;
        let file = write_fixture(FIXTURE);

        seed_episodes_if_empty(&pool, file.path()).await.unwrap();
        seed_episodes_if_empty(&pool, file.path()).await.unwrap();

        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM episode")
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count.0, 1);
    }

    #[tokio::test]
    async fn seeds_guests_json() {
        let pool = setup().await;
        let file = write_fixture(FIXTURE);

        seed_episodes_if_empty(&pool, file.path()).await.unwrap();

        let guests: (String,) =
            sqlx::query_as("SELECT guests_json FROM episode WHERE id = 's01e01'")
                .fetch_one(&pool)
                .await
                .unwrap();
        assert_eq!(guests.0, r#"["Felissa Rose"]"#);
    }
}
