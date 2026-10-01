import {createClient} from '@supabase/supabase-js';
export const configured=!!(__SUPABASE_URL__&&__SUPABASE_KEY__);
export const db=configured?createClient(__SUPABASE_URL__,__SUPABASE_KEY__,{auth:{flowType:'pkce',detectSessionInUrl:false,persistSession:true,autoRefreshToken:true}}):null;
export async function command(action,payload={}){
 const {data,error}=await db.rpc('kimie_command',{action,payload});if(error)throw error;return data;
}
export async function rows(table,filters={}){
 // Page explicitly instead of silently dropping rows at Supabase's default response limit.
 const result=[];for(let from=0;;from+=500){let q=db.from(table).select('*');for(const [k,v] of Object.entries(filters))q=Array.isArray(v)?q.in(k,v):q.eq(k,v);
 const key=table==='members'?'user_id':table==='project_members'?'user_id':'id';
 const {data,error}=await q.order(key).range(from,from+499);if(error)throw error;result.push(...data);if(data.length<500)return result;}
}
export async function loadWorkspace(workspaceId,projectId){
 const [members,projects,profiles]=await Promise.all([rows('members',{workspace_id:workspaceId}),rows('projects',{workspace_id:workspaceId}),rows('profiles')]);
 const selected=projects.some(p=>p.id===projectId)?projectId:projects[0]?.id;
 const [rooms,projectMembers]=selected?await Promise.all([rows('rooms',{project_id:selected}),rows('project_members',{project_id:selected})]):[[],[]];
 const tasks=[];
 // Limit URL length for large workspaces. RLS still applies to every query.
 for(let i=0;i<rooms.length;i+=50)tasks.push(...await rows('tasks',{room_id:rooms.slice(i,i+50).map(r=>r.id)}));
 return {members,projects,profiles,projectId:selected,rooms,projectMembers,tasks};
}
export async function loadMessages(roomId,before){
 let q=db.from('messages').select('*').eq('room_id',roomId).order('created_at',{ascending:false}).order('id',{ascending:false}).limit(100);
 if(before)q=q.or(`created_at.lt.${before.created_at},and(created_at.eq.${before.created_at},id.lt.${before.id})`);
 const {data,error}=await q;if(error)throw error;return data.reverse();
}
export async function searchMessages(roomIds,query){
 const terms=query.normalize('NFKC').trim().split(/\s+/).filter(Boolean);if(!terms.length)return [];
 const result=[];
 // Search server-side, escaped ILIKE wildcards, with paging; the database filters unauthorized rooms.
 for(let i=0;i<roomIds.length;i+=40){for(let from=0;;from+=200){let q=db.from('messages').select('*').in('room_id',roomIds.slice(i,i+40));for(const term of terms)q=q.ilike('body','%'+term.replace(/[\\%_]/g,'\\$&')+'%');const {data,error}=await q.order('created_at',{ascending:false}).order('id').range(from,from+199);if(error)throw error;result.push(...data);if(data.length<200)break;}}
 return result.sort((a,b)=>b.created_at.localeCompare(a.created_at));
}
