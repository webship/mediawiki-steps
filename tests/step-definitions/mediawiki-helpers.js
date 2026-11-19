'use strict';

// Shared helpers for the step files of this pack.
//
// Not a step file: it registers no step definitions and no hooks. It holds the
// plumbing the steps use and that a project can require for its own steps:
// the addresses of the wiki, the waits on the wiki's own signals (its module
// loader, its hooks, its job queue), the users registry and the session cache,
// the messages of a page, the request the browser cut, and a client of the
// wiki's API that works as the administrator of the users registry for the
// test data (pages, files, protection, blocks) and its cleanup.
//
// Every lookup starts with what a person reads (a label, a role, a text) and
// falls back to the stable hooks of the wiki's pages (`mw.config`, the ids of
// its forms, the classes of its messages). Everything builds on webship-js's
// own helpers (`gotoUrl`, `friendly`) so the steps fail the way the core
// webship-js steps do.

const fs = require('fs');
const path = require('path');
const { gotoUrl, friendly } = require('webship-js/tests/step-definitions/webship');

/** The per-assertion wait budget: `minWaitTime.page` from cucumber.js, at least 10 seconds. */
function budget(world) {
  return Math.max((world && world.minWaitTime && world.minWaitTime.page) || 0, 10000);
}

/** The settle budget after an action (`minWaitTime.page`, 3 seconds by default). */
function settleBudget(world) {
  return (world && world.minWaitTime && world.minWaitTime.page) || 3000;
}

/** Escape a literal string for use in a RegExp. */
function escapeRegExp(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** White space (and the bidirectional marks the wiki puts around names) collapsed and trimmed. */
function clean(text) {
  return String(text === null || text === undefined ? '' : text).replace(/[‪-‮‎‏]/g, '').replace(/\s+/g, ' ').trim();
}

/** A list for an error message: `"a", "b", "c"` or `(none)`. */
function listed(values) {
  const items = [...new Set((values || []).map(clean).filter(Boolean))];
  return items.length ? items.map((item) => `"${item}"`).join(', ') : '(none)';
}

/** A page title as the wiki writes it in addresses: spaces as underscores, the first letter upper case. */
function titleKey(title) {
  const key = clean(title).replace(/ /g, '_');
  const colon = key.indexOf(':');
  const upper = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  // "Talk:page" → "Talk:Page": the namespace and the name each start upper case.
  if (colon > 0) return upper(key.slice(0, colon)) + ':' + upper(key.slice(colon + 1));
  return upper(key);
}

/** A page title as the wiki shows it: underscores as spaces, the first letter upper case. */
function titleText(title) {
  return titleKey(title).replace(/_/g, ' ');
}

/** An account name as the wiki stores it: the first letter upper case. */
function wikiUserName(name) {
  const n = clean(name).replace(/_/g, ' ');
  return n.charAt(0).toUpperCase() + n.slice(1);
}

/** The site root without a trailing slash. */
function siteRoot(world) {
  return String(world.launchUrl || (world.parameters && world.parameters.launchUrl) || '').replace(/\/+$/, '');
}

/** The folder of index.php and api.php (`worldParameters.scriptPath`, '' at the root). */
function scriptPath(world) {
  const value = String((world.parameters && world.parameters.scriptPath) || '').replace(/\/+$/, '');
  return value && !value.startsWith('/') ? '/' + value : value;
}

/** The skin the steps ask for (`worldParameters.skin`), or '' for the wiki's default. */
function skinParam(world) {
  return String((world.parameters && world.parameters.skin) || '').trim();
}

/** The address of index.php with a title and parameters (and the skin of `worldParameters.skin`). */
function indexUrl(world, title, params = {}) {
  const query = new URLSearchParams();
  if (title) query.set('title', titleKey(title));
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null) query.set(key, String(value));
  }
  if (skinParam(world) && !query.has('useskin')) query.set('useskin', skinParam(world));
  return `${siteRoot(world)}${scriptPath(world)}/index.php?${query.toString()}`;
}

