<template>
  <div class="reg-key">
    <div class="header-actions">
      <Icon class="icon" icon="ion:add-outline" width="23" height="23" @click="openAdd"/>
      <Icon class="icon" icon="fluent:copy-add-24-regular" width="23" height="23" @click="openBatchAdd"/>
      <el-dropdown class="export-dropdown" trigger="click">
        <Icon class="icon" icon="material-symbols:download-rounded" width="22" height="22"/>
        <template #dropdown>
          <el-dropdown-menu>
            <el-dropdown-item @click="exportRegKeys('test')">{{ $t('exportTestRegKey') }}</el-dropdown-item>
            <el-dropdown-item @click="exportRegKeys('month')">{{ $t('exportMonthRegKey') }}</el-dropdown-item>
            <el-dropdown-item @click="exportRegKeys('quarter')">{{ $t('exportQuarterRegKey') }}</el-dropdown-item>
            <el-dropdown-item @click="exportRegKeys('year')">{{ $t('exportYearRegKey') }}</el-dropdown-item>
            <el-dropdown-item divided @click="exportRegKeys('all')">{{ $t('exportAllRegKey') }}</el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
      <div class="search">
        <el-input
            v-model="params.code"
            class="search-input"
            :placeholder="$t('searchRegKeyDesc')"
        >
        </el-input>
      </div>
      <Icon class="icon" icon="iconoir:search" @click="search" width="20" height="20"/>
      <Icon class="icon" icon="ion:reload" width="18" height="18" @click="refresh"/>
      <Icon class="icon" icon="fluent:broom-sparkle-16-regular" width="22" height="22" @click="clearNotUse"/>
    </div>

    <el-scrollbar class="scrollbar">
      <div  class="loading" :class="regKeyLoading ? 'loading-show' : 'loading-hide'" :style="regKeyFirst ? 'background: transparent' : ''">
        <loading/>
      </div>
      <div class="code-box">
        <div class="code-item" v-for="item in regKeyData">
          <div class="code-info">
            <div class="info-left">
              <div class="info-left-item">
                <span class="code" @click="copyCode(item.code)">{{ item.code }}</span>
              </div>
              <div class="info-left-item">
                <div>{{ $t('remainingUses') }}：</div>
                <div v-if="item.count">{{ item.count }}</div>
                <el-tag v-else type="danger">{{ $t('exhausted') }}</el-tag>
              </div>
              <div class="info-left-item">
                <div>{{ $t('roleDesc') }}：</div>
                <el-tag>{{ item.roleName }}</el-tag>
              </div>
              <div class="info-left-item">
                <div>{{ $t('accountValidity') }}：</div>
                <el-tag>{{ formatValidityType(item.validityType) }}</el-tag>
              </div>
              <div class="info-left-item">
                <div>{{ $t('validUntil') }}：</div>
                <div v-if="item.expireTime">{{ formatExpireTime(item.expireTime) }}</div>
                <el-tag v-else type="danger">{{ $t('expired') }}</el-tag>
              </div>
            </div>
            <div class="info-right">
              <el-dropdown class="setting">
                <Icon icon="fluent:settings-24-filled" width="21" height="21" color="#909399"/>
                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="copyCode(item.code)">{{ $t('copy') }}</el-dropdown-item>
                    <el-dropdown-item @click="openHistory(item)">{{ $t('history') }}</el-dropdown-item>
                    <el-dropdown-item @click="deleteRegKey(item)">{{ $t('delete') }}</el-dropdown-item>
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </div>
          </div>
        </div>
      </div>
      <div class="empty" v-if="regKeyData.length === 0">
        <el-empty v-if="!regKeyFirst" :image-size="isMobile ? 120 : null" :description="$t('noCodeFound')"/>
      </div>
    </el-scrollbar>
    <el-dialog v-model="showAdd" :title="$t('addRegKey')">
      <div class="container">
        <el-input v-model="addForm.code" :placeholder="$t('regKey')">
          <template #suffix>
            <Icon @click.stop="genCode" class="gen-code" icon="bitcoin-icons:refresh-filled" width="24" height="24"/>
          </template>
        </el-input>
        <el-select v-model="addForm.roleId" :placeholder="$t('roleDesc')">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-select v-model="addForm.validityType" :placeholder="$t('accountValidity')">
          <el-option :label="$t('validityTest')" value="test"/>
          <el-option :label="$t('validityMonth')" value="month"/>
          <el-option :label="$t('validityQuarter')" value="quarter"/>
          <el-option :label="$t('validityYear')" value="year"/>
        </el-select>
        <el-date-picker
            v-model="addForm.expireTime"
            type="date"
            :placeholder="$t('validUntil')"
        />
        <el-input-number v-model="addForm.count" :min="1" :max="99999"/>
        <el-button class="btn" type="primary" @click="submit" :loading="addLoading"
        >{{ $t('add') }}
        </el-button>
      </div>
    </el-dialog>
    <el-dialog v-model="showBatchAdd" :title="$t('batchAddRegKey')">
      <div class="container">
        <el-select v-model="batchForm.roleId" :placeholder="$t('roleDesc')">
          <el-option v-for="item in roleList" :label="item.name" :value="item.roleId" :key="item.roleId"/>
        </el-select>
        <el-select v-model="batchForm.validityType" :placeholder="$t('accountValidity')">
          <el-option :label="$t('validityTest')" value="test"/>
          <el-option :label="$t('validityMonth')" value="month"/>
          <el-option :label="$t('validityQuarter')" value="quarter"/>
          <el-option :label="$t('validityYear')" value="year"/>
        </el-select>
        <el-date-picker
            v-model="batchForm.expireTime"
            type="date"
            :placeholder="$t('validUntil')"
        />
        <div class="form-row">
          <span>{{ $t('batchCount') }}</span>
          <el-input-number v-model="batchForm.batchCount" :min="1" :max="1000"/>
        </div>
        <div class="form-row">
          <span>{{ $t('perRegKeyUseCount') }}</span>
          <el-input-number v-model="batchForm.count" :min="1" :max="99999"/>
        </div>
        <div class="form-row">
          <span>{{ $t('regKeyLength') }}</span>
          <el-input-number v-model="batchForm.codeLength" :min="6" :max="32"/>
        </div>
        <el-alert :title="$t('batchRegKeyDesc')" type="info" :closable="false"/>
        <el-button class="btn" type="primary" @click="submitBatchAdd" :loading="batchLoading"
        >{{ $t('batchAdd') }}
        </el-button>
      </div>
    </el-dialog>
    <el-dialog class="history-list" v-model="showRegKeyHistory" :title="$t('useHistory')">
      <div class="loading" :class="historyLoading ? 'loading-show' : 'loading-hide'">
        <loading/>
      </div>
      <el-table v-if="!historyLoading" :data="historyList" :fit="true" style="height: 100%">
        <el-table-column :min-width="emailColumnWidth" property="email" :label="$t('user')"
                         :show-overflow-tooltip="true"/>
        <el-table-column :width="createTimeColumnWidth" :formatter="formatUserCreateTime" property="createTime"
                         :label="$t('date')" :show-overflow-tooltip="true"/>
        <el-table-column :width="createTimeColumnWidth" :formatter="formatUserExpireTime" property="expireTime"
                         :label="$t('accountExpireTime')" fixed="right" :show-overflow-tooltip="true"/>
      </el-table>
    </el-dialog>
  </div>
