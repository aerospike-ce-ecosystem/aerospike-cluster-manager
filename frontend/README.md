# Aerospike Cluster Manager — Frontend

Next.js 16 (App Router) + React 19 + TypeScript frontend for Aerospike database management.

## Tech Stack

- **Framework**: Next.js 16 (App Router)
- **UI**: React 19 + TypeScript
- **Styling**: Tailwind CSS 4 + DaisyUI 5
- **State Management**: Zustand 5
- **Data Tables**: TanStack Table 8
- **Code Editor**: Monaco Editor
- **Charts**: Recharts 3
- **Validation**: Zod 4
- **Testing**: Vitest + Testing Library + Playwright (E2E)

## Development

```bash
npm install
npm run dev          # Start dev server on port 3000
```

Requires the backend running on port 8000. API calls are proxied via Next.js rewrites.

## Scripts

| Command                 | Description          |
| ----------------------- | -------------------- |
| `npm run dev`           | Development server   |
| `npm run build`         | Production build     |
| `npm run lint`          | ESLint check         |
| `npm run lint:fix`      | ESLint autofix       |
| `npm run format`        | Prettier format      |
| `npm run type-check`    | TypeScript check     |
| `npm run test`          | Vitest unit tests    |
| `npm run test:e2e`      | Playwright E2E tests |
| `npm run test:coverage` | Coverage report      |

## Project Structure

```
src/
├── app/            # Page routing (App Router)
├── components/     # UI components
│   ├── ui/         # Radix-based primitives (shadcn/ui)
│   ├── common/     # Reusable components
│   ├── layout/     # App shell (header, sidebar, tab-bar)
│   ├── browser/    # Record browser components
│   ├── connection/ # Connection management
│   ├── admin/      # User/role management
│   └── k8s/        # K8s cluster management (wizard, pod table, dialogs, events, config drift)
├── stores/         # Zustand state management
├── hooks/          # Custom React hooks
└── lib/
    ├── api/        # Type-safe API client
    ├── validations/# Zod schemas
    ├── constants.ts
    ├── formatters.ts
    └── utils.ts
```

## Environment Variables

| Variable      | Default                 | Description               |
| ------------- | ----------------------- | ------------------------- |
| `BACKEND_URL` | `http://localhost:8000` | Backend API URL for proxy |