/** The address of api.php. */
function apiUrl(world) {
  return `${siteRoot(world)}${scriptPath(world)}/api.php`;
}

/** A value of the page's own configuration (`mw.config`), or null before the wiki's scripts ran. */
async function config(world, key) {
  return world.page.evaluate((k) => (window.mw && mw.config ? mw.config.get(k) : null), key).catch(() => null);
}

// ---------------------------------------------------------------------------
// The request the browser cut, and opening a page
// ---------------------------------------------------------------------------

/**
 * Whether the browser shows its own error page instead of the wiki's answer:
 * Chromium aborts every request in flight when the network of the machine
 * changes (a container starting or stopping on it) and shows
 * chrome-error://chromewebdata/. Returns a sentence for an error message, or ''.
 */
function cutRequest(world) {
  const url = String(world.page.url() || '');
  if (url.startsWith('chrome-error://')) {
    return `the browser shows its own error page (${url}): the request was cut before the wiki answered`;
  }
  return '';
}

/** The hint of a failure where the browser cut the request. */
const CUT_HINT = 'The browser cut the request (a network change on the machine, such as a container starting); nothing is wrong with the scenario. Run it again. On a shared machine, run the suite in the project\'s container (cmd-tools-testing.sh <project> --run in the Webship Workspace), where the network of the host does not reach.';

/**
 * Wait for the page to go quiet after an action: the document is loaded and
 * the wiki's module loader has no module still loading.
 */
async function settle(world, timeout) {
  const deadline = Date.now() + (timeout || settleBudget(world));
  await world.page.waitForLoadState('load', { timeout: Math.max(deadline - Date.now(), 1) }).catch(() => {});
  await world.page.waitForFunction(() => {
    // The loader is defined in stages while the page starts: read it only once it is whole.
    if (!window.mw || !mw.loader || typeof mw.loader.getModuleNames !== 'function' || typeof mw.loader.getState !== 'function') return document.readyState === 'complete';
    return !mw.loader.getModuleNames().some((name) => mw.loader.getState(name) === 'loading');
  }, null, { timeout: Math.max(deadline - Date.now(), 1) }).catch(() => {});
}

/**
 * Wait until the modules the page asked for (the wiki writes them in RLPAGEMODULES)
 * are ready: `mw.loader.using()` resolved. Returns the modules that failed.
 */
async function pageModulesReady(world, timeout) {
  const t = timeout || budget(world);
  await world.page.waitForFunction(() => !!(window.mw && mw.loader && typeof mw.loader.using === 'function' && typeof mw.loader.getState === 'function'), null, { timeout: t });
  return world.page.evaluate((ms) => new Promise((resolve) => {
    const modules = (window.RLPAGEMODULES || []).filter((name) => mw.loader.getState(name) !== null);
    const timer = setTimeout(() => resolve(modules.filter((name) => mw.loader.getState(name) !== 'ready').map((name) => `${name} (${mw.loader.getState(name)})`)), ms);
    mw.loader.using(modules).then(() => { clearTimeout(timer); resolve([]); }, () => {
      clearTimeout(timer);
      resolve(modules.filter((name) => mw.loader.getState(name) !== 'ready').map((name) => `${name} (${mw.loader.getState(name)})`));
    });
  }), t);
}

/**
 * Wait until modules of the wiki's module loader are ready (`mw.loader.using()`
 * resolved), loading them if the page has not yet. Fails with the states of the
 * modules that did not get there.
 */
