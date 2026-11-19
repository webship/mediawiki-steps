'use strict';

// Search: the search box of the skin with its suggestions (they load late: the
// skin loads its search module when the box gets the focus, then asks the wiki
// for titles), choosing a suggestion, a full search, and the results page.
//
// Waits: the skin's search module through the wiki's module loader
// (`mw.loader.using()`), then the answer to the suggestions request
// (rest.php/v1/search/title for the default skin, api.php action=opensearch for
// the others). No sleeps.

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
  settle,
  waitForModules,
  afterNavigation,
  eventually,
  pageSummary,
} = require('./mediawiki-helpers');

/** The search module of the skin on screen. */
async function searchModule(world) {
  const skin = await config(world, 'skin');
  return ({ 'vector-2022': 'skins.vector.search', minerva: 'skins.minerva.search' })[skin] || 'mediawiki.searchSuggest';
}

/** The search box a person types in (the skin replaces it once its search module runs). */
function searchBox(world) {
  return world.page.locator('#p-search input[name="search"], #searchform input[name="search"], #simpleSearch input[name="search"], input#searchInput').filter({ visible: true }).first();
}

/** The suggestions of the search box: the titles it offers, without the "Search for pages containing" entry. */
async function suggestions(world) {
  return world.page.evaluate(() => {
    const codex = [...document.querySelectorAll('#p-search [role="option"], .vector-search-box [role="option"]')]
      .filter((o) => o.offsetParent && !o.closest('.cdx-typeahead-search__search-footer') && !/cdx-typeahead-search__search-footer/.test(o.className))
      .map((o) => (o.querySelector('.cdx-menu-item__text__label, .cdx-search-result-title') || o).textContent.replace(/\s+/g, ' ').trim());
    const legacy = [...document.querySelectorAll('.suggestions .suggestions-result')].filter((o) => o.offsetParent).map((o) => o.textContent.replace(/\s+/g, ' ').trim());
    return codex.concat(legacy).filter((t) => t && !/^Search for pages containing/i.test(t));
  }).catch(() => []);
}

/**
 * Type in the search box of the skin, as a person does: the box gets the focus,
 * the skin's search module loads, and every letter is typed. The step waits for
 * the wiki's answer to the suggestions request.
 *
 * Example #1: When I type "Readi" in the search box
 * Example #2: When we type "Second test" in the search box
 * Example #3: And I type "Main" in the search box
 * Example #4: When I type "Category:Test" in the search box
 * Example #5: When I type "zzqq" in the search box
 */
When(/^(I |we )*type "([^"]*)" in the search box$/, { timeout: 60000 }, async function (pronounCase, text) {
  const page = this.page;
  let box = searchBox(this);
  if (!(await box.count())) {
    // A narrow default skin folds the box behind a search button.
    const toggle = page.locator('#p-search .search-toggle, .vector-search-box .search-toggle').filter({ visible: true });
    if (await toggle.count()) await toggle.first().click();
    box = searchBox(this);
  }
  if (!(await box.count())) throw friendly({ message: `The page has no search box: ${await pageSummary(this)}.`, hint: cutRequest(this) ? CUT_HINT : 'Open a page of the wiki first.' });
  await box.click();
  await waitForModules(this, await searchModule(this), { what: 'The search box of the skin' });
  box = searchBox(this);
  const answered = page.waitForResponse((r) => /\/rest\.php\/v1\/search\/title|action=opensearch|list=prefixsearch/.test(r.url()), { timeout: budget(this) }).catch(() => null);
  await box.fill('');
  await box.pressSequentially(text, { delay: 30 });
  const response = await answered;
  if (response && !/json/.test(response.headers()['content-type'] || '')) {
    throw friendly({ message: `The wiki answered the suggestions request (${response.url()}) with ${response.headers()['content-type'] || 'no content type'}, not JSON.`, hint: 'On nginx, rest.php/v1/... needs the rule MediaWiki documents: location /rest.php/ { try_files $uri $uri/ /rest.php?$query_string; }.' });
  }
  await settle(this, 1000);
});

