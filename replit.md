# ORION - Strategic Intelligence Platform

## Overview

ORION is a strategic intelligence and futures research platform designed for analyzing driving forces, trends, and scenario planning using a three-lens scanning approach (Megatrends, Trends, and Weak Signals & Wildcards). It provides analytics, AI-powered insights, and report generation for strategic decision-making, aiming to support business vision and market potential. The platform is a full-stack TypeScript application with a React frontend, Express.js backend, PostgreSQL, and integrates with OpenAI's GPT models for intelligent analysis.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript, built using Vite.
- **UI Components**: Shadcn/ui (Radix UI-based) for accessible components.
- **Styling**: Tailwind CSS with CSS custom properties for theming (dark/light modes).
- **State Management**: Zustand for global state, TanStack Query for server state.
- **Routing**: Wouter for client-side routing.
- **Data Visualization**: Placeholder components for D3.js/Plotly.js charts (RadarChart, NetworkChart).

### Backend Architecture
- **Runtime**: Node.js with Express.js.
- **Language**: TypeScript with ESM modules.
- **API Design**: RESTful API with structured route handlers.
- **Database ORM**: Drizzle ORM for type-safe operations and schema management.
- **Real-time Communication**: Server-sent events (SSE) for streaming AI responses and job status.
- **Background Jobs**: Job processing system for long-running tasks.

### Data Storage Solutions
- **Primary Database**: PostgreSQL with Neon serverless hosting.
- **Schema Design**: Normalized tables for projects, driving forces, clusters, workspaces, jobs, and reports.
- **Data Types**: Support for arrays, JSON objects, and vector references.
- **Migration System**: Drizzle Kit for schema versioning.

### Authentication and Authorization
- **Session Management**: Express sessions with PostgreSQL session store (connect-pg-simple).
- **Security**: CORS configuration and request validation using Zod.
- **No explicit authentication system implemented** - designed for internal/trusted environments.

### Core Business Logic
- **Three-Lens Framework**: Categorizes driving forces (Megatrends, Trends, Weak Signals/Wildcards).
- **STEEP Analysis**: Classifies forces by Social, Technological, Economic, Environmental, and Political dimensions.
- **Clustering Engine**: Machine learning for grouping related driving forces using embeddings.
- **Impact Assessment**: Scoring system for evaluating force impact and time-to-market.
- **Sentiment Analysis**: Classification of driving forces as positive, negative, or neutral.
- **Duplication Prevention**: User projects start empty, falling back to a global default project based on subscription tier for driving forces.
- **Project Context**: ORION Copilot and Scanning Assistant can access project-specific driving forces for context-aware analysis.

### UI/UX Decisions
- Custom ORION logo integrated throughout the application interface.
- Dark/light mode theming support.

## External Dependencies

### AI and Machine Learning
- **OpenAI Assistant API**:
  - **ORION Scanning Intelligence Assistant**: For strategic foresight and trend scanning analysis.
  - **ORION Strategic Copilot**: For comprehensive strategic foresight and innovation.
- **Image Analysis**: Full image upload and analysis capabilities (PNG, JPG, JPEG, GIF, WebP) with OpenAI visual processing.
- **Text Embeddings**: OpenAI's `text-embedding-3-large` model for semantic similarity and clustering.
- **Streaming Responses**: Real-time AI conversations via server-sent events.

### Database and Hosting
- **Neon Database**: Serverless PostgreSQL hosting.
- **Database Driver**: `@neondatabase/serverless`.

### Development and Deployment
- **Replit Platform**: Development environment.
- **Build Tools**: Vite (frontend), esbuild (backend).
- **Package Manager**: NPM.

### UI and Visualization Libraries
- **Radix UI**: Accessible UI primitives.
- **React Hook Form**: Form handling with validation.
- **Date-fns**: Date manipulation.
- **D3.js**: Data visualization library (planned).

### Utility Libraries
- **Zod**: Schema validation.
- **Clsx/Tailwind Merge**: CSS class name utilities.
- **Nanoid**: Unique ID generation.

## Stripe Integration Configuration

### Current Status
✅ **Live Mode - Production Ready** - Stripe subscription integration is fully configured with Live Mode keys and products.

### Environment Configuration

**Production (Current Setup):**
```bash
STRIPE_SECRET_KEY=sk_live_...          # Live Mode secret key (backend)
VITE_STRIPE_PUBLIC_KEY=pk_live_...     # Live Mode publishable key (frontend)
STRIPE_WEBHOOK_SECRET=whsec_...        # Webhook signing secret
```

**Development/Testing (Available for Testing):**
```bash
TESTING_STRIPE_SECRET_KEY=sk_test_...  # Test Mode secret key (backend)
TESTING_VITE_STRIPE_PUBLIC_KEY=pk_test_... # Test Mode publishable key (frontend)
```

### Subscription Plans (Live Mode)
Three subscription tiers configured in database with Stripe Live Mode price IDs:
- **Basic Plan**: €1/month (price_1SCd6VCR3rcAGMiHsrxja8q6)
  - Product ID: prod_T8uw20uamZuXhf
- **Professional Plan**: €2/month (price_1SCd6VCR3rcAGMiHImbauvFQ)
  - Product ID: prod_T8uwJQJ0co4nqT
- **Enterprise Plan**: €3/month (price_1SCd6WCR3rcAGMiHhmowXDpU)
  - Product ID: prod_T8uwBWXIfVICZU

### Subscription Enforcement (Updated: October 11, 2025)

**Mandatory Subscription Policy:**
- ✅ Users MUST subscribe to access ORION features - no free trial or free tier
- ✅ After login, users without active subscription are redirected to /pricing
- ✅ All protected routes (Projects, Scanning, Analytics, Reports, Chat) require active subscription
- ✅ SubscriptionGuard blocks unauthenticated users and users without subscription tiers
- ✅ No default tier assignment - explicit subscription required

**Protected Routes:**
- `/projects` - Requires DASHBOARD access (all tiers)
- `/scanning` - Requires SCANNING access (all tiers)
- `/analytics` - Requires ANALYTICS access (all tiers)
- `/reports` - Requires REPORTS access (Professional/Enterprise only)
- `/chat` - Requires COPILOT access (Professional/Enterprise only)

### Key Implementation Details
- Backend uses fallback logic: `STRIPE_SECRET_KEY || TESTING_STRIPE_SECRET_KEY`
- Price IDs stored in database `subscription_plans` table
- Frontend loads Stripe.js with `VITE_STRIPE_PUBLIC_KEY`
- Checkout flow: POST `/api/v1/subscription/checkout` → redirects to Stripe Checkout
- Webhook endpoint: `/api/stripe/webhook` (handles checkout.session.completed, subscription events)
- Error handling includes user-friendly toast messages

### Stripe Products Configuration
Products are configured in Stripe Dashboard (https://dashboard.stripe.com/products) with:
- Metadata: `app=orion-saas`, `tier={basic|professional|enterprise}`
- Recurring billing: Monthly
- Currency: EUR