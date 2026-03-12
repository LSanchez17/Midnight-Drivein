import { Routes, Route, Navigate } from 'react-router-dom'
import LibraryPage from '../pages/LibraryPage'
import EpisodeDetailPage from '../pages/EpisodeDetailPage'
import SettingsPage from '../pages/SettingsPage'

export default function AppRouter() {
    return (
        <Routes>
            <Route path="/" element={<Navigate to="/library" replace />} />
            <Route path="/library" element={<LibraryPage />} />
            <Route path="/episode/:episodeId" element={<EpisodeDetailPage />} />
            <Route path="/settings" element={<SettingsPage />} />
        </Routes>
    )
}