async function waitForModules(world, modules, { what } = {}) {
  const list = [].concat(modules).filter(Boolean);
  const t = budget(world);
  try {
    await world.page.waitForFunction(() => !!(window.mw && mw.loader && typeof mw.loader.using === 'function' && typeof mw.loader.getState === 'function'), null, { timeout: t });
  } catch {
    throw friendly({ message: `The wiki's scripts did not start on ${world.page.url()} (no module loader). ${cutRequest(world)}`.trim(), hint: cutRequest(world) ? CUT_HINT : 'The page must be a page of the wiki, with JavaScript on.' });
  }
  const failed = await world.page.evaluate(({ names, ms }) => new Promise((resolve) => {
    const known = names.filter((name) => mw.loader.getState(name) !== null);
    const unknown = names.filter((name) => mw.loader.getState(name) === null);
    const timer = setTimeout(() => resolve(names.map((name) => `${name}: ${mw.loader.getState(name)}`)), ms);
    mw.loader.using(known).then(() => { clearTimeout(timer); resolve(unknown.map((name) => `${name}: not registered`)); },
      () => { clearTimeout(timer); resolve(known.map((name) => `${name}: ${mw.loader.getState(name)}`).filter((s) => !/: ready$/.test(s))); });
  }), { names: list, ms: t });
  if (failed.length) {
    throw friendly({
      message: `${what || 'The wiki\'s modules'} did not load: ${failed.join(', ')}.`,
      hint: 'A module that is "not registered" belongs to an extension or a skin the wiki does not have; "error" means its script failed (see the browser console).',
    });
  }
}

/**
 * Opening another page leaves the page on screen: an editor with changes asks
 * "Leave site?" (a beforeunload prompt), and a person who opens another page
 * means to leave. The prompt is accepted; every other dialog is left to
 * webship-js's dialog steps when a scenario set them up, and dismissed otherwise
 * (Playwright's own default).
 */
function leaveEditorsWithoutAsking(world) {
  const page = world.page;
  if (page.__webshipLeaveHandler) return;
  page.__webshipLeaveHandler = (dialog) => {
    if (world._dialogHandler) return;
    (dialog.type() === 'beforeunload' ? dialog.accept() : dialog.dismiss()).catch(() => {});
  };
  page.on('dialog', page.__webshipLeaveHandler);
}

/**
 * Open a URL and wait for the page to settle. A network change on the machine
 * aborts a navigation once now and then (ERR_NETWORK_CHANGED, or the browser's
 * own error page): the step goes again, once.
 */
async function open(world, url) {
  leaveEditorsWithoutAsking(world);
  try {
    await gotoUrl(world.page, url);
  } catch (err) {
    if (!/ERR_NETWORK_CHANGED|chrome-error:\/\/chromewebdata|ERR_ABORTED/.test(String(err && err.message))) throw err;
    await world.page.waitForTimeout(500);
    await gotoUrl(world.page, url);
  }
  if (cutRequest(world)) {
    await world.page.waitForTimeout(500);
    await gotoUrl(world.page, url);
  }
  await world.page.waitForSelector('body', { state: 'attached', timeout: budget(world) });
  await settle(world);
}

/** Open a page of the wiki by its title (with parameters such as action=edit). */
async function openPage(world, title, params) {
  await open(world, indexUrl(world, title, params));
}

/**
 * Run an action that sends a form or follows a link, and wait for the new page:
 * the browser leaves the page it was on and the new one is loaded.
 */
async function afterNavigation(world, fn) {
  await Promise.all([
    world.page.waitForNavigation({ timeout: budget(world), waitUntil: 'load' }).catch(() => {}),
    fn(),
  ]);
  await world.page.waitForLoadState('load', { timeout: budget(world) }).catch(() => {});
  await settle(world);
}

/**
 * Wait until a locator has (or, with `notCase`, no longer has) a visible match
 * and fail with a friendly error otherwise.
 */
async function assertPresence(locator, notCase, { label, hint, timeout, found }) {
  try {
    await locator.first().waitFor({ state: notCase ? 'hidden' : 'visible', timeout });
  } catch {
    const seen = found ? await found().catch(() => '') : '';
    throw friendly({
      message: (notCase ? `Expected not to see ${label}, but it is on the page.` : `Expected to see ${label}, but it did not appear within ${timeout} ms.`) + (seen ? ` ${seen}` : ''),
      hint,
    });
  }
}

/** Poll a reading until it satisfies a check, or fail with the last reading. */
async function eventually(world, read, check, explain, timeout) {
  const deadline = Date.now() + (timeout || budget(world));
  let value;
  for (;;) {
    value = await read();
    if (check(value)) return value;
    if (Date.now() > deadline) throw friendly(explain(value));
    await world.page.waitForTimeout(200);
  }
}

