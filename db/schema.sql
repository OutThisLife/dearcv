-- One row per thread. The chat and the resume it produced live together,
-- because they are only ever read together and only ever thrown away together.
create table if not exists threads (
  id uuid primary key,
  doc jsonb,
  source_text text not null default '',
  source_name text not null default '',
  pdf_url text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Nothing looks a thread up by anything but its id, so this is the only index
-- worth having: for sweeping abandoned threads later.
create index if not exists threads_updated_at_idx on threads (updated_at);
