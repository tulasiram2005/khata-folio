import express from 'express';
import { z } from 'zod';
import { createHmac } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { store, hash } from './store.js';
import { customers,day,proposal,draft,reconcile } from '../../packages/ledger.js';
const id=z.int().positive(), note=z.string().trim().min(1).max(160), customer=z.enum(customers);
export function appFor(s, secure=false){
 const app=express(), visits=new Map(), publicRoot=fileURLToPath(new URL('../web/',import.meta.url));
 app.disable('x-powered-by');
 app.use((req,res,next)=>{
   res.set({'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",'Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Permissions-Policy':'camera=(), microphone=(), geolocation=()'});
   if(secure)res.set('Strict-Transport-Security','max-age=31536000');
   next();
 });
 app.get('/healthz',(_,res)=>res.json({ok:true}));
 app.get('/readyz',(_,res)=>res.json({ok:!!s.db.prepare('SELECT 1').get()}));
 app.use('/api',(req,res,next)=>{
   res.set('Cache-Control','no-store');
   if(req.method==='POST' && (!req.is('application/json') || req.get('X-Khata')!=='1' || (req.get('origin') && new URL(req.get('origin')).host!==req.get('host'))))return res.status(403).json({error:'Use the same-origin app.'});
   const now=Date.now();
   for(const [key,bucket] of visits)if(bucket.until<=now)visits.delete(key);
   const key=req.socket.remoteAddress+(req.path==='/session'?' seed':' api');
   const b=visits.get(key)??{n:0,until:now+60000};visits.set(key,b);
   if(++b.n>(req.path==='/session'?20:900))return res.status(429).json({error:'Too many requests. Retry in a minute.'});
   next();
 });
 app.use(express.json({limit:'64kb'}));
 const cookie=req=>req.headers.cookie?.match(/(?:^|;\s*)folio=([\w-]{43})(?:;|$)/)?.[1];
 app.post('/api/session',(req,res)=>{
   let token=cookie(req);
   if(!token || !s.exists(hash(token))){
     if(s.db.prepare('SELECT count(*) AS n FROM shops').get().n>=250)return res.status(503).json({error:'Demo capacity reached. Retry after reset.'});
     token=s.seed();res.cookie('folio',token,{httpOnly:true,sameSite:'strict',secure,path:'/',maxAge:86400000});
   }
   res.json({ok:true});
 });
 const key=req=>z.uuid().parse(req.get('Idempotency-Key'));
 function scope(req){return s.active(z.string().regex(/^[\w-]{43}$/).parse(req.get('X-Statement')))}
 app.get('/api/statement',(req,res)=>res.json(s.statement(scope(req))));
 app.post('/api/attest',(req,res)=>{
   const sc=scope(req),p=z.strictObject({id,action:z.enum(['Confirmed','Disputed']),note:z.string().trim().max(160)}).parse(req.body);
   if(p.action==='Disputed' && !p.note)throw Error('Describe the discrepancy.');
   res.json(s.command(hash(req.get('X-Statement')),key(req),p,()=>s.attest(sc,p.id,p.action,p.note)));
 });
 app.use('/api',(req,res,next)=>{const t=cookie(req);if(!t||!s.exists(hash(t)))return res.status(401).json({error:'Open a demo book to continue.'});req.shop=hash(t);next()});
 app.get('/api/book',(req,res)=>res.json({...s.state(req.shop),customers}));
 app.post('/api/draft',(req,res)=>{const p=z.strictObject({text:note,date:day}).parse(req.body);res.json(draft(p.text,p.date))});
 app.post('/api/reconcile',(req,res)=>{const p=z.strictObject({csv:z.string().min(1).max(50000)}).parse(req.body);res.json(reconcile(p.csv,s.entries(req.shop)))});
 const actions=[
   ['post',proposal,(r,p)=>s.post(r.shop,p)],
   ['reverse',z.strictObject({id,date:day,note}),(r,p)=>s.reverse(r.shop,p.id,p.date,p.note)],
   ['close',z.strictObject({date:day}),(r,p)=>s.close(r.shop,p.date)],
   ['link',z.strictObject({customer}),(r,p)=>s.link(r.shop,p.customer,cookie(r),key(r))],
   ['revoke',z.strictObject({customer}),(r,p)=>s.revoke(r.shop,p.customer)]
 ];
 for(const [action,schema,fn] of actions)app.post('/api/'+action,(req,res)=>{
   const p=schema.parse(req.body),k=key(req);
   const result=s.command(req.shop,k,{action,p},()=>fn(req,p));
   if(action==='link')result.token=createHmac('sha256',cookie(req)).update(k).digest('base64url');
   res.json(result);
 });
 app.use(express.static(publicRoot));
 app.use((_,res)=>res.status(404).json({error:'Page unavailable.'}));
 app.use((err,req,res,next)=>{
   const message=err instanceof z.ZodError?'Check the fields and try again.':err.message;
   const internal=err.code?.startsWith('ERR_SQLITE');
   res.status(internal?500:err.status??400).json({error:internal?'Storage unavailable. Retry shortly.':message});
 });
 return app;
}
if(resolve(process.argv[1]??'')===fileURLToPath(import.meta.url)){
 const s=store(process.env.DB_PATH||'folio.sqlite');
 const server=appFor(s,process.env.RENDER==='true').listen(Number(process.env.PORT||4173),process.env.RENDER?'0.0.0.0':'127.0.0.1',()=>console.log('Khata Folio listening on port '+server.address().port));
 process.on('SIGTERM',()=>server.close(()=>{s.db.close();process.exit(0)}));
}