/**
 * Assert that the suggestions of the search box list, or do not list, a page by
 * its title.
 *
 * Example #1: Then the search suggestions should list "Reading test page"
 * Example #2: Then the search suggestions should not list "Second test page"
 * Example #3: And the search suggestions should list "Main Page"
 * Example #4: Then the search suggestions should list "Category:Test guides"
 * Example #5: And the search suggestions should not list "Reading test page"
 */
Then(/^the search suggestions should( not)* list "([^"]*)"$/, async function (notCase, title) {
  const want = titleText(title);
  await eventually(this, () => suggestions(this), (list) => !!notCase !== list.includes(want),
    (list) => ({ message: notCase ? `The search suggestions list "${want}".` : `The search suggestions do not list "${want}". They list: ${listed(list)}.`, hint: 'Type in the search box first ("When I type ... in the search box"): the suggestions are titles that start with what was typed.' }));
});

/**
 * Choose a suggestion of the search box: the wiki opens that page.
 *
 * Example #1: When I choose the suggestion "Reading test page"
 * Example #2: When we choose the suggestion "Main Page"
 * Example #3: And I choose the suggestion "Second test page"
 * Example #4: When I choose the suggestion "Category:Test guides"
 * Example #5: When we choose the suggestion "Reading test page"
 */
When(/^(I |we )*choose the suggestion "([^"]*)"$/, { timeout: 60000 }, async function (pronounCase, title) {
  const want = titleText(title);
  await eventually(this, () => suggestions(this), (list) => list.includes(want),
    (list) => ({ message: `The search suggestions do not list "${want}". They list: ${listed(list)}.`, hint: 'Type in the search box first.' }));
  const option = this.page.locator('#p-search [role="option"], .vector-search-box [role="option"], .suggestions .suggestions-result').filter({ visible: true }).filter({ hasText: want }).first();
  await afterNavigation(this, () => option.click());
  if (cutRequest(this)) throw friendly({ message: `The suggestion "${want}" did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
});

/**
 * Search the wiki for pages that contain words, as a person does: type the words
 * in the search box and choose "Search for pages containing …". The browser ends
 * on the results page.
 *
 * Example #1: When I search for "readers"
 * Example #2: When we search for "conflict line"
 * Example #3: And I search for "history"
 * Example #4: When I search for "zzqqnothing"
 * Example #5: When we search for "second version"
 */
When(/^(I |we )*search for "([^"]*)"$/, { timeout: 90000 }, async function (pronounCase, words) {
  const page = this.page;
  if (!(await page.evaluate(() => !!window.mw).catch(() => false))) {
    throw friendly({ message: `No page of the wiki is open: ${await pageSummary(this)}.`, hint: 'Open a page of the wiki first.' });
  }
  let box = searchBox(this);
  if (!(await box.count())) {
    const toggle = page.locator('#p-search .search-toggle').filter({ visible: true });
    if (await toggle.count()) await toggle.first().click();
    box = searchBox(this);
  }
  await box.click();
  await waitForModules(this, await searchModule(this), { what: 'The search box of the skin' });
  box = searchBox(this);
  const answered = page.waitForResponse((r) => /\/rest\.php\/v1\/search\/title|action=opensearch/.test(r.url()), { timeout: budget(this) }).catch(() => null);
  await box.fill('');
  await box.pressSequentially(words, { delay: 30 });
  await answered;
  const containing = page.locator('#p-search .cdx-typeahead-search__search-footer, #p-search [role="option"]:has-text("Search for pages containing"), .suggestions .suggestions-special').filter({ visible: true }).first();
  if (await containing.count()) {
    await afterNavigation(this, () => containing.click());
  } else {
    // No suggestions list (a skin without one): the search form's own full search.
    await afterNavigation(this, () => box.press('Enter'));
  }
  if (cutRequest(this)) throw friendly({ message: `The search did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
  const special = await config(this, 'wgCanonicalSpecialPageName');
  if (special !== 'Search') {
    throw friendly({ message: `The search for "${words}" did not open the results page: ${await pageSummary(this)}.`, hint: 'A title that matches the words exactly opens that page instead; choose words that are not a title.' });
  }
});

