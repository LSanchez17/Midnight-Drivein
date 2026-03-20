import Sidebar from './Sidebar'
import AppRouter from '../router'
import { ACCENT_CREAM, PRIMARY_BACKGROUND } from '../../utils/colorConstants'

export default function AppShell() {
    return (
        <div
            className="flex min-h-screen"
            style={{ backgroundColor: PRIMARY_BACKGROUND, color: ACCENT_CREAM }}
        >
            <Sidebar />
            <main className="flex-1 p-8 overflow-y-auto min-h-screen">
                <AppRouter />
            </main>
        </div>
    )
}
