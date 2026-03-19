import type { Episode, EpisodeStatus, MovieSlot } from '../features/episodes/types'

function deriveSlotStatus(slot: MovieSlot): EpisodeStatus {
    const matches = [slot.movieMatch, slot.commentaryMatch]

    if (matches.some((m) => m.status === 'missing')) {
        return 'Missing Files'
    }

    if (matches.some((m) => m.status === 'low-confidence')) {
        return 'Partial Match'
    }

    const hasOffset = slot.cuts.some((c) => c.userOffsetMs !== 0)
    if (hasOffset || slot.flaggedForTiming) {
        return 'Needs Timing Fix'
    }

    return 'Ready'
}

/**
 * Derives EpisodeStatus using worst-slot-wins across all MovieSlots.
 * Priority order: Missing Files > Partial Match > Needs Timing Fix > Ready.
 */
function deriveEpisodeStatus(episode: Episode): EpisodeStatus {
    if (episode.slots.length === 0) return 'Missing Files'

    const statuses = episode.slots.map(deriveSlotStatus)

    if (statuses.some((s) => s === 'Missing Files')) return 'Missing Files'
    if (statuses.some((s) => s === 'Partial Match')) return 'Partial Match'
    if (statuses.some((s) => s === 'Needs Timing Fix')) return 'Needs Timing Fix'
    return 'Ready'
}

export { deriveEpisodeStatus }
