import app from '../hono/hono';
import result from '../model/result';
import mailboxService from '../service/mailbox-service';

app.get('/mailbox/me', c => {
  const {email} = c.get('mailbox');
  return c.json(result.ok({email}));
});
app.get('/mailbox/list', async c => c.json(result.ok(await mailboxService.list(c,c.get('mailbox'),c.req.query()))));
app.get('/mailbox/message', async c => c.json(result.ok(await mailboxService.message(c,c.get('mailbox'),c.req.query('id')))));
app.post('/mailbox/password', async c => {
  await mailboxService.changePassword(c,c.get('mailbox'),await c.req.json());
  return c.json(result.ok());
});
app.delete('/mailbox/logout', async c => {
  await mailboxService.logout(c,c.get('mailbox'));
  return c.json(result.ok());
});
