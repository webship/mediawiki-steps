'use strict';

// Following changes: the watch star of a page, the watchlist, recent changes,
// and the preferences of an account.
//
// Waits: the request the watch star sends (api.php action=watch or unwatch);
// the filters app of the watchlist and of recent changes
// (body.mw-rcfilters-ui-initialized); the preferences module through the module
// loader.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  listed,
  titleText,
  config,
  cutRequest,
  CUT_HINT,
  waitForModules,
  openPage,
  afterNavigation,
  eventually,
  pageSummary,
  messages,
  hasMessage,
  accountName,
} = require('./mediawiki-helpers');

/** The state of the watch star of the page: 'watched', 'unwatched' or null when there is none. */
async function starState(world) {
  return world.page.evaluate(() => {
    const visible = (sel) => [...document.querySelectorAll(sel)].some((e) => e.offsetParent);
    if (visible('#ca-unwatch')) return 'watched';
    if (visible('#ca-watch')) return 'unwatched';
    return null;
  }).catch(() => null);
}

/** The watchlist popover of the default skin ("Organize watchlist"), when it is open. */
function watchPopup(world) {
  return world.page.locator('.mw-watchstar-WatchlistPopup').filter({ visible: true }).first();
}

/**
 * Close the popover the default skin opens over the watch star ("Organize
 * watchlist") with its "Close" button: while it is open, the next click on the
 * page only closes it.
 */
async function closeWatchPopup(world) {
  const popup = watchPopup(world);
  await popup.waitFor({ state: 'visible', timeout: 1500 }).catch(() => {});
  if (!(await popup.count())) return;
  const close = popup.getByRole('button', { name: 'Close' });
  if (await close.count()) await close.click();
  else await world.page.keyboard.press('Escape');
  await popup.waitFor({ state: 'hidden', timeout: budget(world) }).catch(() => {});
}

/**
 * Watch the page on screen, or stop watching it, with its watch star, as a person
 * does. The default skin of the current release answers a click on the star of a
 * watched page with its "Organize watchlist" popover, whose "Unwatch" button
 * stops watching it; the step clicks it then. The step waits for the wiki's
 * answer to the request (api.php action=watch) and closes the popover.
 *
 * Example #1: When I watch the page
 * Example #2: When I stop watching the page
 * Example #3: And we watch the page
 * Example #4: When we stop watching the page
 * Example #5: Then I watch the page
 */
When(/^(I |we )*(watch|stop watching) the page$/, { timeout: 60000 }, async function (pronounCase, action) {
  const page = this.page;
  const want = action === 'watch' ? 'watched' : 'unwatched';
  const state = await starState(this);
  if (!state) throw friendly({ message: `The page has no watch star: ${await pageSummary(this)}.`, hint: 'Log in first: a visitor has no watchlist.' });
  if (state === want) return;
  await closeWatchPopup(this);
  const request = () => page.waitForResponse((r) => /api\.php/.test(r.url()) && /action=watch/.test(r.request().postData() || r.url()), { timeout: budget(this) }).catch(() => null);
  let answered = request();
  const star = page.locator(state === 'unwatched' ? '#ca-watch a, a#ca-watch' : '#ca-unwatch a, a#ca-unwatch').filter({ visible: true }).first();
  await star.click();
  const after = await eventually(this, async () => ({ state: await starState(this), popup: await watchPopup(this).count() }),
    (v) => v.state === want || v.popup > 0,
    (v) => ({ message: `The watch star did not answer (it shows "${v.state}").`, hint: cutRequest(this) ? CUT_HINT : 'The star sends action=watch to the API, or opens the "Organize watchlist" popover.' }));
  if (after.state !== want && want === 'unwatched') {
    const unwatch = watchPopup(this).getByRole('button', { name: 'Unwatch' });
    if (!(await unwatch.count())) throw friendly({ message: 'The "Organize watchlist" popover has no "Unwatch" button.', hint: 'The popover of the star offers "Unwatch" for a watched page.' });
    answered = request();
    await unwatch.click();
  }
  await answered;
  await eventually(this, () => starState(this), (st) => st === want,
    (st) => ({ message: `The watch star did not change to "${want}" (it shows "${st}").`, hint: cutRequest(this) ? CUT_HINT : 'The star sends action=watch (with unwatch=1 to stop watching) to the API.' }));
  await closeWatchPopup(this);
});

/**
 * Assert that the account watches, or does not watch, the page on screen (its
 * watch star).
 *
 * Example #1: Then I should be watching the page
 * Example #2: Then I should not be watching the page
 * Example #3: And we should be watching the page
 * Example #4: And we should not be watching the page
 * Example #5: Then I should be watching the page
 */
Then(/^(I |we )*should( not)* be watching the page$/, async function (pronounCase, notCase) {
  const state = await starState(this);
  if ((state === 'watched') === !!notCase) {
    throw friendly({ message: `The watch star says the page is ${state || 'not watchable'}.`, hint: 'Log in and open a page first.' });
  }
});

