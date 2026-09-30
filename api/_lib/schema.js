export const SCHEMA = `
create table if not exists organizations (
  id serial primary key,
  name text not null,
  domain text,
  plan text default 'Managed',
  created_at timestamptz default now()
);
create table if not exists teams (
  id serial primary key,
  name text not null,
  description text default ''
);
create table if not exists users (
  id serial primary key,
  name text not null,
  email text not null unique,
  password_hash text,
  role text not null default 'customer' check (role in ('admin','agent','customer')),
  team_id int references teams(id) on delete set null,
  org_id int references organizations(id) on delete set null,
  skills text[] default '{}',
  active boolean default true,
  created_at timestamptz default now()
);
create table if not exists categories (
  id serial primary key,
  name text not null unique,
  color text default '#1E6B5F',
  default_team_id int references teams(id) on delete set null
);
create table if not exists sla_policies (
  id serial primary key,
  priority text not null unique check (priority in ('low','normal','high','urgent')),
  first_response_mins int not null,
  resolution_mins int not null
);
create table if not exists tickets (
  id serial primary key,
  subject text not null,
  description text default '',
  status text not null default 'new' check (status in ('new','in_progress','pending','resolved','closed')),
  priority text not null default 'normal' check (priority in ('low','normal','high','urgent')),
  channel text not null default 'web' check (channel in ('email','chat','web','social','phone')),
  category_id int references categories(id) on delete set null,
  requester_id int references users(id) on delete set null,
  org_id int references organizations(id) on delete set null,
  assignee_id int references users(id) on delete set null,
  team_id int references teams(id) on delete set null,
  tags text[] default '{}',
  custom_fields jsonb default '{}',
  first_response_due timestamptz,
  resolution_due timestamptz,
  first_responded_at timestamptz,
  resolved_at timestamptz,
  sla_paused_at timestamptz,
  sla_paused_mins int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists tickets_status_idx on tickets(status);
create index if not exists tickets_assignee_idx on tickets(assignee_id);
create index if not exists tickets_created_idx on tickets(created_at);
create table if not exists comments (
  id serial primary key,
  ticket_id int references tickets(id) on delete cascade,
  author_id int references users(id) on delete set null,
  body text not null,
  is_internal boolean default false,
  channel text default 'web',
  created_at timestamptz default now()
);
create index if not exists comments_ticket_idx on comments(ticket_id);
create table if not exists activity (
  id serial primary key,
  ticket_id int references tickets(id) on delete cascade,
  actor_id int references users(id) on delete set null,
  action text not null,
  detail jsonb default '{}',
  created_at timestamptz default now()
);
create table if not exists routing_rules (
  id serial primary key,
  name text not null,
  position int default 100,
  active boolean default true,
  match_keywords text[] default '{}',
  match_category_id int references categories(id) on delete set null,
  match_channel text,
  set_category_id int references categories(id) on delete set null,
  set_priority text,
  set_team_id int references teams(id) on delete set null,
  add_tags text[] default '{}',
  stop_processing boolean default false
);
create table if not exists kb_articles (
  id serial primary key,
  title text not null,
  body text not null,
  category_id int references categories(id) on delete set null,
  tags text[] default '{}',
  published boolean default true,
  views int default 0,
  helpful int default 0,
  not_helpful int default 0,
  author_id int references users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create table if not exists ticket_articles (
  ticket_id int references tickets(id) on delete cascade,
  article_id int references kb_articles(id) on delete cascade,
  primary key (ticket_id, article_id)
);
create table if not exists macros (
  id serial primary key,
  name text not null,
  body text not null,
  set_status text,
  set_priority text,
  is_internal boolean default false
);
create table if not exists custom_fields (
  id serial primary key,
  key text not null unique,
  label text not null,
  type text not null default 'text' check (type in ('text','number','select')),
  options text[] default '{}',
  required boolean default false,
  position int default 100
);
`;

export const DROP = `drop table if exists ticket_articles, activity, comments, tickets, kb_articles, routing_rules,
  macros, custom_fields, sla_policies, categories, users, teams, organizations cascade;`;
