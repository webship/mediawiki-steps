'use strict';

// The session: logging in by a handle of the users registry or with a user name
// and a password, logging out, who is signed in, and the refusals of the account
// creation form.
//
// Accounts are configuration, not test data: they are listed in cucumber.js
// (`worldParameters.users`) and created once by the build of the wiki. A feature
// never creates or deletes an account: the account creation steps refuse to send
// a form that the wiki could accept.

const { Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  listed,
  titleKey,
  config,
  cutRequest,
  CUT_HINT,
  openPage,
  afterNavigation,
  pageSummary,
  messages,
  hasMessage,
  resolveUser,
  accountName,
  signedInName,
  LOGIN_HINT,
  THROTTLE,
  submitLogin,
  logInAs,
  forgetSession,
  waitForModules,
  settle,
  adminApi,
} = require('./mediawiki-helpers');

/**
 * Log in as an account of the users registry (`worldParameters.users` in
 * cucumber.js), by its handle. An account that logged in earlier in the run
 * takes its session over; otherwise the step logs in through the login form.
 *
 * Example #1: Given I am a logged in user with the "editor" user
 * Example #2: Given we are a logged in user with the "administrator" user
 * Example #3: Given I am a logged in user with "reader"
 * Example #4: And I am a logged in user with the "reader" user
 * Example #5: Given we are a logged in user with the "editor" user
 */
Given(/^(I am |we are )*a logged in user with( the)* "([^"]*)"( user)*$/, { timeout: 120000 }, async function (pronounCase, theCase, handle, userCase) {
  await logInAs(this, handle);
});

/**
 * Log in through the login form as an account of the users registry, as a
 * person does: a new session, never one taken over. For the scenarios that
 * test the form itself; the step fails when the wiki refuses the login. "and
 * ask to be kept logged in" ticks "Keep me logged in" first.
 *
 * Example #1: When I log in as "editor" with the login form
 * Example #2: When we log in as "reader" with the login form
 * Example #3: When I log in as "editor" with the login form and ask to be kept logged in
 * Example #4: And I log in as "administrator" with the login form
 * Example #5: When we log in as "reader" with the login form and ask to be kept logged in
 */
When(/^(I |we )*log in as "([^"]*)" with the login form( and ask to be kept logged in)?$/, { timeout: 120000 }, async function (pronounCase, handle, rememberCase) {
  const user = resolveUser(this, handle);
  const outcome = await submitLogin(this, user.username, user.password, { remember: !!rememberCase });
  if (outcome.name !== user.wikiName) {
    throw friendly({
      message: `The login form refused "${handle}" (${user.username}): ${listed(outcome.errors)}.`,
      hint: outcome.cut ? CUT_HINT : 'Check the user name and the password of the account in worldParameters.users, and that the build of the wiki created the account.',
    });
  }
});

/**
 * Send the login form with a user name and a password. The step does not expect
 * the login to succeed: assert the outcome with the next step. The wiki allows 5
 * failed logins of one account from one address in 5 minutes, so a refusal
 * scenario tries a name the other scenarios do not log in with.
 *
 * Example #1: When I log in with the user name "No such account here" and the password "Wrong-password-1"
 * Example #2: When we log in with the user name "reader" and the password "Not-the-password-2"
 * Example #3: And I log in with the user name "Nobody at all" and the password "Whatever-123!"
 * Example #4: When I log in with the user name "" and the password "Wrong-password-1"
 * Example #5: When we log in with the user name "Someone unknown" and the password "x"
 */
When(/^(I |we )*log in with the user name "([^"]*)" and the password "([^"]*)"$/, { timeout: 120000 }, async function (pronounCase, username, password) {
  this.__loginOutcome = await submitLogin(this, username, password);
});

/**
 * Assert that the login page refused the login with an error message (or a part
 * of it), and that nobody is signed in.
 *
 * Example #1: Then the login should be refused with "Incorrect username or password entered. Please try again."
 * Example #2: Then the login should be refused with "Incorrect username or password entered."
 * Example #3: And the login should be refused with "Please try again."
 * Example #4: Then the login should be refused with "Incorrect username or password"
 * Example #5: Then the login should be refused with "You have made too many recent login attempts."
 */
Then(/^the login should be refused with "([^"]*)"$/, async function (expected) {
  const name = await signedInName(this);
  const errors = await messages(this, 'error');
  const onLogin = titleKey(String(await config(this, 'wgCanonicalSpecialPageName') || '')) === 'Userlogin';
  if (name || !onLogin || !hasMessage(errors, expected)) {
    throw friendly({
      message: name
        ? `The login was not refused: the wiki says "${name}" is signed in.`
        : `The login page did not refuse the login with "${expected}". Its errors: ${listed(errors)}; ${await pageSummary(this)}.`,
      hint: cutRequest(this) ? CUT_HINT : 'Send the form first ("When I log in with the user name ... and the password ..."); the wiki writes one error for a wrong password and an unknown name alike.',
    });
  }
});

