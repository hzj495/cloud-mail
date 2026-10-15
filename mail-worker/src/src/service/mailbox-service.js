import BizError from '../error/biz-error.js';
import jwtUtils from '../utils/jwt-utils.js';

const DEFAULT_PASSWORD = 'aa123456';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const allowed = new Set([
  'GET /mailbox/me', 'GET /mailbox/list', 'GET /mailbox/message',
  'POST /mailbox/password', 'DELETE /mailbox/logout'
]);
const encoder = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
const denied = () => new BizError('邮箱或密码错误', 403);
const expired = () => new BizError('登录已失效，请重新登录', 401);

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({name:'PBKDF2', hash:'SHA-256', salt:encoder.encode(salt), iterations:100000}, key, 256);
  return Array.from(new Uint8Array(bits), b => b.toString(16).padStart(2,'0')).join('');
}

function ownerUsable(c, row) {
  if (!row || row.ownerDeleted || row.ownerStatus || row.accountDeleted) return false;
  if (row.ownerEmail.toLowerCase() === String(c.env.admin || '').toLowerCase() || !row.expireTime) return true;
  const value = row.expireTime;
  const date = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value.replace(' ', 'T') + 'Z';
  return Date.parse(date) > Date.now();
}

const mailboxService = {
  isAllowed(method, path) { return allowed.has(`${method} ${path}`); },

  async ensureSchema(c) {
    await c.env.db.batch([
      c.env.db.prepare(`CREATE TABLE IF NOT EXISTS mailbox_credentials (
        account_id INTEGER PRIMARY KEY, password_hash TEXT NOT NULL, salt TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0, failures INTEGER NOT NULL DEFAULT 0,
        failed_at INTEGER NOT NULL DEFAULT 0)`),
      c.env.db.prepare(`CREATE TABLE IF NOT EXISTS mailbox_sessions (
        token TEXT PRIMARY KEY, account_id INTEGER NOT NULL, version INTEGER NOT NULL,
        expires_at INTEGER NOT NULL)`),
      c.env.db.prepare('CREATE INDEX IF NOT EXISTS mailbox_sessions_account ON mailbox_sessions(account_id)')
    ]);
  },

  async login(c, email, password) {
    if (typeof email !== 'string' || typeof password !== 'string' || !password || password.length > 128) throw denied();
    email = email.trim().toLowerCase();
    const account = await c.env.db.prepare(`SELECT a.account_id AS accountId, a.is_del AS accountDeleted,
      u.email AS ownerEmail, u.status AS ownerStatus, u.is_del AS ownerDeleted, u.expire_time AS expireTime
      FROM account a JOIN user u ON u.user_id=a.user_id
      WHERE a.email = ? COLLATE NOCASE
      AND NOT EXISTS (SELECT 1 FROM user primary_user WHERE primary_user.email=a.email COLLATE NOCASE)`)
      .bind(email).first();
    if (!ownerUsable(c, account)) throw denied();
    await this.ensureSchema(c);
    let credentials = await c.env.db.prepare('SELECT * FROM mailbox_credentials WHERE account_id=?').bind(account.accountId).first();
    // Existing generated mailboxes also receive the default, without changing main users or POP secrets.
    if (!credentials) {
      const salt = crypto.randomUUID();
      const hash = await hashPassword(DEFAULT_PASSWORD, salt);
      await c.env.db.prepare('INSERT OR IGNORE INTO mailbox_credentials(account_id,password_hash,salt) VALUES(?,?,?)')
        .bind(account.accountId,hash,salt).run();
      credentials = await c.env.db.prepare('SELECT * FROM mailbox_credentials WHERE account_id=?').bind(account.accountId).first();
    }
    if (credentials.failures >= 10 && credentials.failed_at > now() - 900) {
      throw new BizError('尝试次数过多，请15分钟后再试',403);
    }
    if (await hashPassword(password, credentials.salt) !== credentials.password_hash) {
      await c.env.db.prepare(`UPDATE mailbox_credentials SET failures=CASE WHEN failed_at < ? THEN 1 ELSE failures+1 END,
        failed_at=? WHERE account_id=?`).bind(now()-900,now(),account.accountId).run();
      throw denied();
    }
    const token = crypto.randomUUID();
    const result = await c.env.db.prepare(`INSERT INTO mailbox_sessions(token,account_id,version,expires_at)
      SELECT ?,account_id,version,? FROM mailbox_credentials WHERE account_id=? AND password_hash=?`)
      .bind(token,now()+SESSION_SECONDS,account.accountId,credentials.password_hash).run();
    if (!result.meta.changes) throw expired();
    await c.env.db.batch([
      c.env.db.prepare('UPDATE mailbox_credentials SET failures=0,failed_at=0 WHERE account_id=?').bind(account.accountId),
      c.env.db.prepare('DELETE FROM mailbox_sessions WHERE account_id=? AND expires_at <= ?').bind(account.accountId,now())
    ]);
    return jwtUtils.generateToken(c,{scope:'mailbox',accountId:account.accountId,token},SESSION_SECONDS);
  },

  async authenticate(c, claims) {
    if (claims.scope !== 'mailbox' || !claims.accountId || !claims.token) throw expired();
    const row = await c.env.db.prepare(`SELECT a.account_id AS accountId,a.user_id AS userId,a.email,
      a.is_del AS accountDeleted,u.email AS ownerEmail,u.status AS ownerStatus,u.is_del AS ownerDeleted,u.expire_time AS expireTime
      FROM mailbox_sessions s JOIN mailbox_credentials p ON p.account_id=s.account_id AND p.version=s.version
      JOIN account a ON a.account_id=s.account_id JOIN user u ON u.user_id=a.user_id
      WHERE s.token=? AND s.account_id=? AND s.expires_at>?
      AND NOT EXISTS(SELECT 1 FROM user primary_user WHERE primary_user.email=a.email COLLATE NOCASE)`)
      .bind(claims.token,claims.accountId,now()).first();
    if (!ownerUsable(c,row)) throw expired();
    return {accountId:row.accountId,userId:row.userId,email:row.email,token:claims.token};
  },

  async list(c, principal, params = {}) {
    const before = Number(params.before) || Number.MAX_SAFE_INTEGER;
    const size = Math.min(50,Math.max(1,Math.floor(Number(params.size) || 30)));
    const {results} = await c.env.db.prepare(`SELECT email_id AS emailId,send_email AS sendEmail,name,subject,
      substr(text,1,160) AS preview,create_time AS createTime FROM email
      WHERE account_id=? AND user_id=? AND type=0 AND is_del=0 AND email_id<? ORDER BY email_id DESC LIMIT ?`)
      .bind(principal.accountId,principal.userId,before,size+1).all();
    const total = await c.env.db.prepare('SELECT count(*) AS total FROM email WHERE account_id=? AND user_id=? AND type=0 AND is_del=0')
      .bind(principal.accountId,principal.userId).first();
    return {items:results.slice(0,size),hasMore:results.length>size,total:total.total};
  },

  async message(c, principal, id) {
    id = Number(id);
    if (!Number.isSafeInteger(id) || id < 1) throw new BizError('邮件不存在',404);
    const row = await c.env.db.prepare(`SELECT email_id AS emailId,send_email AS sendEmail,name,subject,text,content,
      create_time AS createTime FROM email WHERE email_id=? AND account_id=? AND user_id=? AND type=0 AND is_del=0`)
      .bind(id,principal.accountId,principal.userId).first();
    if (!row) throw new BizError('邮件不存在',404);
    const {results} = await c.env.db.prepare(`SELECT att_id AS attId,key,filename,size FROM attachments
      WHERE email_id=? AND account_id=? AND user_id=? AND type=0`).bind(id,principal.accountId,principal.userId).all();
    return {...row,attachments:results};
  },

  async changePassword(c, principal, {oldPassword,newPassword} = {}) {
    if (typeof oldPassword !== 'string' || oldPassword.length > 128 || typeof newPassword !== 'string' || newPassword.length < 6 || newPassword.length > 30) {
      throw new BizError('请输入原密码，新密码长度须为6至30位',400);
    }
    const credentials = await c.env.db.prepare('SELECT * FROM mailbox_credentials WHERE account_id=?').bind(principal.accountId).first();
    if (!credentials || await hashPassword(oldPassword,credentials.salt) !== credentials.password_hash) throw new BizError('原密码错误',403);
    if (oldPassword === newPassword) throw new BizError('新密码不能与原密码相同',400);
    const salt = crypto.randomUUID();
    const hash = await hashPassword(newPassword,salt);
    const results = await c.env.db.batch([
      c.env.db.prepare(`UPDATE mailbox_credentials SET password_hash=?,salt=?,version=version+1,failures=0,failed_at=0
        WHERE account_id=? AND password_hash=?`).bind(hash,salt,principal.accountId,credentials.password_hash),
      c.env.db.prepare(`DELETE FROM mailbox_sessions WHERE account_id=? AND version <
        (SELECT version FROM mailbox_credentials WHERE account_id=?)`).bind(principal.accountId,principal.accountId)
    ]);
    if (!results[0].meta.changes) throw expired();
  },

  async logout(c,principal) {
    await c.env.db.prepare('DELETE FROM mailbox_sessions WHERE token=? AND account_id=?').bind(principal.token,principal.accountId).run();
  }
};
export default mailboxService;