/** The title the page shows (#firstHeading), as a person reads it. */
async function shownTitle(world) {
  return clean(await world.page.locator('#firstHeading, h1').first().innerText({ timeout: 2000 }).catch(() => ''));
}

/** What the page on screen says about itself, for an error message. */
async function pageSummary(world) {
  const cut = cutRequest(world);
  if (cut) return cut;
  const heading = await shownTitle(world);
  const action = await config(world, 'wgAction');
  return `the page shows "${heading || '(no heading)'}"${action ? ` (action ${action})` : ''} at ${world.page.url()}`;
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const MESSAGE_SELECTORS = {
  error: '.cdx-message--error, .mw-message-box-error, .errorbox, .permissions-errors, .mw-htmlform-field-error, .oo-ui-fieldLayout-messages .oo-ui-flaggedElement-error',
  warning: '.cdx-message--warning, .mw-message-box-warning, .warningbox, .mw-warning-with-logexcerpt',
  success: '.cdx-message--success, .mw-message-box-success, .successbox, .mw-preferences-messagebox',
  notice: '.postedit, .mw-notification',
};

/** The visible messages of a kind (error, warning, success, notice), each split into its lines. */
async function messages(world, kind) {
  return world.page.evaluate((selector) => {
    const out = [];
    const boxes = [...document.querySelectorAll(selector)];
    for (const box of boxes) {
      if (boxes.some((other) => other !== box && other.contains(box))) continue;
      const style = getComputedStyle(box);
      const rect = box.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || (!rect.width && !rect.height)) continue;
      for (const line of (box.innerText || '').split('\n')) {
        const text = line.replace(/[‪-‮‎‏]/g, '').replace(/\s+/g, ' ').trim();
        if (text) out.push(text);
      }
    }
    return out;
  }, MESSAGE_SELECTORS[kind]).catch(() => []);
}

/** Whether a message (or a part of it) is among the lines: the bidi marks and white space are ignored. */
function hasMessage(lines, expected) {
  const want = clean(expected).toLowerCase();
  const joined = clean(lines.join(' ')).toLowerCase();
  return lines.some((line) => clean(line).toLowerCase().includes(want)) || joined.includes(want);
}

// ---------------------------------------------------------------------------
// Accounts and sessions
// ---------------------------------------------------------------------------

/**
 * An account of the users registry in cucumber.js (`worldParameters.users`),
 * by the handle a scenario names it with.
 *
 * @returns {{handle: string, username: string, password: string, email: (string|undefined), wikiName: string}}
 */
function resolveUser(world, handle) {
  const users = (world.parameters && world.parameters.users) || {};
  const entry = users[handle];
  if (!entry) {
    throw friendly({
      message: `The user "${handle}" is not in the users registry. Known users: ${Object.keys(users).join(', ') || '(none)'}.`,
      hint: `Add it to worldParameters.users in cucumber.js: users: { ${handle}: { username: '${handle}', password: process.env.${String(handle).toUpperCase()}_PASSWORD } }. The account itself is created once by the build of the wiki, never by a feature.`,
    });
  }
  if (!entry.username || !entry.password) {
    throw friendly({
      message: `The user "${handle}" has no ${entry.username ? 'password' : 'user name'} in the users registry.`,
      hint: `Set worldParameters.users.${handle}.username and .password in cucumber.js, from environment variables.`,
    });
  }
  return { handle, username: entry.username, password: entry.password, email: entry.email, wikiName: wikiUserName(entry.username) };
}

/** A handle of the users registry stands for its account name; anything else is an account name. */
function accountName(world, who) {
  const users = (world.parameters && world.parameters.users) || {};
  return users[who] ? resolveUser(world, who).wikiName : wikiUserName(who);
}

// The sessions of the accounts that logged in during this run, by site and
// account: the cookies of the browser after a login through the form.
const SESSIONS = new Map();

function sessionKey(world, username) {
  return `${siteRoot(world)}|${wikiUserName(username).toLowerCase()}`;
}

