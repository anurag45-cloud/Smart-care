# SmartCare AI — Product Requirements & Build Log

## Original problem statement
Build "SmartCare AI": a production-ready, full-stack AI-powered hospital discovery & healthcare
management platform (6 roles, 8 phases: auth, hospital/doctor discovery, maps, appointments,
medical records, lab reports, AI report analyzer + chatbot, pharmacy/beds/billing/notifications,
AI operational predictions, admin analytics, security/audit).

## User choices (locked)
- Maps: Leaflet + OpenStreetMap (no API key)
- AI: Emergent LLM key (gpt-5.4) for report summaries + report chatbot (SSE streaming)
- Auth: Emergent-managed Google social login
- Scope v1: core patient journey + essentials (roles, hospital search/profile/maps/gallery,
  doctor discovery, appointments, patient & doctor dashboards, medical records, lab report
  upload + AI summary + chatbot, notifications, basic admin dashboard)
- No seed data — DB starts empty; admin (ambuj142006@gmail.com, auto-admin on Google login)
  creates hospitals/departments/doctors via UI

## Architecture
- Frontend: React 19 + Tailwind + shadcn/ui, react-leaflet, recharts, sonner
- Backend: FastAPI + MongoDB (motor), routers: auth, hospitals, appointments, medical,
  reports, ai, misc. Custom string IDs, `{"_id": 0}` projections everywhere.
- Files: Emergent object storage (smartcare-ai/ prefix, soft-delete, authorized streaming via /api/reports/{id}/file)
- AI: emergentintegrations LlmChat (openai/gpt-5.4), streaming mandatory, SSE with X-Accel-Buffering: no
- RBAC: patient (default) / doctor (email match on doctors record, re-resolved every login) / admin (owner email or promotion)

## User personas
Patient (books, uploads reports, chats with AI), Doctor (schedule, appointments, notes,
prescriptions, lab requests, leave), Admin (hospitals, doctors, users, leave review, stats).

## Implemented (2026-09-11, v1)
- Emergent Google OAuth, session cookies + Bearer fallback, role-based guards, audit logs
- Hospital CRUD + search (name/city/dept/specialty, filters, sort, pagination), images,
  departments, facilities; hospital profile with gallery lightbox + Leaflet map + directions + geolocation distance
- Doctor discovery + profile; slot engine (working days/hours/slot size, past-slot filtering,
  leave blocking, double-booking 409)
- Appointments: book/reschedule/cancel/status lifecycle + notifications on every event
- Medical records timeline, prescriptions, lab test requests; doctor patient-file access control
- Lab report upload (PDF/JPG/PNG ≤10MB) → text extraction (pypdf/pytesseract) → AI summary
  with extracted values vs reference ranges, questions-for-doctor, disclaimer
- AI chatbot (SSE streaming, conversation persistence, strictly own-report context)
- Notifications (in-app, unread badge), profile management
- Doctor dashboard (today's appointments, stats), schedule editor, leave apply
- Admin dashboard (stats + recharts), hospitals/doctors/users/leave management
- Testing: 42/42 backend pytest cases pass; full frontend E2E pass (iteration_1.json)

## Known limitations / notes
- Email/SMS notifications: not wired (no provider chosen); in-app only
- AI summary can take up to ~60s on upload; OCR needs tesseract (installed in pod)
- No-show prediction, waiting-time, bed forecast: not in v1

## Backlog
- P0: — (v1 complete)
- P1: Billing system, pharmacy inventory, bed management, lab staff workflow (upload on behalf),
  email notifications (Resend), nurse/staff role
- P2: AI no-show prediction + waiting time + bed forecasting with explainability, Google Places
  hospital import, SMS reminders, appointment reminder scheduler (cron)
- P3: Ratings/reviews, multi-hospital admin scoping, data retention controls

## Next tasks
1. User reviews v1 in preview and confirms the core journey with real Google login
2. Pick P1 items to build next (billing / pharmacy / beds / email)
3. Optionally switch maps to Google Maps if a key is provided later
