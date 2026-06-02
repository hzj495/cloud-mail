import orm from '../entity/orm';
import regKey from '../entity/reg-key';
import { inArray, like, eq, desc, sql, or } from 'drizzle-orm';
import roleService from './role-service';
import BizError from '../error/biz-error';
import { formatDetailDate, toUtc } from '../utils/date-uitil';
import userService from './user-service';
import { t } from '../i18n/i18n.js';

const REG_KEY_VALIDITY_TYPES = ['month', 'quarter', 'year'];

function normalizeValidityType(validityType) {
	return REG_KEY_VALIDITY_TYPES.includes(validityType) ? validityType : '';
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

	computeAccountExpireTime(validityType) {
		switch (validityType) {
			case 'month':
				return toUtc().add(1, 'month').format('YYYY-MM-DD HH:mm:ss');
			case 'quarter':
				return toUtc().add(3, 'month').format('YYYY-MM-DD HH:mm:ss');
			case 'year':
				return toUtc().add(1, 'year').format('YYYY-MM-DD HH:mm:ss');
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

	async history(c, params) {
		const { regKeyId } = params;
		return userService.listByRegKeyId(c, regKeyId);
	}
}

export default regKeyService;
