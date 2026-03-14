export type ErrorCode =
    | 'NOT_FOUND'
    | 'INVALID_INPUT'
    | 'IO_ERROR'
    | 'DB_ERROR'
    | 'SCAN_IN_PROGRESS'
    | 'UNKNOWN'

export class ApiError extends Error {
    readonly code: ErrorCode

    constructor(code: ErrorCode, message: string) {
        super(message)
        this.name = 'ApiError'
        this.code = code
    }
}
