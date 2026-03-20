import { MUTED_TEXT } from "../../utils/colorConstants"

interface LabelProps {
    children: React.ReactNode
}

export default function Label({ children }: LabelProps) {
    return (
        <p
            className="text-[10px] uppercase tracking-[0.2em] mb-1"
            style={{ color: MUTED_TEXT }}
        >
            {children}
        </p>
    )
}
