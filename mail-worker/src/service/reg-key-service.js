import orm from '../entity/orm';
import regKey from '../entity/reg-key';
import { inArray, like, eq, desc, sql, or } from 'drizzle-orm';
import roleService from './role-service';
import BizError from '../error/biz-error';
import { formatDetailDate, toUtc } from '../utils/date-uitil';
import userService from './user-service';
import { t } from '../i18n/i18n.js';

const REG_KEY_VALIDITY_TYPES = ['test', 'month', 'quarter', 'year'];
const REG_KEY_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789abcdefghijkmnopqrstuvwxyz';
const MAX_BATCH_CREATE_COUNT = 1000;

function normalizeValidityType(validityType) {
	return REG_KEY_VALIDITY_TYPES.includes(validityType) ? validityType : '';
}

function normalizeExportValidityType(validityType) {
	return validityType === 'all' || REG_KEY_VALIDITY_TYPES.includes(validityType) ? validityType : '';
}

function generateRandomRegKeyCode(length = 8) {
	let code = '';
	for (let i = 0; i < length; i++) {
		code += REG_KEY_CODE_CHARS[Math.floor(Math.random() * REG_KEY_CODE_CHARS.length)];
	}
	return code;
}

const regKeyService = {

	async add(c, params, userId) {

		let {code,roleId,count,expireTime,validityType} = params;

		if (!code) {
			throw new BizError(t('emptyRegKey'));
		}

		if (!count) {
			throw new BizError(t('regKeyUseCount'));
		}

		if (!expireTime) {
			throw new BizError(t('emptyRegKeyExpire'));
		}

		validityType = normalizeValidityType(validityType);
		if (!validityType) {
			throw new BizError(t('emptyRegKeyValidity'));
		}

		const regKeyRow = await orm(c).select().from(regKey).where(eq(regKey.code, code)).get();

		if (regKeyRow) {
			throw new BizError(t('isExistRegKye'));
		}

		const roleRow = await roleService.selectById(c, roleId);
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		expireTime = formatDetailDate(expireTime)

		await orm(c).insert(regKey).values({code,roleId,count,userId,expireTime,validityType}).run();
	},


	async batchAdd(c, params, userId) {

		let {roleId,count,expireTime,validityType,batchCount,codeLength} = params;

		batchCount = Number(batchCount);
		count = Number(count);
		codeLength = Number(codeLength || 8);

		if (!batchCount || batchCount < 1) {
			throw new BizError(t('regKeyBatchCount'));
		}

		if (batchCount > MAX_BATCH_CREATE_COUNT) {
			throw new BizError(t('regKeyBatchCountLimit'));
		}

		if (codeLength < 6 || codeLength > 32) {
			throw new BizError(t('regKeyCodeLengthLimit'));
		}

		if (!count) {
			throw new BizError(t('regKeyUseCount'));
		}

		if (!expireTime) {
			throw new BizError(t('emptyRegKeyExpire'));
		}

		validityType = normalizeValidityType(validityType);
		if (!validityType) {
			throw new BizError(t('emptyRegKeyValidity'));
		}

		const roleRow = await roleService.selectById(c, roleId);
		if (!roleRow) {
			throw new BizError(t('roleNotExist'));
		}

		expireTime = formatDetailDate(expireTime);

		const insertRows = [];
		const generatedCodeSet = new Set();
		let tryCount = 0;

		while (insertRows.length < batchCount) {
			if (tryCount > batchCount * 20) {
				throw new BizError(t('regKeyBatchGenerateFail'));
			}
			tryCount++;

			const code = generateRandomRegKeyCode(codeLength);
			if (generatedCodeSet.has(code)) {
				continue;
			}

			const oldRegKey = await this.selectByCode(c, code);
			if (oldRegKey) {
				continue;
			}

			generatedCodeSet.add(code);
			insertRows.push({code,roleId,count,userId,expireTime,validityType});
		}

		for (let i = 0; i < insertRows.length; i += 100) {
			await orm(c).insert(regKey).values(insertRows.slice(i, i + 100)).run();
		}

		return insertRows.map(item => item.code);
	},

	async delete(c, params) {
		let {regKeyIds} = params;
		regKeyIds = regKeyIds.split(',').map(id => Number(id));
		await orm(c).delete(regKey).where(inArray(regKey.regKeyId,regKeyIds)).run();
	},

	async clearNotUse(c) {
		let now = formatDetailDate(toUtc().tz('Asia/Shanghai').startOf('day'))
		await orm(c).delete(regKey).where(or(eq(regKey.count, 0),sql`datetime(${regKey.expireTime}, '+8 hours') < datetime(${now})`)).run();
	},

	selectByCode(c, code) {
		return orm(c).select().from(regKey).where(eq(regKey.code, code)).get();
	},

	async list(c, params) {

		const {code} = params
		let query = orm(c).select().from(regKey)

		if (code) {
			query = query.where(like(regKey.code, `${code}%`))
		}

		const regKeyList = await query.orderBy(desc(regKey.regKeyId)).all();
		const roleList = await roleService.roleSelectUse(c);

		const today = toUtc().tz('Asia/Shanghai').startOf('day')

		regKeyList.forEach(regKeyRow => {

			const index = roleList.findIndex(roleRow => roleRow.roleId === regKeyRow.roleId)
			regKeyRow.roleName = index > -1 ? roleList[index].name : ''

			const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

			if (expireTime.isBefore(today)) {
				regKeyRow.expireTime = null
			}
		})

		return regKeyList;
	},

	async assertUsableCode(c, code) {

		if (!code) {
			throw new BizError(t('emptyRegKey'));
		}

		const regKeyRow = await this.selectByCode(c, code);

		if (!regKeyRow) {
			throw new BizError(t('notExistRegKey'));
		}

		if (regKeyRow.count <= 0) {
			throw new BizError(t('noRegKeyCount'));
		}

		const today = toUtc().tz('Asia/Shanghai').startOf('day')
		const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');

		if (expireTime.isBefore(today)) {
			throw new BizError(t('regKeyExpire'));
		}

		return regKeyRow;
	},

	computeAccountExpireTime(validityType, baseTime = null) {
		let startTime = baseTime ? toUtc(baseTime) : toUtc();
		const now = toUtc();

		if (!startTime.isValid() || startTime.isBefore(now)) {
			startTime = now;
		}

		switch (validityType) {
			case 'test':
				return startTime.add(3, 'day').format('YYYY-MM-DD HH:mm:ss');
			case 'month':
				return startTime.add(1, 'month').format('YYYY-MM-DD HH:mm:ss');
			case 'quarter':
				return startTime.add(3, 'month').format('YYYY-MM-DD HH:mm:ss');
			case 'year':
				return startTime.add(1, 'year').format('YYYY-MM-DD HH:mm:ss');
			default:
				return null;
		}
	},

	async reduceCount(c, code, count) {
		await orm(c).update(regKey).set({
			count: sql`${regKey.count}
	  -
	  ${count}`
		}).where(eq(regKey.code, code)).run();
	},


	async exportList(c, params) {
		let { validityType } = params;
		validityType = normalizeExportValidityType(validityType || 'all');
		if (!validityType) {
			throw new BizError(t('emptyRegKeyValidity'));
		}

		let query = orm(c).select().from(regKey);
		if (validityType !== 'all') {
			query = query.where(eq(regKey.validityType, validityType));
		}

		const regKeyList = await query.orderBy(desc(regKey.regKeyId)).all();
		const roleList = await roleService.roleSelectUse(c);
		const today = toUtc().tz('Asia/Shanghai').startOf('day');

		return regKeyList.map(regKeyRow => {
			const roleRow = roleList.find(roleRow => roleRow.roleId === regKeyRow.roleId);
			const expireTime = toUtc(regKeyRow.expireTime).tz('Asia/Shanghai').startOf('day');
			return {
				regKeyId: regKeyRow.regKeyId,
				code: regKeyRow.code,
				count: regKeyRow.count,
				roleName: roleRow ? roleRow.name : '',
				validityType: regKeyRow.validityType,
				expireTime: regKeyRow.expireTime,
				status: regKeyRow.count <= 0 ? 'exhausted' : (expireTime.isBefore(today) ? 'expired' : 'normal'),
				createTime: regKeyRow.createTime
			}
		});
	},

	async history(c, params) {
		const { regKeyId } = params;
		return userService.listByRegKeyId(c, regKeyId);
	}
}

export default regKeyService;
