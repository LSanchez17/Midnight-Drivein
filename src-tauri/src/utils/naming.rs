use std::path::Path;

use crate::constants::SUPPORTED_EXTENSIONS;

// normalize_filename
// Strip the file extension and remove parenthesised year tags.
//
// `"The Slumber Party Massacre (1982).mkv"` → `"The Slumber Party Massacre"`
// `"sleepaway_camp_1983.mp4"` → `"sleepaway_camp_1983"`
//
// Original casing is preserved.
pub(crate) fn normalize_filename(filename: &str) -> String {
    let stem = Path::new(filename)
        .file_stem()
        .and_then(|s| s.to_str())
        .unwrap_or(filename);
    strip_year_tags(stem).trim().to_string()
}

// TODO: Handle special naming conventions(IE CHUD)
// normalize_for_match
// Level-2 normalisation for fuzzy comparison.
// If the input looks like a video filename, applies normalize_filename first.
// Then: lowercase → underscores/dots → spaces → collapse whitespace.
//
// `"Castle Freak (1995).mkv"` → `"castle freak"`
// `"castle_freak_1995.mkv"` → `"castle freak 1995"`
// `"S01E01A Segments"` → `"s01e01a segments"`
pub(crate) fn normalize_for_match(input: &str) -> String {
    let stem = if has_video_extension(input) {
        normalize_filename(input)
    } else {
        input.to_string()
    };
    stem.to_lowercase()
        .replace(['_', '.'], " ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

fn has_video_extension(s: &str) -> bool {
    Path::new(s)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| SUPPORTED_EXTENSIONS.contains(&e.to_lowercase().as_str()))
        .unwrap_or(false)
}

fn strip_year_tags(s: &str) -> String {
    let mut result = s.to_string();
    loop {
        match find_year_tag(&result) {
            Some((start, end)) => {
                result.drain(start..end);
            }
            None => break,
        }
    }
    result
}

// Returns the byte range `(start, end)` of the first `(NNNN)` year tag in `s`,
// including any single space immediately before the opening parenthesis.
fn find_year_tag(s: &str) -> Option<(usize, usize)> {
    let bytes = s.as_bytes();
    for i in 0..bytes.len() {
        if bytes[i] == b'('
            && i + 5 < bytes.len()
            && bytes[i + 1].is_ascii_digit()
            && bytes[i + 2].is_ascii_digit()
            && bytes[i + 3].is_ascii_digit()
            && bytes[i + 4].is_ascii_digit()
            && bytes[i + 5] == b')'
        {
            let start = if i > 0 && bytes[i - 1] == b' ' {
                i - 1
            } else {
                i
            };
            let end = i + 6;
            return Some((start, end));
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_filename_strips_extension() {
        assert_eq!(normalize_filename("film.mkv"), "film");
    }

    #[test]
    fn normalize_filename_strips_year_tag() {
        assert_eq!(
            normalize_filename("The Slumber Party Massacre (1982).mkv"),
            "The Slumber Party Massacre"
        );
    }

    #[test]
    fn normalize_filename_preserves_casing() {
        assert_eq!(normalize_filename("Castle Freak.mkv"), "Castle Freak");
    }

    #[test]
    fn normalize_filename_trims_whitespace() {
        assert_eq!(normalize_filename("The Thing (1982).mkv"), "The Thing");
    }

    #[test]
    fn normalize_filename_no_year_unchanged() {
        assert_eq!(
            normalize_filename("sleepaway_camp_1983.mp4"),
            "sleepaway_camp_1983"
        );
    }

    #[test]
    fn normalize_for_match_lowercases() {
        assert_eq!(normalize_for_match("Castle Freak"), "castle freak");
    }

    #[test]
    fn normalize_for_match_replaces_underscores() {
        assert_eq!(
            normalize_for_match("castle_freak_1995.mkv"),
            "castle freak 1995"
        );
    }

    #[test]
    fn normalize_for_match_replaces_dots() {
        assert_eq!(normalize_for_match("C.H.U.D..mkv"), "c h u d");
    }

    #[test]
    fn normalize_for_match_collapses_whitespace() {
        assert_eq!(normalize_for_match("The  Thing"), "the thing");
    }

    #[test]
    fn normalize_for_match_strips_year_and_lowercases() {
        assert_eq!(normalize_for_match("Film (1982).mkv"), "film");
    }
}
