// Local integration fixture ONLY. Binds loopback, never used by the production build or deployment.
import {PGlite} from '@electric-sql/pglite';
import {build} from 'esbuild';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
const pg=new PGlite();
const actors={owner:{id:'10000000-0000-4000-8000-000000000001',email:'owner@example.test',name:'佐藤（管理者）'},client:{id:'10000000-0000-4000-8000-000000000002',email:'client@example.test',name:'田中様'}};
await pg.exec(`create role anon nologin;create role authenticated nologin;create schema auth;grant usage on schema public,auth to authenticated,anon;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
await pg.exec(await readFile('supabase/migrations/202609300001_workspace.sql','utf8'));
async function as(actor,fn){await pg.query("select set_config('request.jwt.claim.sub',$1,false)",[actor.id]);await pg.exec('set role authenticated');try{return await fn();}finally{await pg.exec('reset role');}}
async function rpc(action,payload){return (await pg.query('select public.kimie_command($1,$2) as result',[action,JSON.stringify(payload)])).rows[0].result;}
for(const a of Object.values(actors)){await pg.query('insert into auth.users values($1,$2,now())',[a.id,a.email]);await as(a,()=>rpc('profile',{name:a.name}));}
const ws=await as(actors.owner,()=>rpc('create_workspace',{name:'KIMIE 動作検証'}));
const project=await as(actors.owner,()=>rpc('create_project',{workspace_id:ws.id,name:'田中邸 リノベーション'}));
await as(actors.owner,()=>rpc('invite',{workspace_id:ws.id,email:actors.client.email,category:'client',project_ids:[project.id]}));await as(actors.client,()=>rpc('accept_invitations',{}));
const chat=await as(actors.owner,()=>rpc('start_chat',{project_id:project.id,participant_ids:[actors.client.id],name:'田中様との連絡',body:'明日までに床材のサンプルを確認してください。',client_id:crypto.randomUUID()}));
const bundle=await build({entryPoints:['src/app.mjs'],bundle:true,format:'esm',target:'es2022',write:false,define:{__SUPABASE_URL__:JSON.stringify('http://127.0.0.1:8766'),__SUPABASE_KEY__:JSON.stringify('sb_publishable_local_test_fixture')}});
const assets={'/':await readFile('index.html'),'/portal.css':await readFile('portal.css'),'/portal.mjs':await readFile('portal.mjs'),'/apps.mjs':await readFile('apps.mjs'),'/chat-todo/':await readFile('src/index.html'),'/chat-todo/index.html':await readFile('src/index.html'),'/chat-todo/app.js':bundle.outputFiles[0].contents,'/chat-todo/styles.css':await readFile('styles.css'),'/chat-todo/production.css':await readFile('src/production.css')};
const token=a=>Buffer.from(JSON.stringify({alg:'none'})).toString('base64url')+'.'+Buffer.from(JSON.stringify({sub:a.id,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')+'.fixture';
const session=a=>({access_token:token(a),refresh_token:a.id,expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user:{...a,aud:'authenticated',role:'authenticated',email_confirmed_at:new Date().toISOString()}});
let queue=Promise.resolve();
createServer((req,res)=>{queue=queue.then(async()=>{const url=new URL(req.url,'http://localhost');res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');const send=(code,data)=>{res.writeHead(code);res.end(JSON.stringify(data));};
 try{
 if(assets[url.pathname]){res.setHeader('Content-Type',/\.m?js$/.test(url.pathname)?'text/javascript':url.pathname.endsWith('.css')?'text/css':'text/html');res.end(assets[url.pathname]);return;}
 let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>150000)throw Error('Request too large');}const body=raw?JSON.parse(raw):{};
 const actor=Object.values(actors).find(a=>req.headers.authorization==='Bearer '+token(a));
 // Compare the fixture JWT's subject; its time component changes each second.
 let selected;try{const sub=JSON.parse(Buffer.from(req.headers.authorization?.split(' ')[1].split('.')[1],'base64url')).sub;selected=Object.values(actors).find(a=>a.id===sub);}catch{}
 if(url.pathname==='/auth/v1/otp'){send(200,{});return;}
 if(url.pathname==='/auth/v1/verify'){const a=Object.values(actors).find(a=>a.email===body.email);if(!a||body.token!=='123456'){send(403,{message:'コードが無効です',code:'otp_expired'});return;}send(200,session(a));return;}
 if(url.pathname==='/auth/v1/token'){const a=Object.values(actors).find(a=>a.id===body.refresh_token);send(a?200:401,a?session(a):{});return;}
 if(url.pathname==='/auth/v1/user'){send(selected?200:401,selected?session(selected).user:{message:'Unauthorized'});return;}
 if(url.pathname==='/auth/v1/logout'){send(204,{});return;}
 if(!selected){send(401,{message:'Unauthorized'});return;}
 if(url.pathname==='/rest/v1/rpc/kimie_command'){send(200,await as(selected,()=>rpc(body.action,body.payload)));return;}
 const table=url.pathname.split('/').at(-1);if(!['profiles','workspaces','members','projects','project_members','invitations','rooms','messages','tasks'].includes(table)){send(404,{});return;}
 const values=[],conditions=[];for(const [key,value] of url.searchParams){if(['select','order','limit','offset','or'].includes(key))continue;if(!/^[a-z_]+$/.test(key))throw Error('invalid column');if(value.startsWith('eq.')){values.push(value.slice(3));conditions.push(`${key}=$${values.length}`);}else if(value.startsWith('in.(')){const items=value.slice(4,-1).split(',');values.push(items);conditions.push(`${key}=any($${values.length}::uuid[])`);}else if(value.startsWith('ilike.')){values.push(value.slice(6));conditions.push(`${key} ilike $${values.length}`);}}
 const order=(url.searchParams.get('order')||'').split(',').filter(Boolean).map(v=>{const [k,d]=v.split('.');if(!/^[a-z_]+$/.test(k))throw Error('invalid order');return k+(d==='desc'?' desc':' asc');}).join(',');
 const limit=Math.min(Number(url.searchParams.get('limit')||500),500),offset=Number(url.searchParams.get('offset')||0);if(!Number.isInteger(limit)||!Number.isInteger(offset))throw Error('invalid range');
 const result=await as(selected,()=>pg.query(`select * from public.${table}${conditions.length?' where '+conditions.join(' and '):''}${order?' order by '+order:''} limit ${limit} offset ${offset}`,values));send(200,result.rows.map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['due','start_date'].includes(key)&&value?new Date(value).toISOString().slice(0,10):value]))));
 }catch(e){send(400,{message:e.message,code:e.code||'P0001'});}
 }).catch(()=>res.end());}).listen(8766,'127.0.0.1',()=>console.log('LOCAL TEST FIXTURE http://127.0.0.1:8766 — owner@example.test / client@example.test, code 123456. No real email is sent.'));
