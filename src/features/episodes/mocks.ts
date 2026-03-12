import type { Episode } from './types'

export const MOCK_EPISODES: Episode[] = [
    {
        id: 's01e01',
        title: 'The Drive-In Mutants',
        season: 1,
        episode: 1,
        isSpecial: false,
        airDate: '1986-07-04',
        description: 'Joe Bob kicks off the summer with two mutant-packed creature features.',
        movies: [
            { title: 'Humanoids from the Deep', path: '/media/movies/humanoids.mkv' },
            { title: 'Mutant', path: '/media/movies/mutant.mkv' },
        ],
        segments: [
            { title: 'Intro Segment', path: '/media/segments/s01e01-intro.mkv' },
            { title: 'Intermission Segment', path: '/media/segments/s01e01-intermission.mkv' },
        ],
        fileMatches: [
            { slot: 'movie1', filename: 'humanoids.mkv', confidence: 0.97, status: 'matched' },
            { slot: 'segment1', filename: 's01e01-intro.mkv', confidence: 0.95, status: 'matched' },
            { slot: 'movie2', filename: 'mutant.mkv', confidence: 0.91, status: 'matched' },
            { slot: 'segment2', filename: 's01e01-intermission.mkv', confidence: 0.93, status: 'matched' },
        ],
        playbackConfig: { offsets: { segment1: 0, segment2: 0 } },
        status: 'Ready',
    },
    {
        id: 's01e02',
        title: 'Slasher Summer',
        season: 1,
        episode: 2,
        isSpecial: false,
        airDate: '1986-07-11',
        description: 'The slasher season begins — but one file refuses to show up.',
        movies: [
            { title: 'Friday the 13th Part 2', path: '/media/movies/f13p2.mkv' },
            { title: 'The Burning' },
        ],
        segments: [
            { title: 'Intro Segment', path: '/media/segments/s01e02-intro.mkv' },
            { title: 'Intermission Segment' },
        ],
        fileMatches: [
            { slot: 'movie1', filename: 'f13p2.mkv', confidence: 0.88, status: 'matched' },
            { slot: 'segment1', filename: 's01e02-intro.mkv', confidence: 0.76, status: 'low-confidence' },
            { slot: 'movie2', status: 'missing' },
            { slot: 'segment2', status: 'missing' },
        ],
        playbackConfig: { offsets: { segment1: 0, segment2: 0 } },
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
        movies: [
            { title: 'Zombie' },
            { title: 'Let Sleeping Corpses Lie' },
        ],
        segments: [
            { title: 'Intro Segment' },
            { title: 'Intermission Segment' },
        ],
        fileMatches: [
            { slot: 'movie1', status: 'missing' },
            { slot: 'segment1', status: 'missing' },
            { slot: 'movie2', status: 'missing' },
            { slot: 'segment2', status: 'missing' },
        ],
        playbackConfig: { offsets: { segment1: 0, segment2: 0 } },
        status: 'Missing Files',
    },
    {
        id: 's01e04',
        title: 'Body Count Rising',
        season: 1,
        episode: 4,
        isSpecial: false,
        airDate: '1986-07-25',
        description: 'Files matched, but the second segment is off by about 12 seconds.',
        movies: [
            { title: 'Halloween II', path: '/media/movies/halloween2.mkv' },
            { title: 'Terror Train', path: '/media/movies/terrortrain.mkv' },
        ],
        segments: [
            { title: 'Intro Segment', path: '/media/segments/s01e04-intro.mkv' },
            { title: 'Intermission Segment', path: '/media/segments/s01e04-intermission.mkv' },
        ],
        fileMatches: [
            { slot: 'movie1', filename: 'halloween2.mkv', confidence: 0.94, status: 'matched' },
            { slot: 'segment1', filename: 's01e04-intro.mkv', confidence: 0.9, status: 'matched' },
            { slot: 'movie2', filename: 'terrortrain.mkv', confidence: 0.92, status: 'matched' },
            { slot: 'segment2', filename: 's01e04-intermission.mkv', confidence: 0.87, status: 'matched' },
        ],
        playbackConfig: { offsets: { segment1: 0, segment2: 12 } },
        status: 'Needs Timing Fix',
    },
    {
        id: 'special-halloween',
        title: 'The Drive-In Will Never Die',
        isSpecial: true,
        airDate: '1987-10-31',
        description: 'A special Halloween broadcast — classic Drive-In all night long.',
        movies: [
            { title: 'The Texas Chain Saw Massacre', path: '/media/movies/tcsm.mkv' },
            { title: 'Halloween', path: '/media/movies/halloween.mkv' },
        ],
        segments: [
            { title: 'Special Intro', path: '/media/segments/special-halloween-intro.mkv' },
            { title: 'Special Intermission', path: '/media/segments/special-halloween-inter.mkv' },
        ],
        fileMatches: [
            { slot: 'movie1', filename: 'tcsm.mkv', confidence: 0.99, status: 'matched' },
            { slot: 'segment1', filename: 'special-halloween-intro.mkv', confidence: 0.97, status: 'matched' },
            { slot: 'movie2', filename: 'halloween.mkv', confidence: 0.99, status: 'matched' },
            { slot: 'segment2', filename: 'special-halloween-inter.mkv', confidence: 0.96, status: 'matched' },
        ],
        playbackConfig: { offsets: { segment1: 0, segment2: 0 } },
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