/** The results of the results page: the titles found and the snippet of each. */
async function results(world) {
  return world.page.evaluate(() => [...document.querySelectorAll('.mw-search-results .mw-search-result')].map((li) => ({
    title: (li.querySelector('.mw-search-result-heading a') || {}).textContent || '',
    snippet: ((li.querySelector('.searchresult') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
    matches: [...li.querySelectorAll('.searchmatch')].map((m) => m.textContent.trim()),
  }))).catch(() => []);
}

/**
 * Assert that the results page lists, or does not list, a page.
 *
 * Example #1: Then the search results should list the page "Reading test page"
 * Example #2: Then the search results should not list the page "Second test page"
 * Example #3: And the search results should list the page "Second test page"
 * Example #4: Then the search results should list the page "History test page"
 * Example #5: And the search results should not list the page "Main Page"
 */
Then(/^the search results should( not)* list the page "([^"]*)"$/, async function (notCase, title) {
  const want = titleText(title);
  const found = await results(this);
  if (!!notCase === found.some((r) => r.title.trim() === want)) {
    throw friendly({ message: notCase ? `The search results list "${want}".` : `The search results do not list "${want}". They list: ${listed(found.map((r) => r.title))}.`, hint: 'Search first ("When I search for ..."); the wiki finds a page by the words of its text and title.' });
  }
});

/**
 * Assert that a result of the results page shows a word of the search
 * highlighted in its snippet.
 *
 * Example #1: Then the search result "Reading test page" should mention "readers"
 * Example #2: And the search result "Second test page" should mention "version"
 * Example #3: Then the search result "History test page" should mention "history"
 * Example #4: Then the search result "Reading test page" should mention "wiki"
 * Example #5: And the search result "Reading test page" should mention "readers"
 */
Then(/^the search result "([^"]*)" should mention "([^"]*)"$/, async function (title, word) {
  const want = titleText(title);
  const found = await results(this);
  const result = found.find((r) => r.title.trim() === want);
  if (!result || !result.matches.some((m) => m.toLowerCase() === clean(word).toLowerCase())) {
    throw friendly({
      message: result ? `The result "${want}" does not highlight "${word}"; it highlights ${listed(result.matches)} in "${result.snippet.slice(0, 200)}".` : `The search results do not list "${want}". They list: ${listed(found.map((r) => r.title))}.`,
      hint: 'The results page highlights the words of the search in each snippet.',
    });
  }
});

/**
 * Assert how many pages the search found, as the results page counts them, or
 * that it found none ("There were no results matching the query.").
 *
 * Example #1: Then the search should find 1 page
 * Example #2: Then the search should find 2 pages
 * Example #3: Then the search should find no page
 * Example #4: And the search should find 3 pages
 * Example #5: And the search should find no page
 */
Then(/^the search should find (\d+|no) pages?$/, async function (count) {
  const want = count === 'no' ? 0 : Number(count);
  const state = await this.page.evaluate(() => ({
    none: !!document.querySelector('.mw-search-nonefound'),
    total: (() => { const i = document.querySelector('.results-info'); return i && i.dataset && i.dataset.mwNumResultsTotal ? Number(i.dataset.mwNumResultsTotal) : null; })(),
    listed: document.querySelectorAll('.mw-search-results .mw-search-result').length,
    info: ((document.querySelector('.results-info') || document.querySelector('.mw-search-nonefound') || {}).textContent || '').replace(/\s+/g, ' ').trim(),
  })).catch(() => ({ none: false, total: null, listed: 0, info: '' }));
  const got = state.none ? 0 : (state.total !== null ? state.total : state.listed);
  if (got !== want || (want === 0 && !state.none)) {
    throw friendly({ message: `The search found ${got} page(s), not ${want}. The results page says: "${state.info}".`, hint: 'Search first ("When I search for ..."). A test page is found once the wiki has indexed it, at the save.' });
  }
});

module.exports = { suggestions, results };
