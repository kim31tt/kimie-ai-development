import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const sql=await readFile(new URL('../supabase/migrations/202609300001_workspace.sql',import.meta.url),'utf8');
const ids={owner:'00000000-0000-4000-8000-000000000001',staff:'00000000-0000-4000-8000-000000000002',client:'00000000-0000-4000-8000-000000000003',partner:'00000000-0000-4000-8000-000000000004',stranger:'00000000-0000-4000-8000-000000000005',unverified:'00000000-0000-4000-8000-000000000006'};
let db;
async function as(user,fn){await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub','${ids[user]||user}',false);`);try{return await fn();}finally{await db.exec('reset role');}}
async function rpc(action,payload={}){return (await db.query('select public.kimie_command($1,$2) as result',[action,JSON.stringify(payload)])).rows[0].result;}
async function select(table){return (await db.query(`select * from public.${table}`)).rows;}
const uuid=()=>crypto.randomUUID();
let workspace,project,privateChat,clientChat,partnerChat,task,otherWorkspace;
test.before(async()=>{
 db=new PGlite();
 await db.exec(`create role anon nologin;create role authenticated nologin;create schema auth;grant usage on schema public,auth to authenticated,anon;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 for(const [key,id] of Object.entries(ids))await db.query('insert into auth.users values($1,$2,$3)',[id,key+'@example.com',key==='unverified'?null:new Date().toISOString()]);
 await db.exec(sql);
 for(const key of ['owner','staff','client','partner','stranger'])await as(key,()=>rpc('profile',{name:key==='staff'||key==='client'?'同じ表示名':key}));
 workspace=await as('owner',()=>rpc('create_workspace',{name:'KIMIE'}));
 project=await as('owner',()=>rpc('create_project',{workspace_id:workspace.id,name:'田中邸'}));
 for(const [key,category] of [['staff','company'],['client','client'],['partner','partner']]){await as('owner',()=>rpc('invite',{workspace_id:workspace.id,email:key+'@example.com',category,project_ids:[project.id]}));await as(key,()=>rpc('accept_invitations'));}
 privateChat=await as('owner',()=>rpc('start_chat',{project_id:project.id,participant_ids:[ids.staff],body:'社内の仕入条件を相談したい',client_id:uuid()}));
 clientChat=await as('owner',()=>rpc('start_chat',{project_id:project.id,participant_ids:[ids.client],body:'明日までに図面を確認してください',client_id:uuid()}));
 partnerChat=await as('owner',()=>rpc('start_chat',{project_id:project.id,participant_ids:[ids.partner],body:'見積をお願いします',client_id:uuid()}));
 task=(await as('client',()=>select('tasks')))[0];
 otherWorkspace=await as('stranger',()=>rpc('create_workspace',{name:'別組織'}));
});
test.after(async()=>db?.close());
test('未ログイン・メール未確認・直接書き込みは拒否する',async()=>{
 await db.exec('set role anon');await assert.rejects(()=>select('messages'));await assert.rejects(()=>rpc('create_workspace',{name:'侵入'}));await db.exec('reset role');
 await as('unverified',()=>assert.rejects(()=>rpc('profile',{name:'未確認'}),/メール確認/));
 await as('client',()=>assert.rejects(()=>db.query('update public.members set role=\'admin\' where user_id=$1',[ids.client]),/permission denied/));
 await as('client',()=>assert.rejects(()=>db.exec("delete from public.tasks"),/permission denied/));
});
test('同名でもIDで区別し、施主に社内・取引先の会話とTodoを返さない',async()=>{
 await as('client',async()=>{assert.deepEqual((await select('rooms')).map(r=>r.id),[clientChat.room_id]);assert.equal((await select('messages')).length,1);assert.equal((await select('tasks')).length,1);assert.equal((await select('invitations')).length,0);assert.equal((await select('profiles')).filter(p=>p.display_name==='同じ表示名').length,2);});
 await as('partner',async()=>assert.deepEqual((await select('rooms')).map(r=>r.id),[partnerChat.room_id]));
 await as('stranger',async()=>{assert.equal((await select('messages')).length,0);assert.equal((await select('projects')).length,0);assert.deepEqual((await select('workspaces')).map(w=>w.id),[otherWorkspace.id]);});
});
test('別会話への投稿・タスク変更・権限操作をサーバーで拒否する',async()=>{
 await as('client',()=>assert.rejects(()=>rpc('send_message',{room_id:privateChat.room_id,body:'侵入',client_id:uuid()}),/アクセス/));
 await as('partner',()=>assert.rejects(()=>rpc('save_task',{...task,title:'侵入'}),/アクセス/));
 await as('client',()=>assert.rejects(()=>rpc('invite',{workspace_id:workspace.id,email:'x@example.com',category:'company'}),/管理者/));
 await as('stranger',()=>assert.rejects(()=>rpc('start_chat',{project_id:project.id,participant_ids:[ids.owner],body:'侵入',client_id:uuid()}),/アクセス/));
});
test('管理者でも参加者外の会話は閲覧できない',async()=>{
 const chat=await as('staff',()=>rpc('start_chat',{project_id:project.id,participant_ids:[ids.partner],body:'共同作業の相談',client_id:uuid()}));
 await as('owner',async()=>{assert.equal((await select('rooms')).some(r=>r.id===chat.room_id),false);await assert.rejects(()=>rpc('send_message',{room_id:chat.room_id,body:'閲覧できない',client_id:uuid()}),/アクセス/);});
});
test('参加者の並びが変わっても同じチャットを使い、再送は二重投稿しない',async()=>{
 const id=uuid(),body='再送確認';await as('client',async()=>{const first=await rpc('start_chat',{project_id:project.id,participant_ids:[ids.owner,ids.client],body,client_id:id});const second=await rpc('start_chat',{project_id:project.id,participant_ids:[ids.client,ids.owner],body,client_id:id});assert.equal(first.room_id,clientChat.room_id);assert.equal(first.id,second.id);assert.equal((await select('messages')).filter(m=>m.client_id===id).length,1);await assert.rejects(()=>rpc('send_message',{room_id:first.room_id,body:'異なる内容',client_id:id}),/再送内容/);});
});
test('招待の期限・取消・メール一致・他組織の案件IDを検証する',async()=>{
 await as('owner',()=>assert.rejects(()=>rpc('invite',{workspace_id:workspace.id,email:'stranger@example.com',category:'client',project_ids:[uuid()]}),/案件/));
 const inv=await as('owner',()=>rpc('invite',{workspace_id:workspace.id,email:'stranger@example.com',category:'client',project_ids:[]}));
 await db.query("update public.invitations set expires_at=now()-interval '1 day' where id=$1",[inv.id]);
 await as('stranger',()=>rpc('accept_invitations'));assert.equal((await db.query('select * from public.members where workspace_id=$1 and user_id=$2',[workspace.id,ids.stranger])).rows.length,0);
 const next=await as('owner',()=>rpc('invite',{workspace_id:workspace.id,email:'stranger@example.com',category:'client',project_ids:[]}));
 await as('owner',()=>rpc('revoke_invitation',{workspace_id:workspace.id,id:next.id}));await as('stranger',()=>rpc('accept_invitations'));assert.equal((await as('stranger',()=>select('workspaces'))).length,1);
});
test('小タスク・複数担当の保存、バージョン競合・日付・不正担当を検証する',async()=>{
 const sub={id:uuid(),title:'寸法確認',start_date:'2026-10-01',due:'2026-10-02',assignee_ids:[ids.client],done:false};
 await as('client',async()=>{const updated={...task,start_date:'2026-10-01',due:'2026-10-10',assignee_ids:[ids.owner,ids.client],subtasks:[sub],waiting_reason:'回答待ち'};await rpc('save_task',updated);await assert.rejects(()=>rpc('save_task',updated),/他のユーザー/);task=(await select('tasks')).find(t=>t.id===task.id);assert.equal(task.version,2);assert.equal(task.assignee_ids.length,2);
 await assert.rejects(()=>rpc('save_task',{...task,version:null}),/他のユーザー/);
 await assert.rejects(()=>rpc('save_task',{...task,assignee_ids:[ids.partner]}),/担当者/);
 await assert.rejects(()=>rpc('save_task',{...task,start_date:'2026-10-20'}),/着手予定日/);
 await assert.rejects(()=>rpc('save_task',{...task,done:true}),/未完了/);
 assert.equal((await select('tasks')).find(t=>t.id===task.id).version,2);
 });
});
test('話題の分岐は参加者を維持し、同じ元投稿から重複しない',async()=>{
 const a=await as('client',()=>rpc('branch',{message_id:clientChat.id,body:'仕様について相談したい',client_id:uuid()}));
 const b=await as('owner',()=>rpc('branch',{message_id:clientChat.id,body:'引き続き相談しましょう',client_id:uuid()}));assert.equal(a.room_id,b.room_id);
 const r=(await as('client',()=>select('rooms'))).find(r=>r.id===a.room_id);assert.deepEqual(r.participant_ids.slice().sort(),[ids.owner,ids.client].sort());
 await as('partner',()=>assert.rejects(()=>rpc('branch',{message_id:clientChat.id,body:'侵入',client_id:uuid()}),/アクセス/));
 await as('client',()=>assert.rejects(()=>rpc('room_status',{id:a.room_id,status:'resolved'}),/未完了/));
});
test('案件参加解除と組織参加解除は次のAPIアクセスから反映する',async()=>{
 await as('owner',()=>rpc('project_members',{workspace_id:workspace.id,project_id:project.id,user_ids:[ids.owner,ids.staff,ids.partner]}));
 await as('client',async()=>{assert.equal((await select('messages')).length,0);assert.equal((await select('tasks')).length,0);await assert.rejects(()=>rpc('send_message',{room_id:clientChat.room_id,body:'解除後',client_id:uuid()}),/アクセス/);});
 await as('owner',()=>rpc('remove_member',{workspace_id:workspace.id,user_id:ids.partner}));
 await as('partner',async()=>{assert.equal((await select('workspaces')).length,0);assert.equal((await select('messages')).length,0);});
 await as('owner',()=>assert.rejects(()=>rpc('remove_member',{workspace_id:workspace.id,user_id:ids.owner}),/所有者/));
});
