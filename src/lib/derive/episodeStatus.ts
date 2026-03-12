import type { Episode, EpisodeStatus } from '../../features/episodes/types'

/**
 * Derives EpisodeStatus from an Episode's FileMatch rows, PlaybackCut offsets,
 * and flaggedForTiming flag. Evaluated in priority order per spec 0005.
 *
 * Priority:
 *  1. Any FileMatch is missing           → 'Missing Files'
 *  2. Any FileMatch is low-confidence    → 'Partial Match'
 *  3. All matched AND offset or flagged  → 'Needs Timing Fix'
 *  4. All matched, clean                 → 'Ready'
 */
export function deriveEpisodeStatus(episode: Episode): EpisodeStatus {
    const matches = [episode.movieMatch, episode.segmentMatch]

    if (matches.some((m) => m.status === 'missing')) {
        return 'Missing Files'
    }

    if (matches.some((m) => m.status === 'low-confidence')) {
        return 'Partial Match'
    }

    const hasOffset = episode.cuts.some((c) => c.userOffsetMs !== 0)
    if (hasOffset || episode.flaggedForTiming) {
        return 'Needs Timing Fix'
    }

    return 'Ready'
}