</template>

<script setup>
import {defineOptions, nextTick, reactive, ref, watch} from "vue"
import {Icon} from "@iconify/vue";
import loading from "@/components/loading/index.vue";
import {useSettingStore} from "@/store/setting.js";
import {roleSelectUse} from "@/request/role.js";
import {useRoleStore} from "@/store/role.js";
import {regKeyAdd, regKeyList, regKeyClearNotUse, regKeyDelete, regKeyHistory, regKeyBatchAdd, regKeyExport} from "@/request/reg-key.js";
import {getTextWidth} from "@/utils/text.js";
import dayjs from "dayjs";
import {tzDayjs} from "@/utils/day.js";
import {useI18n} from "vue-i18n";

defineOptions({
  name: 'reg-key'
})

const roleStore = useRoleStore();
const settingStore = useSettingStore();
const params = reactive({
  code: '',
})

const {t} = useI18n()
const roleList = reactive([])
const addLoading = ref(false)
const batchLoading = ref(false)
const exportLoading = ref(false)
const showAdd = ref(false)
const showBatchAdd = ref(false)
const regKeyLoading = ref(true)
const regKeyFirst = ref(true)
const showRegKeyHistory = ref(false)
const historyList = reactive([])
const emailColumnWidth = ref(0)
const createTimeColumnWidth = ref(0)
const historyLoading = ref(false)
const isMobile = window.innerWidth < 1025

