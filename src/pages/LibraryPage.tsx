import { useEffect, useState } from 'react'
import { getEpisodes } from '../api'
import type { Episode, EpisodeStatus } from '../features/episodes/types'
import EpisodeCard from '../features/episodes/components/EpisodeCard'
import TextInput from '../components/ui/TextInput'
import { ACCENT_CREAM, ACCENT_DARK, ACCENT_RED, MUTED_TEXT, PRIMARY_BACKGROUND, SECONDARY_BACKGROUND } from '../utils/colorConstants'
import LoadingSkeleton from '../components/ui/Loading'
import Header from '../components/ui/Header'

const ALL_STATUSES: EpisodeStatus[] = [
    'Ready',
    'Partial Match',
    'Missing Files',
    'Needs Timing Fix',
]

type SpecialFilter = 'All' | 'Episodes' | 'Specials'

const selectStyle: React.CSSProperties = {
    backgroundColor: PRIMARY_BACKGROUND,
    border: `1px solid ${ACCENT_DARK}`,
    color: ACCENT_CREAM,
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
        setLoading(true)
        getEpisodes({ search, status: statusFilter, type: specialFilter }).then((data) => {
            setEpisodes(data)
            setLoading(false)
        })
    }, [search, statusFilter, specialFilter])

    const filtered = episodes

    return (
        <div className="space-y-6 max-w-6xl">
            <div className="flex items-center gap-3">
                <Header as='h1' title='Library' className='text-4xl tracking-[0.15em] uppercase' />
                {!loading && (
                    <span
                        className="text-xs px-2 py-0.5 rounded-full border"
                        style={{ color: MUTED_TEXT, borderColor: ACCENT_DARK, backgroundColor: SECONDARY_BACKGROUND }}
                    >
                        {filtered.length} {filtered.length === 1 ? 'episode' : 'episodes'}
                    </span>
                )}
            </div>
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
            {loading && (
                <LoadingSkeleton itemCount={6} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4" />
            )}
            {!loading && filtered.length === 0 && (
                <div
                    className="flex flex-col items-center justify-center py-24 gap-3 rounded-lg"
                    style={{ border: `1px dashed ${ACCENT_DARK}` }}
                >
                    <span className="text-5xl">🎞</span>
                    <p className="text-sm" style={{ color: MUTED_TEXT }}>
                        No episodes match your current filters.
                    </p>
                    <button
                        className="text-xs underline"
                        style={{ color: ACCENT_RED }}
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
