import app from '../hono/hono';
import result from '../model/result';
import smtpService from '../service/smtp-service';
import BizError from '../error/biz-error';

function assertGatewayToken(c) {
	const expected = c.env.smtp_gateway_token || c.env.SMTP_GATEWAY_TOKEN || c.env.pop3_gateway_token || c.env.POP3_GATEWAY_TOKEN;
	if (!expected) {
		throw new BizError('SMTP gateway token is not configured on Worker: smtp_gateway_token', 500);
	}

	const auth = c.req.header('authorization') || '';
	const bearer = auth.replace(/^Bearer\s+/i, '').trim();
	const token = c.req.header('x-smtp-gateway-token') || c.req.header('x-pop3-gateway-token') || bearer;

	if (!token || token !== expected) {
		throw new BizError('Invalid SMTP gateway token', 401);
	}
}

app.get('/smtp/health', async (c) => {
	assertGatewayToken(c);
	return c.json(result.ok({ ok: true, time: new Date().toISOString() }));
});

app.post('/smtp/auth', async (c) => {
	assertGatewayToken(c);
	const data = await smtpService.auth(c, await c.req.json());
	return c.json(result.ok(data));
});

app.post('/smtp/send', async (c) => {
	assertGatewayToken(c);
	const data = await smtpService.send(c, await c.req.json());
	return c.json(result.ok(data));
});
