import { useState, useEffect } from 'react'
import Panel from '../components/ui/Panel'
import Button from '../components/ui/Button'
import ScanSummaryPanel from '../components/ui/ScanSummaryPanel'
import { useSettings } from '../context/SettingsContext'
import { saveSettings, selectLibraryRoot, scanLibrary, getScanSummary } from '../api'
import { ApiError } from '../api/errors'
import type { ScanResult } from '../api/types'
import FieldError from '../components/ui/FieldError'
import FolderRow from '../components/ui/FolderRow'
import { ACCENT_CREAM, ACCENT_RED, MUTED_TEXT } from '../utils/colorConstants'
import Header from '../components/ui/Header'

export default function SettingsPage() {
    const { settings, isLoading, reloadSettings } = useSettings()

    const [moviesFolderError, setMoviesFolderError] = useState<string | null>(null)
    const [commentaryFolderError, setCommentaryFolderError] = useState<string | null>(null)
    const [scanToggleError, setScanToggleError] = useState<string | null>(null)
    const [autoAdvanceError, setAutoAdvanceError] = useState<string | null>(null)
    const [scanError, setScanError] = useState<string | null>(null)
    const [lastScan, setLastScan] = useState<ScanResult | null>(null)
    const [isScanning, setIsScanning] = useState(false)

    useEffect(() => {
        getScanSummary()
            .then(setLastScan)
            .catch(() => {
                // empty state on failure  
            })
    }, [])

    async function handleChooseFolder(field: 'moviesFolder' | 'commentaryFolder') {
        const setError = field === 'moviesFolder' ? setMoviesFolderError : setCommentaryFolderError
        setError(null)
        try {
            const path = await selectLibraryRoot()

            // cancelled dialog is not an error, but we shouldn't try to save null to settings
            if (path === null) return

            await saveSettings({ [field]: path })
            reloadSettings()
        } catch (e) {
            setError(e instanceof ApiError ? e.message : String(e))
        }
    }

    async function handleScan() {
        setScanError(null)
        setIsScanning(true)
        try {
            const result = await scanLibrary()
            setLastScan(result)
        } catch (e) {
            setScanError(e instanceof ApiError ? e.message : String(e))
        } finally {
            setIsScanning(false)
        }
    }

    async function handleScanOnStartupChange(checked: boolean) {
        setScanToggleError(null)
        try {
            await saveSettings({ scanOnStartup: checked })
            reloadSettings()
        } catch (e) {
            setScanToggleError(e instanceof ApiError ? e.message : String(e))
        }
    }

    async function handleAutoAdvanceChange(checked: boolean) {
        setAutoAdvanceError(null)

        try {
            await saveSettings({ autoAdvanceSlots: checked })
            reloadSettings()
        } catch (e) {
            setAutoAdvanceError(e instanceof ApiError ? e.message : String(e))
        }
    }

    const bothFoldersSet = Boolean(settings?.moviesFolder && settings?.commentaryFolder)

    return (
        <div className="space-y-6 max-w-2xl">
            <Header title="Settings" as="h1" className="text-4xl uppercase tracking-[0.15em]" />
            <Panel title="Library Root">
                <div className="space-y-4 text-sm">
                    <FolderRow
                        label="Movies Folder"
                        value={settings?.moviesFolder}
                        placeholder="e.g. /Users/you/Movies"
                        ariaLabel="Movies folder path"
                        disabled={isLoading}
                        onChoose={() => handleChooseFolder('moviesFolder')}
                        error={moviesFolderError}
                    />
                    <FolderRow
                        label="Commentary Folder"
                        value={settings?.commentaryFolder}
                        placeholder="e.g. /Users/you/Commentary"
                        ariaLabel="Commentary folder path"
                        disabled={isLoading}
                        onChoose={() => handleChooseFolder('commentaryFolder')}
                        error={commentaryFolderError}
                    />
                    <Button
                        variant="primary"
                        disabled={isScanning || !bothFoldersSet}
                        title={bothFoldersSet ? undefined : 'Configure both folders first'}
                        onClick={handleScan}
                    >
                        {isScanning ? 'Scanning…' : 'Rescan Library'}
                    </Button>
                    <FieldError message={scanError} />
                    <ScanSummaryPanel result={lastScan} isScanning={isScanning} />
                </div>
            </Panel>

            <Panel title="Scan Preferences">
                <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings?.scanOnStartup ?? false}
                            disabled={isLoading}
                            onChange={(e) => handleScanOnStartupChange(e.target.checked)}
                            className={`w-4 h-4 accent-[${ACCENT_RED}] cursor-pointer`}
                        />
                        <span style={{ color: ACCENT_CREAM }}>Scan library on startup</span>
                    </label>
                    <FieldError message={scanToggleError} />
                    <p className="text-xs" style={{ color: MUTED_TEXT }}>
                        Fuzzy-match thresholds and additional scan settings will appear here in a future phase.
                    </p>
                </div>
            </Panel>

            <Panel title="Playback">
                <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings?.autoAdvanceSlots ?? true}
                            disabled={isLoading}
                            onChange={(e) => handleAutoAdvanceChange(e.target.checked)}
                            className={`w-4 h-4 accent-[${ACCENT_RED}] cursor-pointer`}
                        />
                        <span style={{ color: ACCENT_CREAM }}>Automatically advance to the next movie when playback ends</span>
                    </label>
                    <FieldError message={autoAdvanceError} />
                </div>
            </Panel>

            <Panel title="Metadata">
                <div className="space-y-3 text-sm">
                    <div className="flex gap-3">
                        <Button variant="ghost">Import Metadata</Button>
                        <Button variant="ghost">Export Metadata</Button>
                    </div>
                    <p style={{ color: MUTED_TEXT }}>
                        Metadata is stored locally in a SQLite database on your machine. It is never uploaded or
                        shared.
                    </p>
                </div>
            </Panel>

            <Panel title="Appearance">
                <p className="text-sm" style={{ color: MUTED_TEXT }}>
                    Theme options will appear here in a future phase.
                </p>
            </Panel>

            <Panel title="About">
                <div className="space-y-3 text-sm" style={{ color: MUTED_TEXT }}>
                    <p className="leading-relaxed">
                        <strong style={{ color: ACCENT_CREAM }}>Midnight Drive-In</strong> is a local-only media
                        organizer. It does not host, stream, download, or distribute any media. All files remain
                        on your machine at all times.
                    </p>
                    <p className="leading-relaxed">
                        This application is a personal tool for organizing files you already own. Use it
                        responsibly and in accordance with applicable copyright law.
                    </p>
                </div>
            </Panel>
        </div>
    )
}
