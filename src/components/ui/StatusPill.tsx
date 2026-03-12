import { clsx } from 'clsx'
import type { EpisodeStatus } from '../../features/episodes/types'

interface StatusConfig {
    label: string
    bg: string
    text: string
    border: string
}

const STATUS_MAP: Record<EpisodeStatus, StatusConfig> = {
    Ready: {
        label: '● Ready',
        bg: 'rgba(20,83,45,0.4)',
        text: '#86efac',
        border: '#166534',
    },
    'Partial Match': {
        label: '◐ Partial',
        bg: 'rgba(113,63,18,0.4)',
        text: '#fde047',
        border: '#854d0e',
    },
    'Missing Files': {
        label: '○ Missing',
        bg: 'rgba(127,29,29,0.4)',
        text: '#fca5a5',
        border: '#7f1d1d',
    },
    'Needs Timing Fix': {
        label: '⚠ Timing',
        bg: 'rgba(124,45,18,0.4)',
        text: '#fdba74',
        border: '#7c2d12',
    },
}

interface Props {
    status: EpisodeStatus
    className?: string
}

export default function StatusPill({ status, className }: Props) {
    const cfg = STATUS_MAP[status]
    return (
        <span
            className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs border whitespace-nowrap', className)}
            style={{ backgroundColor: cfg.bg, color: cfg.text, borderColor: cfg.border }}
            aria-label={`Status: ${status}`}
        >
            {cfg.label}
        </span>
    )
}