function reuseSessions(world) {
  return !(world.parameters && world.parameters.reuseSessions === false);
}

/** The account the page says is signed in (`wgUserName`), or null for a visitor. */
async function signedInName(world) {
  return config(world, 'wgUserName');
}

const LOGIN_HINT = 'The login page is Special:UserLogin: the fields "Username" and "Password", the box "Keep me logged in" and the button "Log in". Check launchUrl and scriptPath in cucumber.js.';
const THROTTLE = /too many recent login attempts/i;

/**
 * Fill in and send the login form, then read its outcome: the account the next
 * page says is signed in, or the error messages of the login page.
 *
 * @returns {Promise<{name: (string|null), errors: string[]}>}
 */
async function submitLogin(world, username, password, { remember = false } = {}) {
  await world.page.context().clearCookies();
  world.__sessionKey = null;
  await openPage(world, 'Special:UserLogin');
  const page = world.page;
  try {
    await page.locator('#wpName1').waitFor({ state: 'visible', timeout: budget(world) });
  } catch (err) {
    throw friendly({ message: `The login form did not appear: ${await pageSummary(world)}.`, cause: err, hint: cutRequest(world) ? CUT_HINT : LOGIN_HINT });
  }
  await page.locator('#wpName1').fill(username);
  await page.locator('#wpPassword1').fill(password);
  if (remember) await page.locator('#wpRemember').check();
  await afterNavigation(world, () => page.locator('#wpLoginAttempt').click());
  const cut = cutRequest(world);
  if (cut) return { name: null, errors: [cut], cut: true };
  const name = await signedInName(world);
  const errors = name ? [] : await messages(world, 'error');
  return { name, errors };
}

/** Take over the session an account opened earlier in this run. */
async function restoreSession(world, user) {
  const key = sessionKey(world, user.username);
  const cookies = SESSIONS.get(key);
  if (!cookies || !reuseSessions(world)) return false;
  const context = world.page.context();
  await context.clearCookies();
  await context.addCookies(cookies);
  await openPage(world, 'Special:BlankPage');
  if ((await signedInName(world)) === user.wikiName) {
    world.__sessionKey = key;
    return true;
  }
  SESSIONS.delete(key);
  await context.clearCookies();
  return false;
}

/**
 * Log in as an account of the users registry, by its handle: take over its
 * session when it has one from earlier in the run, else log in through the
 * form and keep the session for the next scenario.
 */
async function logInAs(world, handle) {
  const user = resolveUser(world, handle);
  if (await restoreSession(world, user)) return user;
  const outcome = await submitLogin(world, user.username, user.password);
  if (outcome.name !== user.wikiName) {
    const throttled = outcome.errors.some((e) => THROTTLE.test(e));
    throw friendly({
      message: `Could not log in as "${handle}" (${user.username}): ${outcome.name ? `the wiki says "${outcome.name}" is signed in` : listed(outcome.errors)}.`,
      hint: outcome.cut ? CUT_HINT : (throttled
        ? 'The wiki allows 5 failed logins of an account from one address in 5 minutes; a successful login clears the count. Wait 5 minutes, and keep the scenarios that try wrong passwords to accounts the other scenarios do not use.'
        : 'Check the user name and the password of the account in worldParameters.users, and that the build of the wiki created the account (createAndPromote).'),
    });
  }
  if (reuseSessions(world)) {
    const key = sessionKey(world, user.username);
    SESSIONS.set(key, await world.page.context().cookies());
    world.__sessionKey = key;
  }
  return user;
}

/** Forget the session of the browser in the session cache: it ended (a logout). */
function forgetSession(world) {
  if (world.__sessionKey) SESSIONS.delete(world.__sessionKey);
  world.__sessionKey = null;
}

// ---------------------------------------------------------------------------
// The editors
// ---------------------------------------------------------------------------

/**
 * Close the visual editor's welcome dialog when it shows ("Welcome to <wiki>"):
 * it opens over the first editor an account opens, and the page behind it is
 * inert until it is closed. "Start editing" keeps the editor that was opened.
 * Waits for the editor's own init module first, which decides whether to show it.
 */
