import Sidebar from './Sidebar'
import AppRouter from '../router'

export default function AppShell() {
    return (
        <div
            className="flex min-h-screen"
            style={{ backgroundColor: '#0b0b0f', color: '#f3ebd2' }}
        >
            <Sidebar />
            <main className="flex-1 p-8 overflow-y-auto min-h-screen">
                <AppRouter />
            </main>
        </div>
    )
}
