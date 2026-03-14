import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import type { ReactNode } from 'react'
import { getSettings } from '../api'
import type { AppSettings } from '../api/types'
import { ApiError } from '../api/errors'

interface SettingsContextValue {
    settings: AppSettings | null
    isLoading: boolean
    error: ApiError | null
    reloadSettings: () => void
}

const SettingsContext = createContext<SettingsContextValue | null>(null)

export function SettingsProvider({ children }: { children: ReactNode }) {
    const [settings, setSettings] = useState<AppSettings | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState<ApiError | null>(null)

    const load = useCallback(async () => {
        setIsLoading(true)
        setError(null)
        try {
            const userSettings = await getSettings()
            setSettings(userSettings)
        } catch (err) {
            setError(err instanceof ApiError ? err : new ApiError('UNKNOWN', String(err)))
        } finally {
            setIsLoading(false)
        }
    }, [])

    useEffect(() => {
        load()
    }, [load])

    return (
        <SettingsContext.Provider value={{ settings, isLoading, error, reloadSettings: load }}>
            {children}
        </SettingsContext.Provider>
    )
}

export function useSettings(): SettingsContextValue {
    const ctx = useContext(SettingsContext)
    if (ctx === null) {
        throw new Error('useSettings must be used inside <SettingsProvider>')
    }
    return ctx
}
