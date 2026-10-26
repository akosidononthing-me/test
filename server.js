'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const port=Number(process.env.PORT)||3000;
const clients=new Map();
function send(res,code,data,type='application/json'){res.writeHead(code,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(type==='application/json'?JSON.stringify(data):data)}
function publish(to,msg){const c=clients.get(to);if(c){c.write(`data: ${JSON.stringify(msg)}\n\n`);return true}return false}
const server=http.createServer((req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(req.method==='GET'&&u.pathname==='/events'){
  const role=u.searchParams.get('role');if(!['admin','client'].includes(role))return send(res,400,{error:'Invalid role'});
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
  const old=clients.get(role);if(old)old.end();clients.set(role,res);
  res.write(`data: ${JSON.stringify({type:'ready',role})}\n\n`);
  publish(role==='admin'?'client':'admin',{type:'peer-online',role});
  const timer=setInterval(()=>res.write(': ping\n\n'),20000);
  req.on('close',()=>{clearInterval(timer);if(clients.get(role)===res){clients.delete(role);publish(role==='admin'?'client':'admin',{type:'peer-offline',role})}});return;
 }
 if(req.method==='POST'&&u.pathname==='/signal'){
  let data='';req.on('data',c=>{data+=c;if(data.length>100000){req.destroy()}});req.on('end',()=>{
   try{const m=JSON.parse(data);if(!['admin','client'].includes(m.from)||!['offer','answer','candidate','bye','hello'].includes(m.type))return send(res,400,{error:'Invalid signal'});
    const delivered=publish(m.from==='admin'?'client':'admin',m);send(res,200,{delivered});
   }catch{send(res,400,{error:'Invalid JSON'})}
  });return;
 }
 if(req.method==='GET'){
  const pages={'/':'admin.html','/admin':'admin.html','/client':'client.html','/common.js':'common.js'};
  const file=pages[u.pathname];if(!file)return send(res,404,{error:'Not found'});
  return fs.readFile(path.join(__dirname,'public',file),(err,b)=>err?send(res,500,{error:'Read error'}):send(res,200,b,file.endsWith('.js')?'application/javascript; charset=utf-8':'text/html; charset=utf-8'));
 }
 send(res,405,{error:'Method not allowed'});
});server.listen(port,'0.0.0.0',()=>console.log('OnTour camera test listening on '+port));
