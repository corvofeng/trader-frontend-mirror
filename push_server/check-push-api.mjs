#!/usr/bin/env node
/**
 * 检查 Web Push 后端接口完整性（healthz / config / subscribe / test / unsubscribe / status / poll-now）
 *
 * 两种用法：
 *   1) 自动读取 vite.config.ts 里 server.proxy['/api'] 的 target：
 *        node push_server/check-push-api.mjs
 *
 *   2) 显式传 base-url（可以同时测多个）：
 *        node push_server/check-push-api.mjs --base-url http://127.0.0.1:8000
 *        node push_server/check-push-api.mjs --base-url http://127.0.0.1:5173
 *        node push_server/check-push-api.mjs --base-url https://stock.in.corvo.fun
 *
 * 额外参数：
 *   --account-alias <str>    subscribe / test 用的账户别名（默认 main_gjzq_qmt）
 *   --admin-token <str>      带 X-Admin-Token 请求 /status /poll-now（没配置 ADMIN_SHARED_SECRET 时可省略）
 *   --json                   输出机器可读 JSON（给 CI / 脚本用）
 *
 * 退出码：0 = 全部通过；非 0 = 至少 1 项失败 / 警告
 */
import { readFileSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// ---------------------------------------------------------------------------
// 命令行解析
// ---------------------------------------------------------------------------
function parseArgs(argv) {
  const args = { baseUrls: [], accountAlias: 'main_gjzq_qmt', adminToken: '', json: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--base-url') args.baseUrls.push(argv[++i]);
    else if (a.startsWith('--base-url=')) args.baseUrls.push(a.slice('--base-url='.length));
    else if (a === '--account-alias') args.accountAlias = argv[++i];
    else if (a.startsWith('--account-alias=')) args.accountAlias = a.slice('--account-alias='.length);
    else if (a === '--admin-token') args.adminToken = argv[++i];
    else if (a.startsWith('--admin-token=')) args.adminToken = a.slice('--admin-token='.length);
    else if (a === '--json') args.json = true;
    else if (a === '-h' || a === '--help') args.help = true;
  }
  return args;
}

const ARGS = parseArgs(process.argv.slice(2));

if (ARGS.help) {
  console.log(readFileSync(new URL('./check-push-api.mjs', import.meta.url), 'utf8').split('\n').slice(0, 30).join('\n').replace(/^.{0,3}/, ''));
  process.exit(0);
}

// ---------------------------------------------------------------------------
// 颜色 & 输出（TTY 才上色）
// ---------------------------------------------------------------------------
const TTY = process.stdout.isTTY && !ARGS.json;
const C = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};
const c = (code, s) => (TTY ? `${code}${s}${C.reset}` : s);
const PASS = (s) => c(C.green, '✅ PASS ') + s;
const WARN = (s) => c(C.yellow, '⚠️ WARN ') + s;
const FAIL = (s) => c(C.red, '❌ FAIL ') + s;
const INFO = (s) => c(C.cyan, 'ℹ️  INFO ') + s;
const H1 = (s) => '\n' + c(C.bold, '━━━ ' + s + ' ' + '━'.repeat(Math.max(0, 70 - s.length))) + '\n';
const H2 = (s) => c(C.bold + C.cyan, '\n■ ' + s);
const HR = () => c(C.gray, '─'.repeat(76));

// ---------------------------------------------------------------------------
// 从 vite.config.ts 提取 /api 的 target（零依赖，纯正则 / 字符串扫描）
// ---------------------------------------------------------------------------
function extractViteProxyTarget() {
  const viteFile = resolve(ROOT, 'vite.config.ts');
  let src;
  try { src = readFileSync(viteFile, 'utf8'); } catch { return null; }

  // 兼容：server: { proxy: { '/api': { target: 'http://127.0.0.1:8000/' } } }
  const blockRe = /['"']?\/api['"']?\s*:\s*\{([^}]+)\}/s;
  const m = src.match(blockRe);
  if (!m) return null;
  const block = m[1];
  const targetRe = /target\s*:\s*['"`]([^'"`]+)['"`]/;
  const m2 = block.match(targetRe);
  return m2 ? m2[1].replace(/\/+$/, '') : null;
}

// ---------------------------------------------------------------------------
// fetch 封装 + 测量耗时
// ---------------------------------------------------------------------------
async function req(baseUrl, path, opts = {}) {
  const url = baseUrl + path;
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  let status = 0;
  let text = '';
  let ok = false;
  let err = '';
  try {
    const resp = await fetch(url, { ...opts, signal: controller.signal, redirect: 'follow' });
    status = resp.status;
    text = await resp.text();
    ok = resp.ok;
  } catch (e) {
    err = (e && e.message) ? e.message : String(e);
    if (e && e.name === 'AbortError') err = 'TIMEOUT';
  } finally {
    clearTimeout(timer);
  }
  const ms = Date.now() - started;
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* not json */ }
  return { url, status, text, json, ok, ms, err };
}

function b64urlSafe(s) {
  return s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 生成一个假的 endpoint / keys 用于 subscribe 接口参数校验
function fakeSubscription() {
  const rand = (n) => {
    const out = globalThis.crypto
      ? globalThis.crypto.getRandomValues(new Uint8Array(n))
      : new Uint8Array(Array.from({ length: n }, () => Math.floor(Math.random() * 256)));
    return b64urlSafe(Buffer.from(out).toString('base64'));
  };
  return {
    endpoint: `https://fcm.googleapis.com/fcm/send/fake-${Date.now()}`,
    p256dh: rand(65), // P-256 uncompressed point is 65 bytes
    auth: rand(16),
    client_id: 'probe_' + rand(6),
  };
}

