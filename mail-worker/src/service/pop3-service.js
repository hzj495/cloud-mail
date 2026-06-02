import orm from '../entity/orm';
import email from '../entity/email';
import accountService from './account-service';
import userService from './user-service';
import BizError from '../error/biz-error';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { emailConst, isDel } from '../const/entity-const';

function toInt(value, defaultValue = 0) {
	const num = Number(value);
	return Number.isFinite(num) ? num : defaultValue;
}

function normalizeAccount(accountRow) {
	return {
		accountId: accountRow.accountId,
		userId: accountRow.userId,
		email: accountRow.email,
		name: accountRow.name || '',
		popSecretTime: accountRow.popSecretTime || null
	};
}

function escapeHeader(value = '') {
	return String(value || '').replace(/[\r\n]+/g, ' ').trim();
}

function encodeBase64Utf8(str) {
	const bytes = new TextEncoder().encode(str);
	let binary = '';
	for (const b of bytes) binary += String.fromCharCode(b);
	return btoa(binary);
}

function encodeHeader(value = '') {
	value = escapeHeader(value);
	if (!value) return '';
	return /^[\x20-\x7E]*$/.test(value) ? value : `=?UTF-8?B?${encodeBase64Utf8(value)}?=`;
}

function formatAddress(address = '', name = '') {
	address = escapeHeader(address);
	name = escapeHeader(name);
	if (!address) return '';
	return name ? `${encodeHeader(name)} <${address}>` : address;
}

function parseJsonArray(value) {
	if (!value) return [];
	try {
		const arr = JSON.parse(value);
		return Array.isArray(arr) ? arr : [];
	} catch (e) {
		return [];
	}
}

function formatAddressList(value) {
	const arr = Array.isArray(value) ? value : parseJsonArray(value);
	return arr.map(item => formatAddress(item.address || item.email || '', item.name || '')).filter(Boolean).join(', ');
}

function getDomain(address = '') {
	const parts = String(address).split('@');
	return parts.length === 2 ? parts[1] : 'localhost';
}

function makeBoundary(prefix, id) {
	return `----=_CloudMail_${prefix}_${id}_${Math.random().toString(36).slice(2)}`;
}

function normalizeBody(value = '') {
	return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '\r\n');
}

function estimateSize(row) {
	return Math.max(512, 900 + String(row.subject || '').length + String(row.text || '').length + String(row.content || '').length);
}

function buildRfc822(row) {
	const from = formatAddress(row.sendEmail || '', row.name || '');
	const to = formatAddressList(row.recipient) || formatAddress(row.toEmail || '', row.toName || '');
	const cc = formatAddressList(row.cc);
	const date = row.createTime ? new Date(row.createTime).toUTCString() : new Date().toUTCString();
	const messageId = escapeHeader(row.messageId) || `<cloudmail-${row.emailId}@${getDomain(row.toEmail || row.sendEmail || '')}>`;
	const subject = encodeHeader(row.subject || '');
	const text = row.text || '';
	const html = row.content || '';

	const headers = [];
	headers.push(`From: ${from || 'unknown@example.com'}`);
	if (to) headers.push(`To: ${to}`);
	if (cc) headers.push(`Cc: ${cc}`);
	headers.push(`Subject: ${subject}`);
	headers.push(`Date: ${date}`);
	headers.push(`Message-ID: ${messageId}`);
	if (row.inReplyTo) headers.push(`In-Reply-To: ${escapeHeader(row.inReplyTo)}`);
	if (row.relation) headers.push(`References: ${escapeHeader(row.relation)}`);
	headers.push('MIME-Version: 1.0');
	headers.push('X-Mailer: CloudMail POP3 Gateway');

	if (text && html) {
		const boundary = makeBoundary('ALT', row.emailId);
		headers.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
		return [
			...headers,
			'',
			`--${boundary}`,
			'Content-Type: text/plain; charset=UTF-8',
			'Content-Transfer-Encoding: 8bit',
			'',
			normalizeBody(text),
			`--${boundary}`,
			'Content-Type: text/html; charset=UTF-8',
			'Content-Transfer-Encoding: 8bit',
			'',
			normalizeBody(html),
			`--${boundary}--`,
			''
		].join('\r\n');
	}

	if (html) {
		headers.push('Content-Type: text/html; charset=UTF-8');
		headers.push('Content-Transfer-Encoding: 8bit');
		return [...headers, '', normalizeBody(html), ''].join('\r\n');
	}

	headers.push('Content-Type: text/plain; charset=UTF-8');
	headers.push('Content-Transfer-Encoding: 8bit');
	return [...headers, '', normalizeBody(text || ''), ''].join('\r\n');
}

