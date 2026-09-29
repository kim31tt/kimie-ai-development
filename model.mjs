export const GROUPS = {team:{label:'社内',short:'社内のみ',color:'purple',members:['あなた','佐藤']},client:{label:'施主',short:'社内 ＋ 施主',color:'blue',members:['あなた','佐藤','田中様']},partner:{label:'取引先',short:'社内 ＋ 取引先',color:'amber',members:['あなた','佐藤','山本']}};
export const STATUS = {open:'未解決',waiting:'返答待ち',resolved:'解決済み'};
export const uid = () => crypto.randomUUID();
export function day(offset=0,reference=new Date()){ const d=new Date(reference); d.setDate(d.getDate()+offset); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; }
export function visible(room,role){return role==='team'||room.group===role;}
export function extractRequests(text){return text.split(/\n|(?<=[。！？])/u).map(s=>s.trim()).filter(s=>s && !/^(よろしく)?お願い(します|いたします|できますか|できる|ね)[。！？?！]*$/.test(s) && !/(不要|しないで|必要ありません|なくて大丈夫|しなくていい|やらなくていい|しなくて大丈夫|完了しました|対応済み)/u.test(s) && /(お願い|ください|下さい|いただけますか|もらえますか|もらえる|くれる[？?]?|しておきます|やっておきます|確認するね|必要です|します[。！!]?\s*$|すること[。]?\s*$|TODO[:：]|ToDo[:：])/iu.test(s)).slice(0,5).map(s=>({title:s.replace(/^(TODO|ToDo)[:：]\s*/iu,'').slice(0,160),due:parseDue(s)}));}
export function parseDue(text,reference=new Date()){const base=new Date(reference);const relative=n=>day(n,base);if(text.includes('明後日'))return relative(2);if(text.includes('明日'))return relative(1);if(text.includes('今日')||text.includes('本日'))return relative(); const weekday=text.match(/(来週|今週)?([日月火水木金土])曜(?:日)?/);if(weekday){const target='日月火水木金土'.indexOf(weekday[2]),today=base.getDay();let offset=(target-today+7)%7;if(weekday[1]==='来週'){const monday=(today+6)%7;offset=7-monday+(target+6)%7;}return relative(offset);} const m=text.match(/(\d{1,2})[月/](\d{1,2})日?/);if(m){const y=base.getFullYear(),d=new Date(y,+m[1]-1,+m[2]);if(d.getMonth()===+m[1]-1&&d.getDate()===+m[2])return `${y}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;}return '';}
export function addMessage(state,roomId,text,auto=true){
  const room=state.rooms.find(r=>r.id===roomId);
  if(!room||!text.trim())return [];
  const topic=state.topics.find(t=>t.id===room.topicId);
  if(!topic||topic.status==='resolved')throw Error('解決済みの話題です。再開してから投稿してください。');
  const message={id:uid(),roomId,author:'あなた',text:text.trim(),at:new Date().toISOString()};
  state.messages.push(message);topic.updatedAt=message.at;
  if(topic.originMessageId){
    if(!auto||room.trackingDismissed)return [];
    const {task,created}=ensureConversationTask(state,room);
    if(task){if(!task.messageId||!state.messages.some(m=>m.id===task.messageId&&m.roomId===roomId))task.messageId=message.id;updateConversationTask(task,message,room);}
    return created?[task]:[];
  }
  const made=[];
  if(auto)for(const item of extractRequests(text)){
    if(state.tasks.some(t=>t.roomId===roomId&&t.title===item.title&&(!t.done||t.dismissed)))continue;
    const task={id:uid(),roomId,messageId:message.id,...item,assignee:detectAssignee(text,room)||'未割当',done:false,review:true};
    state.tasks.push(task);made.push(task);
  }
  return made;
}
export function resolveTopic(state,id){const rooms=state.rooms.filter(r=>r.topicId===id).map(r=>r.id);if(state.tasks.some(t=>rooms.includes(t.roomId)&&!t.done&&!t.dismissed))return false;state.topics.find(t=>t.id===id).status='resolved';return true;}
export function taskFromMessage(state,id){const m=state.messages.find(m=>m.id===id);if(!m)return null;const existing=state.tasks.find(t=>t.messageId===id);if(existing){existing.dismissed=false;const r=state.rooms.find(r=>r.id===existing.roomId);if(r.trackedTaskId===existing.id)r.trackingDismissed=false;return existing;}const task={id:uid(),roomId:m.roomId,messageId:id,title:m.text.slice(0,160),due:parseDue(m.text),assignee:'未割当',done:false,review:true};state.tasks.push(task);return task;}
export function seed(){const at=(n,h=10)=>`${day(n)}T${String(h).padStart(2,'0')}:00:00+09:00`;return {version:1,projects:[{id:'p1',name:'田中邸 リノベーション',tag:'住宅 / 設計・施工',initial:'T'},{id:'p2',name:'青山オフィス',tag:'オフィス / 内装計画',initial:'A'}],topics:[{id:'t1',projectId:'p1',title:'キッチンの仕様を決める',summary:'仕上げ・見積・納期を、ひとつの話題で。',status:'open',createdAt:at(-3),updatedAt:at(-1)},{id:'t2',projectId:'p1',title:'照明プランの確認',summary:'ダイニングの照明位置と器具の選定',status:'waiting',createdAt:at(-5),updatedAt:at(-2)},{id:'t3',projectId:'p1',title:'現地調査の日程',summary:'現場の寸法確認と写真撮影',status:'open',createdAt:at(-2),updatedAt:at(-1)},{id:'t4',projectId:'p1',title:'床材のサンプル選び',summary:'オークのナチュラル色で決定',status:'resolved',createdAt:at(-6),updatedAt:at(-1)},{id:'t5',projectId:'p2',title:'エントランスのサイン計画',summary:'来客を迎えるサインのデザイン',status:'open',createdAt:at(-1),updatedAt:at(-1)}],rooms:[{id:'r1',topicId:'t1',group:'client',name:'施主との相談'},{id:'r2',topicId:'t1',group:'partner',name:'取引先との調整'},{id:'r3',topicId:'t1',group:'team',name:'社内メモ'},{id:'r4',topicId:'t2',group:'client',name:'施主との相談'},{id:'r5',topicId:'t3',group:'partner',name:'取引先との調整'},{id:'r6',topicId:'t4',group:'client',name:'施主との相談'},{id:'r7',topicId:'t5',group:'team',name:'社内メモ'}],messages:[{id:'m1',roomId:'r2',author:'あなた',text:'キッチン天板は、施主様のご希望で人工大理石の明るい色を検討しています。\n候補のサンプルと、納期の目安を教えていただけますか？',at:at(-2,10)},{id:'m2',roomId:'r2',author:'山本',text:'承知しました。サンプルは2種類をご用意できます。\n納期は通常3週間ですが、在庫も確認します。',at:at(-2,11)},{id:'m3',roomId:'r2',author:'あなた',text:'ありがとうございます。比較用の見積書をお願いします。\nサンプルは現場で一緒に確認しましょう。',at:at(-1,14)},{id:'m4',roomId:'r1',author:'田中様',text:'キッチンは明るい雰囲気にしたいです。天板のサンプルを見て決められますか？',at:at(-2,9)},{id:'m5',roomId:'r1',author:'あなた',text:'はい、2種類のサンプルをご用意します。見比べながら一緒に決めましょう。',at:at(-1,10)},{id:'m6',roomId:'r3',author:'佐藤',text:'見積の内訳と仕入れ条件は、この社内メモで整理しましょう。施主向けには確定した提案だけをまとめます。',at:at(-1,11)},{id:'m7',roomId:'r4',author:'あなた',text:'ダイニングの照明プランをご確認ください。テーブル位置に合わせた2案です。',at:at(-2,10)},{id:'m8',roomId:'r5',author:'あなた',text:'現地調査の候補日を3つ教えてください。',at:at(-1,9)},{id:'m9',roomId:'r6',author:'田中様',text:'床材はオークのナチュラル色でお願いします。ありがとうございました。',at:at(-1,12)},{id:'m10',roomId:'r7',author:'あなた',text:'サインのラフ案を作成します。',at:at(-1,13)}],tasks:[{id:'d1',roomId:'r2',messageId:'m1',title:'天板サンプル2種類と納期を確認する',due:day(),assignee:'山本',done:false,review:false},{id:'d2',roomId:'r2',messageId:'m3',title:'比較用の見積書を用意する',due:day(2),assignee:'山本',done:false,review:true},{id:'d3',roomId:'r4',messageId:'m7',title:'照明プラン2案の返答を確認する',due:day(-1),assignee:'あなた',done:false,review:false},{id:'d4',roomId:'r5',messageId:'m8',title:'現地調査の候補日を3つ確認する',due:day(3),assignee:'あなた',done:false,review:false},{id:'d5',roomId:'r7',messageId:'m10',title:'エントランスサインのラフ案を作成',due:day(4),assignee:'佐藤',done:false,review:false}]};}

// Create an always-available chat for each audience, without requiring a topic form.
export function ensureProjectChats(state) {
  let changed = false;
  for (const project of state.projects) {
    const id = `general-${project.id}`;
    if (!state.topics.some(t => t.id === id)) {
      const now = new Date().toISOString();
      state.topics.push({id, projectId:project.id, title:'案件チャット', kind:'general', summary:'まずは、いつものように話しましょう。', status:'open', createdAt:now, updatedAt:now});
      changed = true;
    }
    for (const group of Object.keys(GROUPS)) {
      const roomId = `${id}-${group}`;
      if (!state.rooms.some(r => r.id === roomId)) {
        state.rooms.push({id:roomId, topicId:id, group, name:group==='team'?'社内の会話':`${GROUPS[group].label}との会話`});
        changed = true;
      }
    }
  }
  return changed;
}

// Fork only within the original audience; other audiences never inherit the quote.
export function branchConversation(state, messageId, text) {
  const source = state.messages.find(m => m.id === messageId);
  if (!source || !text.trim()) return null;
  const sourceRoom = state.rooms.find(r => r.id === source.roomId);
  const parent = state.topics.find(t => t.id === sourceRoom.topicId);
  let topic = state.topics.find(t => t.originMessageId === source.id);
  let room;
  if (!topic) {
    const now = new Date().toISOString();
    topic = {id:uid(),projectId:parent.projectId,title:source.text.replace(/\s+/g,' ').slice(0,42),summary:'会話から分かれた、続きのやりとり',originMessageId:source.id,status:'open',createdAt:now,updatedAt:now};
    room = {id:uid(),topicId:topic.id,group:sourceRoom.group,name:sourceRoom.name};
    state.topics.push(topic); state.rooms.push(room);
  } else {
    room = state.rooms.find(r=>r.topicId===topic.id && r.group===sourceRoom.group);
    topic.status = 'open';
  }
  const tracking=ensureConversationTask(state,room);
  const tasks = addMessage(state, room.id, text);
  if(tracking.created&&!tasks.includes(tracking.task))tasks.push(tracking.task);
  return {topic,room,tasks};
}

export function conversationTitle(state, topic, room) {
  const origin=state.messages.find(m=>m.id===topic.originMessageId);
  const originalRoom=origin&&state.rooms.find(r=>r.id===origin.roomId);
  return originalRoom && room && originalRoom.group!==room.group ? room.name : topic.title;
}

// A branch has one tracked task per audience room, rather than one per reply.
export function ensureConversationTask(state,room){
  if(room.trackingDismissed)return {task:null,created:false};
  let fresh=false;
  let task=state.tasks.find(t=>t.id===room.trackedTaskId);
  if(task)return {task,created:false};
  const topic=state.topics.find(t=>t.id===room.topicId);
  const origin=state.messages.find(m=>m.id===topic.originMessageId);
  const sourceRoom=origin&&state.rooms.find(r=>r.id===origin.roomId);
  const sameAudience=sourceRoom?.group===room.group;
  // Reuse a task made from the original request; retain its origin for navigation.
  task=sameAudience&&state.tasks.find(t=>t.messageId===origin.id&&!t.dismissed&&!t.conversationTask);
  if(task){task.originMessageId=origin.id;task.roomId=room.id;task.messageId=null;}
  else task=state.tasks.find(t=>t.roomId===room.id&&!t.dismissed);
  if(!task){
    task={id:uid(),roomId:room.id,messageId:null,originMessageId:sameAudience?origin?.id:null,title:(sameAudience?origin.text:room.name).replace(/\s+/g,' ').slice(0,160),due:'',assignee:'未割当',done:false,review:true};
    state.tasks.push(task);fresh=true;
  }
  task.conversationTask=true;task.relatedMessageIds=task.relatedMessageIds||[];
  room.trackedTaskId=task.id;
  if(fresh&&sameAudience&&!task.done)updateConversationTask(task,origin,room);
  return {task,created:true};
}
export function detectAssignee(text,room){
  const members=GROUPS[room.group].members;
  const matched=members.filter(name=>new RegExp(name+'(?:さん|様)?(?:に|へ|が|担当|[、,：:])').test(text)&&!new RegExp(name+'(?:さん|様)?(?:に|が)?(?:は)?(?:お願いしない|担当ではない)').test(text));
  return matched.length===1?matched[0]: /(?:私が|自分が|私に任せて)/.test(text)?'あなた':'';
}
export function completionSignal(text){
  if(/(?:まだ|未完了|未対応|していない|していません|できていない|終わっていない|してない|終わってない|ではない|ではありません|予定|これから|[?？])/.test(text))return false;
  return /(?:対応しました|対応済み|完了しました|完了です|確認できました|終わりました|終わった|済みました|送付しました)/.test(text);
}
export function updateConversationTask(task,message,room){
  if(task.dismissed||task.done)return;
  task.relatedMessageIds=task.relatedMessageIds||[];
  if(!task.relatedMessageIds.includes(message.id))task.relatedMessageIds.push(message.id);
  const due=/(?:じゃなく|ではなく|ではない|じゃない)/.test(message.text)?'':parseDue(message.text,new Date(message.at));
  const assignee=detectAssignee(message.text,room);
  const changed=[];
  if(due&&!task.manualFields?.due&&due!==task.due){task.due=due;changed.push('期限');}
  if(assignee&&!task.manualFields?.assignee&&assignee!==task.assignee){task.assignee=assignee;changed.push('担当');}
  if(completionSignal(message.text)){task.completionCandidate=true;task.completionMessageId=message.id;changed.push('完了候補');}
  if(changed.length){task.lastUpdate={messageId:message.id,fields:changed};task.review=true;}
}
export function dismissTask(state,id){
  const task=state.tasks.find(t=>t.id===id);if(!task)return;
  task.dismissed=true;task.completionCandidate=false;
  const room=state.rooms.find(r=>r.id===task.roomId);
  if(room.trackedTaskId===id)room.trackingDismissed=true;
}
export function restoreTracking(state,roomId){
  const room=state.rooms.find(r=>r.id===roomId);if(!room)return;
  room.trackingDismissed=false;
  const existing=state.tasks.find(t=>t.id===room.trackedTaskId);
  if(existing){existing.dismissed=false;return existing;}
  return ensureConversationTask(state,room).task;
}
