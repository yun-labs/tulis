# tulis

tulis is a Firebase-backed note-taking app with real-time sync, tags, slash commands, and a clean desktop/mobile UI.

## What The App Does

- Email/password and Google auth.
- Real-time notes with Firestore.
- Auto-create note guard:
  - New users always land in an editable note.
  - Deleting the last note auto-creates a fresh blank note.
  - Invalid/non-owned note routes recover to an accessible note.
- Sidebar workflows:
  - `All` and `Pinned` tabs
  - Full-text search (title + content + tags)
  - Tag filtering
- Editor workflows:
  - TipTap rich-text editor
  - Slash command menu (`/`)
  - Inline tag chips and date chips
  - Debounced autosave + sync status
- PWA support (manifest, service worker, install banner, app icons).
- Theme support (light/dark).

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- React 19 + TypeScript
- Tailwind CSS v4
- Firebase Auth + Cloud Firestore
- TipTap editor (`@tiptap/react`, StarterKit, suggestion plugins)

## Project Structure

```text
src/
  app/
    login/page.tsx              # Auth UI (sign in/sign up/reset)
    notes/page.tsx              # Entry route -> redirects to concrete note
    notes/[id]/page.tsx         # Main note experience (editor + header + drawer)
    page.tsx                    # Root entry route -> auth-aware redirect
    layout.tsx                  # Global metadata, fonts, PWA provider
    manifest.ts                 # Web app manifest
    globals.css                 # Design tokens + shared utilities
  components/
    notes/NotesDrawer.tsx       # Sidebar, list/search/filter/create/delete
    editor/CommandMenu.tsx      # Slash command menu UI
    editor/DatePicker.tsx       # Date picker modal
    pwa/*                       # Install banner + provider
    ThemeToggle.tsx             # Theme switcher
  hooks/
    useAuthGuard.ts             # Auth guard + user registration sync
    usePwaInstall.ts            # PWA prompt state hook
  lib/
    firebase.ts                 # Firebase init
    firestorePaths.ts           # App-scoped Firestore paths
    notes.ts                    # Tag normalization + search parsing
    notesLifecycle.ts           # Ensure-user-note flows and recovery
    notesQuery.ts               # Latest note lookup helpers
    userRegistration.ts         # User directory app registration
    editor/*                    # Slash command/suggestion wiring
  editor/
    TagChip.ts                  # Inline tag chip node/plugin
    DateChip.ts                 # Inline date chip node/plugin
```

## Firestore Layout

App data is namespaced under:

```text
/tulis/data/notes/{noteId}
```

User directory (cross-app registration):

```text
/users/{uid}
  apps:
    tulis: true
```

### Note Document Shape

Core fields used by the app:

- `ownerUid: string`
- `title: string`
- `content: string` (plain text for search preview)
- `content_json: JSON` (TipTap document)
- `tags: string[]` (normalized, lowercase, max 10)
- `pinned: boolean`
- `createdAt`, `updatedAt` (timestamps)
- Compatibility fields still present: `created_at`, `updated_at`

## Sync Model

- Notes list and current note use Firestore `onSnapshot`.
- Editor writes are debounced.
- Remote content is applied unless there are pending local unsaved edits.
- Conflict model is effectively last-write-wins at document level.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Configure environment variables in `.env.local`:

```bash
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=...
```

3. Run dev server:

```bash
npm run dev
```

4. Open:

```text
http://localhost:3000
```

## Scripts

- `npm run dev` - start dev server
- `npm run lint` - run ESLint
- `npm run build` - production build
- `npm run start` - start production server

## Notes

- Service worker is enabled in production mode by `PwaProvider`.
- If PWA icons seem stale on device/browser, hard refresh and reinstall the app icon.
