'use strict';

// The administrator's pages: protecting a page, deleting and restoring it, and
// blocking and unblocking an account. A block a scenario makes is lifted after it
// (the After hook of mediawiki-pages.steps.js), and the block form's
// "Block the last IP address used by this account" is cleared: an autoblock
// would block the address the whole suite runs from.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  clean,
  listed,
  titleText,
  cutRequest,
  CUT_HINT,
  openPage,
  afterNavigation,
  pageSummary,
  messages,
  hasMessage,
  resolveUser,
  pageInfo,
  apiBlocks,
  wikiUserName,
} = require('./mediawiki-helpers');

const LEVELS = {
  'all users': 'Allow all users',
  'autoconfirmed users': 'Allow only autoconfirmed users',
  administrators: 'Allow only administrators',
};

/** Choose an option of an OOUI dropdown (a combobox), as a person does. */
async function chooseOption(world, combobox, option) {
  await combobox.click();
  const item = world.page.getByRole('option', { name: option, exact: true }).filter({ visible: true }).first();
  try {
    await item.waitFor({ state: 'visible', timeout: 5000 });
  } catch {
    const options = await world.page.locator('[role="option"]').filter({ visible: true }).allInnerTexts().catch(() => []);
    throw friendly({ message: `The list offers no "${option}". It offers: ${listed(options)}.`, hint: 'Name the option as the form writes it.' });
  }
  await item.click();
}

/** An account name from a handle of the users registry, or the name itself. */
function blockTarget(world, who) {
  const users = (world.parameters && world.parameters.users) || {};
  return users[who] ? resolveUser(world, who).wikiName : wikiUserName(who);
}

/**
 * Protect a page with its protection form (action=protect), as an administrator:
 * who may edit it (and move it, which follows). "remove the protection" sets it
 * back to all users.
 *
 * Example #1: When I protect the page "Protection test page" so that only autoconfirmed users can edit it
 * Example #2: When I protect the page "Protection test page" so that only administrators can edit it
 * Example #3: When I remove the protection of the page "Protection test page"
 * Example #4: And we protect the page "Second test page" so that only administrators can edit it
 * Example #5: When we remove the protection of the page "Second test page"
 */
When(/^(?:(?:I|we) protect the page "([^"]*)" so that only (autoconfirmed users|administrators) can edit it|(?:I|we) remove the protection of the page "([^"]*)")$/, { timeout: 90000 }, async function (title, who, unprotectTitle) {
  const page = this.page;
  const target = title || unprotectTitle;
  await openPage(this, target, { action: 'protect' });
  const group = page.getByRole('group', { name: 'Edit', exact: true });
  if (!(await group.count())) {
    throw friendly({ message: `The protection form of "${titleText(target)}" did not open: ${await pageSummary(this)}. ${listed(await messages(this, 'error'))}`, hint: cutRequest(this) ? CUT_HINT : 'Log in as an administrator ("protect" right) first.' });
  }
  await chooseOption(this, group.getByRole('combobox').first(), LEVELS[who || 'all users']);
  await afterNavigation(this, () => page.getByRole('button', { name: 'Confirm' }).click());
  if (cutRequest(this)) throw friendly({ message: `The protection was not saved: ${cutRequest(this)}.`, hint: CUT_HINT });
});

/**
 * Assert who may edit a page, as the wiki's API reports its protection.
 *
 * Example #1: Then the page "Protection test page" should be protected so that only autoconfirmed users can edit it
 * Example #2: Then the page "Protection test page" should be protected so that only administrators can edit it
 * Example #3: Then the page "Protection test page" should not be protected
 * Example #4: And the page "Second test page" should be protected so that only administrators can edit it
 * Example #5: And the page "Second test page" should not be protected
 */
Then(/^the page "([^"]*)" should (?:be protected so that only (autoconfirmed users|administrators) can edit it|(not) be protected)$/, async function (title, who, notCase) {
  const info = await pageInfo(this, title);
  const edit = info.protection.find((p) => p.type === 'edit');
  const level = edit ? edit.level : '';
  const want = notCase ? '' : (who === 'administrators' ? 'sysop' : 'autoconfirmed');
  if (level !== want) {
    throw friendly({ message: `"${titleText(title)}" is ${level ? `protected for "${level}"` : 'not protected'}, not ${want ? `for "${want}"` : 'unprotected'}.`, hint: 'Protect it first, with the protection form ("When I protect the page ...").' });
  }
});

