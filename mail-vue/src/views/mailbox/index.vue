<template>
  <div class="mailbox-layout">
    <aside class="mailbox-sidebar">
      <div class="brand">{{ settingStore.settings.title || '邮箱' }}</div>
      <nav aria-label="邮箱菜单"><button class="inbox-menu" @click="backToInbox">✉ 收件箱</button></nav>
    </aside>
    <main class="mailbox-main">
      <header class="mailbox-header">
        <div class="identity"><strong>收件箱</strong><span>{{ mailboxEmail }}</span></div>
        <div class="header-actions">
          <button type="button" @click="openPassword">修改密码</button>
          <button type="button" :disabled="loggingOut" @click="logout">退出登录</button>
        </div>
      </header>
      <section v-if="!selected" class="inbox-content" aria-label="收件邮件">
        <div class="mail-toolbar"><span>共 {{ total }} 封</span><button :disabled="loading" @click="loadMessages(false)">{{ loading ? '刷新中…' : '刷新' }}</button></div>
        <p v-if="loadError" class="error">{{ loadError }}</p>
        <div v-if="!items.length && !loading && !loadError" class="empty">暂无邮件</div>
        <div v-if="!items.length && loading" class="empty">正在加载邮件…</div>
        <button v-for="mail in items" :key="mail.emailId" class="mail-row" @click="openMessage(mail)">
          <span class="sender">{{ mail.name || mail.sendEmail }}</span>
          <span class="summary"><strong>{{ mail.subject || '（无主题）' }}</strong><span>{{ mail.preview }}</span></span>
          <time>{{ formatTime(mail.createTime) }}</time>
        </button>
        <div v-if="hasMore" class="load-more"><button :disabled="loading" @click="loadMessages(true)">{{ loading ? '加载中…' : '加载更多' }}</button></div>
      </section>
      <section v-else class="message-content" aria-label="邮件详情">
        <button @click="backToInbox">← 返回收件箱</button>
        <p v-if="messageLoading" class="empty">正在加载邮件…</p>
        <p v-else-if="messageError" class="error">{{ messageError }}</p>
        <template v-else-if="message">
          <h1>{{ message.subject || '（无主题）' }}</h1>
          <div class="message-meta"><span>{{ message.name }} &lt;{{ message.sendEmail }}&gt;</span><time>{{ formatTime(message.createTime) }}</time></div>
          <iframe v-if="message.content" :srcdoc="safeDocument" title="邮件内容" sandbox="allow-popups allow-popups-to-escape-sandbox" referrerpolicy="no-referrer"></iframe>
          <pre v-else>{{ message.text || '（邮件无正文）' }}</pre>
          <div v-if="message.attachments?.length" class="attachments">
            <span>附件：</span>
            <a v-for="att in message.attachments" :key="att.attId" :href="attachmentUrl(att.key)" target="_blank" rel="noopener noreferrer">{{ att.filename || '附件' }}</a>
          </div>
        </template>
      </section>
    </main>
    <dialog ref="passwordDialog" class="password-dialog" @close="clearPassword">
      <form @submit.prevent="changePassword">
        <h2>修改密码</h2>
        <label>原密码<input v-model="password.oldPassword" type="password" autocomplete="current-password" required maxlength="128" /></label>
        <label>新密码<input v-model="password.newPassword" type="password" autocomplete="new-password" required minlength="6" maxlength="30" placeholder="6至30位" /></label>
        <label>确认新密码<input v-model="password.confirm" type="password" autocomplete="new-password" required minlength="6" maxlength="30" /></label>
        <p class="password-hint">修改成功后，请使用新密码重新登录。</p>
        <p v-if="passwordError" class="error" role="alert">{{ passwordError }}</p>
        <div class="dialog-actions"><button type="button" :disabled="passwordSaving" @click="passwordDialog.close()">取消</button><button class="primary" :disabled="passwordSaving" type="submit">{{ passwordSaving ? '保存中…' : '保存密码' }}</button></div>
      </form>
    </dialog>
  </div>
</template>

