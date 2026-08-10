import http from '@/axios/index.js'

export function accountList(accountId, size, lastSort, keyword = '') {
    return http.get('/account/list', {params: {accountId, size, lastSort, keyword}});
}

export function accountAdd(email,token) {
    return http.post('/account/add', {email,token})
}

export function accountSetName(accountId,name) {
    return http.put('/account/setName', {name,accountId})
}

export function accountDelete(accountId) {
    return http.delete('/account/delete', {params: {accountId}})
}

export function accountSetAllReceive(accountId) {
    return http.put('/account/setAllReceive', {accountId})
}

export function accountSetAsTop(accountId) {
    return http.put('/account/setAsTop', {accountId})
}

export function accountResetPopSecret(accountId) {
    return http.post('/account/popSecret/reset', {accountId})
}

export function accountDeletePopSecret(accountId) {
    return http.delete('/account/popSecret/delete', {params: {accountId}})
}

export function accountBatchRandomAdd(count, domain, prefixLength = 10, generatePopSecret = true) {
    return http.post('/account/batchRandomAdd', {count, domain, prefixLength, generatePopSecret})
}

export function accountBatchResetPopSecretExport(accountIds = []) {
    return http.post('/account/popSecret/batchResetExport', {accountIds})
}
