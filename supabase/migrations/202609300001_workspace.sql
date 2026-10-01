begin;
create schema if not exists kimie_private;
revoke all on schema kimie_private from public;
grant usage on schema kimie_private to authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check(length(display_name) between 1 and 60)
);
create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(name) between 1 and 80),
  owner_id uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create table public.members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  category text not null check(category in ('company','partner','client','other')),
  role text not null default 'member' check(role in ('admin','member')),
  primary key(workspace_id,user_id)
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null check(length(name) between 1 and 80),
  created_at timestamptz not null default now()
);
create table public.project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id),
  primary key(project_id,user_id)
);
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null check(length(email) <= 254 and email like '%@%'),
  category text not null check(category in ('company','partner','client','other')),
  project_ids uuid[] not null default '{}',
  created_by uuid not null references public.profiles(id),
  expires_at timestamptz not null default now()+interval '7 days',
  accepted_by uuid references public.profiles(id),
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index invitations_pending on public.invitations(workspace_id,email) where accepted_by is null and revoked_at is null;
create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null check(length(title) between 1 and 160),
  participant_ids uuid[] not null check(cardinality(participant_ids) between 2 and 100),
  audience_key text not null,
  parent_id uuid references public.rooms(id),
  origin_message_id uuid,
  status text not null default 'open' check(status in ('open','waiting','resolved')),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now()
);
create unique index rooms_audience on public.rooms(project_id,audience_key) where parent_id is null;
create unique index rooms_origin on public.rooms(origin_message_id) where origin_message_id is not null;
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  author_id uuid not null references public.profiles(id),
  body text not null check(length(body) between 1 and 4000),
  client_id uuid not null,
  created_at timestamptz not null default now(),
  unique(author_id,client_id)
);
alter table public.rooms add constraint rooms_origin_fk foreign key(origin_message_id) references public.messages(id);
create index messages_room_time on public.messages(room_id,created_at,id);
create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  message_id uuid not null references public.messages(id),
  title text not null check(length(title) between 1 and 160),
  kind text not null default 'todo' check(kind in ('discussion','todo','waiting')),
  due date,
  start_date date,
  assignee_ids uuid[] not null default '{}',
  waiting_reason text not null default '' check(length(waiting_reason)<=200),
  notes text not null default '' check(length(notes)<=2000),
  priority text not null default 'normal' check(priority in ('normal','high','low')),
  subtasks jsonb not null default '[]' check(jsonb_typeof(subtasks)='array'),
  done boolean not null default false,
  dismissed boolean not null default false,
  review boolean not null default true,
  version integer not null default 1,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now(),
  unique(message_id),
  check(start_date is null or due is null or start_date<=due)
);
create index tasks_room on public.tasks(room_id);
create index members_user on public.members(user_id);
create index project_members_user on public.project_members(user_id);
create index rooms_project on public.rooms(project_id);

-- Authorization helpers live outside the exposed API schema. No helper trusts a user ID supplied by the browser.
create function kimie_private.member(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.members where workspace_id=w and user_id=auth.uid());
$$;
create function kimie_private.admin(w uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.members where workspace_id=w and user_id=auth.uid() and role='admin');
$$;
create function kimie_private.project_access(p uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.projects pr join public.members m on m.workspace_id=pr.workspace_id and m.user_id=auth.uid()
 where pr.id=p and (m.role='admin' or exists(select 1 from public.project_members pm where pm.project_id=p and pm.user_id=auth.uid())));
$$;
create function kimie_private.room_access(r uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.rooms where id=r and auth.uid()=any(participant_ids) and kimie_private.project_access(project_id));
$$;
create function kimie_private.peer(u uuid) returns boolean language sql stable security definer set search_path='' as $$
 select u=auth.uid() or exists(select 1 from public.members a join public.members b on a.workspace_id=b.workspace_id where a.user_id=auth.uid() and b.user_id=u);
$$;

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.invitations enable row level security;
alter table public.rooms enable row level security;
alter table public.messages enable row level security;
alter table public.tasks enable row level security;
revoke all on public.profiles,public.workspaces,public.members,public.projects,public.project_members,public.invitations,public.rooms,public.messages,public.tasks from anon,authenticated;
grant select on public.profiles,public.workspaces,public.members,public.projects,public.project_members,public.invitations,public.rooms,public.messages,public.tasks to authenticated;
create policy profiles_read on public.profiles for select to authenticated using(kimie_private.peer(id));
create policy workspaces_read on public.workspaces for select to authenticated using(kimie_private.member(id));
create policy members_read on public.members for select to authenticated using(kimie_private.member(workspace_id));
create policy projects_read on public.projects for select to authenticated using(kimie_private.project_access(id));
create policy project_members_read on public.project_members for select to authenticated using(kimie_private.project_access(project_id));
create policy invitations_read on public.invitations for select to authenticated using(kimie_private.admin(workspace_id));
create policy rooms_read on public.rooms for select to authenticated using(kimie_private.room_access(id));
create policy messages_read on public.messages for select to authenticated using(kimie_private.room_access(room_id));
create policy tasks_read on public.tasks for select to authenticated using(kimie_private.room_access(room_id));

