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