const addForm = reactive({
  code: '',
  count: 1,
  roleId: null,
  validityType: 'month',
  expireTime: null
})

const batchForm = reactive({
  batchCount: 10,
  count: 1,
  roleId: null,
  validityType: 'month',
  expireTime: null,
  codeLength: 8
})

const regKeyData = reactive([])

getList(true)

roleSelectUse().then(list => {
  roleList.length = 0
  roleList.push(...list)
})

watch(() => roleStore.refresh, () => {
  roleSelectUse().then(list => {
    roleList.length = 0
    roleList.push(...list)
  })
})

function openHistory(regKey) {

  historyList.length = 0
  historyLoading.value = true
  regKeyHistory(regKey.regKeyId).then(list => {

    historyList.push(...list)
    if (list.length > 0) {

      const email = list.reduce((a, b) =>
          compareByLengthAndUpperCase(a, b, 'email')
      ).email;

      emailColumnWidth.value = getTextWidth(email) + 30
      emailColumnWidth.value = emailColumnWidth.value < 300 ? emailColumnWidth.value : 300
      const createTime = list.reduce((a, b) =>
          compareByLengthAndUpperCase(a, b, 'createTime')
      ).createTime;
      createTimeColumnWidth.value = getTextWidth(createTime)
    }

  }).finally(() => {
    historyLoading.value = false
  })

  showRegKeyHistory.value = true
}

const compareByLengthAndUpperCase = (a, b, key) => {
  const getUpperCaseCount = (str) => (str.match(/[A-Z]/g) || []).length;
  if (a[key].length === b[key].length) {
    return getUpperCaseCount(a[key]) > getUpperCaseCount(b[key]) ? a : b;
  }
  return a[key].length > b[key].length ? a : b;
};

function formatUserCreateTime(regKey) {
  const createTime = tzDayjs(regKey.createTime);
  const currentYear = dayjs().year();
  const expireYear = createTime.year();

  if (settingStore.lang === 'en') {

    if (expireYear === currentYear) {
      return createTime.format('MMM D, HH:mm');
    } else {
      return createTime.format('MMM D, YYYY HH:mm');
    }

  } else {

    if (expireYear === currentYear) {
      return createTime.format('M月D日 HH:mm');
    } else {
      return createTime.format('YYYY年M月D日 HH:mm');
    }

  }

}

function formatExpireTime(expireTime) {
  const expireDate = tzDayjs(expireTime);
  const currentYear = dayjs().year();
  const expireYear = expireDate.year();

  if (settingStore.lang === 'en') {

    return expireYear === currentYear
        ? expireDate.format('MMM D')
        : expireDate.format('MMM D, YYYY');

  } else {

    return expireYear === currentYear
        ? expireDate.format('M月D日')
        : expireDate.format('YYYY年M月D日');

  }
}

function formatUserExpireTime(row) {
  if (!row.expireTime) {
    return t('unlimited')
  }
  const expireDate = tzDayjs(row.expireTime);
  const currentYear = dayjs().year();
  const expireYear = expireDate.year();

  if (settingStore.lang === 'en') {
    return expireYear === currentYear
        ? expireDate.format('MMM D, HH:mm')
        : expireDate.format('MMM D, YYYY HH:mm');
  }

  return expireYear === currentYear
      ? expireDate.format('M月D日 HH:mm')
      : expireDate.format('YYYY年M月D日 HH:mm');
}

function formatValidityType(validityType) {
  const map = {
    test: t('validityTest'),
    month: t('validityMonth'),
    quarter: t('validityQuarter'),
    year: t('validityYear')
  }
  return map[validityType] || t('unknown')
}

function refresh() {
  params.code = null
  getList(true)
}

function search() {
  getList(true)
}

function getList(showLoading = false) {
  if (showLoading) {
    regKeyLoading.value = true
  }
  regKeyList(params).then(list => {
    regKeyData.length = 0
    regKeyData.push(...list)
    regKeyLoading.value = false
    setTimeout(() => {
      regKeyFirst.value = false
    },200)
  })
}

async function copyCode(code) {
  try {
    await navigator.clipboard.writeText(code);
    ElMessage({
      message: t('copySuccessMsg'),
      type: 'success',
      plain: true,
    })
  } catch (err) {
    console.error('复制失败:', err);
    ElMessage({
      message: '复制失败',
      type: 'error',
      plain: true,
    })
  }
}

