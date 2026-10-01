import {publicConfig} from './config.mjs';
import {build} from 'esbuild';
import {mkdir,copyFile} from 'node:fs/promises';
import {loadEnvFile} from 'node:process';
try{loadEnvFile('.env.local');}catch(e){if(e.code!=='ENOENT')throw e;}
const {url,key}=publicConfig(process.env);
await mkdir('dist',{recursive:true});
await build({entryPoints:['src/app.mjs'],bundle:true,minify:true,format:'esm',target:'es2022',outfile:'dist/app.js',define:{__SUPABASE_URL__:JSON.stringify(url),__SUPABASE_KEY__:JSON.stringify(key)}});
await copyFile('styles.css','dist/styles.css');
await copyFile('src/production.css','dist/production.css');
await copyFile('src/index.html','dist/index.html');
console.log(url&&key?'Built with Supabase public connection settings.':'Built in setup-required mode. No sample data or login bypass is enabled.');
