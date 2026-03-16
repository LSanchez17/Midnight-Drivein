import { useNavigate } from 'react-router-dom'
import Card from '../../../components/ui/Card'
import StatusPill from '../../../components/ui/StatusPill'
import Button from '../../../components/ui/Button'
import type { Episode } from '../types'

export default function EpisodeCard({ episode }: { episode: Episode }) {
    const navigate = useNavigate()

    const label = episode.isSpecial
        ? '★ Special'
        : `S${String(episode.season).padStart(2, '0')} E${String(episode.episode).padStart(2, '0')}`

    return (
        <Card
            className="flex flex-col gap-3 cursor-pointer group"
            style={{ transition: 'border-color 0.15s' }}
            onMouseEnter={(e) => {
                ; (e.currentTarget as HTMLElement).style.borderColor = '#8b1e2d'
            }}
            onMouseLeave={(e) => {
                ; (e.currentTarget as HTMLElement).style.borderColor = '#2a2a33'
            }}
        >
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p
                        className="text-[10px] uppercase tracking-[0.2em] mb-0.5"
                        style={{ color: '#b8b1a1' }}
                    >
                        {label}
                    </p>
                    <h3
                        className="text-base font-semibold leading-tight truncate transition-colors"
                        style={{
                            color: '#e90c0c',
                            fontFamily: '"Arial Narrow", sans-serif',
                            letterSpacing: '0.05em',
                        }}
                    >
                        {episode.title}
                    </h3>
                </div>
                <StatusPill status={episode.status} />
            </div>

            <div className="text-xs space-y-0.5" style={{ color: '#dfa51d' }}>
                {episode.slots.length === 0 ? (
                    <p>🎬 Unknown Film</p>
                ) : (
                    episode.slots.map((s) => (
                        <p key={s.id}>
                            🎬{' '}
                            {s.movieTitle ??
                                s.movieMatch.displayName ??
                                s.movieMatch.filename ??
                                'Unknown Film'}
                        </p>
                    ))
                )}
            </div>

            {episode.airDate && (
                <p className="text-[10px]" style={{ color: '#dd57f8' }}>
                    {episode.airDate}
                </p>
            )}

            <Button
                variant="ghost"
                className="mt-auto w-full text-xs"
                onClick={() => navigate(`/episode/${episode.id}`)}
            >
                Open →
            </Button>
        </Card>
    )
}
