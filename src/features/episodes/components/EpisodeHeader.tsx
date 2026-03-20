import Header from "../../../components/ui/Header"
import StatusPill from "../../../components/ui/StatusPill"
import { MUTED_TEXT } from "../../../utils/colorConstants"
import type { Episode } from "../types"

interface EpisodeHeaderProps {
    episode: Episode
}

const EpisodeHeader = ({ episode }: EpisodeHeaderProps) => {
    const episodeLabel = episode.isSpecial
        ? '★ Special'
        : `Season ${episode.season} · Episode ${episode.episode}`

    return (
        <div className="flex items-start justify-between gap-4">
            <div>
                <p
                    className="text-[10px] uppercase tracking-[0.2em] mb-1"
                    style={{ color: MUTED_TEXT }}
                >
                    {episodeLabel}
                    {episode.airDate && ` · ${episode.airDate}`}
                </p>
                <Header as='h1' title={episode.title} className="text-3xl uppercase tracking-[0.1em] leading-tight" />
                <p className="text-sm mt-2" style={{ color: MUTED_TEXT }}>
                    {episode.description}
                </p>
            </div>
            <StatusPill status={episode.status} className="mt-1 shrink-0" />
        </div>
    )
}

export default EpisodeHeader