'use strict';

// The history of a page: its revisions (each known by its edit summary, as a
// person picks it in the list), comparing two of them, and undoing one.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  listed,
  titleText,
  config,
  cutRequest,
  CUT_HINT,
  openPage,
  afterNavigation,
  pageSummary,
  messages,
  closeWelcomeDialog,
  accountName,
} = require('./mediawiki-helpers');

/** The revisions of the history page, newest first: id, summary, author. */
async function revisions(world) {
  return world.page.evaluate(() => [...document.querySelectorAll('#pagehistory li[data-mw-revid], #pagehistory li')].map((li) => ({
    id: li.getAttribute('data-mw-revid'),
    summary: (() => { const t = ((li.querySelector('.comment') || {}).textContent || '').replace(/\s+/g, ' ').trim(); return t.startsWith('(') && t.endsWith(')') ? t.slice(1, -1) : t; })(),
    user: ((li.querySelector('.history-user a, .mw-userlink') || {}).textContent || '').replace(/[‪-‮]/g, '').trim(),
  }))).catch(() => []);
}

async function historyRow(world, summary) {
  const rows = await revisions(world);
  const index = rows.findIndex((r) => r.summary === summary || r.summary.includes(summary));
  if (index < 0) {
    throw friendly({ message: `The history has no revision "${summary}". Its revisions: ${listed(rows.map((r) => r.summary || '(no summary)'))}.`, hint: 'A revision is named by its edit summary; open the history first ("When I open the history of the page ...").' });
  }
  return { index, row: world.page.locator('#pagehistory li').nth(index), rows };
}

/**
 * Open the history of a page (action=history).
 *
 * Example #1: When I open the history of the page "History test page"
 * Example #2: When we open the history of the page "Editing test page"
 * Example #3: And I open the history of the page "Reading test page"
 * Example #4: When I open the history of the page "Visual editor test page"
 * Example #5: When I open the history of the page "Conflict test page"
 */
When(/^(I |we )*open the history of the page "([^"]*)"$/, { timeout: 60000 }, async function (pronounCase, title) {
  await openPage(this, title, { action: 'history' });
  if (cutRequest(this)) throw friendly({ message: `The history of "${title}" did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
  if ((await config(this, 'wgAction')) !== 'history') throw friendly({ message: `The history of "${titleText(title)}" did not open: ${await pageSummary(this)}.`, hint: 'The page must exist.' });
});

/**
 * Assert that the history lists, or does not list, a revision by its edit
 * summary, and by its author (a handle of the users registry or an account name).
 *
 * Example #1: Then the history should list the revision "First version"
 * Example #2: Then the history should list the revision "A typo" by "editor"
 * Example #3: And the history should not list the revision "Never saved"
 * Example #4: Then the history should list the revision "Second version" by "administrator"
 * Example #5: And the history should list the revision "Undid revision"
 */
Then(/^the history should( not)* list the revision "([^"]*)"(?: by "([^"]*)")?$/, async function (notCase, summary, who) {
  const rows = await revisions(this);
  const author = who ? accountName(this, who) : null;
  const has = rows.some((r) => (r.summary === summary || r.summary.includes(summary)) && (!author || r.user === author));
  if (!!notCase === has) {
    throw friendly({ message: notCase ? `The history lists the revision "${summary}".` : `The history has no revision "${summary}"${author ? ` by ${author}` : ''}. It lists: ${listed(rows.map((r) => `${r.summary || '(no summary)'} by ${r.user}`))}.`, hint: 'Open the history first ("When I open the history of the page ...").' });
  }
});

/**
 * Assert how many revisions the history lists.
 *
 * Example #1: Then the history should list 2 revisions
 * Example #2: Then the history should list 1 revision
 * Example #3: And the history should list 3 revisions
 * Example #4: Then the history should list 4 revisions
 * Example #5: And the history should list 2 revisions
 */
Then(/^the history should list (\d+) revisions?$/, async function (count) {
  const rows = await revisions(this);
  if (rows.length !== Number(count)) {
    throw friendly({ message: `The history lists ${rows.length} revision(s), not ${count}: ${listed(rows.map((r) => r.summary || '(no summary)'))}.`, hint: 'Open the history first; it lists up to 50 revisions per page.' });
  }
});

/**
 * Compare two revisions from the history, as a person does: the older one as
 * the first, the newer one as the second, then "Compare selected revisions".
 *
 * Example #1: When I compare the revisions "First version" and "Second version"
 * Example #2: When we compare the revisions "First version" and "Undid revision"
 * Example #3: And I compare the revisions "Second version" and "Third version"
 * Example #4: When I compare the revisions "First version" and "Third version"
 * Example #5: When we compare the revisions "Second version" and "First version"
 */
When(/^(I |we )*compare the revisions "([^"]*)" and "([^"]*)"$/, { timeout: 60000 }, async function (pronounCase, first, second) {
  const a = await historyRow(this, first);
  const b = await historyRow(this, second);
  // The history lists the newest first: the older revision is the one further down.
  const [older, newer] = a.index > b.index ? [a, b] : [b, a];
  await older.row.locator('input[name="oldid"]').check();
  await newer.row.locator('input[name="diff"]').check();
  await afterNavigation(this, () => this.page.getByRole('button', { name: 'Compare selected revisions' }).first().click());
  if (cutRequest(this)) throw friendly({ message: `The comparison did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
  if (!(await this.page.locator('table.diff').count())) throw friendly({ message: `The comparison did not open: ${await pageSummary(this)}.`, hint: 'Compare two different revisions of the page.' });
});

/**
 * Undo a revision from the history, as a person does with its "undo" link: the
 * editor opens with the change taken back and the summary written ("Undid
 * revision …"). Save it with "When I save the page".
 *
 * Example #1: When I undo the revision "Second version"
 * Example #2: When we undo the revision "Changed meanwhile"
 * Example #3: And I undo the revision "Third version"
 * Example #4: When I undo the revision "A typo"
 * Example #5: When we undo the revision "Second version"
 */
When(/^(I |we )*undo the revision "([^"]*)"$/, { timeout: 60000 }, async function (pronounCase, summary) {
  const { row } = await historyRow(this, summary);
  const undo = row.getByRole('link', { name: 'undo' });
  if (!(await undo.count())) throw friendly({ message: `The revision "${summary}" has no "undo" link.`, hint: 'The first revision of a page cannot be undone; the account must be allowed to edit the page.' });
  await afterNavigation(this, () => undo.first().click());
  await closeWelcomeDialog(this);
  const ok = await this.page.locator('.mw-undo-success').count();
  if (!ok) {
    throw friendly({ message: `The wiki cannot undo the revision "${summary}": ${listed((await messages(this, 'error')).concat(await messages(this, 'warning')))}; ${await pageSummary(this)}.`, hint: 'A revision whose lines changed again later cannot be undone ("The edit could not be undone due to conflicting intermediate edits.").' });
  }
});

module.exports = { revisions };
