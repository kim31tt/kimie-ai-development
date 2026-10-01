export function publicConfig(env){
 const url=env.SUPABASE_URL||'',key=env.SUPABASE_PUBLISHABLE_KEY||'';
 if(!!url!==!!key)throw Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY');
 if(env.VERCEL_ENV==='production'&&(!url||!key))throw Error('Production deployment requires Supabase connection settings');
 if(url&&!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url))throw Error('SUPABASE_URL must be your HTTPS Supabase project URL');
 if(key){let allowed=key.startsWith('sb_publishable_');if(!allowed)try{allowed=JSON.parse(Buffer.from(key.split('.')[1],'base64url')).role==='anon';}catch{}
 if(!allowed)throw Error('Use a publishable/anon key, never a secret/service_role key');}
 return {url,key};
}
