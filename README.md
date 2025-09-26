# ChickadeeX - AI-Assisted Medical Reports Platform

A modern, secure, role-based platform for AI‑assisted medical imaging reports. Doctors can search DICOM studies from PACS/DICOMweb with advanced filtering, generate and version reports with LLM assistance, and finalize/export with comprehensive auditing.

## 🎯 Vision & Goals
- **Efficient Workflows**: Enable safe, efficient reporting workflows for medical imaging with modern UI/UX
- **DICOM Integration**: Seamlessly integrate with PACS/DICOMweb for study discovery and retrieval with partial matching
- **AI Assistance**: Provide high‑quality AI assistance while keeping physicians in control of the reporting process
- **Compliance**: Maintain strong authentication, role-based access control, audit trails, and operational observability
- **Professional Interface**: Modern, clean, medical-grade user interface with comprehensive search and filtering capabilities

## 🏗️ System Architecture

### Backend (Node.js/Express)
- **Authentication & RBAC**: JWT-based authentication with role-based access control
- **Database**: PostgreSQL with comprehensive schema and migrations  
- **Caching**: Redis for session storage and caching
- **AI Integration**: LLM and RAG support for report generation
- **Audit Logging**: Comprehensive audit trail for compliance
- **Security**: Helmet, rate limiting, input validation, CORS protection

### Frontend (React)
- **Modern UI**: React 18 with Tailwind CSS for responsive, professional medical interface
- **Role-based Navigation**: Dynamic UI based on user roles with comprehensive permissions
- **Authentication Flow**: Dual-mode local and SSO (Keycloak) login support
- **Real-time Feedback**: Toast notifications, loading states, and smooth transitions
- **Advanced Search**: Comprehensive search and filtering with partial matching support
- **DICOM Integration**: Enhanced studies page with advanced filters, thumbnails, and quick actions
- **Admin Panel**: Modern, clean interface for user management, LLM configuration, and system settings
- **Reports Management**: Card-based layout with status tracking, filtering, and export capabilities

### Infrastructure
- **Containerized**: Full Docker Compose setup for production deployment
- **Reverse Proxy**: Nginx for load balancing and SSL termination
- **Security**: Production-ready security headers and configurations
- **Monitoring**: Health checks and logging infrastructure
- **DICOM Viewer**: Integrated BlueLight viewer for medical image analysis
- **Identity Management**: Keycloak SSO with automatic realm configuration

## 👥 User Roles

| Role | Permissions | Features |
|------|-------------|----------|
| **Admin** | Full system access | User management (popup password reset), LLM configuration, PACS settings, system configuration, audit logs, modern dashboard |
| **Doctor** | Report & study management | DICOM studies search (partial matching), comprehensive report management, AI-generate, finalize reports |
| **Researcher** | Read finalized reports | View and export finalized reports for research purposes |
| **Observer** | View-only access | Read finalized reports without export capabilities |

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose
- Node.js 18+ (for development)
- PostgreSQL 15+ (for local development)

### Production Deployment

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd chickadeeX
   ```

2. **Configure environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your production values
   ```

3. **Start all services:**
   ```bash
   docker-compose up -d --build
   ```

4. **Access the application:**
   - **Frontend**: http://localhost (production via Nginx)
   - **Backend API**: http://localhost/api (via proxy) or http://localhost:3000/api (direct)
   - **Keycloak Admin**: http://localhost:8080 (SSO management)
   - **BlueLight Viewer**: http://localhost/bluelight/html/start.html (DICOM viewer)

5. **Admin User Creation:**
   - The first user who logs in via Keycloak becomes an `admin` automatically if no admin exists.
   - No default local admin is seeded anymore. If you initialized the database before this change, run `scripts/remove_default_admin.sql` against your DB to delete the seeded admin (`admin@medical-reports.com`).

### Development Setup

1. **Backend development:**
   ```bash
   cd backend
   npm install
   npm run dev
   ```

2. **Frontend development:**
   ```bash
   cd frontend
   npm install
   npm start
   ```

## 🛠️ Build Guide

Use these steps when you need to produce a clean production build outside of Docker (for CI pipelines or local verification).

