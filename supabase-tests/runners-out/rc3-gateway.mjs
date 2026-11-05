import http from 'node:http'
const routes=[['/auth/v1',55499],['/rest/v1',55430]]
const server=http.createServer((req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:3001');res.setHeader('Access-Control-Allow-Headers','authorization,apikey,content-type,x-client-info,prefer,accept-profile,content-profile,x-supabase-api-version');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,PATCH,DELETE,OPTIONS');
 if(req.method==='OPTIONS'){res.writeHead(204);res.end();return}
 const url=new URL(req.url,'http://127.0.0.1');const route=routes.find(([prefix])=>url.pathname===prefix||url.pathname.startsWith(prefix+'/'));
 if(!route){res.writeHead(404);res.end('Local integration gateway: unsupported route');return}
 const headers={...req.headers,host:'127.0.0.1:'+route[1]};delete headers.connection;
 const upstream=http.request({hostname:'127.0.0.1',port:route[1],path:(url.pathname.slice(route[0].length)||'/')+url.search,method:req.method,headers},r=>{res.writeHead(r.statusCode,{...r.headers,'access-control-allow-origin':'http://127.0.0.1:3001'});r.pipe(res)});
 upstream.on('error',()=>{if(!res.headersSent)res.writeHead(502);res.end('Local service unavailable')});req.pipe(upstream)
});server.listen(55421,'127.0.0.1',()=>console.log('Local-only gateway listening on 127.0.0.1:55421; only loopback Auth/REST routes enabled.'))
