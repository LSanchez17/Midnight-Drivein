import type { Episode, MovieSlot, FileMatch, PlaybackCut } from './types'

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

// Typical 6-cut interleave: commentary → movie → commentary → movie → commentary → movie (an example pattern, cuts can be n1 -> m1 -> ni --> mi --> ...  long)
function standardCuts(prefix: string, overrides: Partial<Record<string, number>> = {}): PlaybackCut[] {
    const cuts: PlaybackCut[] = [
        cut(`${prefix}-c1`, 1, 'commentary', 0, 300_000, overrides[`${prefix}-c1`] ?? 0),
        cut(`${prefix}-c2`, 2, 'movie', 0, 900_000, overrides[`${prefix}-c2`] ?? 0),
        cut(`${prefix}-c3`, 3, 'commentary', 300_000, 720_000, overrides[`${prefix}-c3`] ?? 0),
        cut(`${prefix}-c4`, 4, 'movie', 900_000, 2_100_000, overrides[`${prefix}-c4`] ?? 0),
        cut(`${prefix}-c5`, 5, 'commentary', 720_000, 1_110_000, overrides[`${prefix}-c5`] ?? 0),
        cut(`${prefix}-c6`, 6, 'movie', 2_100_000, 4_200_000, overrides[`${prefix}-c6`] ?? 0),
    ]
    return cuts
}

function slot(
    episodeId: string,
    slotLetter: string,
    commentary: string,
    movieTitle: string,
    movieYear: number,
    movieMatch: FileMatch,
    commentaryMatch: FileMatch,
    cuts: PlaybackCut[],
    flaggedForTiming = false,
): MovieSlot {
    return {
        id: `${episodeId}-${slotLetter}`,
        slot: slotLetter,
        commentary,
        movieTitle,
        movieYear,
        movieMatch,
        commentaryMatch,
        cuts,
        flaggedForTiming,
    }
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
        guests: [],
        slots: [
            slot(
                's01e01', 'a',
                'S01E01A Segments',
                'Humanoids from the Deep', 1980,
                matched('movie', 'humanoids.mkv', 'Humanoids from the Deep', '/media/movies/humanoids.mkv', 0.97),
                matched('commentary', 's01e01a-seg.mkv', 'S01E01A Segments', '/media/commentary/s01e01a-seg.mkv', 0.95),
                standardCuts('s01e01-a'),
            ),
        ],
        status: 'Ready',
    },
    {
        id: 's01e02',
        title: 'Slasher Summer',
        season: 1,
        episode: 2,
        isSpecial: false,
        airDate: '1986-07-11',
        description: 'The slasher season begins — but the commentary reel is a shaky match.',
        guests: [],
        slots: [
            slot(
                's01e02', 'a',
                'S01E02A Segments',
                'Friday the 13th Part 2', 1981,
                matched('movie', 'f13p2.mkv', 'Friday the 13th Part 2', '/media/movies/f13p2.mkv', 0.88),
                lowConfidence('commentary', 's01e02a-seg.mkv', 'S01E02A Segments', '/media/commentary/s01e02a-seg.mkv', 0.76),
                standardCuts('s01e02-a'),
            ),
        ],
        status: 'Partial Match',
    },
    {
        id: 's01e03',
        title: 'Season 1 Episode 3',
        season: 1,
        episode: 3,
        isSpecial: false,
        airDate: '2019-04-12',
        description: 'Week 3',
        guests: [],
        slots: [
            slot(
                's01e03', 'a',
                'deathgasm commentary',
                'Deathgasm', 2015,
                matched('movie', 'deathgasm.mkv', 'Deathgasm', '/media/movies/deathgasm.mkv', 0.97),
                matched('commentary', 'deathgasm_commentary.mkv', 'deathgasm commentary', '/media/commentary/deathgasm_commentary.mkv', 0.95),
                [
                    cut('s01e03-a-c1', 1, 'commentary', 0, 60_000),
                    cut('s01e03-a-c2', 2, 'movie', 60_000, 150_000),
                    cut('s01e03-a-c3', 3, 'commentary', 150_000, 210_000),
                    cut('s01e03-a-c4', 4, 'movie', 210_000, 4_920_000),
                ],
            ),
            slot(
                's01e03', 'b',
                'the changeling commentary',
                'The Changeling', 1980,
                matched('movie', 'the_changeling.mkv', 'The Changeling', '/media/movies/the_changeling.mkv', 0.94),
                matched('commentary', 'changeling_commentary.mkv', 'the changeling commentary', '/media/commentary/changeling_commentary.mkv', 0.92),
                [
                    cut('s01e03-b-c1', 1, 'commentary', 0, 120_000),
                    cut('s01e03-b-c2', 2, 'movie', 120_000, 240_000),
                    cut('s01e03-b-c3', 3, 'commentary', 240_000, 300_000),
                    cut('s01e03-b-c4', 4, 'movie', 300_000, 6_420_000),
                ],
            ),
        ],
        status: 'Ready',
    },
    {
        id: 's01e04',
        title: 'Body Count Rising',
        season: 1,
        episode: 4,
        isSpecial: false,
        airDate: '1986-07-25',
        description: 'Files matched, but the third cut (intermission) is off by about 12 seconds.',
        guests: [],
        slots: [
            slot(
                's01e04', 'a',
                'S01E04A Segments',
                'Halloween II', 1981,
                matched('movie', 'halloween2.mkv', 'Halloween II', '/media/movies/halloween2.mkv', 0.94),
                matched('commentary', 's01e04a-seg.mkv', 'S01E04A Segments', '/media/commentary/s01e04a-seg.mkv', 0.90),
                standardCuts('s01e04-a', { 's01e04-a-c3': 12_000 }),
            ),
        ],
        status: 'Needs Timing Fix',
    },
    {
        id: 'special-halloween',
        title: 'The Drive-In Will Never Die',
        episode: 1,
        isSpecial: true,
        airDate: '1987-10-31',
        description: 'A special Halloween broadcast — classic Drive-In all night long.',
        guests: [],
        slots: [
            slot(
                'special-halloween', 'a',
                'Special Halloween Segments',
                'The Texas Chain Saw Massacre', 1974,
                matched('movie', 'tcsm.mkv', 'The Texas Chain Saw Massacre', '/media/movies/tcsm.mkv', 0.99),
                matched('commentary', 'special-halloween-a-seg.mkv', 'Special Halloween Segments', '/media/commentary/special-halloween-a-seg.mkv', 0.97),
                standardCuts('special-halloween-a'),
            ),
        ],
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
