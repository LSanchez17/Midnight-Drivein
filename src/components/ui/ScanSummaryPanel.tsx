import type { ScanResult } from '../../api/types'
import { ACCENT_ORANGE, ACCENT_PINK, MUTED_TEXT } from '../../utils/colorConstants'
import { formatDate } from '../../utils/timeUtils'
import Row from './Row'

interface ScanSummaryPanelProps {
    result: ScanResult | null
    isScanning: boolean
}

export default function ScanSummaryPanel({ result, isScanning }: ScanSummaryPanelProps) {
    if (isScanning) {
        return (
            <p className="text-sm mt-3" style={{ color: MUTED_TEXT }}>
                Scanning…
            </p>
        )
    }

    if (!result) {
        return (
            <p className="text-sm mt-3" style={{ color: MUTED_TEXT }}>
                No scan has been run yet.
            </p>
        )
    }

    const hasWarnings = result.errors.length > 0
    const hasMissingFolders = result.missingFolders.length > 0

    return (
        <div className="mt-4 space-y-3 text-sm">
            <div className="space-y-1">
                <Row label="Last scan" value={formatDate(result.lastScanAt)} />
                <Row label="Movie files" value={result.movieFileCount} />
                <Row label="Commentary files" value={result.commentaryFileCount} />
            </div>
            <div>
                <p
                    className="text-[10px] uppercase tracking-[0.2em] mb-1"
                    style={{ color: MUTED_TEXT }}
                >
                    Match Results
                </p>
                <div className="space-y-1">
                    <Row
                        label="Matched"
                        value={
                            <span style={{ color: '#4ade80' }}>
                                {result.matchSummary.matched}
                            </span>
                        }
                    />
                    <Row
                        label="Low Confidence"
                        value={
                            <span style={{ color: ACCENT_ORANGE }}>
                                {result.matchSummary.lowConfidence}
                            </span>
                        }
                    />
                    <Row
                        label="Missing"
                        value={
                            <span style={{ color: ACCENT_PINK }}>
                                {result.matchSummary.missing}
                            </span>
                        }
                    />
                </div>
            </div>
            {hasMissingFolders && (
                <div>
                    <p
                        className="text-[10px] uppercase tracking-[0.2em] mb-1"
                        style={{ color: ACCENT_PINK }}
                    >
                        Missing Folders
                    </p>
                    <ul className="space-y-0.5">
                        {result.missingFolders.map((folder) => (
                            <li
                                key={folder}
                                className="text-xs font-mono break-all"
                                style={{ color: ACCENT_PINK }}
                            >
                                {folder}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            {hasWarnings && (
                <details>
                    <summary
                        className="cursor-pointer text-xs select-none"
                        style={{ color: ACCENT_PINK }}
                    >
                        {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-3">
                        {result.errors.map((msg, i) => (
                            <li key={i} className="text-xs break-all" style={{ color: ACCENT_PINK }}>
                                {msg}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    )
}
