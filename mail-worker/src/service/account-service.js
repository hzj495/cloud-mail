import BizError from '../error/biz-error';
import verifyUtils from '../utils/verify-utils';
import emailUtils from '../utils/email-utils';
import userService from './user-service';
import emailService from './email-service';
import orm from '../entity/orm';
import account from '../entity/account';
import { and, asc, eq, gt, inArray, count, sql, ne, or, lt, desc } from 'drizzle-orm';
import {accountConst, isDel, settingConst} from '../const/entity-const';
import settingService from './setting-service';
import turnstileService from './turnstile-service';
import roleService from './role-service';
import { t } from '../i18n/i18n';
import verifyRecordService from './verify-record-service';
import saltHashUtils from '../utils/crypto-utils';
import dayjs from 'dayjs';

const accountService = {

	async add(c, params, userId) {

		const { addEmailVerify , addEmail, manyEmail, addVerifyCount, minEmailPrefix, emailPrefixFilter } = await settingService.query(c);

		let { email, token } = params;


		if (!(addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN)) {
			throw new BizError(t('addAccountDisabled'));
		}


		if (!email) {
			throw new BizError(t('emptyEmail'));
		}

		if (!verifyUtils.isEmail(email)) {
			throw new BizError(t('notEmail'));
		}

		if (!c.env.domain.includes(emailUtils.getDomain(email))) {
			throw new BizError(t('notExistDomain'));
		}

		if (emailUtils.getName(email).length < minEmailPrefix) {
			throw new BizError(t('minEmailPrefix', { msg: minEmailPrefix } ));
		}

		if (emailPrefixFilter.some(content => emailUtils.getName(email).includes(content))) {
			throw new BizError(t('banEmailPrefix'));
		}

		let accountRow = await this.selectByEmailIncludeDel(c, email);

		if (accountRow && accountRow.isDel === isDel.DELETE) {
			throw new BizError(t('isDelAccount'));
		}

		if (accountRow) {
			throw new BizError(t('isRegAccount'));
		}

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (userRow.email !== c.env.admin) {

			if (roleRow.accountCount > 0) {
				const userAccountCount = await accountService.countUserAccount(c, userId)
				if(userAccountCount >= roleRow.accountCount) throw new BizError(t('accountLimit'), 403);
			}

			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, email)) {
				throw new BizError(t('noDomainPermAdd'),403)
			}

		}

		let addVerifyOpen = false

		if (addEmailVerify === settingConst.addEmailVerify.OPEN) {
			addVerifyOpen = true
			await turnstileService.verify(c, token);
		}

		if (addEmailVerify === settingConst.addEmailVerify.COUNT) {
			addVerifyOpen = await verifyRecordService.isOpenAddVerify(c, addVerifyCount);
			if (addVerifyOpen) {
				await turnstileService.verify(c,token)
			}
		}


		accountRow = await orm(c).insert(account).values({ email: email, userId: userId, name: emailUtils.getName(email) }).returning().get();

		if (addEmailVerify === settingConst.addEmailVerify.COUNT && !addVerifyOpen) {
			const row = await verifyRecordService.increaseAddCount(c);
			addVerifyOpen = row.count >= addVerifyCount
		}

		accountRow.addVerifyOpen = addVerifyOpen
		return accountRow;
	},


	genRandomEmailPrefix(length = 10) {
		const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
		const values = new Uint8Array(length);
		crypto.getRandomValues(values);
		let prefix = '';
		for (let i = 0; i < values.length; i++) {
			prefix += chars[values[i] % chars.length];
		}
		return prefix;
	},

	async buildPopSecretPatch() {
		const popSecret = this.genPopSecret(24);
		const { salt, hash } = await saltHashUtils.hashPassword(popSecret);
		const popSecretTime = dayjs().toISOString();
		return {
			popSecret,
			popSecretTime,
			patch: {
				popSecretHash: hash,
				popSecretSalt: salt,
				popSecretTime
			}
		};
	},

	async batchRandomAdd(c, params, userId) {
		const { addEmail, manyEmail, minEmailPrefix, emailPrefixFilter } = await settingService.query(c);
		let { count: createCount, domain, prefixLength = 10, generatePopSecret = true } = params || {};

		createCount = Number(createCount);
		prefixLength = Number(prefixLength);

		if (!(addEmail === settingConst.addEmail.OPEN && manyEmail === settingConst.manyEmail.OPEN)) {
			throw new BizError(t('addAccountDisabled'));
		}

		if (!Number.isInteger(createCount) || createCount < 1) {
			throw new BizError('批量生成数量必须大于0');
		}
		if (createCount > 200) {
			throw new BizError('单次最多批量生成200个邮箱');
		}

		domain = String(domain || '').trim();
		if (domain.startsWith('@')) domain = domain.slice(1);
		if (!domain || !c.env.domain.includes(domain)) {
			throw new BizError(t('notExistDomain'));
		}

		if (!Number.isInteger(prefixLength) || prefixLength < minEmailPrefix) {
			prefixLength = Math.max(Number(minEmailPrefix) || 6, 6);
		}
		if (prefixLength > 30) prefixLength = 30;

		const userRow = await userService.selectById(c, userId);
		const roleRow = await roleService.selectById(c, userRow.type);

		if (userRow.email !== c.env.admin) {
			if (roleRow.accountCount > 0) {
				const userAccountCount = await accountService.countUserAccount(c, userId);
				if (userAccountCount + createCount > roleRow.accountCount) {
					throw new BizError(t('accountLimit'), 403);
				}
			}
			if(!roleService.hasAvailDomainPerm(roleRow.availDomain, `x@${domain}`)) {
				throw new BizError(t('noDomainPermAdd'),403);
			}
		}

		const created = [];
		const credentials = [];
		const used = new Set();
		let tries = 0;

		while (created.length < createCount) {
			tries++;
			if (tries > createCount * 80) {
				throw new BizError('随机前缀生成失败，请加大前缀长度后重试');
			}

			const prefix = this.genRandomEmailPrefix(prefixLength);
			if (emailPrefixFilter.some(content => prefix.includes(content))) continue;

			const email = `${prefix}@${domain}`;
			if (used.has(email)) continue;
			used.add(email);

			const exist = await this.selectByEmailIncludeDel(c, email);
			if (exist) continue;

			let insertData = {
				email,
				userId,
				name: prefix
			};
			let popSecret = '';
			let popSecretTime = null;

			if (generatePopSecret) {
				const pop = await this.buildPopSecretPatch();
				insertData = { ...insertData, ...pop.patch };
				popSecret = pop.popSecret;
				popSecretTime = pop.popSecretTime;
			}

			const row = await orm(c).insert(account).values(insertData).returning().get();
			created.push(this.maskPopSecretTime(row));
			credentials.push({
				accountId: row.accountId,
				email,
				popSecret,
				popSecretTime
			});
		}

		return {
			created,
			credentials,
			text: credentials.map(item => `${item.email}——${item.popSecret}`).join('\n')
		};
	},

	selectByEmailIncludeDel(c, email) {
		return orm(c).select().from(account).where(sql`${account.email} COLLATE NOCASE = ${email}`).get();
	},

	async list(c, params, userId) {

		let { accountId, size, lastSort } = params;

		accountId = Number(accountId);
		size = Number(size);
		lastSort = Number(lastSort);

		if (size > 30) {
			size = 30;
		}

		if (!accountId) {
			accountId = 0;
		}

		if(Number.isNaN(lastSort)) {
			lastSort = 9999999999;
		}

		const list = await orm(c).select().from(account).where(
			and(
				eq(account.userId, userId),
				eq(account.isDel, isDel.NORMAL),
					or(
						lt(account.sort, lastSort),
						and(
							eq(account.sort, lastSort),
							gt(account.accountId, accountId)
						)
					))
				)
			.orderBy(desc(account.sort), asc(account.accountId))
			.limit(size)
			.all();

		return list.map(item => this.maskPopSecretTime(item));
	},

	async delete(c, params, userId) {

		let { accountId } = params;

		const user = await userService.selectById(c, userId);
		const accountRow = await this.selectById(c, accountId);

		if (accountRow.email === user.email) {
			throw new BizError(t('delMyAccount'));
		}

		if (accountRow.userId !== user.userId) {
			throw new BizError(t('noUserAccount'));
		}

		await orm(c).update(account).set({ isDel: isDel.DELETE }).where(
			and(eq(account.userId, userId),
				eq(account.accountId, accountId)))
			.run();
	},

	selectById(c, accountId) {
		return orm(c).select().from(account).where(
			and(eq(account.accountId, accountId),
				eq(account.isDel, isDel.NORMAL)))
			.get();
	},

	async insert(c, params) {
		await orm(c).insert(account).values({ ...params }).returning();
	},

	async insertList(c, list) {
		await orm(c).insert(account).values(list).run();
	},

	async physicsDeleteByUserIds(c, userIds) {
		await emailService.physicsDeleteUserIds(c, userIds);
		await orm(c).delete(account).where(inArray(account.userId,userIds)).run();
	},

	async selectUserAccountCountList(c, userIds, del = isDel.NORMAL) {
		const result = await orm(c)
			.select({
				userId: account.userId,
				count: count(account.accountId)
			})
			.from(account)
			.where(and(
				inArray(account.userId, userIds),
				eq(account.isDel, del)
			))
			.groupBy(account.userId)
		return result;
	},

	async countUserAccount(c, userId) {
		const { num } = await orm(c).select({num: count()}).from(account).where(and(eq(account.userId, userId),eq(account.isDel, isDel.NORMAL))).get();
		return num;
	},

	async restoreByEmail(c, email) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.email, email)).run();
	},

	async restoreByUserId(c, userId) {
		await orm(c).update(account).set({isDel: isDel.NORMAL}).where(eq(account.userId, userId)).run();
	},

	async setName(c, params, userId) {
		const { name, accountId } = params
		if (name.length > 30) {
			throw new BizError(t('usernameLengthLimit'));
		}
		await orm(c).update(account).set({name}).where(and(eq(account.userId, userId),eq(account.accountId, accountId))).run();
	},

	async allAccount(c, params) {

		let { userId, num, size } = params

		userId = Number(userId)

		num = Number(num)
		size = Number(size)

		if (size > 30) {
			size = 30;
		}

		num = (num - 1) * size;

		const userRow = await userService.selectByIdIncludeDel(c, userId);

		const list = await orm(c).select().from(account).where(and(eq(account.userId, userId),ne(account.email,userRow.email))).limit(size).offset(num);
		const { total } = await orm(c).select({ total: count() }).from(account).where(eq(account.userId, userId)).get();

		return { list: list.map(item => this.maskPopSecretTime(item)), total }
	},

	async physicsDelete(c, params) {
		const { accountId } = params
		await emailService.physicsDeleteByAccountId(c, accountId)
		await orm(c).delete(account).where(eq(account.accountId, accountId)).run();
	},

	async setAllReceive(c, params, userId) {
		let a = null
		const { accountId } = params;
		const accountRow = await this.selectById(c, accountId);
		if (accountRow.userId !== userId) {
			return;
		}
		await orm(c).update(account).set({ allReceive: accountConst.allReceive.CLOSE }).where(eq(account.userId, userId)).run();
		await orm(c).update(account).set({ allReceive: accountRow.allReceive ? 0 : 1 }).where(eq(account.accountId, accountId)).run();
	},


	genPopSecret(length = 24) {
		const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
		const values = new Uint8Array(length);
		crypto.getRandomValues(values);
		return Array.from(values, item => chars[item % chars.length]).join('');
	},

	maskPopSecretTime(accountRow) {
		if (!accountRow) return accountRow;
		accountRow.hasPopSecret = !!accountRow.popSecretHash;
		delete accountRow.popSecretHash;
		delete accountRow.popSecretSalt;
		return accountRow;
	},

	async resetPopSecret(c, params, userId) {
		const { accountId } = params;
		const accountRow = await this.selectById(c, accountId);

		if (!accountRow || accountRow.userId !== userId) {
			throw new BizError(t('noUserAccount'));
		}

		const popSecret = this.genPopSecret(24);
		const { salt, hash } = await saltHashUtils.hashPassword(popSecret);
		const popSecretTime = dayjs().toISOString();

		await orm(c).update(account).set({
			popSecretHash: hash,
			popSecretSalt: salt,
			popSecretTime
		}).where(and(eq(account.accountId, accountId), eq(account.userId, userId))).run();

		return {
			accountId: accountRow.accountId,
			email: accountRow.email,
			popSecret,
			popSecretTime
		};
	},

	async deletePopSecret(c, params, userId) {
		const { accountId } = params;
		const accountRow = await this.selectById(c, accountId);

		if (!accountRow || accountRow.userId !== userId) {
			throw new BizError(t('noUserAccount'));
		}

		await orm(c).update(account).set({
			popSecretHash: '',
			popSecretSalt: '',
			popSecretTime: null
		}).where(and(eq(account.accountId, accountId), eq(account.userId, userId))).run();
	},


	async batchResetExport(c, params, userId) {
		let { accountIds = [] } = params || {};
		if (!Array.isArray(accountIds)) accountIds = [];
		accountIds = accountIds.map(item => Number(item)).filter(item => Number.isInteger(item) && item > 0);

		let where = and(eq(account.userId, userId), eq(account.isDel, isDel.NORMAL));
		if (accountIds.length > 0) {
			where = and(where, inArray(account.accountId, accountIds));
		}

		const list = await orm(c).select().from(account).where(where).orderBy(asc(account.accountId)).limit(500).all();
		if (list.length === 0) {
			throw new BizError('没有可导出的邮箱');
		}
		if (list.length > 500) {
			throw new BizError('单次最多导出500个邮箱');
		}

		const credentials = [];
		for (const item of list) {
			const pop = await this.buildPopSecretPatch();
			await orm(c).update(account).set(pop.patch).where(and(eq(account.userId, userId), eq(account.accountId, item.accountId))).run();
			credentials.push({
				accountId: item.accountId,
				email: item.email,
				popSecret: pop.popSecret,
				popSecretTime: pop.popSecretTime
			});
		}

		return {
			credentials,
			text: credentials.map(item => `${item.email}——${item.popSecret}`).join('\n')
		};
	},

	async verifyPopSecret(c, email, popSecret) {
		if (!email || !popSecret) return null;
		const accountRow = await this.selectByEmailIncludeDel(c, email);
		if (!accountRow || accountRow.isDel !== isDel.NORMAL || !accountRow.popSecretHash || !accountRow.popSecretSalt) {
			return null;
		}
		const ok = await saltHashUtils.verifyPassword(popSecret, accountRow.popSecretSalt, accountRow.popSecretHash);
		return ok ? accountRow : null;
	},

	async setAsTop(c, params, userId) {
		const { accountId } = params;
		const userRow = await userService.selectById(c, userId);
		const mainAccountRow = await accountService.selectByEmailIncludeDel(c, userRow.email);
		let mainSort = mainAccountRow.sort === 0 ? 2 : mainAccountRow.sort + 1;
		await orm(c).update(account).set({ sort: mainSort }).where(eq(account.email, userRow.email )).run();
		await orm(c).update(account).set({ sort: mainSort - 1 }).where(and(eq(account.accountId, accountId),eq(account.userId,userId))).run();
	}
};

export default accountService;