/**
 * Assert that the watchlist of the account lists, or does not list, a page
 * (Special:EditWatchlist, the list of watched pages).
 *
 * Example #1: Then my watchlist should list the page "Reading test page"
 * Example #2: Then my watchlist should not list the page "Second test page"
 * Example #3: And our watchlist should list the page "History test page"
 * Example #4: Then my watchlist should list the page "Talk:Reading test page"
 * Example #5: And my watchlist should not list the page "Reading test page"
 */
Then(/^(my|our) watchlist should( not)* list the page "([^"]*)"$/, { timeout: 60000 }, async function (possessive, notCase, title) {
  await openPage(this, 'Special:EditWatchlist');
  const titles = await this.page.evaluate(() => [...document.querySelectorAll('#mw-content-text input[type="checkbox"][name="wpTitles[]"], #mw-content-text input[type="checkbox"]')].map((c) => c.value).filter((v) => v && v !== 'on')).catch(() => []);
  const want = titleText(title);
  if (!!notCase === titles.map(titleText).includes(want)) {
    throw friendly({ message: notCase ? `The watchlist lists "${want}".` : `The watchlist does not list "${want}". It lists: ${listed(titles.map(titleText))}.`, hint: 'Log in first; a page is watched with its star, or when the account edits it with "Watch this page" ticked.' });
  }
});

/** The lines of a changes list (the watchlist or recent changes), once its filters app is ready. */
async function changesLines(world, special) {
  await openPage(world, special);
  if (cutRequest(world)) throw friendly({ message: `${special} did not open: ${cutRequest(world)}.`, hint: CUT_HINT });
  await world.page.waitForFunction(() => document.body.classList.contains('mw-rcfilters-ui-initialized') || !document.body.classList.contains('mw-rcfilters-enabled'), null, { timeout: budget(world) }).catch(() => {});
  await world.page.locator('.mw-rcfilters-ui-changesListWrapperWidget-pending, .mw-changeslist-results-empty').first().waitFor({ state: 'detached', timeout: 2000 }).catch(() => {});
  return world.page.evaluate(() => [...document.querySelectorAll('.mw-changeslist .mw-changeslist-line, .mw-changeslist li')].map((line) => ({
    titles: [...line.querySelectorAll('.mw-changeslist-title, .mw-title a')].map((a) => a.textContent.trim()),
    text: line.textContent.replace(/[‪-‮]/g, '').replace(/\s+/g, ' ').trim(),
  }))).catch(() => []);
}

/**
 * Assert that the watchlist (Special:Watchlist) or recent changes
 * (Special:RecentChanges) show a change to a page, and its edit summary and
 * author when given. A change folded into a group of the same page counts.
 *
 * Example #1: Then the recent changes should show a change to "Reading test page"
 * Example #2: Then the recent changes should show a change to "History test page" with the summary "Second version"
 * Example #3: Then the watchlist should show a change to "Reading test page"
 * Example #4: And the recent changes should show a change to "History test page" by "administrator"
 * Example #5: Then the watchlist should show a change to "History test page" with the summary "Second version"
 */
Then(/^the (recent changes|watchlist) should show a change to "([^"]*)"(?: with the summary "([^"]*)")?(?: by "([^"]*)")?$/, { timeout: 60000 }, async function (list, title, summary, who) {
  const special = list === 'watchlist' ? 'Special:Watchlist' : 'Special:RecentChanges';
  const want = titleText(title);
  const author = who ? accountName(this, who) : null;
  const lines = await changesLines(this, special);
  const match = lines.filter((l) => l.titles.includes(want) && (!summary || l.text.includes(summary)) && (!author || l.text.includes(author)));
  if (!match.length) {
    throw friendly({ message: `The ${list} show no change to "${want}"${summary ? ` with the summary "${summary}"` : ''}${author ? ` by ${author}` : ''}. Pages in it: ${listed([].concat(...lines.map((l) => l.titles)).slice(0, 20))}.`, hint: list === 'watchlist' ? 'The watchlist shows the changes to the pages the account watches, from others and its own.' : 'Recent changes show the last 7 days by default; bots are hidden.' });
  }
});

/**
 * Open the preferences of the account (Special:Preferences) and wait for the
 * preferences module.
 *
 * Example #1: When I open my preferences
 * Example #2: When we open our preferences
 * Example #3: And I open my preferences
 * Example #4: Given I open my preferences
 * Example #5: When I open my preferences
 */