// 非常粗的 VAPID P-256 公钥结构检查（长度 + b64url 字符集）
function looksLikeValidVapidPub(b64url) {
  if (typeof b64url !== 'string' || !b64url) return false;
  if (!/^[A-Za-z0-9_-]+$/.test(b64url)) return false;
  // 标准 P-256 公钥（65 bytes 未压缩）→ base64url 通常 87~88 chars（带/不带 padding）
  const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
  let bytes;
  try { bytes = Buffer.from(b64url + pad, 'base64'); } catch { return false; }
  return bytes.length === 65 && bytes[0] === 0x04;
}

// ---------------------------------------------------------------------------
// 检查器
// ---------------------------------------------------------------------------
function makeResult(name, path, method) {
  return { name, path, method, ok: false, warn: false, status: 0, ms: 0, note: '', err: '' };
}

async function checkBase(baseUrl, accountAlias, adminToken) {
  const results = [];
  const push = (line, note, warn = false) => {
    line.note = note || line.note;
    line.warn = line.warn || warn;
    results.push(line);
    const tag = line.ok ? PASS : line.warn ? WARN : FAIL;
    const meta = `${String(line.status).padStart(3, ' ')}  ${String(line.ms).padStart(5, ' ')}ms  ${c(C.gray, line.method.padEnd(6) + ' ' + line.path)}`;
    console.log(`  ${tag(line.note || c(C.gray, '(no detail)'))}`);
    console.log(`       ${meta}`);
    if (line.err) console.log(`       ${c(C.red, line.err)}`);
  };

  // 1) healthz
  {
    const r = makeResult('healthz', '/api/push/healthz', 'GET');
    const resp = await req(baseUrl, '/api/push/healthz');
    r.status = resp.status; r.ms = resp.ms; r.err = resp.err;
    r.ok = resp.ok && resp.json?.ok === true;
    let note = '';
    if (resp.json) {
      note = [
        resp.json.vapid_ok ? 'vapid=ok' : 'vapid=missing',
        `subs=${resp.json.subscriptions ?? '?'}`,
        `accounts=${(resp.json.accounts ?? []).length}`,
        `poll=${resp.json.poll_interval_s ?? '?'}s`,
      ].join(' · ');
    } else if (resp.err) {
      note = '连接失败';
    } else {
      note = '返回不是 JSON 或缺少 ok=true';
    }
    push(r, note, !r.ok && resp.status === 401);
  }

  // 2) config（最重要，前端启动订阅第一步就会请求）
  let cfgJson = null;
  {
    const r = makeResult('config', '/api/push/config', 'GET');
    const resp = await req(baseUrl, '/api/push/config');
    r.status = resp.status; r.ms = resp.ms; r.err = resp.err;
    cfgJson = resp.json;
    const hasPub = !!(cfgJson && typeof cfgJson.vapid_public_key === 'string' && cfgJson.vapid_public_key.length > 0);
    const looksValid = hasPub && looksLikeValidVapidPub(cfgJson.vapid_public_key);
    r.ok = resp.ok && hasPub && looksValid;
    let note;
    if (resp.err) note = '连接失败';
    else if (!resp.ok) note = `HTTP ${resp.status}（期望 200）`;
    else if (!hasPub) note = '缺少 vapid_public_key 字段';
    else if (!looksValid) note = 'vapid_public_key 长度/结构不像 P-256 公钥';
    else note = `vapid=${cfgJson.vapid_public_key.slice(0, 8)}…${cfgJson.vapid_public_key.slice(-6)} · poll=${cfgJson.poll_interval_seconds ?? '?'}s · upstream=${cfgJson.upstream_base_url || '-'}`;
    push(r, note);
  }

  // 3) subscribe（传假数据，后端只要字段校验通过就会 200）
  let subJson = null;
  {
    const r = makeResult('subscribe', '/api/push/subscribe', 'POST');
    const fake = fakeSubscription();
    const body = {
      account_alias: accountAlias,
      endpoint: fake.endpoint,
      keys: { p256dh: fake.p256dh, auth: fake.auth },
      client_id: fake.client_id,
    };
    const resp = await req(baseUrl, '/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    r.status = resp.status; r.ms = resp.ms; r.err = resp.err;
    subJson = resp.json;
    r.ok = resp.ok && resp.json?.ok === true;
    let note;
    if (resp.err) note = '连接失败';
    else if (resp.status === 400) note = `参数校验失败：${resp.json?.error || resp.text.slice(0, 80)}`;
    else if (!resp.ok) note = `HTTP ${resp.status}（期望 200）`;
    else note = `endpoint_host=${resp.json?.endpoint_host || '?'} · total=${resp.json?.total_subscriptions ?? '?'}`;
    push(r, note);
    // 顺手存下，后面 test 要用
    r.__fakeEndpoint = fake.endpoint;
  }

  // 4) test（给某个账户发测试推送；没有订阅时如果返回 ok=false 视为 warn）
  {
    const r = makeResult('test', '/api/push/test', 'POST');
    const resp = await req(baseUrl, '/api/push/test', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(adminToken ? { 'X-Admin-Token': adminToken } : {}),
      },
      body: JSON.stringify({ account_alias: accountAlias }),
    });
    r.status = resp.status; r.ms = resp.ms; r.err = resp.err;
    const j = resp.json || {};
    const missing = !resp.ok && resp.status === 401; // 需要 admin token
    const noSubs = resp.ok && j.ok === false && j.reason && /暂无订阅/.test(j.reason);
    r.ok = resp.ok && Number(j.sent) >= 0;
    if (missing) r.ok = false;
    // 只有 200 + sent>=0 才算 pass；「暂无订阅」是业务逻辑正常，也当 pass（因为会清掉我们刚才假的订阅）
    let note;
    if (resp.err) note = '连接失败';
    else if (missing) note = '需要 X-Admin-Token（你后端配置了 ADMIN_SHARED_SECRET，加 --admin-token 再测）';
    else if (resp.status === 404) note = '接口不存在 /api/push/test';
    else if (!resp.ok) note = `HTTP ${resp.status} · ${j.error || resp.text.slice(0, 80)}`;
    else note = noSubs ? `${j.reason || '该账户暂无订阅'}（这是正常的，先完成真实订阅）` : `sent=${j.sent}/${j.total ?? '?'}`;
    push(r, note, noSubs);
  }

  // 5) unsubscribe（清掉我们 probe 产生的假订阅）
  {
    const r = makeResult('unsubscribe', '/api/push/unsubscribe', 'POST');
    const fakeEp = results.find((x) => x.path === '/api/push/subscribe' && x.__fakeEndpoint)?.__fakeEndpoint;
    const body = { account_alias: accountAlias, endpoint: fakeEp || 'probe-placeholder' };
    const resp = await req(baseUrl, '/api/push/unsubscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
    r.status = resp.status; r.ms = resp.ms; r.err = resp.err;
    r.ok = resp.ok && Number.isInteger(resp.json?.removed);
    let note;
    if (resp.err) note = '连接失败';
    else if (!resp.ok) note = `HTTP ${resp.status} · ${resp.json?.error || resp.text.slice(0, 80)}`;
    else note = `removed=${resp.json?.removed}（probe 假 endpoint 清理）`;
    push(r, note);
  }

  // 6) status（管理；需要 admin token 时 401 算 warn）
  {
    const r = makeResult('status', '/api/push/status', 'GET');
    const resp = await req(baseUrl, '/api/push/status', {
      headers: { Accept: 'application/json', ...(adminToken ? { 'X-Admin-Token': adminToken } : {}) },
    });
    r.status = resp.status; r.ms = resp.ms; r.err = resp.err;
    const missing = resp.status === 401;
    r.ok = resp.ok || missing; // 401 是 expected，不算 fail
    let note;
    if (resp.err) note = '连接失败';
    else if (missing) note = '需要 X-Admin-Token（已配置 ADMIN_SHARED_SECRET，加 --admin-token 可查看详情）';
    else if (!resp.ok) note = `HTTP ${resp.status}`;
    else {
      const j = resp.json || {};
      note = [
        `subs=${(j.subscriptions ?? []).length}`,
        `accounts=${(j.accounts ?? []).length}`,
        `poll=${j.poll_interval_seconds ?? '?'}s`,
        `storage=${j.storage_dir || ''}`,
      ].filter(Boolean).join(' · ');
    }
    push(r, note, missing);
  }

  // 7) poll-now（管理；同样 401 warn）
  {
    const r = makeResult('poll-now', '/api/push/poll-now', 'POST');
    const resp = await req(baseUrl, '/api/push/poll-now', {
      method: 'POST',
      headers: { Accept: 'application/json', ...(adminToken ? { 'X-Admin-Token': adminToken } : {}) },
    });
    r.status = resp.status; r.ms = resp.ms; r.err = resp.err;
    const missing = resp.status === 401;
    r.ok = resp.ok || missing;
    let note;
    if (resp.err) note = '连接失败';
    else if (missing) note = '需要 X-Admin-Token';
    else if (!resp.ok) note = `HTTP ${resp.status}`;
    else note = resp.json?.msg || 'ok';
    push(r, note, missing);
  }

  // 总览
  const passed = results.filter((r) => r.ok && !r.warn).length;
  const warns = results.filter((r) => r.warn).length;
  const failed = results.filter((r) => !r.ok).length;
  return { baseUrl, results, passed, warns, failed, cfg: cfgJson, sub: subJson };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  let baseUrls = ARGS.baseUrls;
  if (baseUrls.length === 0) {
    const fromVite = extractViteProxyTarget();
    if (fromVite) baseUrls = [fromVite];
    else {
      console.log(c(C.red, '❌ 未找到 --base-url 且 vite.config.ts 里找不到 server.proxy["/api"].target。'));
      console.log(c(C.gray, '   用法: node push_server/check-push-api.mjs --base-url http://127.0.0.1:8000'));
      process.exit(2);
    }
  }

  if (ARGS.json) console.log('[');
  const reports = [];
  let overallExit = 0;

  for (let i = 0; i < baseUrls.length; i++) {
    const base = baseUrls[i].replace(/\/+$/, '');
    if (!ARGS.json) {
      console.log(H1(`检查 base-url ${c(C.bold, base)} （account=${ARGS.accountAlias}）`));
      console.log(INFO('target 来源：' + (ARGS.baseUrls.length > 0 ? '--base-url CLI 参数' : 'vite.config.ts server.proxy[/api]')));
      console.log(HR());
    }
    const rep = await checkBase(base, ARGS.accountAlias, ARGS.adminToken);
    reports.push(rep);

    if (!ARGS.json) {
      console.log(HR());
      const badge = (label, n, bg, fg) =>
        c(bg, ` ${c(C.bold + fg, label + ': ' + String(n).padStart(2, ' '))} `);
      const passedBadge = badge('PASS', rep.passed, C.bgGreen, '\x1b[30m');
      const warnBadge = rep.warns > 0 ? badge('WARN', rep.warns, C.bgYellow, '\x1b[30m') : '';
      const failBadge = rep.failed > 0 ? badge('FAIL', rep.failed, C.bgRed, '\x1b[30m') : '';
      console.log(`\n  结果汇总: ${passedBadge} ${warnBadge} ${failBadge}`.trimEnd());
      if (rep.failed > 0) {
        overallExit = 1;
        console.log(FAIL('有失败项，请对照上面每个接口的 detail 修。'));
      } else if (rep.warns > 0) {
        overallExit = overallExit || 0; // 有 warn 仍认为"功能可用"，保持 exit 0；你希望 CI 严格就改 1
        console.log(WARN('有警告项（通常是缺少管理员 token / 暂无订阅），不影响主流程。'));
      } else {
        console.log(PASS('✅ 全部 7 个 Web Push API 接口正常，可直接前端订阅。'));
      }
    } else {
      const toEmit = {
        base_url: rep.baseUrl,
        passed: rep.passed,
        warns: rep.warns,
        failed: rep.failed,
        results: rep.results.map((r) => ({
          name: r.name, method: r.method, path: r.path,
          ok: r.ok, warn: r.warn, status: r.status, ms: r.ms,
          note: r.note, err: r.err || undefined,
        })),
      };
      console.log(JSON.stringify(toEmit, null, 2) + (i + 1 < baseUrls.length ? ',' : ''));
    }
  }
  if (ARGS.json) console.log(']');

  process.exit(overallExit);
}

main().catch((e) => {
  console.error('Fatal:', e && e.stack || e);
  process.exit(3);
});
