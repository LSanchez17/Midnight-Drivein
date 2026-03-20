import { describe, it, expect } from 'vitest'
import { formatDate, msToHMS } from '../timeUtils'

describe('msToHMS', () => {
    it('formats zero milliseconds as 00:00:00', () => {
        expect(msToHMS(0)).toBe('00:00:00')
    })

    it('formats minutes and seconds correctly', () => {
        expect(msToHMS(61_000)).toBe('00:01:01')
    })

    it('formats hours, minutes and seconds correctly', () => {
        expect(msToHMS(3_661_000)).toBe('01:01:01')
    })

    it('pads hours to two digits', () => {
        expect(msToHMS(12 * 3600 * 1000)).toBe('12:00:00')
    })
})

describe('formatDate', () => {
    it('returns a human-friendly string containing the year for valid ISO input', () => {
        const out = formatDate('2020-01-02T03:04:05Z')
        expect(out).toEqual(expect.stringContaining('2020'))
    })

    it('returns the original string for invalid dates', () => {
        const bad = 'not-a-date'
        expect(formatDate(bad)).toBe(bad)
    })
})
