import { useNavigate } from "react-router-dom"
import { ACCENT_CREAM, MUTED_TEXT } from "../../utils/colorConstants"

interface GoBackProps {
    url: string
    location: string
}

const GoBack = ({ url, location }: GoBackProps) => {
    const navigate = useNavigate()


    return (
        <button
            className="text-xs mb-3 block transition-colors cursor-pointer"
            style={{ color: MUTED_TEXT }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = ACCENT_CREAM)}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = MUTED_TEXT)}
            onClick={() => navigate(url)}
        >
            ← Back to {location}
        </button>
    )
}

export default GoBack