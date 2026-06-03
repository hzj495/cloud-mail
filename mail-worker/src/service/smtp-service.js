import accountService from './account-service';
import emailService from './email-service';
import BizError from '../error/biz-error';

function toInt(value, defaultValue = 0) {
	const num = Number(value);
	return Number.isFinite(num) ? num : defaultValue;
}

function normalizeEmail(value = '') {
	value = String(value || '').trim();
	const match = value.match(/<([^>]+)>/);
	if (match) value = match[1];
	value = value.replace(/^mailto:/i, '').trim();
	return value.toLowerCase();
}

function normalizeRecipientList(value) {
	const source = Array.isArray(value) ? value : String(value || '').split(/[;,]/);
	const result = [];
	const used = new Set();
	for (const item of source) {
		const email = normalizeEmail(item);
		if (!email || !email.includes('@')) continue;
		if (used.has(email)) continue;
		used.add(email);
		result.push(email);
	}
	return result;
}

function clip(value, max) {
	value = String(value || '');
	return value.length > max ? value.slice(0, max) : value;
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

const smtpService = {
	async auth(c, params) {
		const emailAddress = normalizeEmail(params.email || params.username || params.user);
		const secret = String(params.smtpSecret || params.popSecret || params.password || '');
		const accountRow = await accountService.verifyPopSecret(c, emailAddress, secret);
		if (!accountRow) {
			throw new BizError('SMTP authentication failed', 401);
		}
		return normalizeAccount(accountRow);
	},

	async send(c, params) {
		const accountId = toInt(params.accountId);
		const userId = toInt(params.userId);
		const accountRow = await accountService.selectById(c, accountId);
		if (!accountRow || accountRow.userId !== userId) {
			throw new BizError('SMTP account not found', 404);
		}

		const authEmail = normalizeEmail(accountRow.email);
		const mailFrom = normalizeEmail(params.mailFrom || params.from || authEmail);
		if (mailFrom && mailFrom !== authEmail) {
			throw new BizError('SMTP sender must match authenticated account', 403);
		}

		const receiveEmail = normalizeRecipientList(params.rcptTo || params.to || params.receiveEmail);
		if (receiveEmail.length === 0) {
			throw new BizError('SMTP recipient is empty');
		}
		if (receiveEmail.length > 100) {
			throw new BizError('SMTP recipient count exceeds 100');
		}

		let subject = clip(params.subject || '(no subject)', 500);
		let text = clip(params.text || '', 1024 * 1024);
		let content = clip(params.html || params.content || '', 1024 * 1024);

		if (!text && !content) {
			text = ' ';
		}

		const rows = await emailService.send(c, {
			accountId,
			name: params.name || accountRow.name || authEmail.split('@')[0],
			sendType: 'send',
			receiveEmail,
			text,
			content,
			subject,
			attachments: []
		}, userId);

		return {
			sent: true,
			count: receiveEmail.length,
			emailId: rows && rows[0] ? rows[0].emailId : null
		};
	}
};

export default smtpService;
