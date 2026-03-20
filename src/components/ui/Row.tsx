import { ACCENT_CREAM, MUTED_TEXT } from "../../utils/colorConstants"

interface RowProps {
    label: string
    value: React.ReactNode
}

export default function Row({ label, value }: RowProps) {
    return (
        <div className="flex justify-between items-baseline gap-4">
            <span style={{ color: MUTED_TEXT }}>{label}</span>
            <span style={{ color: ACCENT_CREAM }} className="tabular-nums">
                {value}
            </span>
        </div>
    )
}
