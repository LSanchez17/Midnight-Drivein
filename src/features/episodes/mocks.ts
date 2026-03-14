import type { Episode, FileMatch, PlaybackCut } from './types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function matched(
    fileType: FileMatch['fileType'],
    filename: string,
    displayName: string,
    path: string,
    confidence: number,
): FileMatch {
    return { fileType, filename, displayName, path, confidence, status: 'matched', isUserOverridden: false }
}

function lowConfidence(
    fileType: FileMatch['fileType'],
    filename: string,
    displayName: string,
    path: string,
    confidence: number,
): FileMatch {
    return { fileType, filename, displayName, path, confidence, status: 'low-confidence', isUserOverridden: false }
}

function missing(fileType: FileMatch['fileType']): FileMatch {
    return { fileType, status: 'missing', isUserOverridden: false }
}

function cut(
    id: string,
    sortOrder: number,
    sourceType: PlaybackCut['sourceType'],
    startMs: number,
    endMs: number,
    userOffsetMs = 0,
): PlaybackCut {
    return { id, sortOrder, sourceType, startMs, endMs, userOffsetMs }
}

// Typical 6-cut interleave: seg → movie → seg → movie → seg → movie
function standardCuts(prefix: string, overrides: Partial<Record<string, number>> = {}): PlaybackCut[] {
    const cuts: PlaybackCut[] = [
        cut(`${prefix}-c1`, 1, 'segment', 0, 300_000, overrides[`${prefix}-c1`] ?? 0),
        cut(`${prefix}-c2`, 2, 'movie', 0, 900_000, overrides[`${prefix}-c2`] ?? 0),
        cut(`${prefix}-c3`, 3, 'segment', 300_000, 720_000, overrides[`${prefix}-c3`] ?? 0),
        cut(`${prefix}-c4`, 4, 'movie', 900_000, 2_100_000, overrides[`${prefix}-c4`] ?? 0),
        cut(`${prefix}-c5`, 5, 'segment', 720_000, 1_110_000, overrides[`${prefix}-c5`] ?? 0),
        cut(`${prefix}-c6`, 6, 'movie', 2_100_000, 4_200_000, overrides[`${prefix}-c6`] ?? 0),
    ]
    return cuts
}

// ---------------------------------------------------------------------------
// Mock episodes
// ---------------------------------------------------------------------------

export const MOCK_EPISODES: Episode[] = [
    {
        id: 's01e01',
        title: 'The Drive-In Mutants',
        season: 1,
        episode: 1,
        isSpecial: false,
        airDate: '1986-07-04',
        description: 'Joe Bob kicks off the summer with two mutant-packed creature features.',
        hostLabel: 'S01E01 Segments',
        movieTitle: 'Humanoids from the Deep',
        movieYear: 1980,
        movieMatch: matched('movie', 'humanoids.mkv', 'Humanoids from the Deep', '/media/movies/humanoids.mkv', 0.97),
        segmentMatch: matched('segment', 's01e01-seg.mkv', 'S01E01 Segments', '/media/segments/s01e01-seg.mkv', 0.95),
        cuts: standardCuts('s01e01'),
        flaggedForTiming: false,
        status: 'Ready',
    },
    {
        id: 's01e02',
        title: 'Slasher Summer',
        season: 1,
        episode: 2,
        isSpecial: false,
        airDate: '1986-07-11',
        description: 'The slasher season begins — but the segment reel is a shaky match.',
        hostLabel: 'S01E02 Segments',
        movieTitle: 'Friday the 13th Part 2',
        movieYear: 1981,
        movieMatch: matched('movie', 'f13p2.mkv', 'Friday the 13th Part 2', '/media/movies/f13p2.mkv', 0.88),
        segmentMatch: lowConfidence('segment', 's01e02-seg.mkv', 'S01E02 Segments', '/media/segments/s01e02-seg.mkv', 0.76),
        cuts: standardCuts('s01e02'),
        flaggedForTiming: false,
        status: 'Partial Match',
    },
    {
        id: 's01e03',
        title: 'Zombie Night',
        season: 1,
        episode: 3,
        isSpecial: false,
        airDate: '1986-07-18',
        description: 'The dead walk — and so does this completely unmatched episode.',
        hostLabel: 'S01E03 Segments',
        movieMatch: missing('movie'),
        segmentMatch: missing('segment'),
        cuts: standardCuts('s01e03'),
        flaggedForTiming: false,
        status: 'Missing Files',
    },
    {
        id: 's01e04',
        title: 'Body Count Rising',
        season: 1,
        episode: 4,
        isSpecial: false,
        airDate: '1986-07-25',
        description: 'Files matched, but the third cut (intermission) is off by about 12 seconds.',
        hostLabel: 'S01E04 Segments',
        movieTitle: 'Halloween II',
        movieYear: 1981,
        movieMatch: matched('movie', 'halloween2.mkv', 'Halloween II', '/media/movies/halloween2.mkv', 0.94),
        segmentMatch: matched('segment', 's01e04-seg.mkv', 'S01E04 Segments', '/media/segments/s01e04-seg.mkv', 0.90),
        cuts: standardCuts('s01e04', { 's01e04-c3': 12_000 }),
        flaggedForTiming: false,
        status: 'Needs Timing Fix',
    },
    {
        id: 'special-halloween',
        title: 'The Drive-In Will Never Die',
        episode: 1,
        isSpecial: true,
        airDate: '1987-10-31',
        description: 'A special Halloween broadcast — classic Drive-In all night long.',
        hostLabel: 'Special Halloween Segments',
        movieTitle: 'The Texas Chain Saw Massacre',
        movieYear: 1974,
        movieMatch: matched('movie', 'tcsm.mkv', 'The Texas Chain Saw Massacre', '/media/movies/tcsm.mkv', 0.99),
        segmentMatch: matched('segment', 'special-halloween-seg.mkv', 'Special Halloween Segments', '/media/segments/special-halloween-seg.mkv', 0.97),
        cuts: standardCuts('special-halloween'),
        flaggedForTiming: false,
        status: 'Ready',
    },
]

export function getEpisodes(): Promise<Episode[]> {
    return new Promise((resolve) => setTimeout(() => resolve(MOCK_EPISODES), 300))
}

export function getEpisode(id: string): Promise<Episode | undefined> {
    return new Promise((resolve) =>
        setTimeout(() => resolve(MOCK_EPISODES.find((e) => e.id === id)), 200),
    )
}