/**
 * Delete a page with its deletion form (action=delete), as an administrator, with
 * a reason; the step waits for "Action complete".
 *
 * Example #1: When I delete the page "Deletion test page" with the reason "A test of the deletion"
 * Example #2: When we delete the page "Second test page" with the reason "No longer needed"
 * Example #3: And I delete the page "Deletion test page" with the reason "Duplicate"
 * Example #4: When I delete the page "Talk:Deletion test page" with the reason "A test"
 * Example #5: When we delete the page "Deletion test page" with the reason "Cleanup"
 */
When(/^(I |we )*delete the page "([^"]*)" with the reason "([^"]*)"$/, { timeout: 90000 }, async function (pronounCase, title, reason) {
  const page = this.page;
  await openPage(this, title, { action: 'delete' });
  const button = page.getByRole('button', { name: 'Delete page' });
  if (!(await button.count())) {
    throw friendly({ message: `The deletion form of "${titleText(title)}" did not open: ${await pageSummary(this)}. ${listed(await messages(this, 'error'))}`, hint: cutRequest(this) ? CUT_HINT : 'Log in as an administrator ("delete" right) first; the page must exist.' });
  }
  await page.getByRole('textbox', { name: 'Other/additional reason:' }).fill(reason);
  await afterNavigation(this, () => button.click());
  const text = clean(await page.locator('#mw-content-text').innerText().catch(() => ''));
  if (!/has been deleted/.test(text)) {
    throw friendly({ message: `The wiki did not delete "${titleText(title)}": ${await pageSummary(this)}. ${listed(await messages(this, 'error'))}`, hint: cutRequest(this) ? CUT_HINT : 'The wiki answers a deletion with "Action complete".' });
  }
});

/**
 * Restore a deleted page with every revision (Special:Undelete), as an
 * administrator, with a reason.
 *
 * Example #1: When I restore the page "Deletion test page" with the reason "Deleted by mistake"
 * Example #2: When we restore the page "Second test page" with the reason "Needed again"
 * Example #3: And I restore the page "Deletion test page" with the reason "A test of the restore"
 * Example #4: When I restore the page "Talk:Deletion test page" with the reason "A test"
 * Example #5: When we restore the page "Deletion test page" with the reason "Back"
 */
When(/^(I |we )*restore the page "([^"]*)" with the reason "([^"]*)"$/, { timeout: 90000 }, async function (pronounCase, title, reason) {
  const page = this.page;
  await openPage(this, 'Special:Undelete', { target: titleText(title) });
  const button = page.getByRole('button', { name: /^(Undelete|Restore)$/ });
  if (!(await button.count())) {
    throw friendly({ message: `The restore form of "${titleText(title)}" did not open: ${await pageSummary(this)}. ${listed(await messages(this, 'error'))}`, hint: cutRequest(this) ? CUT_HINT : 'Log in as an administrator ("undelete" right) first; the page must have been deleted.' });
  }
  await page.locator('input[name="wpComment"]').fill(reason);
  await afterNavigation(this, () => button.first().click());
  const text = clean(await page.locator('#mw-content-text').innerText().catch(() => ''));
  if (!/has been undeleted|has been restored/.test(text)) {
    throw friendly({ message: `The wiki did not restore "${titleText(title)}": ${text.slice(0, 200)}.`, hint: cutRequest(this) ? CUT_HINT : 'The wiki answers a restore with "<title> has been undeleted".' });
  }
});

/**
 * Assert that a page exists, or does not, as the wiki's API reports it.
 *
 * Example #1: Then the page "Deletion test page" should not exist
 * Example #2: Then the page "Deletion test page" should exist
 * Example #3: And the page "Second test page" should exist
 * Example #4: Then the page "Page made in the source editor" should exist
 * Example #5: And the page "Talk:Deletion test page" should not exist
 */
Then(/^the page "([^"]*)" should( not)* exist$/, async function (title, notCase) {
  const info = await pageInfo(this, title);
  if (info.exists === !!notCase) {
    throw friendly({ message: `"${titleText(title)}" ${info.exists ? 'exists' : 'does not exist'} on the wiki.`, hint: notCase ? 'Delete it first.' : 'Make it or restore it first.' });
  }
});

/**
 * Block an account with the block form (Special:Block), as an administrator:
 * on the whole site, for an expiry of the form's list ("2 hours", "1 day",
 * "1 week", …), with a reason. The step clears "Block the last IP address used by
 * this account" (an autoblock would block the address the suite runs from), and
 * the block is lifted after the scenario.
 *
 * Example #1: When I block the account "reader" for "1 day" with the reason "A test of the block"
 * Example #2: When we block the account "reader" for "2 hours" with the reason "Testing"
 * Example #3: And I block the account "reader" for "1 week" with the reason "A test"
 * Example #4: When I block the account "Reader" for "1 day" with the reason "A test of the block"
 * Example #5: When we block the account "reader" for "3 days" with the reason "Testing the block list"
 */
