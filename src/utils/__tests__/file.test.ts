import { describe, it, expect } from 'vitest'
import { formatBytes } from '../file'

describe('formatBytes', () => {
    it('returns em dash for undefined', () => {
        expect(formatBytes(undefined)).toBe('—')
    })

    it('formats bytes under 1 MB as KB (rounded)', () => {
        expect(formatBytes(512)).toBe('1 KB')
        expect(formatBytes(1024)).toBe('1 KB')
        expect(formatBytes(2048)).toBe('2 KB')
    })

    it('formats megabytes with one decimal', () => {
        expect(formatBytes(1_048_576)).toBe('1.0 MB')
        expect(formatBytes(1_500_000)).toBe('1.4 MB')
    })

    it('formats gigabytes with one decimal', () => {
        expect(formatBytes(1_073_741_824)).toBe('1.0 GB')
        expect(formatBytes(1_610_612_736)).toBe('1.5 GB')
    })
})
