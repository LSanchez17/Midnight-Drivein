import type { ScanResult } from '../../api/types'
import { formatDate } from '../../utils/Time'
import Row from './Row'

interface ScanSummaryPanelProps {
    result: ScanResult | null
    isScanning: boolean
}

export default function ScanSummaryPanel({ result, isScanning }: ScanSummaryPanelProps) {
    if (isScanning) {
        return (
            <p className="text-sm mt-3" style={{ color: '#b8b1a1' }}>
                Scanning…
            </p>
        )
    }

    if (!result) {
        return (
            <p className="text-sm mt-3" style={{ color: '#b8b1a1' }}>
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
                    style={{ color: '#b8b1a1' }}
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
                            <span style={{ color: '#fdba74' }}>
                                {result.matchSummary.lowConfidence}
                            </span>
                        }
                    />
                    <Row
                        label="Missing"
                        value={
                            <span style={{ color: '#f87171' }}>
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
                        style={{ color: '#f87171' }}
                    >
                        Missing Folders
                    </p>
                    <ul className="space-y-0.5">
                        {result.missingFolders.map((folder) => (
                            <li
                                key={folder}
                                className="text-xs font-mono break-all"
                                style={{ color: '#f87171' }}
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
                        style={{ color: '#f87171' }}
                    >
                        {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-3">
                        {result.errors.map((msg, i) => (
                            <li key={i} className="text-xs break-all" style={{ color: '#f87171' }}>
                                {msg}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    )
}
