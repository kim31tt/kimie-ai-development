import './build.mjs';
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
const allowed={'/':'index.html','/index.html':'index.html','/app.js':'app.js','/styles.css':'styles.css','/production.css':'production.css'};
createServer(async(req,res)=>{const path=allowed[new URL(req.url,'http://localhost').pathname];if(!path){res.writeHead(404).end();return;}try{const data=await readFile('dist/'+path);res.setHeader('Content-Type',path.endsWith('.js')?'text/javascript':path.endsWith('.css')?'text/css':'text/html');res.setHeader('Cache-Control','no-store');res.end(data);}catch{res.writeHead(500).end();}}).listen(8766,'127.0.0.1',()=>console.log('KIMIE: http://127.0.0.1:8766'));
