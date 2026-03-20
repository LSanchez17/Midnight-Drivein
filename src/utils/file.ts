function formatBytes(bytes: number | undefined): string {
    if (bytes === undefined) return '—'
    if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`
    if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
    return `${(bytes / 1024).toFixed(0)} KB`
}

export { formatBytes }