async function closeWelcomeDialog(world) {
  const page = world.page;
  const hasEditorInit = await page.evaluate(() => !!(window.mw && mw.loader && mw.loader.getState('ext.visualEditor.desktopArticleTarget.init'))).catch(() => false);
  if (!hasEditorInit) return;
  await page.evaluate(() => mw.loader.using('ext.visualEditor.desktopArticleTarget.init')).catch(() => {});
  // The dialog is shown by the module ext.visualEditor.welcome, which the init module loads only
  // when the account has not seen it (its option visualeditor-hidebetawelcome).
  const shown = await page.evaluate(() => {
    const hidden = mw.user && mw.user.options && String(mw.user.options.get('visualeditor-hidebetawelcome')) === '1';
    const state = mw.loader.getState('ext.visualEditor.welcome');
    return !!document.querySelector('.ve-init-mw-welcomeDialog') || (!hidden && state !== 'registered') || ['loading', 'loaded', 'executing'].includes(state);
  }).catch(() => false);
  if (!shown) return;
  const dialog = page.locator('.ve-init-mw-welcomeDialog.oo-ui-window-active');
  await dialog.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await dialog.count()) {
    await dialog.getByRole('button', { name: 'Start editing' }).click();
    await page.waitForFunction(() => !document.querySelector('.ve-init-mw-welcomeDialog.oo-ui-window-active') && !document.querySelector('.mw-page-container[inert]'), null, { timeout: budget(world) }).catch(() => {});
  }
}

/** Whether the visual editor is open on the page. */
async function visualEditorActive(world) {
  return world.page.evaluate(() => document.documentElement.classList.contains('ve-active') && !!(window.ve && ve.init && ve.init.target && ve.init.target.active)).catch(() => false);
}

/**
 * Count the times a hook of the wiki (mw.hook) fires from now on. The wiki's hooks
 * remember their last firing and replay it to a late listener, so the count starts
 * at what the listener saw at once, and a wait is for a count above it.
 */
async function countHook(world, name) {
  return world.page.evaluate((hook) => {
    window.__webshipHooks = window.__webshipHooks || {};
    if (!(hook in window.__webshipHooks)) {
      window.__webshipHooks[hook] = 0;
      mw.hook(hook).add(() => { window.__webshipHooks[hook] += 1; });
    }
    return window.__webshipHooks[hook];
  }, name);
}

/** Wait until a hook counted by countHook() fired more than `seen` times. */
async function waitForHook(world, name, seen, timeout) {
  await world.page.waitForFunction(({ hook, n }) => window.__webshipHooks && window.__webshipHooks[hook] > n, { hook: name, n: seen }, { timeout: timeout || budget(world) * 2 });
}

// ---------------------------------------------------------------------------
// Files of the pack and of the project
// ---------------------------------------------------------------------------

/**
 * A file a step reads: a path from the project (where cucumber-js runs), else
 * from this pack's own folder, so a feature copied from the pack finds the
 * fixtures that ship with it (tests/fixtures/).
 */
function fixturePath(file) {
  const candidates = [path.resolve(process.cwd(), file), path.resolve(__dirname, '..', '..', file)];
  const found = candidates.find((candidate) => fs.existsSync(candidate));
  if (!found) {
    throw friendly({ message: `The file "${file}" is not there (looked in ${candidates.join(' and ')}).`, hint: 'Give the path from the project root, for example tests/fixtures/blue-square.png (the pack ships it).' });
  }
  return found;
}

// ---------------------------------------------------------------------------
// The wiki's API, as the administrator of the users registry
// ---------------------------------------------------------------------------

const API_CLIENTS = new Map();
const MARKER = '(test page of a scenario)';

/** The handle of the account the test-data steps work as (`worldParameters.wikiAdmin`). */
function adminHandle(world) {
  return (world.parameters && world.parameters.wikiAdmin) || 'administrator';
}

