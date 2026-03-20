import { ACCENT_CREAM, ACCENT_DARK, ACCENT_RED, MUTED_TEXT } from '../../../utils/colorConstants'
import type { PlaybackCut } from '../types'

export default function SlotTimeline({ cuts }: { cuts: PlaybackCut[] }) {
    return (
        <div className="space-y-2 mb-4">
            <p className="text-[10px] uppercase tracking-[0.15em]" style={{ color: MUTED_TEXT }}>
                Timeline
            </p>
            <div className="flex gap-1 h-8 rounded overflow-hidden">
                {cuts.map((cut, i) => (
                    <div
                        key={i}
                        className="flex-1 flex items-center justify-center text-[9px] uppercase tracking-widest"
                        style={{
                            backgroundColor: i % 2 === 0 ? 'rgba(139,30,45,0.25)' : ACCENT_DARK,
                            color: i % 2 === 0 ? ACCENT_CREAM : MUTED_TEXT,
                            border: i % 2 === 0 ? `1px solid ${ACCENT_RED}` : `1px solid ${ACCENT_DARK}`,
                        }}
                    >
                        {cut.sourceType === 'commentary' ? 'Seg' : 'Mov'} {cut.sortOrder}
                    </div>
                ))}
            </div>
            <p className="text-[10px]" style={{ color: '#ffffff' }}>
                {/* TODO: playback order should eventually come from metadata */}
                Playback order: Seg 1 → Mov 2 → Seg 3 → Mov 4 → Seg 5 → Mov 6
            </p>
        </div>
    )
}
