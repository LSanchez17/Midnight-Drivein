import { clsx } from 'clsx'
import type { InputHTMLAttributes } from 'react'
import { ACCENT_CREAM, ACCENT_DARK, ACCENT_RED, PRIMARY_BACKGROUND } from '../../utils/colorConstants'

export default function TextInput({ className, style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            className={clsx(
                'w-full rounded px-3 py-2 text-sm transition-colors outline-none',
                className,
            )}
            style={{
                backgroundColor: PRIMARY_BACKGROUND,
                border: `1px solid ${ACCENT_DARK}`,
                color: ACCENT_CREAM,
                ...style,
            }}
            onFocus={(e) => {
                e.currentTarget.style.borderColor = ACCENT_RED
            }}
            onBlur={(e) => {
                e.currentTarget.style.borderColor = ACCENT_DARK
            }}
            {...props}
        />
    )
}
