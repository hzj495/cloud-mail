// This controls presentation only; the Worker verifies signatures and permissions.
export function isMailboxSession(token = localStorage.getItem('token')) {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part.padEnd(Math.ceil(part.length / 4) * 4, '='))).scope === 'mailbox';
  } catch { return false; }
}
