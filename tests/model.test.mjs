import test from 'node:test';
import assert from 'node:assert/strict';
import {seed,addMessage,resolveTopic,taskFromMessage,visible,day,extractRequests,parseDue} from '../model.mjs';
test('依頼からTodoを作り、元の会話と投稿を保持する',()=>{const s=seed();let tasks=addMessage(s,'r2','明日までに見積をお願いします。');assert.equal(tasks.length,1);assert.equal(tasks[0].due,day(1));assert.equal(tasks[0].roomId,'r2');assert.equal(tasks[0].review,true);assert.equal(s.messages.at(-1).id,tasks[0].messageId);assert.equal(tasks[0].assignee,'未割当');});
test('同じ会話で同一の未完了依頼は重複させず、送り先が異なれば別Todoにする',()=>{const s=seed();assert.equal(addMessage(s,'r2','図面を確認してください').length,1);assert.equal(addMessage(s,'r2','図面を確認してください').length,0);assert.equal(addMessage(s,'r1','図面を確認してください').length,1);});
test('依頼ではない文章・否定・自動生成オフではTodoを作らない',()=>{const s=seed();assert.deepEqual(extractRequests('ありがとうございます。対応は不要です。'),[]);assert.equal(addMessage(s,'r2','確認してください',false).length,0);assert.equal(addMessage(s,'r2','確認しないでください。').length,0);});
test('手動Todo化は元メッセージを保持し、二重作成しない',()=>{const s=seed();let t=taskFromMessage(s,'m2');assert.equal(t.messageId,'m2');assert.equal(t.roomId,'r2');assert.equal(taskFromMessage(s,'m2').id,t.id);});
test('施主と取引先のプレビューでは互いの会話と社内会話を表示しない',()=>{const s=seed();assert.deepEqual(s.rooms.filter(r=>visible(r,'client')).map(r=>r.id),['r1','r4','r6']);assert.deepEqual(s.rooms.filter(r=>visible(r,'partner')).map(r=>r.id),['r2','r5']);assert.equal(s.rooms.filter(r=>visible(r,'team')).length,s.rooms.length);});
test('未完了Todoがある話題は解決できず、完了後に解決できる',()=>{const s=seed();assert.equal(resolveTopic(s,'t1'),false);s.tasks.filter(t=>['r1','r2','r3'].includes(t.roomId)).forEach(t=>t.done=true);assert.equal(resolveTopic(s,'t1'),true);assert.throws(()=>addMessage(s,'r1','新しい依頼をお願いします'));});
test('期限表現と不正な日付を扱える',()=>{assert.equal(parseDue('明後日まで'),day(2));assert.equal(parseDue('本日まで'),day());assert.equal(parseDue('2/31まで'),'');});
test('保存して再読込しても関連付けが維持される',()=>{const s=seed();const [t]=addMessage(s,'r3','明日までに原価を確認してください');const loaded=JSON.parse(JSON.stringify(s));assert.equal(loaded.tasks.find(x=>x.id===t.id).roomId,'r3');assert.equal(loaded.messages.find(x=>x.id===t.messageId).text,'明日までに原価を確認してください');});

import {ensureProjectChats,branchConversation} from '../model.mjs';
test('案件には事前の話題作成なしで投稿できるチャットが用意される',()=>{const s=seed();const old=JSON.stringify(s.messages);assert.equal(ensureProjectChats(s),true);assert.equal(ensureProjectChats(s),false);assert.equal(JSON.stringify(s.messages),old);for(const p of s.projects){const rooms=s.rooms.filter(r=>r.topicId===`general-${p.id}`);assert.equal(rooms.length,3);}assert.equal(addMessage(s,'general-p1-team','明日までに図面を確認してもらえる？').length,1);});
test('日常会話はTodoを作らず、会話を継続できる',()=>{const s=seed();ensureProjectChats(s);const n=s.tasks.length;addMessage(s,'general-p1-team','おはようございます');addMessage(s,'general-p1-team','今日の現場はどんな感じですか？');assert.equal(s.tasks.length,n);});
test('投稿から分岐すると元の送り先を維持し、同じ投稿からは同じ会話を継続する',()=>{const s=seed();ensureProjectChats(s);const a=branchConversation(s,'m2','詳細を確認しておきます');assert.equal(a.room.group,'partner');assert.equal(a.topic.originMessageId,'m2');assert.equal(a.tasks.length,1);assert.equal(visible(a.room,'client'),false);const b=branchConversation(s,'m2','ありがとうございます');assert.equal(b.room.id,a.room.id);assert.equal(b.topic.id,a.topic.id);assert.equal(b.tasks.length,0);});
test('分岐するまで新しい話題は不要で、空の返信では作成されない',()=>{const s=seed();const n=s.topics.length;assert.equal(branchConversation(s,'m2','  '),null);assert.equal(s.topics.length,n);});

