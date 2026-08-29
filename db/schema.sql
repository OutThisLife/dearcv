-- One row per thread. The chat and the resume it produced live together,
-- because they are only ever read together and only ever thrown away together.
create table if not exists threads (
  id uuid primary key,
  doc jsonb,
  source_text text not null default '',
  source_name text not null default '',
  pdf_path text,
  messages jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Set once, when the thread is created, from whoever was connected at the time.
-- Null means the thread predates ownership or was started by someone who never
-- connected, and stays reachable by its link alone.
alter table threads add column if not exists owner_id text;

-- Nothing looks a thread up by anything but its id, so this is the only index
-- worth having: for sweeping abandoned threads later.
create index if not exists threads_updated_at_idx on threads (updated_at);

-- For listing someone their own threads, which is the point of tying them to
-- an account rather than a browser.
create index if not exists threads_owner_id_idx on threads (owner_id);

-- Every read and write goes through a route that has already worked out who is
-- asking, using the service role, which bypasses RLS. Turning it on with no
-- policies is therefore not a way of granting access but of removing one: the
-- anon key ships to the browser, and without this it could read the table.
alter table threads enable row level security;

-- Private: a resume is somebody's name, address and history, so the file is
-- reachable only by a URL this server signs, for as long as it says.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('resumes', 'resumes', false, 10485760, array['application/pdf'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