/**
 * A client of the wiki's API, logged in as the administrator of the users
 * registry (action=clientlogin), with its own cookies: the browser's session is
 * never touched. One client per site and account, for the whole run.
 */
async function adminApi(world) {
  const admin = resolveUser(world, adminHandle(world));
  const key = `${apiUrl(world)}|${admin.wikiName}`;
  if (API_CLIENTS.has(key)) return API_CLIENTS.get(key);
  const { request } = require('playwright');
  const context = await request.newContext({ ignoreHTTPSErrors: true });
  const endpoint = apiUrl(world);
  const call = async (params, { post = false, multipart = null } = {}) => {
    const form = { format: 'json', formatversion: '2', ...params };
    let response;
    for (let attempt = 0; ; attempt += 1) {
      try {
        response = post || multipart
          ? await context.post(endpoint, multipart ? { multipart: { ...form, ...multipart } } : { form })
          : await context.get(endpoint, { params: form });
        break;
      } catch (err) {
        // A network change on the machine cuts a request now and then: go again, twice.
        if (attempt >= 2 || !/ERR_NETWORK_CHANGED|ECONNRESET|socket hang up|ETIMEDOUT/i.test(String(err && err.message))) throw err;
        await new Promise((r) => setTimeout(r, 500));
      }
    }
    const text = await response.text();
    let body;
    try { body = JSON.parse(text); } catch { body = null; }
    if (!body) {
      throw friendly({ message: `The wiki's API at ${endpoint} did not answer with JSON (HTTP ${response.status()}): ${clean(text).slice(0, 160)}`, hint: 'Check launchUrl and scriptPath in cucumber.js: api.php must answer at <launchUrl><scriptPath>/api.php.' });
    }
    return body;
  };
  const tokens = await call({ action: 'query', meta: 'tokens', type: 'login' });
  const login = await call({ action: 'clientlogin', username: admin.username, password: admin.password, logintoken: tokens.query.tokens.logintoken, loginreturnurl: siteRoot(world) + '/' }, { post: true });
  if (!login.clientlogin || login.clientlogin.status !== 'PASS') {
    throw friendly({
      message: `The test-data steps could not log in to the wiki's API as "${adminHandle(world)}" (${admin.username}): ${clean(JSON.stringify(login.clientlogin || login.error || login))}.`,
      hint: 'worldParameters.wikiAdmin names the account the test pages are made and deleted with: an administrator of the users registry, with its password.',
    });
  }
  const csrf = (await call({ action: 'query', meta: 'tokens' })).query.tokens.csrftoken;
  const client = { call, csrf, admin, context };
  API_CLIENTS.set(key, client);
  return client;
}

/** Fail with the API's own error, when it gave one. */
function apiError(body, what) {
  if (body && body.error) {
    throw friendly({ message: `${what}: the wiki's API refused it (${body.error.code}: ${clean(body.error.info)}).`, hint: 'The test-data steps work as worldParameters.wikiAdmin: it needs the rights of an administrator (sysop).' });
  }
  return body;
}

/** What the API says about a page: whether it is there, its latest revision, its protection. */
async function pageInfo(world, title) {
  const api = await adminApi(world);
  const body = apiError(await api.call({ action: 'query', titles: titleText(title), prop: 'info|revisions', inprop: 'protection', rvprop: 'ids|user|comment|content', rvslots: 'main' }), `Reading the page "${title}"`);
  const page = body.query.pages[0];
  const rev = page.revisions && page.revisions[0];
  return {
    exists: !page.missing && !page.invalid,
    title: page.title,
    protection: page.protection || [],
    revision: rev ? { id: rev.revid, user: rev.user, comment: rev.comment || '', text: rev.slots && rev.slots.main ? rev.slots.main.content : '' } : null,
  };
}

/** Make or change a page as the administrator. */
async function apiEdit(world, title, text, summary) {
  const api = await adminApi(world);
  return apiError(await api.call({ action: 'edit', title: titleText(title), text, summary, token: api.csrf, bot: '0' }, { post: true }), `Saving the page "${title}"`);
}