import {conversationTitle} from '../model.mjs';
test('別の送り先には分岐元の投稿から作られたタイトルを表示しない',()=>{const s=seed();const b=branchConversation(s,'m6','詳細を確認します');const clientRoom={id:'client-branch',topicId:b.topic.id,group:'client',name:'施主への提案'};s.rooms.push(clientRoom);assert.equal(conversationTitle(s,b.topic,clientRoom),'施主への提案');assert.equal(conversationTitle(s,b.topic,b.room),b.topic.title);});
test('単独のあいさつや依頼不要の返事をTodoにしない',()=>{assert.deepEqual(extractRequests('よろしくお願いします。'),[]);assert.deepEqual(extractRequests('確認しなくていいです。'),[]);});

import {dismissTask,restoreTracking,completionSignal} from '../model.mjs';
test('依頼表現のない会話もフォローに登録し、返信は同じ1件を更新',()=>{const s=seed();const b=branchConversation(s,'m4','明るい色も良さそうですね');assert.equal(b.tasks.length,1);const t=s.tasks.find(t=>t.id===b.room.trackedTaskId);assert.equal(t.title,s.messages.find(m=>m.id==='m4').text);const count=s.tasks.length;addMessage(s,b.room.id,'明日までにお願いします。佐藤さんにお願い');assert.equal(s.tasks.length,count);assert.equal(t.due,day(1));assert.equal(t.assignee,'佐藤');assert.equal(t.relatedMessageIds.length,3);});
test('分岐元の投稿に既にTodoがあれば引き継ぎ、重複させない',()=>{const s=seed();const n=s.tasks.length;const b=branchConversation(s,'m3','山本さんにお願い。明後日までに');assert.equal(s.tasks.length,n);assert.equal(b.room.trackedTaskId,'d2');const t=s.tasks.find(t=>t.id==='d2');assert.equal(t.originMessageId,'m3');assert.equal(t.due,day(2));assert.equal(t.messageId,s.messages.at(-1).id);});
test('解除したTodoは返信や再読込で復活せず、明示的に戻せる',()=>{const s=seed();const b=branchConversation(s,'m4','検討しましょう');const id=b.room.trackedTaskId;dismissTask(s,id);let copy=JSON.parse(JSON.stringify(s));addMessage(copy,b.room.id,'明日までにお願いします');assert.equal(copy.tasks.find(t=>t.id===id).dismissed,true);assert.equal(copy.tasks.filter(t=>t.roomId===b.room.id).length,1);restoreTracking(copy,b.room.id);addMessage(copy,b.room.id,'明後日までにお願いします');assert.equal(copy.tasks.find(t=>t.id===id).due,day(2));});
test('完了候補は自動完了せず、否定・疑問・予定では候補を作らない',()=>{const s=seed();const b=branchConversation(s,'m4','検討しましょう');const t=s.tasks.find(t=>t.id===b.room.trackedTaskId);for(const txt of ['まだ対応していません','対応しましたか？','完了しましたと伝える予定です']){assert.equal(completionSignal(txt),false);addMessage(s,b.room.id,txt);assert.notEqual(t.completionCandidate,true);}addMessage(s,b.room.id,'対応しました');assert.equal(t.completionCandidate,true);assert.equal(t.done,false);});
test('手動指定は自動更新で上書きせず、別の送り先の発言も混ぜない',()=>{const s=seed();const b=branchConversation(s,'m4','検討しましょう');const t=s.tasks.find(t=>t.id===b.room.trackedTaskId);Object.assign(t,{due:day(5),assignee:'あなた',manualFields:{due:true,assignee:true}});addMessage(s,b.room.id,'明日までに佐藤さんにお願い');assert.equal(t.due,day(5));assert.equal(t.assignee,'あなた');addMessage(s,'r2','山本さんにお願い。明日までに');assert.equal(t.assignee,'あなた');});
test('解除済みTodoは話題の解決を妨げず、完了済みTodoは勝手に更新しない',()=>{const s=seed();const b=branchConversation(s,'m4','検討しましょう');const t=s.tasks.find(t=>t.id===b.room.trackedTaskId);t.done=true;const due=t.due;addMessage(s,b.room.id,'明日までにお願いします');assert.equal(t.due,due);dismissTask(s,t.id);assert.equal(resolveTopic(s,b.topic.id),true);});