<script setup>
import {computed,onMounted,onBeforeUnmount,reactive,ref} from 'vue';
import http from '@/axios';
import {useSettingStore} from '@/store/setting';
import {cvtR2Url} from '@/utils/convert';
const settingStore = useSettingStore();
const mailboxEmail = ref('');
const items = ref([]);
const total = ref(0);
const hasMore = ref(false);
const loading = ref(false);
const loadError = ref('');
const selected = ref(null);
const message = ref(null);
const messageLoading = ref(false);
const messageError = ref('');
const loggingOut = ref(false);
const passwordDialog = ref(null);
const password = reactive({oldPassword:'',newPassword:'',confirm:''});
const passwordError = ref('');
const passwordSaving = ref(false);
let timer;
let messageRequest = 0;

const safeDocument = computed(() => `<meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: http: data:; style-src 'unsafe-inline'; font-src https:; form-action 'none'; base-uri 'none'"><base target="_blank"><style>body{font-family:Arial,sans-serif;overflow-wrap:anywhere}img{max-width:100%;height:auto}</style>${message.value?.content || ''}`);
function attachmentUrl(key) {
  try { const url = new URL(cvtR2Url(key),location.origin); return ['https:','http:'].includes(url.protocol) ? url.href : undefined; }
  catch { return undefined; }
}
function formatTime(value) {
  if (!value) return '';
  const normalized = /(?:Z|[+-]\d\d:\d\d)$/.test(value) ? value : value.replace(' ','T')+'Z';
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('zh-CN',{hour12:false});
}
async function loadMessages(append = false) {
  if (loading.value) return;
  loading.value = true;
  loadError.value = '';
  try {
    const data = await http.get('/mailbox/list',{params:{before:append ? items.value.at(-1)?.emailId : undefined}});
    items.value = append ? [...items.value,...data.items] : data.items;
    total.value = data.total;
    hasMore.value = data.hasMore;
  } catch (e) { loadError.value = e.message || '邮件加载失败，请重试'; }
  finally { loading.value = false; }
}
async function openMessage(mail) {
  const request = ++messageRequest;
  selected.value = mail.emailId;
  message.value = null;
  messageError.value = '';
  messageLoading.value = true;
  try {
    const data = await http.get('/mailbox/message',{params:{id:mail.emailId}});
    if (request === messageRequest) message.value = data;
  } catch (e) { if (request === messageRequest) messageError.value = e.message || '邮件加载失败'; }
  finally { if (request === messageRequest) messageLoading.value = false; }
}
function backToInbox() { messageRequest++; selected.value=null; message.value=null; }
function clearPassword() { password.oldPassword=''; password.newPassword=''; password.confirm=''; passwordError.value=''; }
function openPassword() { clearPassword(); passwordDialog.value.showModal(); }
function leave() { localStorage.removeItem('token'); location.replace('/login'); }
async function logout() {
  loggingOut.value = true;
  try { await http.delete('/mailbox/logout'); leave(); }
  finally { loggingOut.value = false; }
}
async function changePassword() {
  passwordError.value = '';
  if (password.newPassword !== password.confirm) { passwordError.value='两次输入的新密码不一致'; return; }
  passwordSaving.value = true;
  try { await http.post('/mailbox/password',{oldPassword:password.oldPassword,newPassword:password.newPassword}); leave(); }
  catch(e) { passwordError.value = e.message || '修改失败，请重试'; }
  finally { passwordSaving.value = false; }
}
onMounted(async () => {
  const me = await http.get('/mailbox/me');
  mailboxEmail.value = me.email;
  await loadMessages();
  timer = setInterval(() => { if (!document.hidden && !selected.value) loadMessages(); },30000);
});
onBeforeUnmount(() => { clearInterval(timer); messageRequest++; });
</script>

