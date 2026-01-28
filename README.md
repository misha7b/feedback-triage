# Cloudflare Internship Takehome Assignment

# Feedback Triage 

A Cloudflare Workers application for managing and categorizing customer feedback from multiple sources.

## Features

- **Multi-source feedback collection** - Discord, Twitter, GitHub, and Support tickets
- **AI-powered enrichment** - Automatic urgency, sentiment, and category classification
- **Triage queue** - Rapidly categorize feedback as Escalate, Backlog, Duplicate, or Noise
- **Review dashboard** - Filter and track triaged issues with resolution status
- **Keyboard shortcuts** - Power-user friendly (E/B/D/N for triage decisions)
- **Real-time statistics** - Emerging themes, source breakdowns, and daily metrics

## Tech Stack

- **[Cloudflare Workers](https://developers.cloudflare.com/workers/)** - Serverless runtime
- **[D1 Database](https://developers.cloudflare.com/d1/)** - SQLite-based persistent storage
- **[Workers AI](https://developers.cloudflare.com/workers-ai/)** - Feedback classification
- **TypeScript** - Type-safe application code

## Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)
- A Cloudflare account

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/feedback-triage.git
cd feedback-triage

# Install dependencies
npm install

# Create the D1 database
wrangler d1 create feedback-triage-db

# Update wrangler.jsonc with your database_id

# Run migrations
wrangler d1 execute feedback-triage-db --local --file=migrations/0001_schema.sql
wrangler d1 execute feedback-triage-db --local --file=migrations/0002_seed.sql
wrangler d1 execute feedback-triage-db --local --file=migrations/0003_add_resolved.sql
```

### Development

```bash
# Start local development server
npm run dev
```

The app will be available at `http://localhost:8787`

### Deployment

```bash
# Deploy to Cloudflare Workers
npm run deploy
```

## Usage

### Triage Queue (`/`)

The main interface for processing untriaged feedback. Items are prioritized by urgency (critical > high > medium > low).

**Keyboard shortcuts:**
- `E` - Escalate
- `B` - Backlog
- `D` - Duplicate
- `N` - Noise

### Review Page (`/review`)

View and manage triaged items with filtering by status. Track resolution status for escalated issues.

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/queue` | GET | Fetch the next untriaged item |
| `/api/triage` | POST | Record a triage decision |
| `/api/stats` | GET | Get dashboard statistics |
| `/api/triaged` | GET | Fetch triaged items (supports `?status=` and `?include_resolved=` filters) |
| `/api/resolve` | POST | Mark an item as resolved/unresolved |

## Database Schema

```sql
feedback (
  id              INTEGER PRIMARY KEY,
  source          TEXT,     -- discord, twitter, github, support
  source_id       TEXT,     -- external reference ID
  author          TEXT,
  content         TEXT,
  created_at      DATETIME,
  urgency         TEXT,     -- low, medium, high, critical
  sentiment       TEXT,     -- positive, neutral, negative
  category        TEXT,     -- bug, feature_request, question, complaint, praise, other
  triage_status   TEXT,     -- escalate, backlog, duplicate, noise
  triaged_at      DATETIME,
  resolved_at     DATETIME
)
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start local development server |
| `npm run deploy` | Deploy to Cloudflare Workers |
| `npm run test` | Run tests with Vitest |
| `npm run cf-typegen` | Generate TypeScript types for bindings |

## License

MIT