/**
 * Log out as a person does: the "Log out" link of the user menu (opened first
 * when the skin folds it), else the link wherever the skin puts it, else the
 * logout page's own button. The step waits for the wiki to end the session.
 *
 * Example #1: When I log out
 * Example #2: When we log out
 * Example #3: And I log out
 * Example #4: Then I log out
 * Example #5: Given I log out
 */
When(/^(I |we )*log out$/, { timeout: 90000 }, async function (pronounCase) {
  const page = this.page;
  forgetSession(this);
  if (!(await signedInName(this))) await openPage(this, 'Special:BlankPage');
  if (!(await signedInName(this))) return;
  const link = page.locator('#pt-logout a, a#pt-logout, #pt-logout').filter({ visible: true });
  if (!(await link.count())) {
    const menu = page.locator('#vector-user-links-dropdown-checkbox, #p-personal-checkbox, #vector-user-links-dropdown .vector-dropdown-label').filter({ visible: true });
    if (await menu.count()) await menu.first().click();
  }
  const target = page.locator('#pt-logout a, a#pt-logout').filter({ visible: true });
  if (await target.count()) {
    await afterNavigation(this, () => target.first().click());
  } else {
    await openPage(this, 'Special:UserLogout');
    const button = page.getByRole('button', { name: 'Log out' });
    if (await button.count()) await afterNavigation(this, () => button.first().click());
  }
  try {
    await page.waitForFunction(() => window.mw && mw.config && mw.config.get('wgUserName') === null, null, { timeout: budget(this) });
  } catch (err) {
    throw friendly({ message: `Logging out did not end the session: the wiki still says "${await signedInName(this)}" is signed in (${await pageSummary(this)}).`, cause: err, hint: cutRequest(this) ? CUT_HINT : 'The skin offers "Log out" in the user menu; it posts to the API (action=logout) and opens Special:UserLogout.' });
  }
});

/**
 * Assert who is signed in, as the page says (`wgUserName`): an account of the
 * users registry by its handle, or nobody. A page that is not the wiki's (the
 * browser's own error page) is replaced by Special:BlankPage first.
 *
 * Example #1: Then I should be logged in as "editor"
 * Example #2: Then we should be logged in as "administrator"
 * Example #3: And I should be logged in as "reader"
 * Example #4: Then I should not be logged in as "editor"
 * Example #5: Then we should not be logged in as "reader"
 */
Then(/^(I |we )*should( not)* be logged in as "([^"]*)"$/, async function (pronounCase, notCase, handle) {
  const user = resolveUser(this, handle);
  if ((await config(this, 'wgUserName')) === null && !(await this.page.evaluate(() => !!window.mw).catch(() => false))) await openPage(this, 'Special:BlankPage');
  const name = await signedInName(this);
  if (!!notCase === (name === user.wikiName)) {
    throw friendly({
      message: notCase ? `"${handle}" (${user.wikiName}) is signed in.` : `Expected "${handle}" (${user.wikiName}) to be signed in; the wiki says ${name ? `"${name}"` : 'nobody'} is.`,
      hint: 'Log in with "Given I am a logged in user with the ... user" or the login form steps.',
    });
  }
});

/**
 * Assert that somebody is, or nobody is, signed in, as the page says (`wgUserName`).
 *
 * Example #1: Then I should be logged in
 * Example #2: Then I should not be logged in
 * Example #3: And we should be logged in
 * Example #4: And we should not be logged in
 * Example #5: Then nobody should be logged in
 */
Then(/^(?:(I |we )*should( not)* be logged in|(nobody) should be logged in)$/, async function (pronounCase, notCase, nobodyCase) {
  if (!(await this.page.evaluate(() => !!window.mw).catch(() => false))) await openPage(this, 'Special:BlankPage');
  const name = await signedInName(this);
  const expectNobody = !!(notCase || nobodyCase);
  if (expectNobody === !!name) {
    throw friendly({
      message: expectNobody ? `Expected nobody to be signed in; the wiki says "${name}" is.` : `Expected an account to be signed in; nobody is (${await pageSummary(this)}).`,
      hint: 'The page says who is signed in through mw.config wgUserName.',
    });
  }
});