When(/^(I |we )*open (my|our) preferences$/, { timeout: 60000 }, async function (pronounCase, possessive) {
  await openPage(this, 'Special:Preferences');
  if (cutRequest(this)) throw friendly({ message: `The preferences did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
  if ((await config(this, 'wgCanonicalSpecialPageName')) !== 'Preferences' || !(await this.page.locator('#mw-prefs-form').count())) {
    throw friendly({ message: `The preferences did not open: ${await pageSummary(this)}.`, hint: 'Log in first: a visitor has no preferences.' });
  }
  await waitForModules(this, 'mediawiki.special.preferences.ooui', { what: 'The preferences form' });
});

/** The checkbox of a preference by its label, after its tab was opened. */
async function preferenceBox(world, label) {
  const page = world.page;
  const tabIndex = await page.evaluate((text) => {
    const panels = [...document.querySelectorAll('#mw-prefs-form [role="tabpanel"]')];
    return panels.findIndex((p) => [...p.querySelectorAll('label, .oo-ui-labelElement-label')].some((l) => l.textContent.replace(/\s+/g, ' ').trim() === text));
  }, clean(label));
  if (tabIndex < 0) {
    const labels = await page.evaluate(() => [...document.querySelectorAll('#mw-prefs-form .oo-ui-checkboxInputWidget')].map((w) => (w.closest('.oo-ui-fieldLayout') || w).textContent.replace(/\s+/g, ' ').trim()).slice(0, 40)).catch(() => []);
    throw friendly({ message: `The preferences have no "${label}". Some of their boxes: ${listed(labels)}.`, hint: 'Name the preference by its label as the page writes it; open the preferences first ("When I open my preferences").' });
  }
  const tab = page.locator('#mw-prefs-form [role="tab"]').nth(tabIndex);
  if ((await tab.getAttribute('aria-selected')) !== 'true') await tab.click();
  const box = page.getByRole('checkbox', { name: clean(label), exact: true });
  await box.first().waitFor({ state: 'visible', timeout: budget(world) });
  return box.first();
}

/**
 * Tick or untick a preference by its label (the step opens the tab it is on).
 *
 * Example #1: When I tick the preference "Mark all edits minor by default"
 * Example #2: When I untick the preference "Mark all edits minor by default"
 * Example #3: And we tick the preference "Show preview before edit box"
 * Example #4: When we untick the preference "Show preview before edit box"
 * Example #5: When I tick the preference "Add pages I create and files I upload to my watchlist"
 */
When(/^(I |we )*(tick|untick) the preference "([^"]*)"$/, async function (pronounCase, action, label) {
  const box = await preferenceBox(this, label);
  if (action === 'tick') await box.check();
  else await box.uncheck();
});

/**
 * Save the preferences; the step waits for the wiki's answer ("Your preferences
 * have been saved.").
 *
 * Example #1: When I save my preferences
 * Example #2: When we save our preferences
 * Example #3: And I save my preferences
 * Example #4: Then I save my preferences
 * Example #5: When I save my preferences
 */
When(/^(I |we )*save (my|our) preferences$/, { timeout: 60000 }, async function (pronounCase, possessive) {
  const save = this.page.locator('#prefcontrol button, #prefcontrol input[type="submit"]').filter({ visible: true }).first();
  await this.page.waitForFunction(() => { const b = document.querySelector('#prefcontrol button, #prefcontrol input[type="submit"]'); return b && !b.disabled; }, null, { timeout: budget(this) }).catch(() => {});
  await afterNavigation(this, () => save.click());
  if (cutRequest(this)) throw friendly({ message: `The preferences were not saved: ${cutRequest(this)}.`, hint: CUT_HINT });
  // The wiki answers with a success box that the page's script hides at once and shows again as a
  // notification ("Your preferences have been saved."): either one is the answer.
  const confirmed = () => this.page.evaluate(() => [...document.querySelectorAll('.mw-preferences-messagebox, .mw-notification')]
    .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
  const said = await eventually(this, confirmed, (lines) => hasMessage(lines, 'Your preferences have been saved.') || lines.length > 0, () => ({ message: 'The wiki did not answer the save of the preferences.', hint: 'The "Save" button is on only after a change.' }));
  if (!hasMessage(said, 'Your preferences have been saved.')) {
    throw friendly({ message: `The wiki did not confirm the preferences: ${listed(said.concat(await messages(this, 'error')))}.`, hint: 'The "Save" button is on only after a change.' });
  }
  await waitForModules(this, 'mediawiki.special.preferences.ooui', { what: 'The preferences form' });
});

/**
 * Assert that a preference is ticked or not, by its label.
 *
 * Example #1: Then the preference "Mark all edits minor by default" should be ticked
 * Example #2: Then the preference "Mark all edits minor by default" should not be ticked
 * Example #3: And the preference "Show preview before edit box" should be ticked
 * Example #4: Then the preference "Warn me when I leave an edit page with unsaved changes" should be ticked
 * Example #5: And the preference "Show preview before edit box" should not be ticked
 */
Then(/^the preference "([^"]*)" should( not)* be ticked$/, async function (label, notCase) {
  const box = await preferenceBox(this, label);
  const checked = await box.isChecked();
  if (checked === !!notCase) {
    throw friendly({ message: `The preference "${label}" is ${checked ? 'ticked' : 'not ticked'}.`, hint: 'Tick or untick it, then save the preferences.' });
  }
});

module.exports = { starState, changesLines };
