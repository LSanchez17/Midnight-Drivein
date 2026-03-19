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

export default function SettingsPage() {
    const { settings, isLoading, reloadSettings } = useSettings()

    const [moviesFolderError, setMoviesFolderError] = useState<string | null>(null)
    const [commentaryFolderError, setCommentaryFolderError] = useState<string | null>(null)
    const [scanToggleError, setScanToggleError] = useState<string | null>(null)
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

    const bothFoldersSet = Boolean(settings?.moviesFolder && settings?.commentaryFolder)

    return (
        <div className="space-y-6 max-w-2xl">
            <h1
                className="text-4xl uppercase tracking-[0.15em]"
                style={{
                    color: '#f3ebd2',
                    fontFamily: 'Impact, "Arial Narrow", sans-serif',
                }}
            >
                Settings
            </h1>

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
                            className="w-4 h-4 accent-[#8b1e2d] cursor-pointer"
                        />
                        <span style={{ color: '#f3ebd2' }}>Scan library on startup</span>
                    </label>
                    <FieldError message={scanToggleError} />
                    <p className="text-xs" style={{ color: '#b8b1a1' }}>
                        Fuzzy-match thresholds and additional scan settings will appear here in a future phase.
                    </p>
                </div>
            </Panel>

            <Panel title="Metadata">
                <div className="space-y-3 text-sm">
                    <div className="flex gap-3">
                        <Button variant="ghost">Import Metadata</Button>
                        <Button variant="ghost">Export Metadata</Button>
                    </div>
                    <p style={{ color: '#b8b1a1' }}>
                        Metadata is stored locally in a SQLite database on your machine. It is never uploaded or
                        shared.
                    </p>
                </div>
            </Panel>

            <Panel title="Appearance">
                <p className="text-sm" style={{ color: '#b8b1a1' }}>
                    Theme options will appear here in a future phase.
                </p>
            </Panel>

            <Panel title="About">
                <div className="space-y-3 text-sm" style={{ color: '#b8b1a1' }}>
                    <p className="leading-relaxed">
                        <strong style={{ color: '#f3ebd2' }}>Midnight Drive-In</strong> is a local-only media
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