/**
 * Try to create an account with the account creation form (Special:CreateAccount),
 * and send it only when the wiki will refuse it: the passwords differ, or the
 * form's own checks already show a problem (a name in use, a password the wiki
 * refuses). A form the wiki could accept is not sent, and the step fails: a suite
 * never creates an account. A handle of the users registry stands for its name.
 *
 * Example #1: When I try to create the account "Never created account" with the password "Unique-pass-2026-x" and the confirmation "Unique-pass-2026-y"
 * Example #2: When I try to create the account "editor" with the password "Unique-pass-2026-x" and the confirmation "Unique-pass-2026-x"
 * Example #3: When we try to create the account "Never created account" with the password "abc" and the confirmation "abc"
 * Example #4: And I try to create the account "reader" with the password "Another-pass-2026" and the confirmation "Another-pass-2026"
 * Example #5: When I try to create the account "Never created account" with the password "password" and the confirmation "password"
 */
When(/^(I |we )*try to create the account "([^"]*)" with the password "([^"]*)" and the confirmation "([^"]*)"$/, { timeout: 120000 }, async function (pronounCase, who, password, retype) {
  const page = this.page;
  const name = accountName(this, who);
  await openPage(this, 'Special:CreateAccount');
  if (!(await page.locator('#wpName2').count())) {
    throw friendly({ message: `The account creation form is not on Special:CreateAccount: ${await pageSummary(this)}.`, hint: 'A visitor may create accounts on a default wiki; a signed-in account sees the form only with the "createaccount" right.' });
  }
  await waitForModules(this, 'mediawiki.special.createaccount', { what: 'The checks of the account creation form' });
  // The form checks the name and the password with the API while they are typed (list=users,
  // action=validatepassword): wait for each answer, as a person waits for the message under the field.
  const answer = (re) => page.waitForResponse((r) => /api\.php/.test(r.url()) && re.test(r.url() + ' ' + (r.request().postData() || '')), { timeout: budget(this) }).catch(() => null);
  const nameChecked = answer(/ususers=|list=users/);
  await page.locator('#wpName2').fill(name);
  await page.locator('#wpName2').blur();
  await nameChecked;
  const passwordChecked = answer(/validatepassword/);
  await page.locator('#wpPassword2').fill(password);
  await page.locator('#wpPassword2').blur();
  await passwordChecked;
  await page.locator('#wpRetype').fill(retype);
  await page.locator('#wpRetype').blur();
  await settle(this, 1000);
  const shown = await messages(this, 'error');
  if (password === retype && !shown.length) {
    let exists = false;
    try {
      const api = await adminApi(this);
      const body = await api.call({ action: 'query', list: 'users', ususers: name });
      exists = !!(body.query && body.query.users && body.query.users[0] && !body.query.users[0].missing);
    } catch { exists = false; }
    if (!exists) {
      throw friendly({
        message: `The form shows no problem with the account "${name}": sending it would create the account, so the step did not send it.`,
        hint: 'A suite never creates an account. Test the refusals: different passwords, a name in use (a handle of the users registry), or a password the wiki refuses ("abc", "password").',
      });
    }
  }
  this.__accountTried = name;
  await afterNavigation(this, () => page.locator('#wpCreateaccount').click());
});

/**
 * Assert that the account creation form refused the account with an error
 * message (or a part of it), and that the account does not exist unless its
 * name was already in use.
 *
 * Example #1: Then the account creation should be refused with "The passwords you entered do not match."
 * Example #2: Then the account creation should be refused with "Username entered already in use. Please choose a different name."
 * Example #3: Then the account creation should be refused with "Passwords must be at least 8 characters."
 * Example #4: And the account creation should be refused with "There are problems with some of your input."
 * Example #5: Then the account creation should be refused with "The password entered is in a list of very commonly used passwords."
 */
Then(/^the account creation should be refused with "([^"]*)"$/, async function (expected) {
  const errors = await messages(this, 'error');
  const special = String(await config(this, 'wgCanonicalSpecialPageName') || '');
  if (!/^CreateAccount$/i.test(special) || !hasMessage(errors, expected)) {
    throw friendly({
      message: `The account creation form did not refuse with "${expected}". Its errors: ${listed(errors)}; ${await pageSummary(this)}.`,
      hint: cutRequest(this) ? CUT_HINT : 'Send the form with "When I try to create the account ..." first.',
    });
  }
  const name = this.__accountTried;
  if (name) {
    const users = (this.parameters && this.parameters.users) || {};
    const known = Object.values(users).some((u) => clean(u.username).toLowerCase() === clean(name).toLowerCase());
    if (!known) {
      const api = await adminApi(this);
      const body = await api.call({ action: 'query', list: 'users', ususers: name });
      const user = body.query && body.query.users && body.query.users[0];
      if (user && !user.missing) {
        throw friendly({ message: `The account "${name}" exists on the wiki after the refusal.`, hint: 'The wiki created the account: remove it by hand (a wiki keeps accounts; block it), and check the scenario.' });
      }
    }
  }
});

module.exports = {};