<style scoped>
.mailbox-layout{display:flex;min-height:100dvh;background:#fff;color:#24364a;font:14px/1.5 system-ui,-apple-system,sans-serif}
.mailbox-sidebar{width:240px;flex-shrink:0;background:#031827;color:#fff;padding:16px 10px;box-sizing:border-box}
.brand{font-size:18px;font-weight:700;text-align:center;padding:12px 8px;margin-bottom:18px;background:#2e8aeb;border-radius:7px;overflow-wrap:anywhere}
button{font:inherit;cursor:pointer;border:1px solid #d6e0eb;border-radius:5px;background:#fff;color:#25405d;padding:7px 12px}
button:hover{background:#edf6ff}button:disabled{opacity:.6;cursor:wait}button:focus-visible,a:focus-visible{outline:2px solid #2584e5;outline-offset:2px}
.inbox-menu{width:100%;text-align:left;background:#172f41;color:#fff;border:0;font-weight:700;padding:11px 18px}.inbox-menu:hover{background:#24445a}
.mailbox-main{flex:1;min-width:0}.mailbox-header{display:flex;justify-content:space-between;align-items:center;gap:15px;min-height:70px;padding:10px 24px;border-bottom:1px solid #e8edf4;box-sizing:border-box}
.identity{display:flex;gap:20px;align-items:center;min-width:0}.identity strong{font-size:17px;white-space:nowrap}.identity span{color:#758295;overflow-wrap:anywhere}.header-actions{display:flex;gap:8px;flex-shrink:0}
.mail-toolbar{display:flex;justify-content:space-between;align-items:center;padding:13px 24px;border-bottom:1px solid #e8edf4;color:#758295}
.mail-row{display:flex;align-items:center;gap:20px;width:100%;text-align:left;border:0;border-bottom:1px solid #edf0f5;border-radius:0;padding:19px 24px}
.sender{width:160px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.summary{flex:1;min-width:0}.summary strong,.summary>span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.summary>span{color:#94a0af;font-size:13px;margin-top:4px}.mail-row time{color:#8a96a6;font-size:12px;flex-shrink:0}
.empty{text-align:center;padding:65px 20px;color:#8a96a6}.error{color:#c13131;margin:16px 24px;overflow-wrap:anywhere}.load-more{text-align:center;padding:24px}
.message-content{padding:24px}.message-content h1{font-size:22px;overflow-wrap:anywhere}.message-meta{display:flex;justify-content:space-between;gap:14px;color:#7b899b;padding-bottom:20px;flex-wrap:wrap;overflow-wrap:anywhere}.message-content iframe{border:1px solid #e8edf4;border-radius:5px;width:100%;height:65dvh;background:#fff;box-sizing:border-box}.message-content pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}.attachments{display:flex;gap:15px;flex-wrap:wrap;padding-top:20px}.attachments a{color:#1677d2;overflow-wrap:anywhere}
.password-dialog{border:1px solid #dfe7ef;border-radius:12px;width:360px;max-width:calc(100vw - 60px);padding:26px;color:#24364a;background:#fff}.password-dialog::backdrop{background:rgba(0,18,40,.4)}.password-dialog h2{margin:0 0 20px;font-size:20px}.password-dialog label{display:block;margin-top:14px}.password-dialog input{display:block;box-sizing:border-box;width:100%;padding:10px;margin-top:5px;border:1px solid #cbd6e3;border-radius:5px;font:inherit;color:#24364a;background:#fff}.password-hint{font-size:12px;color:#7b899b}.password-dialog .error{margin:12px 0}.dialog-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:22px}.primary{color:#fff;background:#2584e5;border-color:#2584e5}.primary:hover{background:#1675d6}
@media(max-width:767px){.mailbox-layout{flex-direction:column}.mailbox-sidebar{width:100%;padding:8px 12px;display:flex;align-items:center;gap:14px}.brand{font-size:15px;margin:0;padding:8px 12px;max-width:55%}.inbox-menu{white-space:nowrap}.mailbox-header{align-items:flex-start;flex-direction:column;padding:14px 16px;gap:10px}.identity{gap:12px}.identity span{font-size:12px}.header-actions{align-self:flex-end}.mail-toolbar{padding:12px 16px}.mail-row{position:relative;padding:14px 16px;display:grid;grid-template-columns:1fr auto;gap:6px}.sender{width:auto;min-width:0}.summary{grid-column:1 / -1;grid-row:2}.mail-row time{grid-column:2;grid-row:1;font-size:11px}.message-content{padding:16px}.message-content h1{font-size:19px}.message-content iframe{height:60dvh}}
</style>

