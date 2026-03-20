import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'
import { ACCENT_CREAM, ACCENT_DARK, ACCENT_PINK, ACCENT_RED, MUTED_TEXT } from '../../utils/colorConstants'

type Variant = 'primary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
}

export default function Button({ variant = 'primary', className, children, ...props }: Props) {
    const base =
        'inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-sm transition-all ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
        'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'

    const styles: Record<Variant, React.CSSProperties> = {
        primary: { backgroundColor: ACCENT_RED, color: ACCENT_CREAM, border: `1px solid ${ACCENT_RED}` },
        ghost: { backgroundColor: 'transparent', color: MUTED_TEXT, border: `1px solid ${ACCENT_DARK}` },
        danger: { backgroundColor: 'transparent', color: ACCENT_PINK, border: '1px solid #7f1d1d' },
    }

    return (
        <button
            className={clsx(base, className)}
            style={styles[variant]}
            onMouseEnter={(e) => {
                if (variant === 'ghost') {
                    ; (e.currentTarget as HTMLElement).style.color = ACCENT_CREAM
                        ; (e.currentTarget as HTMLElement).style.borderColor = ACCENT_CREAM
                }
                if (variant === 'primary') {
                    ; (e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)'
                }
            }}
            onMouseLeave={(e) => {
                ; (e.currentTarget as HTMLElement).style.filter = ''
                if (variant === 'ghost') {
                    ; (e.currentTarget as HTMLElement).style.color = MUTED_TEXT
                        ; (e.currentTarget as HTMLElement).style.borderColor = ACCENT_DARK
                }
            }}
            {...props}
        >
            {children}
        </button>
    )
}
