import StatusPill from "../../../components/ui/StatusPill"
import { ACCENT_CREAM, MUTED_TEXT } from "../../../utils/colorConstants"
import type { Episode } from "../types"

interface EpisodeMetaDataProps {
    episode: Episode
}

const EpisodeMetaData = ({ episode }: EpisodeMetaDataProps) => {
    return (
        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
            <dt style={{ color: MUTED_TEXT }}>Type</dt>
            <dd style={{ color: ACCENT_CREAM }}>{episode.isSpecial ? 'Special' : 'Episode'}</dd>
            {!episode.isSpecial && (
                <>
                    <dt style={{ color: MUTED_TEXT }}>Season / Episode</dt>
                    <dd style={{ color: ACCENT_CREAM }}>
                        S{episode.season} E{episode.episode}
                    </dd>
                </>
            )}
            <dt style={{ color: MUTED_TEXT }}>Air Date</dt>
            <dd style={{ color: ACCENT_CREAM }}>{episode.airDate ?? '—'}</dd>
            <dt style={{ color: MUTED_TEXT }}>Status</dt>
            <dd>
                <StatusPill status={episode.status} />
            </dd>
        </dl>
    )
}

export default EpisodeMetaData