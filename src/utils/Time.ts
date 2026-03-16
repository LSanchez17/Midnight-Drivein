function msToHMS(ms: number | undefined): string {
    // If there are no milliseconds, assume its the end of the file. Display as 00:00:00 to avoid confusion with an invalid timestamp.
    if (ms === undefined) return '00:00:00'

    const s = Math.floor(ms / 1000)
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

export { msToHMS }