When(/^(I |we )*block the account "([^"]*)" for "([^"]*)" with the reason "([^"]*)"$/, { timeout: 90000 }, async function (pronounCase, who, expiry, reason) {
  const page = this.page;
  const name = blockTarget(this, who);
  await openPage(this, `Special:Block/${name}`);
  const submit = page.getByRole('button', { name: /^(Add block|Block|Block this user)$/ });
  if (!(await submit.count())) {
    throw friendly({ message: `The block form did not open: ${await pageSummary(this)}. ${listed(await messages(this, 'error'))}`, hint: cutRequest(this) ? CUT_HINT : 'Log in as an administrator ("block" right) first.' });
  }
  if (!this.__wikiCleanup) this.__wikiCleanup = { pages: new Set(), blocks: new Set() };
  this.__wikiCleanup.blocks.add(name);
  await chooseOption(this, page.locator('[id^="mw-input-wpExpiry"] [role="combobox"]').first(), expiry);
  await page.getByRole('checkbox', { name: /^Block the last IP address used by this account/ }).uncheck();
  await page.locator('input[name="wpReason-other"]').fill(reason);
  await afterNavigation(this, () => submit.first().click());
  const text = clean(await page.locator('#mw-content-text').innerText().catch(() => ''));
  if (!/has been blocked/.test(text)) {
    throw friendly({ message: `The wiki did not block "${name}": ${listed((await messages(this, 'error')).concat([text.slice(0, 160)]))}.`, hint: cutRequest(this) ? CUT_HINT : 'The wiki answers a block with "Block succeeded".' });
  }
});

/**
 * Lift the block of an account with the unblock form (Special:Unblock), as an
 * administrator, with a reason.
 *
 * Example #1: When I unblock the account "reader" with the reason "The test is over"
 * Example #2: When we unblock the account "reader" with the reason "Done"
 * Example #3: And I unblock the account "Reader" with the reason "A test of the unblock"
 * Example #4: When I unblock the account "reader" with the reason "Blocked by mistake"
 * Example #5: When we unblock the account "reader" with the reason "Testing"
 */
When(/^(I |we )*unblock the account "([^"]*)" with the reason "([^"]*)"$/, { timeout: 90000 }, async function (pronounCase, who, reason) {
  const page = this.page;
  const name = blockTarget(this, who);
  await openPage(this, `Special:Unblock/${name}`);
  const submit = page.getByRole('button', { name: /^(Remove this block|Unblock)$/ });
  if (!(await submit.count())) {
    throw friendly({ message: `The unblock form did not open: ${await pageSummary(this)}. ${listed(await messages(this, 'error'))}`, hint: cutRequest(this) ? CUT_HINT : 'Log in as an administrator ("block" right) first.' });
  }
  await page.getByRole('textbox', { name: 'Reason:' }).fill(reason);
  await afterNavigation(this, () => submit.first().click());
  const text = clean(await page.locator('#mw-content-text').innerText().catch(() => ''));
  if (!/has been unblocked/.test(text)) {
    throw friendly({ message: `The wiki did not unblock "${name}": ${listed((await messages(this, 'error')).concat([text.slice(0, 160)]))}.`, hint: cutRequest(this) ? CUT_HINT : 'The account must be blocked.' });
  }
});

/**
 * Assert that an account is, or is not, blocked, as the wiki's API reports it.
 *
 * Example #1: Then the account "reader" should be blocked
 * Example #2: Then the account "reader" should not be blocked
 * Example #3: And the account "Reader" should be blocked
 * Example #4: And the account "editor" should not be blocked
 * Example #5: Then the account "reader" should be blocked
 */
Then(/^the account "([^"]*)" should( not)* be blocked$/, async function (who, notCase) {
  const name = blockTarget(this, who);
  const blocks = await apiBlocks(this, name);
  if (!!notCase === !!blocks.length) {
    throw friendly({ message: blocks.length ? `"${name}" is blocked until ${blocks[0].expiry} ("${blocks[0].reason}").` : `"${name}" is not blocked.`, hint: notCase ? 'Unblock it first.' : 'Block it first, with the block form.' });
  }
});

module.exports = { chooseOption };
