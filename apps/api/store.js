import { DatabaseSync } from 'node:sqlite';
import { createHash,randomBytes,createHmac } from 'node:crypto';
import { customers,pair,day } from '../../packages/ledger.js';
export const hash=value=>createHash('sha256').update(value).digest('hex');
export const secret=()=>randomBytes(32).toString('base64url');
export const fail=message=>{throw new Error(message)};
export function store(filename=':memory:'){
  const db=new DatabaseSync(filename);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
  CREATE TABLE IF NOT EXISTS shops(id TEXT PRIMARY KEY,closed TEXT NOT NULL DEFAULT '',created INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS entries(id INTEGER PRIMARY KEY,shop TEXT NOT NULL REFERENCES shops(id),date TEXT NOT NULL,debit TEXT NOT NULL,credit TEXT NOT NULL CHECK(debit<>credit),amount INTEGER NOT NULL CHECK(typeof(amount)='integer' AND amount BETWEEN 1 AND 100000000),note TEXT NOT NULL,reversal INTEGER UNIQUE REFERENCES entries(id));
  CREATE INDEX IF NOT EXISTS entry_shop ON entries(shop,date,id);
  CREATE TRIGGER IF NOT EXISTS journal_edit BEFORE UPDATE ON entries BEGIN SELECT RAISE(ABORT,'Journal is immutable'); END;
  CREATE TRIGGER IF NOT EXISTS journal_delete BEFORE DELETE ON entries BEGIN SELECT RAISE(ABORT,'Journal is immutable'); END;
  CREATE TABLE IF NOT EXISTS commands(shop TEXT,key TEXT,fingerprint TEXT,result TEXT,PRIMARY KEY(shop,key));
  CREATE TABLE IF NOT EXISTS links(token TEXT PRIMARY KEY,shop TEXT,customer TEXT,expires INTEGER,revoked INTEGER DEFAULT 0);
  CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,shop TEXT,entry INTEGER,action TEXT,note TEXT,previous TEXT,digest TEXT);
  CREATE INDEX IF NOT EXISTS event_shop ON events(shop,id);`);
  const one=(sql,...p)=>db.prepare(sql).get(...p),all=(sql,...p)=>db.prepare(sql).all(...p),run=(sql,...p)=>db.prepare(sql).run(...p);
  function atomic(fn){db.exec('BEGIN IMMEDIATE');try{const v=fn();db.exec('COMMIT');return v}catch(e){db.exec('ROLLBACK');throw e}}
  function event(shop,entry,action,note){
    const previous=one('SELECT digest FROM events WHERE shop=? ORDER BY id DESC LIMIT 1',shop)?.digest??'';
    run('INSERT INTO events(shop,entry,action,note,previous,digest) VALUES(?,?,?,?,?,?)',shop,entry,action,note,previous,hash(JSON.stringify([shop,entry,action,note,previous])));
  }
  function insert(shop,e,reversal=null){
    const id=Number(run('INSERT INTO entries(shop,date,debit,credit,amount,note,reversal) VALUES(?,?,?,?,?,?,?)',shop,e.date,e.debit,e.credit,e.amount,e.note,reversal).lastInsertRowid);
    event(shop,id,reversal?'Reversed':'Posted',e.note); return id;
  }
  const entries=shop=>all('SELECT id,date,debit,credit,amount,note,reversal FROM entries WHERE shop=? ORDER BY date DESC,id DESC',shop);
  function seed(){
    return atomic(()=>{
      const token=secret(),shop=hash(token);run('INSERT INTO shops(id,created) VALUES(?,?)',shop,Date.now());
      const ids=[];
      for(let i=0;i<120;i++){
        const customer=customers[i%40],date=new Date(Date.UTC(2026,5,1)+Math.floor(i*1.45)*86400000).toISOString().slice(0,10);
        ids.push(insert(shop,pair({kind:i<40 || i%3?'Credit sale':'UPI receipt',customer,amount:3500+(i*73%900)*100,date,note:i<40 || i%3?'General provisions':'UPI settlement'})));
      }
      for(const i of [3,14,29])event(shop,ids[i],'Disputed','Please check the quantity.');
      for(const i of [8,16]){const e=one('SELECT * FROM entries WHERE id=?',ids[i]);insert(shop,{...e,date:'2026-11-22',debit:e.credit,credit:e.debit,note:'Duplicate delivery slip'},e.id)}
      return token;
    });
  }
  function command(shop,key,body,fn){
    return atomic(()=>{
      const fp=hash(JSON.stringify(body)),prior=one('SELECT * FROM commands WHERE shop=? AND key=?',shop,key);
      if(prior){if(prior.fingerprint!==fp)fail('This request key already belongs to another action.');return JSON.parse(prior.result)}
      const result=fn();run('INSERT INTO commands VALUES(?,?,?,?)',shop,key,fp,JSON.stringify(result));return result;
    });
  }
  const active=token=>one('SELECT shop,customer FROM links WHERE token=? AND revoked=0 AND expires>?',hash(token),Date.now())??fail('This link has expired or was revoked.');
  return {db,seed,entries,command,active,
    exists:shop=>!!one('SELECT id FROM shops WHERE id=?',shop),
    state(shop){return {entries:entries(shop),closed:one('SELECT closed FROM shops WHERE id=?',shop).closed,events:all('SELECT entry,action,note FROM events WHERE shop=? ORDER BY id',shop)}},
    post(shop,p){const e=pair(p);if(e.date<=this.state(shop).closed)fail('This period is closed.');return {id:insert(shop,e)}},
    reverse(shop,id,date,note){day.parse(date);const e=one('SELECT * FROM entries WHERE id=? AND shop=?',id,shop);if(!e || e.reversal || one('SELECT id FROM entries WHERE reversal=?',id))fail('Entry unavailable for reversal.');if(date<e.date || date<=this.state(shop).closed)fail('Choose an open date on or after the entry.');return {id:insert(shop,{...e,debit:e.credit,credit:e.debit,date,note},id)}},
    close(shop,date){day.parse(date);if(date<=this.state(shop).closed)fail('Choose a later closing date.');run('UPDATE shops SET closed=? WHERE id=?',date,shop);event(shop,0,'Closed',date);return {closed:date}},
    link(shop,customer,token,key){const value=createHmac('sha256',token).update(key).digest('base64url');run('UPDATE links SET revoked=1 WHERE shop=? AND customer=?',shop,customer);run('INSERT INTO links(token,shop,customer,expires) VALUES(?,?,?,?)',hash(value),shop,customer,Date.now()+86400000);return {}},
    revoke(shop,name){run('UPDATE links SET revoked=1 WHERE shop=? AND customer=?',shop,name);return {}},
    statement(scope){const acc='Due/'+scope.customer;const rows=entries(scope.shop).filter(e=>e.debit===acc || e.credit===acc);const ids=new Set(rows.map(e=>e.id));return {customer:scope.customer,entries:rows,events:this.state(scope.shop).events.filter(e=>ids.has(e.entry)&&['Confirmed','Disputed'].includes(e.action))}},
    attest(scope,id,action,note){if(!this.statement(scope).entries.some(e=>e.id===id))fail('Entry outside this statement.');event(scope.shop,id,action,note);return {id}}
  };
}
