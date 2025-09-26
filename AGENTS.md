# AGENTS.md

## Project Mission (Read First)
- Build a secure, role-based medical imaging report platform (ChickadeeX) where doctors can:
  - Search DICOM studies from PACS/DICOMweb with advanced filtering and partial matching,
  - Generate and version reports with AI assistance (LLM + optional RAG),
  - Finalize and export reports with comprehensive auditability and compliance features.
- Administrators manage users, system settings, LLM configurations with modern UI/UX.

## Current Status (What's Built & Working)
- **Authentication**: Dual auth (Keycloak SSO + local password). Users linked by `keycloak_user_id` (email changes don't duplicate users).
- **Admin Panel**: Modern, clean UI with enhanced features:
  - **LLM Management**: Full CRUD, enable/disable, health testing, statistics display (total/enabled/disabled counts)
  - **User Management**: Modern card-based layout, popup password reset, role-based permissions, active/inactive user tracking
  - **System Settings**: Clean forms for `system_name`, `max_concurrent_tasks`, `backup_frequency` 
  - **PACS Configuration**: Enhanced UI with auth types (none/basic/token), connection settings
  - **Dashboard Statistics**: Real-time metrics with proper icons and breakdowns
- **Doctor Features**:
  - **Studies Search**: Enhanced DICOMweb integration with partial patient name matching (*wildcards*), advanced filters (Study UID, date ranges, modalities), clean modern UI
  - **Reports Management**: Comprehensive search/filter (patient name/ID, modality, status, date ranges), modern card layout, draft/finalized status tracking
  - **BlueLight Viewer**: Embedded viewer with synchronized report editor, AI preview generation, LLM badge surfacing the configured model name, and stable action layout when the editor is collapsed
- **UI/UX**: Consistent modern design with Tailwind CSS, Lucide React icons, professional color schemes, smooth transitions; BlueLight editor maintains button alignment when toggling compact mode
- **Backend**: Robust API with proper validation, error handling, partial matching support for searches; AI preview endpoint (`POST /api/reports/:id/generate-preview`) returns content without persisting and must be invoked via authenticated clients

## Near‑Term Roadmap
- **Report Creation Flow**: Polish AI-assisted drafting (prompt templating, preview-to-save workflow)
- **Series/Instances Navigation**: Drill-down views for DICOM study details
- **BlueLight Viewer Integration**: Enhanced DICOM viewer capabilities  
- **API Documentation**: Publish Swagger/OpenAPI docs for all routes
- **Testing Suite**: Backend tests (Jest + Supertest) and DICOM proxy smoke tests
- **Performance**: Add pagination improvements and caching optimizations

## Setup Commands
- **Clone repo**: `git clone <repo-url> && cd chickadeeX`
- **Environment setup**: `cp .env.example .env` (adjust secrets/URLs)
- **Docker (recommended)**: `docker-compose up -d --build` (includes all services)
- **Backend development**:
  ```bash
  cd backend && npm install && npm run dev
  ```
- **Frontend development**:
  ```bash
  cd frontend && npm install && npm start
  ```
- **Testing**:
  ```bash
  cd backend && npm test    # Backend tests
  cd frontend && npm test   # Frontend tests
  ```
- **Code quality**:
  ```bash
  cd backend && npm run lint
  ```

## Service URLs (default)
- **Frontend (Production)**: `http://localhost` (via Nginx)
- **Frontend (Development)**: `http://localhost:3001` (React dev server)
- **Backend API**: `http://localhost:3000/api` (direct) or `http://localhost/api` (via proxy)
- **Keycloak SSO**: `http://localhost:8080` (admin console)
- **BlueLight Viewer**: `http://localhost/bluelight/html/start.html`

## Code Style & Standards
- **Language**: Modern JavaScript (Node.js 18+, React 18)
- **Formatting**: 2-space indentation, semicolons required, single quotes preferred
- **Async**: Prefer async/await over promises, early returns for error handling
- **UI Components**: Tailwind CSS for styling, Lucide React for icons
- **Validation**: Joi schemas for backend request validation
- **Logging**: Use centralized logger (`backend/src/utils/logger.js`) instead of `console.log`
- **Icons**: Use Lucide React icons instead of emojis for professional UI
- **Color Schemes**: Blue primary (#3B82F6), green success, yellow warning, red error
- **Responsive**: Mobile-first design with Tailwind breakpoints

## Project Conventions
- Backend structure:
  - Routes: `backend/src/routes/*` (mount in `server.js` under `/api/*`)
  - Middleware: `backend/src/middleware/*` (auth, validation, errors)
  - Services: `backend/src/services/*` (LLM, external calls)
  - DB: `backend/src/database/*` (PostgreSQL/Redis connectors)
  - Auditing: `backend/src/utils/audit.js`
- RBAC:
  - Protect routes with `authenticateToken`, `requireRole`, or `requireAnyRole`
- Validation:
  - Define/update Joi schemas in `backend/src/middleware/validation.js`
- Database:
  - Development uses `backend/migrations/init.sql` as the single source of truth (no incremental migrations)
  - When changing schema for dev, update `init.sql` and keep indexes/triggers consistent
- DICOM proxy:
  - Add endpoints under `/api/dicom/*` and prefer proxying to avoid CORS in the browser
- LLM:
  - Model configs via `/api/admin/llm-configs`; keep `temperature`, `max_tokens`, and `top_p` within validated ranges
  - Frontend AI preview should call `generateReportPreview` in `frontend/src/services/reportService.js` to reuse the centralized axios client/base URL

## Branching & Commits
- Small, focused commits with descriptive messages
- Reference the area changed in the subject (e.g., `studies: add advanced search modal`)
- Ensure backend lint/tests pass before opening PRs

## Adding/Changing APIs
- Keep route naming consistent under `/api/*`
- Add validation + auth first, then route handler and service
- Update frontend services in `frontend/src/services/*`
- Document notable changes in this file or `README.md`

## Testing Notes
- Prefer Supertest for backend route tests (Jest configured in backend)
- Keep tests deterministic; mock network calls where needed
- For DICOM integrations, prefer hitting the backend proxy in tests

## UI/UX Guidelines for Agents
- **Modern & Clean**: Use professional, medical-grade interface design
- **Consistency**: Follow established patterns (card layouts, button styles, spacing)
- **Icons over Emojis**: Use Lucide React icons for professional appearance
- **Status Indicators**: Clear visual feedback (green=success, yellow=warning, red=error)
- **Search/Filter**: Implement comprehensive search with partial matching support
- **Form Design**: Clean inputs with proper validation and feedback
- **Responsive**: Ensure all interfaces work on tablet/mobile devices
- **Loading States**: Provide clear loading indicators for all async operations

## Do/Don't for Agents
- **Do**: Make targeted, incremental improvements; maintain existing UI patterns
- **Do**: Update both frontend and backend when adding search/filter features
- **Do**: Use icons instead of emojis; follow modern, clean design principles
- **Do**: Test partial matching in search fields (patient names, IDs, etc.)
- **Don't**: Introduce breaking changes to auth, RBAC, or database models without confirmation
- **Don't**: Add heavy dependencies; prefer lightweight, focused libraries
- **Don't**: Use inconsistent styling; follow Tailwind/design system patterns

## Quick Orientation for New Agents
- **Start with**: README "Vision & Goals" and "Current Status" sections
- **Database**: Update `backend/migrations/init.sql` for schema changes (no incremental migrations in dev)
- **DICOM Integration**: Add server-side proxy routes under `/api/dicom/*` to avoid CORS issues
- **Search Features**: Implement both frontend (UI) and backend (API) partial matching support
- **LLM Configuration**: Use `backend/src/services/llm.js`; maintain parameter validation consistency
- **UI Changes**: Follow modern card-based layouts, proper icon usage, and responsive design
- **Admin Features**: Enhance existing admin panel sections rather than creating new ones
- **BlueLight Viewer**: Preserve AI badge that surfaces the configured LLM name and avoid moving action buttons when toggling compact mode