async function assertAccount(c, accountId, userId) {
	const accountRow = await accountService.selectById(c, accountId);
	if (!accountRow || accountRow.userId !== userId) {
		throw new BizError('POP3 account not found', 404);
	}
	const userRow = await userService.selectById(c, userId);
	if (!userRow || userService.isExpired(c, userRow)) {
		throw new BizError('POP3 account expired', 401);
	}
	return accountRow;
}

const pop3Service = {
	async auth(c, params) {
		const emailAddress = String(params.email || '').trim();
		const popSecret = String(params.popSecret || '');
		const accountRow = await accountService.verifyPopSecret(c, emailAddress, popSecret);
		if (!accountRow) {
			throw new BizError('POP3 authentication failed', 401);
		}
		const userRow = await userService.selectById(c, accountRow.userId);
		if (!userRow || userService.isExpired(c, userRow)) {
			throw new BizError('POP3 account expired', 401);
		}
		return normalizeAccount(accountRow);
	},

	async list(c, params) {
		const accountId = toInt(params.accountId);
		const userId = toInt(params.userId);
		let limit = toInt(params.limit, 500);
		if (limit < 1) limit = 1;
		if (limit > 2000) limit = 2000;

		await assertAccount(c, accountId, userId);

		const rows = await orm(c).select({
			emailId: email.emailId,
			subject: email.subject,
			text: email.text,
			content: email.content,
			createTime: email.createTime
		}).from(email).where(and(
			eq(email.accountId, accountId),
			eq(email.userId, userId),
			eq(email.type, emailConst.type.RECEIVE),
			eq(email.isDel, isDel.NORMAL)
		)).orderBy(asc(email.emailId)).limit(limit).all();

		return rows.map(row => ({
			emailId: row.emailId,
			uid: `cloudmail-${row.emailId}`,
			octets: estimateSize(row),
			createTime: row.createTime || null
		}));
	},

	async message(c, params) {
		const accountId = toInt(params.accountId);
		const userId = toInt(params.userId);
		const emailId = toInt(params.emailId);
		await assertAccount(c, accountId, userId);

		const row = await orm(c).select().from(email).where(and(
			eq(email.emailId, emailId),
			eq(email.accountId, accountId),
			eq(email.userId, userId),
			eq(email.type, emailConst.type.RECEIVE),
			eq(email.isDel, isDel.NORMAL)
		)).get();

		if (!row) {
			throw new BizError('POP3 message not found', 404);
		}

		const raw = buildRfc822(row);
		return {
			emailId,
			uid: `cloudmail-${emailId}`,
			octets: new TextEncoder().encode(raw).length,
			rfc822: raw
		};
	},

	async delete(c, params) {
		const accountId = toInt(params.accountId);
		const userId = toInt(params.userId);
		const ids = Array.isArray(params.emailIds) ? params.emailIds.map(item => toInt(item)).filter(Boolean) : [];
		await assertAccount(c, accountId, userId);
		if (ids.length === 0) return { deleted: 0 };

		await orm(c).update(email).set({ isDel: isDel.DELETE }).where(and(
			eq(email.accountId, accountId),
			eq(email.userId, userId),
			inArray(email.emailId, ids)
		)).run();

		return { deleted: ids.length };
	}
};

export default pop3Service;