import {trackingKind,classifyTracking,startConversation,relatedConversations} from '../model.mjs';
test('自然な相談・依頼・返答待ち・参考情報を区別する',()=>{
  for(const [text,kind] of [['この案はどうでしょう？','discussion'],['明日までに図面を確認してください','todo'],['先方に確認しています','waiting'],['返答を待っています','waiting'],['参考資料を共有します。対応不要です。','reference'],['参考資料をご確認ください','todo'],['おはようございます',''],['返答待ちではありません',''],['対応しました','']])assert.equal(classifyTracking(text),kind,text);
});
test('相談からTodo、返答待ちへ同じ項目を更新し、完了は候補に留める',()=>{
  const s=seed();const b=branchConversation(s,'m4','この案はどうでしょう？');const t=b.tasks[0];assert.equal(trackingKind(t),'discussion');
  const count=s.tasks.length;addMessage(s,b.room.id,'明日までに図面を確認してください');assert.equal(trackingKind(t),'todo');
  addMessage(s,b.room.id,'先方に確認しています');assert.equal(trackingKind(t),'waiting');
  addMessage(s,b.room.id,'対応しました');assert.equal(t.done,false);assert.equal(t.completionCandidate,true);assert.equal(s.tasks.length,count);
});
test('分類の手動指定は会話で上書きしない',()=>{
  const s=seed();const b=branchConversation(s,'m4','相談したいです');const t=b.tasks[0];t.kind='discussion';t.manualFields={kind:true};
  addMessage(s,b.room.id,'明日までにお願いします');assert.equal(trackingKind(t),'discussion');assert.equal(t.due,day(1));
});
test('参考共有だけではフォローを増やさず、その後の依頼から追跡する',()=>{
  const s=seed();ensureProjectChats(s);const n=s.tasks.length;addMessage(s,'general-p1-team','参考資料を共有します。対応不要です。');
  assert.equal(s.tasks.length,n);const b=branchConversation(s,s.messages.at(-1).id,'ありがとうございます');assert.equal(b.tasks.length,0);
  addMessage(s,b.room.id,'図面を確認してください');assert.equal(s.tasks.length,n+1);assert.equal(trackingKind(s.tasks.at(-1)),'todo');assert.equal(s.tasks.at(-1).title,'図面を確認してください');
});
test('別の相手には作成した文章だけを渡し、元の本文・タイトル・Todoを転送しない',()=>{
  const s=seed();const before=JSON.stringify(s.messages);const b=startConversation(s,{projectId:'p1',group:'client',text:'照明の候補を相談したいです',sourceMessageId:'m6'});
  assert.equal(b.room.group,'client');assert.equal(b.topic.originMessageId,undefined);assert.equal(b.topic.relatedSourceMessageId,'m6');
  assert.equal(b.topic.title,'照明の候補を相談したいです');assert.equal(b.tasks[0].title,b.topic.title);assert.equal(trackingKind(b.tasks[0]),'discussion');
  assert.deepEqual(s.messages.filter(m=>m.roomId===b.room.id).map(m=>m.text),['照明の候補を相談したいです']);
  assert.equal(JSON.stringify(s.messages.slice(0,-1)),before);assert.equal(conversationTitle(s,b.topic,b.room),b.topic.title);
  assert.equal(relatedConversations(s,b.topic.id,'client').length,0);assert.equal(relatedConversations(s,b.topic.id,'partner').length,0);assert.ok(relatedConversations(s,b.topic.id,'team').some(t=>t.id==='t1'));
  assert.ok(relatedConversations(s,'t1','team').some(t=>t.id===b.topic.id));
});
test('新しい会話は送り先・案件・本文を検証し、別案件への関連付けを拒否する',()=>{
  const s=seed(),before=JSON.stringify(s);
  for(const args of [{projectId:'p1',group:'invalid',text:'test'},{projectId:'p1',group:'team',text:' '},{projectId:'missing',group:'team',text:'test'},{projectId:'p2',group:'client',text:'test',sourceMessageId:'m6'}])assert.equal(startConversation(s,args),null);
  assert.equal(JSON.stringify(s),before);
});
test('相手を選んだ会話も返信で同じ項目を更新し、保存・復元後も関連を保つ',()=>{
  const s=seed();const b=startConversation(s,{projectId:'p1',group:'partner',text:'山本さんに図面の確認をお願いします',sourceMessageId:'m6'});
  const copy=JSON.parse(JSON.stringify(s));const t=copy.tasks.find(t=>t.id===b.tasks[0].id);const n=copy.tasks.length;
  addMessage(copy,b.room.id,'返答を待っています');assert.equal(copy.tasks.length,n);assert.equal(trackingKind(t),'waiting');assert.equal(t.assignee,'山本');
  assert.ok(relatedConversations(copy,b.topic.id,'team').some(t=>t.id==='t1'));
});
test('旧データのTodoと会話本文を保ったまま、宛先表示だけを更新する',()=>{
  const s=seed();ensureProjectChats(s);s.rooms.find(r=>r.id==='general-p1-client').name='施主との会話';
  const tasks=JSON.stringify(s.tasks),messages=JSON.stringify(s.messages);ensureProjectChats(s);
  assert.equal(s.rooms.find(r=>r.id==='general-p1-client').name,'田中様との連絡');assert.equal(JSON.stringify(s.tasks),tasks);assert.equal(JSON.stringify(s.messages),messages);assert.equal(trackingKind(s.tasks[0]),'todo');
});
test('相談から具体化したTodoは依頼文を表題にし、その後の相談で未処理の依頼を降格しない',()=>{
  const s=seed();const b=startConversation(s,{projectId:'p1',group:'team',text:'玄関について相談したいです'});const t=b.tasks[0];
  addMessage(s,b.room.id,'明日までに図面を確認してください');assert.equal(t.title,'明日までに図面を確認してください');
  addMessage(s,b.room.id,'この案はどうでしょう？');assert.equal(trackingKind(t),'todo');assert.equal(t.title,'明日までに図面を確認してください');
});
