midnight-drivein/
├─ docs/
│  └─ specs/
│     ├─ 0001-product-foundation.md
│     └─ 0002-ui-shell.md
│
├─ public/
│  └─ logo.svg
│
├─ src/
│  ├─ app/
│  │  ├─ router.tsx
│  │  ├─ App.tsx
│  │  └─ layout/
│  │     ├─ AppShell.tsx
│  │     └─ Sidebar.tsx
│  │
│  ├─ components/
│  │  └─ ui/
│  │     ├─ Button.tsx
│  │     ├─ Card.tsx
│  │     ├─ StatusPill.tsx
│  │     ├─ Panel.tsx
│  │     └─ TextInput.tsx
│  │
│  ├─ features/
│  │  ├─ episodes/
│  │  │  ├─ types.ts
│  │  │  ├─ mocks.ts
│  │  │  └─ components/
│  │  │     └─ EpisodeCard.tsx
│  │  │
│  │  ├─ playback/
│  │  │  ├─ types.ts
│  │  │  └─ components/
│  │  │     ├─ FakePlayer.tsx
│  │  │     └─ TimelineView.tsx
│  │  │
│  │  └─ settings/
│  │     └─ components/
│  │        └─ SettingsGroup.tsx
│  │
│  ├─ pages/
│  │  ├─ LibraryPage.tsx
│  │  ├─ EpisodeDetailPage.tsx
│  │  └─ SettingsPage.tsx
│  │
│  ├─ styles/
│  │  ├─ globals.css
│  │  └─ tokens.css
│  │
│  ├─ assets/
│  │  └─ logo.svg
│  │
│  ├─ main.tsx
│  └─ vite-env.d.ts
│
├─ src-tauri/
│  ├─ src/
│  │  └─ main.rs
│  ├─ icons/
│  ├─ Cargo.toml
│  └─ tauri.conf.json
│
├─ package.json
├─ tsconfig.json
├─ vite.config.ts
└─ README.md