import app from '../hono/hono';
import result from '../model/result';
import pop3Service from '../service/pop3-service';
import BizError from '../error/biz-error';

function assertGatewayToken(c) {
	const expected = c.env.pop3_gateway_token || c.env.POP3_GATEWAY_TOKEN;
	if (!expected) {
		throw new BizError('POP3 gateway token is not configured on Worker: pop3_gateway_token', 500);
	}

	const auth = c.req.header('authorization') || '';
	const bearer = auth.replace(/^Bearer\s+/i, '').trim();
	const token = c.req.header('x-pop3-gateway-token') || bearer;

	if (!token || token !== expected) {
		throw new BizError('Invalid POP3 gateway token', 401);
	}
}

app.get('/pop3/health', async (c) => {
	assertGatewayToken(c);
	return c.json(result.ok({ ok: true, time: new Date().toISOString() }));
});

app.post('/pop3/auth', async (c) => {
	assertGatewayToken(c);
	const data = await pop3Service.auth(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/pop3/list', async (c) => {
	assertGatewayToken(c);
	const data = await pop3Service.list(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/pop3/message', async (c) => {
	assertGatewayToken(c);
	const data = await pop3Service.message(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/pop3/delete', async (c) => {
	assertGatewayToken(c);
	const data = await pop3Service.delete(c, await c.req.json());
	return c.json(result.ok(data));
});
