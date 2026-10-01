import test from 'node:test';
import assert from 'node:assert/strict';
import {publicConfig} from '../scripts/config.mjs';
test('本番は接続先必須、片方だけの設定と秘密鍵を拒否する',()=>{
 assert.throws(()=>publicConfig({VERCEL_ENV:'production'}),/requires/);
 assert.throws(()=>publicConfig({SUPABASE_URL:'https://test.supabase.co'}),/both/);
 const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_PUBLISHABLE_KEY:'sb_secret_test'};
 assert.throws(()=>publicConfig(env),/never a secret/);
 env.SUPABASE_PUBLISHABLE_KEY='a.'+Buffer.from(JSON.stringify({role:'service_role'})).toString('base64url')+'.b';assert.throws(()=>publicConfig(env),/never a secret/);
 env.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';assert.equal(publicConfig(env).url,env.SUPABASE_URL);
 env.SUPABASE_URL='https://unrelated.example';assert.throws(()=>publicConfig(env),/project URL/);
 assert.deepEqual(publicConfig({}),{url:'',key:''});
});
