import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';

const serviceUrl = new URL('../src/service/mailbox-service.js', import.meta.url);
test('mailbox login and read-only isolation', async () => {
  assert.ok(existsSync(serviceUrl), 'Independent mailbox login service must exist');
  const { default: service } = await import(serviceUrl);
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE user (user_id INTEGER PRIMARY KEY,email TEXT,status INTEGER DEFAULT 0,is_del INTEGER DEFAULT 0,expire_time TEXT,
      type INTEGER DEFAULT 1,password TEXT DEFAULT '',salt TEXT DEFAULT '',create_time TEXT,active_time TEXT,create_ip TEXT,
      active_ip TEXT,os TEXT,browser TEXT,device TEXT,sort INTEGER DEFAULT 0,send_count INTEGER DEFAULT 0,reg_key_id INTEGER DEFAULT 0);
    CREATE TABLE account (account_id INTEGER PRIMARY KEY,user_id INTEGER,email TEXT,is_del INTEGER DEFAULT 0);
    CREATE TABLE email (email_id INTEGER PRIMARY KEY,account_id INTEGER,user_id INTEGER,send_email TEXT,name TEXT,subject TEXT,text TEXT,content TEXT,create_time TEXT,type INTEGER DEFAULT 0,is_del INTEGER DEFAULT 0);
    CREATE TABLE attachments (att_id INTEGER PRIMARY KEY,account_id INTEGER,email_id INTEGER,user_id INTEGER,key TEXT,filename TEXT,mime_type TEXT,size INTEGER,type INTEGER DEFAULT 0);
    INSERT INTO user(user_id,email) VALUES (1,'admin@test.com');
    INSERT INTO account VALUES (1,1,'admin@test.com',0),(2,1,'one@test.com',0),(3,1,'two@test.com',0),(4,1,'deleted@test.com',1);
    INSERT INTO email VALUES (11,2,1,'sender@test.com','Sender','Own mail','code 123','<p>code 123</p>','2026-10-15',0,0),
      (12,3,1,'sender@test.com','Sender','Other mail','secret','secret','2026-10-15',0,0),
      (13,2,1,'sender@test.com','Sender','Sent mail','sent','sent','2026-10-15',1,0),
      (14,2,1,'sender@test.com','Sender','Deleted mail','deleted','deleted','2026-10-15',0,1);
  `);
  // D1 adapter backed by real SQLite; all authorization queries execute unchanged.
  const prepare = (sql, values = []) => ({
    bind: (...args) => prepare(sql, args),
    first: async () => db.prepare(sql).get(...values) || null,
    all: async () => ({ results: db.prepare(sql).all(...values) }),
    raw: async () => { const statement=db.prepare(sql); statement.setReturnArrays(true); return statement.all(...values); },
    run: async () => ({ meta: db.prepare(sql).run(...values) })
  });
  const c = {env: {db: {prepare, batch: async statements => {
    db.exec('BEGIN');
    try { const r = []; for (const s of statements) r.push(await s.run()); db.exec('COMMIT'); return r; }
    catch (e) { db.exec('ROLLBACK'); throw e; }
  }}, jwt_secret:'test-secret', admin:'admin@test.com'}};
  const jwt = (await import('../src/utils/jwt-utils.js')).default;
  await assert.rejects(service.login(c, 'one@test.com', 'wrong'), /邮箱或密码错误/);
  await assert.rejects(service.login(c, 'admin@test.com', 'aa123456'), /邮箱或密码错误/);
  await assert.rejects(service.login(c, 'deleted@test.com', 'aa123456'), /邮箱或密码错误/);
  const token = await service.login(c, ' ONE@test.com ', 'aa123456');
  const claims = await jwt.verifyToken(c, token);
  assert.equal(claims.scope, 'mailbox');
  const principal = await service.authenticate(c, claims);
  assert.equal(principal.accountId, 2);
  const list = await service.list(c, principal, {accountId:3, allReceive:1, type:1});
  assert.deepEqual(list.items.map(x => x.emailId), [11]);
  assert.equal((await service.message(c, principal, 11)).subject, 'Own mail');
  for (const id of [12,13,14]) await assert.rejects(service.message(c, principal, id));
  for (const [method,path] of [['POST','/account/add'],['POST','/account/batchRandomAdd'],['GET','/allEmail/list'],['POST','/email/send'],['PUT','/my/setPwd'],['GET','/mailbox/list/anything'],['GET','/public/genToken'],['GET','/pop3'],['GET','/mailbox/password']]) {
    assert.equal(service.isAllowed(method, path), false, `${method} ${path}`);
  }
  assert.equal(service.isAllowed('GET','/mailbox/list'), true);
  if (process.env.MAILBOX_API_TEST) {
    const app = (await import('../.mailbox-test-app.cjs')).default.default;
    const request = async (path,method='GET',body,auth=token) => {
      const res = await app.request(path,{method,headers:{Authorization:auth,'Content-Type':'application/json'},
        ...(body && method !== 'GET' ? {body:JSON.stringify(body)} : {})},c.env);
      return res.json();
    };
    assert.equal((await request('/mailbox/me')).data.email,'one@test.com');
    assert.deepEqual((await request('/mailbox/list?accountId=3&type=1&allReceive=1')).data.items.map(x=>x.emailId),[11]);
    assert.equal((await request('/mailbox/message?id=12')).code,404);
    for (const [method,path] of [['POST','/account/add'],['POST','/account/batchRandomAdd'],['GET','/email/list'],['GET','/allEmail/list'],
      ['POST','/email/send'],['PUT','/my/setPwd'],['GET','/user/list'],['GET','/public/genToken'],['GET','/pop3'],['POST','/register']]) {
      assert.equal((await request(path,method,{})).code,403,`${method} ${path} must be blocked by middleware`);
    }
    assert.equal((await request('/mailbox/list','GET',null,'invalid')).code,401);
    const login = await request('/login','POST',{email:'one@test.com',password:'aa123456'},'');
    assert.equal(login.code,200);
    assert.equal((await jwt.verifyToken(c,login.data.token)).scope,'mailbox');
    const change = await request('/mailbox/password','POST',{oldPassword:'wrong',newPassword:'newpass123'});
    assert.equal(change.code,403);
  }
  await assert.rejects(service.changePassword(c, principal, {oldPassword:'wrong',newPassword:'newpass123'}));
  await service.changePassword(c, principal, {oldPassword:'aa123456',newPassword:'newpass123'});
  await assert.rejects(service.authenticate(c, claims));
  await assert.rejects(service.login(c, 'one@test.com', 'aa123456'));
  const changed = await service.login(c, 'one@test.com', 'newpass123');
  const principal2 = await service.authenticate(c, await jwt.verifyToken(c,changed));
  await service.login(c,'two@test.com','aa123456');
  await service.logout(c, principal2);
  await assert.rejects(service.authenticate(c, await jwt.verifyToken(c,changed)));
  const active = await service.login(c,'one@test.com','newpass123');
  db.exec('UPDATE account SET is_del=1 WHERE account_id=2');
  await assert.rejects(service.authenticate(c, await jwt.verifyToken(c,active)));
  db.close();
});
