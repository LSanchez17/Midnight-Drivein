import { useEffect, useState } from 'react'
import { getEpisodes } from '../features/episodes/mocks'
import type { Episode, EpisodeStatus } from '../features/episodes/types'
import EpisodeCard from '../features/episodes/components/EpisodeCard'
import TextInput from '../components/ui/TextInput'

const ALL_STATUSES: EpisodeStatus[] = [
    'Ready',
    'Partial Match',
    'Missing Files',
    'Needs Timing Fix',
]

type SpecialFilter = 'All' | 'Episodes' | 'Specials'

const selectStyle: React.CSSProperties = {
    backgroundColor: '#0b0b0f',
    border: '1px solid #2a2a33',
    color: '#f3ebd2',
    borderRadius: '0.375rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    outline: 'none',
    cursor: 'pointer',
}

export default function LibraryPage() {
    const [episodes, setEpisodes] = useState<Episode[]>([])
    const [search, setSearch] = useState('')
    const [statusFilter, setStatusFilter] = useState<EpisodeStatus | 'All'>('All')
    const [specialFilter, setSpecialFilter] = useState<SpecialFilter>('All')
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        getEpisodes().then((data) => {
            setEpisodes(data)
            setLoading(false)
        })
    }, [])

    const filtered = episodes.filter((ep) => {
        const q = search.toLowerCase()
        const matchSearch =
            !q ||
            ep.title.toLowerCase().includes(q) ||
            ep.movies.some((m) => m.title.toLowerCase().includes(q))
        const matchStatus = statusFilter === 'All' || ep.status === statusFilter
        const matchSpecial =
            specialFilter === 'All' ||
            (specialFilter === 'Specials' && ep.isSpecial) ||
            (specialFilter === 'Episodes' && !ep.isSpecial)
        return matchSearch && matchStatus && matchSpecial
    })

    return (
        <div className="space-y-6 max-w-6xl">
            {/* Page title */}
            <div className="flex items-center gap-3">
                <h1
                    className="text-4xl tracking-[0.15em] uppercase"
                    style={{
                        color: '#f3ebd2',
                        fontFamily: 'Impact, "Arial Narrow", sans-serif',
                    }}
                >
                    Library
                </h1>
                {!loading && (
                    <span
                        className="text-xs px-2 py-0.5 rounded-full border"
                        style={{ color: '#b8b1a1', borderColor: '#2a2a33', backgroundColor: '#15151b' }}
                    >
                        {filtered.length} {filtered.length === 1 ? 'episode' : 'episodes'}
                    </span>
                )}
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
                <TextInput
                    placeholder="Search episodes or movies…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="max-w-xs"
                    aria-label="Search episodes"
                />
                <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as EpisodeStatus | 'All')}
                    style={selectStyle}
                    aria-label="Filter by status"
                >
                    <option value="All">All Statuses</option>
                    {ALL_STATUSES.map((s) => (
                        <option key={s} value={s}>
                            {s}
                        </option>
                    ))}
                </select>
                <select
                    value={specialFilter}
                    onChange={(e) => setSpecialFilter(e.target.value as SpecialFilter)}
                    style={selectStyle}
                    aria-label="Filter by type"
                >
                    <option value="All">All Types</option>
                    <option value="Episodes">Episodes</option>
                    <option value="Specials">Specials</option>
                </select>
            </div>

            {/* Loading skeletons */}
            {loading && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[...Array(6)].map((_, i) => (
                        <div
                            key={i}
                            className="rounded-lg h-44 animate-pulse"
                            style={{ backgroundColor: '#15151b', border: '1px solid #2a2a33' }}
                        />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!loading && filtered.length === 0 && (
                <div
                    className="flex flex-col items-center justify-center py-24 gap-3 rounded-lg"
                    style={{ border: '1px dashed #2a2a33' }}
                >
                    <span className="text-5xl">🎞</span>
                    <p className="text-sm" style={{ color: '#b8b1a1' }}>
                        No episodes match your current filters.
                    </p>
                    <button
                        className="text-xs underline"
                        style={{ color: '#8b1e2d' }}
                        onClick={() => {
                            setSearch('')
                            setStatusFilter('All')
                            setSpecialFilter('All')
                        }}
                    >
                        Clear filters
                    </button>
                </div>
            )}

            {/* Episode grid */}
            {!loading && filtered.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map((ep) => (
                        <EpisodeCard key={ep.id} episode={ep} />
                    ))}
                </div>
            )}
        </div>
    )
}