create function kimie_private.validate_task(x jsonb, participants uuid[], is_child boolean default false) returns void
language plpgsql set search_path='' as $$
declare u uuid; child jsonb; ids text[]; start_d date; due_d date;
begin
 if length(trim(coalesce(x->>'title',''))) not between 1 and 160 then raise exception 'タスク名を1〜160文字で入力してください'; end if;
 if jsonb_typeof(x->'assignee_ids') is distinct from 'array' then raise exception '担当者が不正です'; end if;
 for u in select value::uuid from jsonb_array_elements_text(x->'assignee_ids') loop
  if not u=any(participants) then raise exception '担当者は会話の参加者から選んでください'; end if;
 end loop;
 start_d=nullif(x->>'start_date','')::date; due_d=nullif(x->>'due','')::date;
 if start_d>due_d then raise exception '着手予定日は期限以前にしてください'; end if;
 if not is_child then
  if jsonb_typeof(x->'subtasks') is distinct from 'array' or jsonb_array_length(x->'subtasks')>100 then raise exception '小タスクは100件以内です'; end if;
  for child in select value from jsonb_array_elements(x->'subtasks') loop
   perform kimie_private.validate_task(child,participants,true);
   perform (child->>'id')::uuid;
   if nullif(child->>'id','') is null or jsonb_typeof(child->'done') is distinct from 'boolean' then raise exception '小タスクが不正です'; end if;
  end loop;
  if (select count(*)<>count(distinct value->>'id') from jsonb_array_elements(x->'subtasks')) then raise exception '小タスクが重複しています'; end if;
 end if;
end;
$$;