### Backend API (Node.js/Express)
1. Install dependencies (if you haven't already):
   ```bash
   cd backend
   npm install
   ```
2. Provide runtime configuration:
   ```bash
   cp ../.env.example ../.env   # adjust values as needed
   ```
3. Run database migrations and optional seed data:
   ```bash
   npm run migrate
   # npm run seed   # optional
   ```
4. Start the production server:
   ```bash
   npm start
   ```

### Frontend Web App (React/Tailwind)
1. Install dependencies:
   ```bash
   cd frontend
   npm install
   ```
2. Create a production build artefact:
   ```bash
   npm run build
   ```
   The optimized bundle is emitted to `frontend/build/` and is the same output served by the Docker/Nginx image.
3. (Optional) Preview the build locally:
   ```bash
   npx serve -s build
   ```

### Full Stack (Docker Compose)
If you prefer containers, rebuild the entire stack with:
```bash
docker-compose up -d --build
```
This runs the same backend and frontend build steps inside their respective images.

## 🔧 Configuration

### Environment Variables

Key environment variables to configure:

```bash
# Database
DATABASE_URL=postgresql://user:pass@host:port/db
REDIS_URL=redis://user:pass@host:port

# Authentication
JWT_SECRET=your-super-secret-jwt-key
KEYCLOAK_URL=http://keycloak:8080
KEYCLOAK_REALM=medical-reports

# LLM Integration
# Configure LLM providers through the Admin Panel. No default API endpoint or key is set in environment.

# Optional RAG
RAG_API_URL=http://your-rag-service:8000
RAG_ENABLED=false
```

### System Configuration

Administrators can configure via the modern admin panel:
- **LLM Models**: Multiple AI models with priority-based fallback, enable/disable toggle, health testing, statistics display (total/enabled/disabled counts)
  - Parameters: `temperature` (0–1), `max_tokens` (256–4096), `top_p` (0.1–1)
- **User Management**: Modern card-based interface, popup password reset, role assignments, active/inactive tracking
- **System Settings**: Clean forms for `system_name`, `max_concurrent_tasks`, `backup_frequency`
- **PACS Integration**: Enhanced UI for DICOM server connection settings with authentication types

## 📌 Current Status & Latest Features

### 🎨 Modern UI/UX Enhancements
- **Professional Interface**: Complete redesign with Tailwind CSS, Lucide React icons, and medical-grade aesthetics
- **Admin Panel**: Modern card-based layouts, popup forms, enhanced statistics displays
- **Search & Filtering**: Comprehensive search with partial matching across patient names, IDs, and studies
- **Status Tracking**: Clear visual indicators for draft/finalized reports, active/inactive users, enabled/disabled LLM models

### 🔍 Enhanced Doctor Features  
- **DICOM Studies Search**: Partial patient name matching with wildcards, advanced filters modal, modern UI
- **Reports Management**: Card-based layout, comprehensive filtering (patient, modality, status, dates), export capabilities
- **Advanced Search**: Study UID, accession numbers, date ranges, modality filtering

### ⚙️ Advanced Admin Features
- **User Management**: Modern interface with popup password reset, role management, active/inactive tracking
- **LLM Configuration**: Enhanced forms, enable/disable toggles, health testing, statistics display
- **System Settings**: Professional configuration interface for all system parameters
- **Dashboard Statistics**: Real-time metrics with proper breakdowns and visual indicators

## 🔒 Security Features

- **Authentication**: Dual-mode (local password + Keycloak SSO)
- **Authorization**: Role-based access control with route protection
- **Session Management**: Secure session handling with Redis
- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: API endpoint protection
- **Security Headers**: OWASP-recommended HTTP headers
- **Audit Logging**: Complete action tracking for compliance

## 📊 API Endpoints

### Authentication
- `POST /api/auth/login` - Local password login
- `POST /api/auth/sso/callback` - SSO authentication
- `POST /api/auth/logout` - User logout
- `GET /api/auth/me` - Current user info

### Reports
- `GET /api/reports` - List reports with filtering
- `POST /api/reports` - Create new report
- `GET /api/reports/:id` - Get specific report
- `POST /api/reports/:id/versions` - Create report version
- `POST /api/reports/:id/generate` - AI generate report
- `POST /api/reports/:id/finalize` - Finalize report

### Admin
- `GET /api/admin/users` - List all users
- `PUT /api/admin/users/:id` - Update user
- `GET /api/admin/llm-configs` - LLM configurations
- `POST /api/admin/llm-configs` - Create LLM config (supports temperature, max_tokens, top_p)
- `PUT /api/admin/llm-configs/:id` - Update LLM config
- `POST /api/admin/llm-configs/:id/test` - Test a specific LLM config health
- `GET /api/admin/system-settings` - Get system settings (singleton)
- `PUT /api/admin/system-settings` - Update system settings (partial)

### DICOM (Doctor-only)
- `GET /api/dicom/studies` - Enhanced proxy query for studies (QIDO-RS) with filters:
  - `patientId`, `patientName` (with partial matching using wildcards)
  - `accessionNumber`, `studyDescription`, `studyInstanceUID`
  - `modalities` (CSV, e.g., CT,MR) — optional; empty means all
  - `studyDate` (YYYYMMDD-YYYYMMDD); accepts slashes/spaces
  - `limit` (10/20/25/50), `offset` for pagination
- `GET /api/dicom/studies/:studyUID/download` - Download a study ZIP (WADO-RS)

### Enhanced Search Features
- **Partial Matching**: Patient name searches support wildcards (`*name*` automatically added)
- **Advanced Filtering**: Study UID, date ranges, modality selection, accession numbers
- **Modern UI**: Clean search interface with advanced filters modal

## 🛣️ Roadmap (Near‑term)
- **Report Creation Flow**: Complete report creation and AI generation workflows
- **Series/Instances Navigation**: Drill‑down views for detailed DICOM study exploration
- **BlueLight Viewer Enhancements**: Improved DICOM viewer integration and features
- **API Documentation**: Swagger/OpenAPI documentation for all public endpoints
- **Testing Suite**: Comprehensive backend tests (Jest + Supertest) including DICOM proxy tests
- **Performance Optimization**: Enhanced pagination, caching, and search performance
- **Mobile Responsiveness**: Further mobile and tablet interface improvements

## 🏥 Medical Report Workflow

1. **Study Import**: Doctor selects study from PACS or manual entry
2. **Report Creation**: System creates report with metadata
3. **Content Generation**: 
   - Manual entry by doctor
   - AI-assisted generation (RAG → LLM fallback)
   - Combination of both approaches
4. **Version Management**: Multiple versions with full history
5. **Review & Edit**: Doctor can modify AI-generated content
6. **Finalization**: Report marked as final and immutable
7. **Access Control**: Role-based viewing and export permissions

## 🔍 AI Integration

### LLM Support
- **Multiple Models**: OpenAI, Anthropic, local models
- **Priority Fallback**: Automatic failover between models
- **Customizable**: Prompt + parameters; supports `temperature`, `max_tokens`, `top_p`
- **Health Checks**: Admin can test a configured model endpoint

### RAG Integration
- **Optional Enhancement**: Knowledge-augmented generation
- **Fallback Strategy**: LLM-only if RAG unavailable
- **Confidence Scoring**: Quality assessment of generated content

## 📈 Monitoring & Compliance

### Audit Logging
- **User Actions**: Login, logout, report access
- **Data Changes**: Report creation, modification, finalization
- **System Events**: Configuration changes, errors
- **Compliance**: HIPAA-ready audit trail

### Health Monitoring
- **Service Health**: Docker health checks
- **Database**: Connection and query monitoring
- **Redis**: Cache performance tracking
- **API**: Response time and error rate monitoring

## 🚀 Production Deployment

### Docker Compose Services
- **Frontend**: React app served by Nginx
- **Backend**: Node.js API server
- **Database**: PostgreSQL with persistent volume
- **Cache**: Redis for sessions
- **Proxy**: Nginx reverse proxy with SSL support
- **SSO**: Keycloak identity provider

### Keycloak Auto-Configuration
- Local/dev compose auto-imports a prebuilt realm (`keycloak/realm-medical-reports.json`) and
  a confidential OIDC client `medical-reports-client` with:
  - Redirect URI: `http://localhost:3000/api/auth/sso/redirect`
  - Web Origin: `http://localhost:3001`
  - Root URL: `http://localhost:3001`
  - Client Secret: `dev-secret` (backend uses the same)
- A one-shot configurator (`keycloak-configurator`) also sets `sslRequired=NONE` and ensures
  the client has up-to-date values based on envs `FRONTEND_URL` and `BACKEND_URL`.

For production, override:
- `KEYCLOAK_CLIENT_SECRET` with a strong secret
- `FRONTEND_URL`, `BACKEND_URL`, `CORS_ORIGIN`, and your TLS setup

### Identity Linking Notes
- On SSO login, users are matched and linked by Keycloak subject (`keycloak_user_id`).
- Email changes in Keycloak will not create duplicate local users.

### Scaling Considerations
- **Horizontal**: Multiple backend instances behind load balancer
- **Database**: Read replicas for query performance
- **Caching**: Redis cluster for high availability
- **Storage**: External file storage for DICOM images

## 🔐 Security Best Practices

- Use strong passwords and API keys
- Enable SSL/TLS in production
- Configure firewall rules
- Regular security updates
- Monitor audit logs
- Backup database regularly
- Implement rate limiting
- Use environment variables for secrets

## 📚 Development

### Code Structure
```
├── backend/           # Node.js API server
│   ├── src/
│   │   ├── routes/    # API endpoints
│   │   ├── middleware/ # Auth, validation, etc.
│   │   ├── services/  # Business logic
│   │   └── utils/     # Helper functions
│   └── migrations/    # Database schema
├── frontend/          # React application
│   ├── src/
│   │   ├── components/ # Reusable components
│   │   ├── pages/     # Route components
│   │   ├── services/  # API clients
│   │   └── contexts/  # React contexts
└── docker-compose.yml # Container orchestration
```

### Contributing
1. Follow existing code style and patterns
2. Add proper error handling and validation
3. Include comprehensive tests
4. Update documentation
5. Follow security best practices

## 📄 License

MIT License - see LICENSE file for details.

## 🆘 Support

For issues and questions:
1. Check the documentation
2. Review error logs in Docker containers
3. Verify environment configuration
4. Check database connectivity

5. Validate API endpoints with curl/Postman

## ✅ Production Checklist

- [ ] Configure production environment variables
- [ ] Set up SSL certificates
- [ ] Configure database backups
- [ ] Enable monitoring and alerting
- [ ] Set up log aggregation
- [ ] Configure firewall rules
- [ ] Test disaster recovery procedures
- [ ] Validate compliance requirements
- [ ] Perform security audit
- [ ] Load test the application


main color
- #655555 
- #e7e7b1
- #adb082
- #fcfdec
- #3b323e
