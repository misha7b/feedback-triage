-- Feedback triage schema

CREATE TABLE feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT NOT NULL CHECK (source IN ('discord', 'twitter', 'github', 'support')),
  source_id TEXT,
  author TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  -- AI enrichment fields
  urgency TEXT CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  sentiment TEXT CHECK (sentiment IN ('positive', 'neutral', 'negative')),
  category TEXT CHECK (category IN ('bug', 'feature_request', 'question', 'complaint', 'praise', 'other')),

  -- Triage fields
  triage_status TEXT CHECK (triage_status IN ('escalate', 'backlog', 'duplicate', 'noise')),
  triaged_at TEXT,

  -- Indexes will help with filtering
  UNIQUE(source, source_id)
);

CREATE INDEX idx_feedback_triage_status ON feedback(triage_status);
CREATE INDEX idx_feedback_source ON feedback(source);
CREATE INDEX idx_feedback_urgency ON feedback(urgency);
CREATE INDEX idx_feedback_created_at ON feedback(created_at);
