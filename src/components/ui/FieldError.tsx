interface FieldErrorProps {
    message: string | null
}

export default function FieldError({ message }: FieldErrorProps) {
    if (!message) return null

    return (
        <p className="text-xs mt-1" style={{ color: '#f87171' }}>
            {message}
        </p>
    )
}