-- Every mutation is transactional. Clients have SELECT-only table grants; direct writes cannot bypass these checks.
create function public.kimie_command(action text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare
 me uuid:=auth.uid(); verified_email text; w uuid; p uuid; r public.rooms; m public.messages; t public.tasks;
 result_id uuid; participants uuid[]; key text; person uuid; inv public.invitations;
 name text; txt text; k text; d date; child jsonb; new_done boolean; ws_owner uuid; existing uuid;
begin
 if me is null then raise exception 'ログインが必要です' using errcode='42501'; end if;
 select lower(email) into verified_email from auth.users where id=me and email_confirmed_at is not null;
 if verified_email is null then raise exception 'メール確認が必要です' using errcode='42501'; end if;
 if pg_column_size(payload)>100000 then raise exception '入力が大きすぎます'; end if;

 if action='profile' then
  name=trim(payload->>'name');
  insert into public.profiles(id,display_name) values(me,name) on conflict(id) do update set display_name=excluded.display_name;
  return jsonb_build_object('id',me);
 end if;
 if not exists(select 1 from public.profiles where id=me) then raise exception '表示名を登録してください'; end if;

 if action='create_workspace' then
  -- New organizations are isolated; creating one never grants access to existing organizations.
  insert into public.workspaces(name,owner_id) values(trim(payload->>'name'),me) returning id into w;
  insert into public.members(workspace_id,user_id,category,role) values(w,me,'company','admin');
  return jsonb_build_object('id',w);
 elsif action='accept_invitations' then
  for inv in select * from public.invitations where email=verified_email and accepted_by is null and revoked_at is null and expires_at>now() for update loop
   insert into public.members(workspace_id,user_id,category) values(inv.workspace_id,me,inv.category) on conflict do nothing;
   insert into public.project_members(project_id,user_id) select id,me from public.projects where id=any(inv.project_ids) and workspace_id=inv.workspace_id on conflict do nothing;
   update public.invitations set accepted_by=me where id=inv.id;
  end loop;
  return '{}';
 elsif action in ('invite','revoke_invitation','create_project','project_members','remove_member') then
  w=(payload->>'workspace_id')::uuid;
  if not kimie_private.admin(w) then raise exception '管理者のみ操作できます' using errcode='42501'; end if;
  if action='invite' then
   if exists(select 1 from jsonb_array_elements_text(coalesce(payload->'project_ids','[]')) ids where not exists(select 1 from public.projects where id=ids.value::uuid and workspace_id=w)) then raise exception '案件が不正です'; end if;
   update public.invitations set revoked_at=now() where workspace_id=w and email=lower(trim(payload->>'email')) and accepted_by is null and revoked_at is null;
   insert into public.invitations(workspace_id,email,category,project_ids,created_by) values(w,lower(trim(payload->>'email')),payload->>'category',array(select value::uuid from jsonb_array_elements_text(coalesce(payload->'project_ids','[]'))),me) returning id into result_id;
  elsif action='revoke_invitation' then
   update public.invitations set revoked_at=now() where id=(payload->>'id')::uuid and workspace_id=w and accepted_by is null returning id into result_id;
  elsif action='create_project' then
   insert into public.projects(workspace_id,name) values(w,trim(payload->>'name')) returning id into result_id;
   insert into public.project_members(project_id,user_id) values(result_id,me);
  elsif action='project_members' then
   p=(payload->>'project_id')::uuid;
   perform 1 from public.projects where id=p and workspace_id=w for update;
   if not found then raise exception '案件が見つかりません'; end if;
   participants=array(select distinct value::uuid from jsonb_array_elements_text(payload->'user_ids'));
   if exists(select 1 from unnest(participants) u where not exists(select 1 from public.members where workspace_id=w and user_id=u)) then raise exception 'メンバーが不正です'; end if;
   delete from public.project_members where project_id=p and not(user_id=any(participants));
   insert into public.project_members(project_id,user_id) select p,unnest(participants) on conflict do nothing;
   result_id=p;
  elsif action='remove_member' then
   person=(payload->>'user_id')::uuid;
   select owner_id into ws_owner from public.workspaces where id=w;
   if person=ws_owner or person=me then raise exception '所有者・自分自身は削除できません'; end if;
   delete from public.project_members where user_id=person and project_id in(select id from public.projects where workspace_id=w);
   delete from public.members where workspace_id=w and user_id=person;
   update public.invitations set revoked_at=now() where workspace_id=w and email=(select lower(email) from auth.users where id=person) and accepted_by is null;
   result_id=person;
  end if;
  return jsonb_build_object('id',result_id);
 elsif action='start_chat' then
  p=(payload->>'project_id')::uuid;
  if not kimie_private.project_access(p) then raise exception '案件にアクセスできません' using errcode='42501'; end if;
  participants=array(select distinct u from (select value::uuid u from jsonb_array_elements_text(payload->'participant_ids') union select me) a order by u);
  if cardinality(participants)<2 or cardinality(participants)>100 then raise exception '相手を1〜99人選んでください'; end if;
  select workspace_id into w from public.projects where id=p;
  if exists(select 1 from unnest(participants) u where not exists(select 1 from public.members wm where wm.workspace_id=w and wm.user_id=u and (wm.role='admin' or exists(select 1 from public.project_members pm where pm.project_id=p and pm.user_id=u)))) then raise exception '相手は案件の参加者から選んでください'; end if;
  key=array_to_string(participants,',');
  name=coalesce(nullif(trim(payload->>'name'),''),(select string_agg(display_name,'・' order by id) from public.profiles where id=any(participants) and id<>me));
  insert into public.rooms(project_id,title,participant_ids,audience_key,created_by) values(p,left(name,160),participants,key,me) on conflict(project_id,audience_key) where parent_id is null do update set audience_key=excluded.audience_key returning * into r;
  -- Message creation is in the same transaction; a failed post leaves no empty group.
  return public.kimie_command('send_message',jsonb_build_object('room_id',r.id,'body',payload->>'body','client_id',payload->>'client_id'));
 elsif action='branch' then
  select * into m from public.messages where id=(payload->>'message_id')::uuid;
  if not found or not kimie_private.room_access(m.room_id) then raise exception '投稿にアクセスできません' using errcode='42501'; end if;
  select * into r from public.rooms where id=m.room_id for update;
  if r.status='resolved' then raise exception '解決済みの話題を再開してください'; end if;
  insert into public.rooms(project_id,title,participant_ids,audience_key,parent_id,origin_message_id,created_by)
  values(r.project_id,left(m.body,80),r.participant_ids,r.audience_key,r.id,m.id,me)
  on conflict(origin_message_id) where origin_message_id is not null do update set origin_message_id=excluded.origin_message_id returning id into result_id;
  return public.kimie_command('send_message',jsonb_build_object('room_id',result_id,'body',payload->>'body','client_id',payload->>'client_id'));
 elsif action='send_message' then
  select * into r from public.rooms where id=(payload->>'room_id')::uuid for update;
  if not found or not kimie_private.room_access(r.id) then raise exception '会話にアクセスできません' using errcode='42501'; end if;
  -- A retry after a network timeout returns the original message, including when the room was subsequently resolved.
  select * into m from public.messages where author_id=me and client_id=(payload->>'client_id')::uuid;
  if found then
   if m.room_id<>r.id or m.body<>trim(payload->>'body') then raise exception '再送内容が一致しません'; end if;
   return jsonb_build_object('id',m.id,'room_id',m.room_id);
  end if;
  if r.status='resolved' then raise exception '解決済みの話題を再開してください'; end if;
  txt=trim(payload->>'body');
  insert into public.messages(room_id,author_id,body,client_id) values(r.id,me,txt,(payload->>'client_id')::uuid) returning * into m;
  k=case when txt~'(不要|しないで|しなくて|必要ありません|参考まで|共有のみ)' then null
   when txt~'(返答待ち|回答待ち|連絡待ち|確認待ち|返事待ち)' then 'waiting'
   when txt~'(お願い|してください|して下さい|してもら|確認します|作成します|対応します|教えて)' then 'todo'
   when txt~'(相談|どう思|どうしま|検討したい|悩んで)' then 'discussion' else null end;
  d=case when txt~'明後日' then (now() at time zone 'Asia/Tokyo')::date+2 when txt~'明日' then (now() at time zone 'Asia/Tokyo')::date+1 when txt~'今日' then (now() at time zone 'Asia/Tokyo')::date else null end;
  if k is not null and (r.parent_id is null or not exists(select 1 from public.tasks where room_id=r.id)) then
   insert into public.tasks(room_id,message_id,title,kind,due,updated_by) values(r.id,m.id,left(txt,160),k,d,me) on conflict(message_id) do nothing;
  end if;
  return jsonb_build_object('id',m.id,'room_id',r.id);
 elsif action='task_from_message' then
  select * into m from public.messages where id=(payload->>'message_id')::uuid;
  if not found or not kimie_private.room_access(m.room_id) then raise exception '投稿にアクセスできません' using errcode='42501'; end if;
  insert into public.tasks(room_id,message_id,title,review,updated_by) values(m.room_id,m.id,left(m.body,160),false,me)
  on conflict(message_id) do update set dismissed=false,version=public.tasks.version+1,updated_by=me,updated_at=now() returning id into result_id;
  update public.rooms set status='open' where id=m.room_id and status='resolved';
  return jsonb_build_object('id',result_id);
 elsif action='save_task' then
  select * into t from public.tasks where id=(payload->>'id')::uuid;
  if found then perform 1 from public.rooms where id=t.room_id for update; end if;
  select * into t from public.tasks where id=(payload->>'id')::uuid for update;
  if not found or not kimie_private.room_access(t.room_id) then raise exception 'Todoにアクセスできません' using errcode='42501'; end if;
  if t.version is distinct from (payload->>'version')::integer then raise exception '他のユーザーが更新しました。最新の内容を開き直してください' using errcode='40001'; end if;
  select * into r from public.rooms where id=t.room_id;
  perform kimie_private.validate_task(payload,r.participant_ids);
  new_done=coalesce((payload->>'done')::boolean,false);
  if new_done and exists(select 1 from jsonb_array_elements(payload->'subtasks') s where (s->>'done')::boolean=false) then raise exception '未完了の小タスクがあります'; end if;
  update public.tasks set title=trim(payload->>'title'),kind=payload->>'kind',due=nullif(payload->>'due','')::date,start_date=nullif(payload->>'start_date','')::date,
   assignee_ids=array(select distinct value::uuid from jsonb_array_elements_text(payload->'assignee_ids')),waiting_reason=coalesce(payload->>'waiting_reason',''),notes=coalesce(payload->>'notes',''),priority=coalesce(payload->>'priority','normal'),
   subtasks=payload->'subtasks',done=new_done,dismissed=coalesce((payload->>'dismissed')::boolean,false),review=false,version=version+1,updated_by=me,updated_at=now() where id=t.id;
  if not new_done and not coalesce((payload->>'dismissed')::boolean,false) then update public.rooms set status='open' where id=r.id and status='resolved'; end if;
  return jsonb_build_object('id',t.id);
 elsif action='room_status' then
  select * into r from public.rooms where id=(payload->>'id')::uuid for update;
  if not found or not kimie_private.room_access(r.id) then raise exception '会話にアクセスできません' using errcode='42501'; end if;
  if r.parent_id is null then raise exception '案件チャットは解決済みにできません'; end if;
  if payload->>'status'='resolved' and exists(select 1 from public.tasks where room_id=r.id and not done and not dismissed) then raise exception '未完了のTodoがあります'; end if;
  update public.rooms set status=payload->>'status' where id=r.id;
  return jsonb_build_object('id',r.id);
 end if;
 raise exception '未対応の操作です';
end;
$$;
revoke all on all functions in schema kimie_private from public,anon,authenticated;
grant execute on function kimie_private.member(uuid),kimie_private.admin(uuid),kimie_private.project_access(uuid),kimie_private.room_access(uuid),kimie_private.peer(uuid) to authenticated;
revoke all on function public.kimie_command(text,jsonb) from public,anon;
grant execute on function public.kimie_command(text,jsonb) to authenticated;
commit;