function genCode() {
  addForm.code = generateRandomCode()
}

function generateRandomCode(length = 8) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function clearNotUse() {
  ElMessageBox.confirm(t('clearRegKey'), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    regKeyClearNotUse().then(() => {
      ElMessage({
        message: t('clearSuccess'),
        type: 'success',
        plain: true,
      })
      getList()
    })
  });
}

function submit() {

  if (!addForm.code) {
    ElMessage({
      message: t('emptyRegKeyMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.roleId) {
    ElMessage({
      message: t('emptyRole'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.validityType) {
    ElMessage({
      message: t('emptyValidityMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.expireTime) {
    ElMessage({
      message: t('emptyTimeMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!addForm.count) {
    ElMessage({
      message: t('emptyCountMsg'),
      type: "error",
      plain: true
    })
    return
  }

  addLoading.value = true
  regKeyAdd(addForm).then(() => {
    showAdd.value = false
    resetForm()
    ElMessage({
      message: t('addSuccessMsg'),
      type: "success",
      plain: true
    })
    getList()
  }).finally(() => {
    addLoading.value = false
  })
}

function submitBatchAdd() {

  if (!batchForm.roleId) {
    ElMessage({
      message: t('emptyRole'),
      type: "error",
      plain: true
    })
    return
  }

  if (!batchForm.validityType) {
    ElMessage({
      message: t('emptyValidityMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!batchForm.expireTime) {
    ElMessage({
      message: t('emptyTimeMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!batchForm.batchCount) {
    ElMessage({
      message: t('emptyBatchCountMsg'),
      type: "error",
      plain: true
    })
    return
  }

  if (!batchForm.count) {
    ElMessage({
      message: t('emptyCountMsg'),
      type: "error",
      plain: true
    })
    return
  }

  batchLoading.value = true
  regKeyBatchAdd(batchForm).then((codes) => {
    showBatchAdd.value = false
    resetBatchForm()
    ElMessage({
      message: t('batchAddSuccessMsg', {count: codes.length}),
      type: "success",
      plain: true
    })
    getList()
  }).finally(() => {
    batchLoading.value = false
  })
}

function exportRegKeys(validityType) {
  if (exportLoading.value) {
    return
  }
  exportLoading.value = true
  regKeyExport(validityType).then((list) => {
    if (!list || list.length === 0) {
      ElMessage({
        message: t('exportNoDataMsg'),
        type: "warning",
        plain: true
      })
      return
    }

    const content = buildRegKeyExportContent(list, validityType)
    const blob = new Blob([content], {type: 'text/plain;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${t(getExportFileNameKey(validityType))}-${dayjs().format('YYYYMMDD-HHmmss')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    ElMessage({
      message: t('exportSuccessMsg'),
      type: "success",
      plain: true
    })
  }).finally(() => {
    exportLoading.value = false
  })
}

function buildRegKeyExportContent(list, validityType) {
  const title = t(getExportTitleKey(validityType))
  const lines = [
    title,
    `${t('exportTime')}：${dayjs().format('YYYY-MM-DD HH:mm:ss')}`,
    `${t('exportTotal')}：${list.length}`,
    '',
    `${t('regKey')}----${t('accountValidity')}----${t('remainingUses')}----${t('validUntil')}----${t('roleDesc')}----${t('status')}`
  ]

  list.forEach(item => {
    lines.push([
      item.code,
      formatValidityType(item.validityType),
      item.count,
      item.expireTime ? formatExportExpireTime(item.expireTime) : '',
      item.roleName || '',
      formatRegKeyStatus(item.status)
    ].join('----'))
  })

  return lines.join('\n')
}

function getExportTitleKey(validityType) {
  const map = {
    test: 'exportTestRegKeyTitle',
    month: 'exportMonthRegKeyTitle',
    quarter: 'exportQuarterRegKeyTitle',
    year: 'exportYearRegKeyTitle',
    all: 'exportAllRegKeyTitle'
  }
  return map[validityType] || 'exportAllRegKeyTitle'
}

function getExportFileNameKey(validityType) {
  const map = {
    test: 'exportTestRegKeyFile',
    month: 'exportMonthRegKeyFile',
    quarter: 'exportQuarterRegKeyFile',
    year: 'exportYearRegKeyFile',
    all: 'exportAllRegKeyFile'
  }
  return map[validityType] || 'exportAllRegKeyFile'
}

function formatExportExpireTime(expireTime) {
  return tzDayjs(expireTime).format('YYYY-MM-DD HH:mm:ss')
}

function formatRegKeyStatus(status) {
  const map = {
    normal: t('normal'),
    exhausted: t('exhausted'),
    expired: t('expired')
  }
  return map[status] || status || ''
}

function deleteRegKey(regKey) {
  ElMessageBox.confirm(t('delConfirm', {msg: regKey.code}), {
    confirmButtonText: t('confirm'),
    cancelButtonText: t('cancel'),
    type: 'warning'
  }).then(() => {
    regKeyDelete([regKey.regKeyId]).then(() => {
      getList()
      ElMessage({
        message: t('delSuccessMsg'),
        type: "success",
        plain: true
      })
    })
  });
}

function resetForm() {
  addForm.code = ''
  addForm.count = 1
  addForm.roleId = null
  addForm.validityType = 'month'
  addForm.expireTime = null
}

function resetBatchForm() {
  batchForm.batchCount = 10
  batchForm.count = 1
  batchForm.roleId = null
  batchForm.validityType = 'month'
  batchForm.expireTime = null
  batchForm.codeLength = 8
}

function openAdd() {
  genCode()
  showAdd.value = true
}

function openBatchAdd() {
  showBatchAdd.value = true
}

</script>

<style scoped lang="scss">
.reg-key {
  height: 100%;
  overflow: hidden;
}

.scrollbar {
  height: calc(100% - 48px);
  position: relative;
  background: var(--extra-light-fill);
  @media (max-width: 372px) {
    height: calc(100% - 85px);
  }

  .code-box {
    padding: 15px 15px 25px 15px;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
    gap: 15px;

    .code-item {
      background: var(--el-bg-color);
      border-radius: 8px;
      border: 1px solid var(--el-border-color);
      transition: all 200ms;
      padding: 15px;

      .code-info {
        display: flex;

        .info-left {
          flex: 1;
          min-width: 0;

          .info-left-item {
            display: flex;
            padding-top: 5px;

            .code {
              font-weight: bold;;
              font-size: 16px;
              white-space: nowrap;
              overflow: hidden;
              text-overflow: ellipsis;
              cursor: pointer;
            }
          }

          .info-left-item:first-child {
            padding-top: 0;
          }
        }

        .info-right {
          display: flex;
          flex-direction: column;
          padding-top: 2px;
          gap: 5px;
        }
      }
    }
  }
}

.empty {
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
}

:deep(.history-list.el-dialog) {
  min-height: 300px;
  width: 500px !important;
  @media (max-width: 540px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.history-list .loading {
  position: absolute;
  top: 10px;
  z-index: 0;
  background: rgba(255, 255, 255, 0);
}

:deep(.history-list .el-dialog__header) {
  padding-bottom: 5px;
}

:deep(.el-scrollbar__view) {
  height: calc(100% - 80px);
}

.loading {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--loadding-background);
  z-index: 2;
}

.loading-show {
  transition: all 200ms ease 200ms;
  opacity: 1;
}

.loading-hide {
  pointer-events: none;
  transition: var(--loading-hide-transition);
  opacity: 0;
}

.container {
  display: grid;
  grid-template-columns: 1fr;
  gap: 15px;
}

.form-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

:deep(.el-dialog) {
  width: 400px !important;
  @media (max-width: 440px) {
    width: calc(100% - 40px) !important;
    margin-right: 20px !important;
    margin-left: 20px !important;
  }
}

.setting, .export-dropdown {
  cursor: pointer;
}

.gen-code {
  color: #606266;
  cursor: pointer;
}

.header-actions {
  padding: 9px 15px;
  display: flex;
  gap: 18px;
  flex-wrap: wrap;
  align-items: center;
  box-shadow: inset 0 -1px 0 0 rgba(100, 121, 143, 0.12);
  font-size: 18px;
  @media (max-width: 767px) {
    gap: 15px;
  }

  .search-input {
    width: min(200px, calc(100vw - 140px));
  }

  .search {
    :deep(.el-input-group) {
      height: 28px;
    }

    :deep(.el-input__inner) {
      height: 28px;
    }
  }

  .icon {
    cursor: pointer;
  }
}

:deep(.el-table__inner-wrapper:before) {
  background: var(--el-bg-color);
}

</style>
