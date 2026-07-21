-- ============================================================
-- HORAS SELGRON — configuração do banco (rode 1x no Supabase)
-- Supabase → SQL Editor → New query → cole tudo → RUN
-- ============================================================

-- 1) PERFIS (dados do usuário + assinatura + papel)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  nome text,
  matricula text,
  secao text default 'SUPRIMENTOS',
  papel text not null default 'colaborador' check (papel in ('colaborador','gestor')),
  assinatura text,                      -- PNG da assinatura (data URL)
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;

-- 2) FICHAS
create table if not exists public.fichas (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.profiles(id) on delete cascade,
  nome text, secao text, matricula text,
  data text,                            -- data do evento (texto)
  comunicado text[] default '{}',       -- {ENTRADA,SAIDA,FALTA}
  tipos text[] default '{}',            -- {Recuperação, Hora Extra, ...}
  entrada text, saida text,
  faltas text, motivo text, observacao text,
  hora_extra boolean default false,
  status text not null default 'enviada'
    check (status in ('rascunho','enviada','assinada','arquivada')),
  assinatura_colaborador text,          -- foto da assinatura no momento do envio
  assinatura_gestor text,               -- foto da assinatura do gestor ao assinar
  assinada_em timestamptz,
  created_at timestamptz default now()
);
alter table public.fichas enable row level security;
create index if not exists fichas_colab_idx on public.fichas(colaborador_id);
create index if not exists fichas_status_idx on public.fichas(status);

-- 3) Função auxiliar: o usuário atual é gestor?
create or replace function public.is_gestor() returns boolean
language sql security definer stable set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and papel = 'gestor');
$$;

-- 4) Políticas de acesso (RLS)
drop policy if exists p_profiles_sel on public.profiles;
create policy p_profiles_sel on public.profiles for select
  using (id = auth.uid() or public.is_gestor());
drop policy if exists p_profiles_ins on public.profiles;
create policy p_profiles_ins on public.profiles for insert
  with check (id = auth.uid());
drop policy if exists p_profiles_upd on public.profiles;
create policy p_profiles_upd on public.profiles for update
  using (id = auth.uid());

drop policy if exists p_fichas_sel on public.fichas;
create policy p_fichas_sel on public.fichas for select
  using (colaborador_id = auth.uid() or public.is_gestor());
drop policy if exists p_fichas_ins on public.fichas;
create policy p_fichas_ins on public.fichas for insert
  with check (colaborador_id = auth.uid());
drop policy if exists p_fichas_upd on public.fichas;
create policy p_fichas_upd on public.fichas for update using (
  (colaborador_id = auth.uid() and status in ('rascunho','enviada')) or public.is_gestor()
);
drop policy if exists p_fichas_del on public.fichas;
create policy p_fichas_del on public.fichas for delete using (
  (colaborador_id = auth.uid() and status in ('rascunho','enviada')) or public.is_gestor()
);

-- 5) Cria o perfil automaticamente quando alguém se cadastra
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end; $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- 6) DEPOIS de fazer seu 1º login no app, rode esta linha
--    (troque pelo SEU e-mail) para virar GESTOR:
-- update public.profiles set papel='gestor' where email='SEU-EMAIL@selgron.com.br';
-- ============================================================