/** Delete a page as the administrator; a page that is not there is skipped. */
async function apiDelete(world, title, reason) {
  const api = await adminApi(world);
  const body = await api.call({ action: 'delete', title: titleText(title), reason: reason || 'Cleanup after a test scenario', token: api.csrf }, { post: true });
  if (body.error && body.error.code === 'missingtitle') return false;
  apiError(body, `Deleting the page "${title}"`);
  return true;
}

/** Protect a page as the administrator: level '' (all users), 'autoconfirmed' or 'sysop'. */
async function apiProtect(world, title, level) {
  const api = await adminApi(world);
  return apiError(await api.call({ action: 'protect', title: titleText(title), protections: `edit=${level || 'all'}|move=${level || 'all'}`, expiry: 'infinite|infinite', reason: `Test page of a scenario ${MARKER}`, token: api.csrf }, { post: true }), `Protecting the page "${title}"`);
}

/** Upload a file as the administrator, whatever the warnings. */
async function apiUpload(world, fileName, localFile, comment) {
  const api = await adminApi(world);
  return apiError(await api.call({ action: 'upload', filename: fileName, comment: comment || `Test file of a scenario ${MARKER}`, ignorewarnings: '1', token: api.csrf }, { multipart: { file: { name: path.basename(localFile), mimeType: 'application/octet-stream', buffer: fs.readFileSync(localFile) } } }), `Uploading the file "${fileName}"`);
}

/** The blocks of an account (API list=blocks). */
async function apiBlocks(world, name) {
  const api = await adminApi(world);
  const body = apiError(await api.call({ action: 'query', list: 'blocks', bkusers: wikiUserName(name), bkprop: 'id|user|expiry|reason|flags' }), `Reading the blocks of "${name}"`);
  return body.query.blocks || [];
}

/** Lift the block of an account as the administrator; an account without one is skipped. */
async function apiUnblock(world, name, reason) {
  if (!(await apiBlocks(world, name)).length) return false;
  const api = await adminApi(world);
  apiError(await api.call({ action: 'unblock', user: wikiUserName(name), reason: reason || 'Cleanup after a test scenario', token: api.csrf }, { post: true }), `Unblocking "${name}"`);
  return true;
}

/**
 * Wait until the wiki's job queue is empty (API siteinfo statistics.jobs): the
 * category counts and the links tables are written by jobs, and the category
 * tree reads them. Returns the jobs left when the budget ran out.
 */
async function waitForJobs(world, timeout) {
  const api = await adminApi(world);
  const deadline = Date.now() + (timeout || budget(world));
  let jobs = 0;
  for (;;) {
    const body = await api.call({ action: 'query', meta: 'siteinfo', siprop: 'statistics' });
    jobs = body.query && body.query.statistics ? body.query.statistics.jobs : 0;
    if (!jobs || Date.now() > deadline) return jobs;
    await new Promise((r) => setTimeout(r, 300));
  }
}

module.exports = {
  budget,
  settleBudget,
  escapeRegExp,
  clean,
  listed,
  titleKey,
  titleText,
  wikiUserName,
  siteRoot,
  scriptPath,
  skinParam,
  indexUrl,
  apiUrl,
  config,
  cutRequest,
  CUT_HINT,
  settle,
  pageModulesReady,
  waitForModules,
  open,
  openPage,
  afterNavigation,
  assertPresence,
  eventually,
  shownTitle,
  pageSummary,
  MESSAGE_SELECTORS,
  messages,
  hasMessage,
  resolveUser,
  accountName,
  SESSIONS,
  sessionKey,
  reuseSessions,
  signedInName,
  LOGIN_HINT,
  THROTTLE,
  submitLogin,
  restoreSession,
  logInAs,
  forgetSession,
  closeWelcomeDialog,
  visualEditorActive,
  countHook,
  waitForHook,
  fixturePath,
  MARKER,
  adminHandle,
  adminApi,
  apiError,
  pageInfo,
  apiEdit,
  apiDelete,
  apiProtect,
  apiUpload,
  apiBlocks,
  apiUnblock,
  waitForJobs,
};
