<template>
  <div class="email-page">
    <div class="account-expire-card" :class="{ 'account-expire-card-expired': expireStatus.expired }" v-if="showExpireInfo">
      <Icon icon="mdi:calendar-clock" width="18" height="18" />
      <span>{{ expireStatus.text }}</span>
    </div>
    <emailScroll ref="scroll"
               :cancel-success="cancelStar"
               :star-success="addStar"
               :getEmailList="getEmailList"
               :emailDelete="emailDelete"
               :star-add="starAdd"
               :star-cancel="starCancel"
               :time-sort="params.timeSort"
               :email-read="emailRead"
               :show-unread="true"
               actionLeft="4px"
               @jump="jumpContent"
  >
      <template #first>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-down-outline"
              v-if="params.timeSort === 0" width="28" height="28"/>
        <Icon class="icon" @click="changeTimeSort" icon="material-symbols-light:timer-arrow-up-outline" v-else
              width="28" height="28"/>
      </template>

    </emailScroll>
  </div>
</template>

<script setup>
import {useAccountStore} from "@/store/account.js";
import {useEmailStore} from "@/store/email.js";
import {useSettingStore} from "@/store/setting.js";
import emailScroll from "@/components/email-scroll/index.vue"
import {emailList, emailDelete, emailLatest, emailRead} from "@/request/email.js";
import {starAdd, starCancel} from "@/request/star.js";
import {computed, defineOptions, h, onMounted, reactive, ref, watch} from "vue";
import {sleep} from "@/utils/time-utils.js";
import router from "@/router/index.js";
import {Icon} from "@iconify/vue";
import { useRoute } from 'vue-router'
import {useUserStore} from "@/store/user.js";
import {tzDayjs} from "@/utils/day.js";
import {useI18n} from "vue-i18n";

defineOptions({
  name: 'email'
})

const route = useRoute();
const {t, locale} = useI18n();
const userStore = useUserStore();
const emailStore = useEmailStore();
const accountStore = useAccountStore();
const settingStore = useSettingStore();
const scroll = ref({})
const params = reactive({
  timeSort: 0,
})

const showExpireInfo = computed(() => Boolean(userStore.user?.email))

const expireStatus = computed(() => {
  const expireTime = userStore.user?.expireTime
  const separator = locale.value === 'en' ? ': ' : '：'
  const leftBracket = locale.value === 'en' ? ' (' : '（'
  const rightBracket = locale.value === 'en' ? ')' : '）'

  if (!expireTime) {
    return {
      expired: false,
      text: `${t('accountExpireTime')}${separator}${t('unlimited')}`
    }
  }

  const end = tzDayjs(expireTime)
  const now = tzDayjs()

  if (end.isBefore(now)) {
    return {
      expired: true,
      text: `${t('accountExpireTime')}${separator}${t('expired')}`
    }
  }

  return {
    expired: false,
    text: `${t('accountExpireTime')}${separator}${end.format('YYYY-MM-DD HH:mm')}${leftBracket}${t('accountRemaining')} ${formatRemaining(end.diff(now, 'minute'))}${rightBracket}`
  }
})

function formatRemaining(totalMinutes) {
  const minutes = Math.max(totalMinutes, 0)
  const day = Math.floor(minutes / 1440)
  const hour = Math.floor((minutes % 1440) / 60)
  const minute = minutes % 60

  if (day > 0) {
    return t('remainingDayHour', {day, hour})
  }

  if (hour > 0) {
    return t('remainingHourMinute', {hour, minute})
  }

  return t('remainingMinute', {minute})
}

onMounted(() => {
  emailStore.emailScroll = scroll;
  latest()
})


watch(() => accountStore.currentAccountId, () => {
  scroll.value.refreshList();
})

function changeTimeSort() {
  params.timeSort = params.timeSort ? 0 : 1
  scroll.value.refreshList();
}

function jumpContent(email) {
  emailStore.contentData.email = email
  emailStore.contentData.delType = 'logic'
  emailStore.contentData.showUnread = true
  emailStore.contentData.showStar = true
  emailStore.contentData.showReply = true
  router.push('/message')
}

const existIds = new Set();

async function latest() {
  while (true) {

    let autoRefresh = settingStore.settings.autoRefresh;
    await sleep(autoRefresh > 1 ? autoRefresh * 1000 : 3000);

    if (route.name !== 'email') {
      continue;
    }

    const latestId = scroll.value.latestEmail?.emailId

    if (!scroll.value.firstLoad && autoRefresh > 1) {
      try {
        const accountId = accountStore.currentAccountId
        const allReceive = scroll.value.latestEmail?.allReceive
        const curTimeSort = params.timeSort
        let list = []

        //确保发起请求时最后一个邮件是当前账号的,或者
        if (accountId === scroll.value.latestEmail?.reqAccountId) {
          list = await emailLatest(latestId, accountId, allReceive);
        }

        //确保请求回来后，账号没有切换，时间排序没有改变，全部邮件类型没变
        if (accountId === accountStore.currentAccountId && params.timeSort === curTimeSort && allReceive === accountStore.currentAccount.allReceive) {
          if (list.length > 0) {

            for (let email of list) {

              email.reqAccountId = accountId;
              email.allReceive = allReceive;

              if (!existIds.has(email.emailId)) {

                existIds.add(email.emailId)
                scroll.value.addItem(email)

                await sleep(50)
              }

            }

          }

        }
      } catch (e) {
        if (e.code === 401 || e.code === 403) {
          settingStore.settings.autoRefresh = 0;
        }
        console.error(e)
      }
    }
  }
}

function addStar(email) {
  emailStore.starScroll?.addItem(email)
}

function cancelStar(email) {
  emailStore.starScroll?.deleteEmail([email.emailId])
}

function getEmailList(emailId, size) {
  const accountId =  accountStore.currentAccountId;
  const allReceive = accountStore.currentAccount.allReceive;
  return emailList(accountId, allReceive, emailId, params.timeSort, size, 0).then(data => {
    data.latestEmail.reqAccountId = accountId;
    data.latestEmail.allReceive = allReceive;
    return data;
  })
}

</script>
<style scoped>
.email-page {
  height: 100%;
  min-height: 0;
  display: grid;
  grid-template-rows: auto 1fr;
  overflow: hidden;
}

.email-page :deep(.email-container) {
  min-height: 0;
}

.account-expire-card {
  margin: 0 12px 8px 12px;
  padding: 8px 12px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--el-color-primary);
  background: var(--el-color-primary-light-9);
  border: 1px solid var(--el-color-primary-light-7);
}

.account-expire-card-expired {
  color: var(--el-color-danger);
  background: var(--el-color-danger-light-9);
  border-color: var(--el-color-danger-light-7);
}

.icon {
  cursor: pointer;
}
</style>
