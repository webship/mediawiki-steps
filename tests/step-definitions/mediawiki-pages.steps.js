'use strict';

// Pages: the test pages a scenario works on (made, protected and deleted again
// through the wiki's API, as the administrator of the users registry), opening a
// page by its title, and what a reader sees on it: its title, its sections and
// contents list, its links, its references, its categories, the category tree of
// a category page, and its talk page.
//
// A test page is made by the scenario and deleted after it, whatever happens in
// it (the After hook below), so the suite leaves the wiki as it found it. A page a
// person made is never overwritten: "has the text" changes only a page that a
// test scenario made (its latest edit summary carries the marker).

const { Before, After, Given, When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  budget,
  clean,
  listed,
  titleKey,
  titleText,
  config,
  cutRequest,
  CUT_HINT,
  settle,
  pageModulesReady,
  openPage,
  afterNavigation,
  eventually,
  shownTitle,
  pageSummary,
  messages,
  closeWelcomeDialog,
  fixturePath,
  MARKER,
  adminApi,
  pageInfo,
  apiEdit,
  apiDelete,
  apiProtect,
  apiUpload,
  apiUnblock,
  waitForJobs,
  waitForCategoryCounts,
  categoriesOf,
  resolveUser,
} = require('./mediawiki-helpers');

// What a scenario made or changed on the wiki, undone after it.
Before(function () {
  this.__wikiCleanup = { pages: new Set(), blocks: new Set() };
});

After({ timeout: 120000 }, async function () {
  const cleanup = this.__wikiCleanup;
  if (!cleanup || (!cleanup.pages.size && !cleanup.blocks.size)) return;
  const problems = [];
  for (const name of cleanup.blocks) {
    try { await apiUnblock(this, name, 'Cleanup after a test scenario'); } catch (err) { problems.push(`unblock ${name}: ${clean(err.message).slice(0, 120)}`); }
  }
  for (const title of cleanup.pages) {
    const talk = talkTitle(title);
    for (const t of talk ? [title, talk] : [title]) {
      try { await apiDelete(this, t, 'Cleanup after a test scenario'); } catch (err) { problems.push(`delete ${t}: ${clean(err.message).slice(0, 120)}`); }
    }
  }
  if (problems.length) process.stderr.write(`\n[mediawiki-steps] cleanup after the scenario left work undone: ${problems.join('; ')}\n`);
});

/** The talk page of a title ("Talk:X" of "X", "User talk:X" of "User:X"), or '' for a talk page. */
function talkTitle(title) {
  const t = titleText(title);
  const m = t.match(/^([^:]+):(.+)$/);
  const namespaces = { Category: 'Category talk', File: 'File talk', User: 'User talk', Help: 'Help talk', Template: 'Template talk', Project: 'Project talk' };
  if (!m) return `Talk:${t}`;
  if (/talk$/i.test(m[1])) return '';
  return namespaces[m[1]] ? `${namespaces[m[1]]}:${m[2]}` : '';
}

/** Register a title for deletion after the scenario. */
function cleanUpAfter(world, title) {
  if (!world.__wikiCleanup) world.__wikiCleanup = { pages: new Set(), blocks: new Set() };
  world.__wikiCleanup.pages.add(titleText(title));
}

/** Make or change a test page; a page a person made is not touched. */
async function writeTestPage(world, title, text, summary) {
  const info = await pageInfo(world, title);
  const ours = !info.exists || (world.__wikiCleanup && world.__wikiCleanup.pages.has(titleText(title))) || (info.revision && info.revision.comment.includes(MARKER));
  if (!ours) {
    throw friendly({
      message: `The page "${titleText(title)}" is on the wiki already and a test scenario did not make it (its latest edit: "${info.revision ? info.revision.comment : ''}" by ${info.revision ? info.revision.user : '?'}).`,
      hint: 'A test page is deleted after the scenario: give the scenario a page of its own, with a title no person uses, or say first that the page does not exist ("Given the page ... does not exist").',
    });
  }
  cleanUpAfter(world, title);
  const before = info.exists && info.revision ? categoriesOf(info.revision.text) : [];
  await apiEdit(world, title, text, `${summary || 'Test page of a scenario'} ${MARKER}`);
  await waitForJobs(world);
  // The categories the page is put in (and taken out of) get their counts once a job of the wiki ran.
  await waitForCategoryCounts(world, before.concat(categoriesOf(text)));
}

/**
 * Make a test page with wikitext, through the wiki's API as the administrator of
 * the users registry (`worldParameters.wikiAdmin`). The page is deleted after the
 * scenario. Run again, it makes a new revision of the same test page.
 *
 * Example #1: Given the page "Reading test page" has the text:
 * Example #2: Given the page "Category:Test guides" has the text:
 * Example #3: And the page "Second test page" has the text:
 * Example #4: Given the page "Talk:Reading test page" has the text:
 * Example #5: Given the page "History test page" has the text:
 */
Given(/^the page "([^"]*)" has the text:$/, { timeout: 90000 }, async function (title, text) {
  await writeTestPage(this, title, String(text));
});

/**
 * Make a test page with one line of wikitext, as the step above ("\n" starts a
 * new line), with an edit summary of its own when given (the history lists the
 * revision by it).
 *
 * Example #1: Given the page "History test page" has the text "First version of the page." with the summary "First version"
 * Example #2: And the page "History test page" has the text "Second version of the page." with the summary "Second version"
 * Example #3: Given the page "Editing test page" has the text "Words to change."
 * Example #4: Given the page "Category:Test guides" has the text "Guides of the test wiki."
 * Example #5: Given the page "Conflict test page" has the text "The first line."
 */
Given(/^the page "([^"]*)" has the text "([^"]*)"(?: with the summary "([^"]*)")?$/, { timeout: 90000 }, async function (title, text, summary) {
  await writeTestPage(this, title, text.replace(/\\n/g, '\n'), summary);
});

/**
 * Make sure a page is not on the wiki (it is deleted through the API when it is),
 * and delete it again after the scenario: for the page the scenario makes itself.
 *
 * Example #1: Given the page "Page made in the source editor" does not exist
 * Example #2: Given the page "Talk:Reading test page" does not exist
 * Example #3: And the page "File:Test square.png" does not exist
 * Example #4: Given the page "Visual editor test page" does not exist
 * Example #5: Given the page "Deletion test page" does not exist
 */
Given(/^the page "([^"]*)" does not exist$/, { timeout: 90000 }, async function (title) {
  cleanUpAfter(this, title);
  await apiDelete(this, title, `Test page of a scenario ${MARKER}`);
});

/**
 * Protect a test page through the API: only autoconfirmed users (the "confirmed"
 * group and established accounts) or only administrators may edit or move it.
 *
 * Example #1: Given the page "Protected test page" is protected so that only autoconfirmed users can edit it
 * Example #2: Given the page "Protected test page" is protected so that only administrators can edit it
 * Example #3: And the page "Second test page" is protected so that only administrators can edit it
 * Example #4: Given the page "Reading test page" is protected so that only autoconfirmed users can edit it
 * Example #5: And the page "History test page" is protected so that only autoconfirmed users can edit it
 */
Given(/^the page "([^"]*)" is protected so that only (autoconfirmed users|administrators) can edit it$/, { timeout: 60000 }, async function (title, who) {
  if (!this.__wikiCleanup || !this.__wikiCleanup.pages.has(titleText(title))) {
    throw friendly({ message: `"${titleText(title)}" is not a test page of this scenario.`, hint: 'Make it first ("Given the page ... has the text ..."): only a test page is protected, and it is deleted after the scenario.' });
  }
  await apiProtect(this, title, who === 'administrators' ? 'sysop' : 'autoconfirmed');
});

/**
 * Upload a test file through the API, whatever the wiki warns (a duplicate, a
 * name in use): the file is deleted after the scenario. The local file is a path
 * from the project, or from this pack (tests/fixtures/ ships with it).
 *
 * Example #1: Given the file "Test square.png" is uploaded from "tests/fixtures/blue-square.png"
 * Example #2: Given the file "Second square.png" is uploaded from "tests/fixtures/blue-square.png"
 * Example #3: And the file "Test square.png" is uploaded from "tests/fixtures/blue-square.png"
 * Example #4: Given the file "Duplicate source.png" is uploaded from "tests/fixtures/blue-square.png"
 * Example #5: Given the file "Reading test image.png" is uploaded from "tests/fixtures/blue-square.png"
 */
Given(/^the file "([^"]*)" is uploaded from "([^"]*)"$/, { timeout: 90000 }, async function (name, file) {
  const local = fixturePath(file);
  cleanUpAfter(this, `File:${name}`);
  await apiUpload(this, name, local);
});

/**
 * Make sure an account has no block (it is lifted through the API when it has
 * one), for the scenarios that block it.
 *
 * Example #1: Given the account "reader" is not blocked
 * Example #2: And the account "reader" is not blocked
 * Example #3: Given the account "editor" is not blocked
 * Example #4: Given the account "Reader" is not blocked
 * Example #5: And the account "editor" is not blocked
 */
Given(/^the account "([^"]*)" is not blocked$/, { timeout: 60000 }, async function (who) {
  const users = (this.parameters && this.parameters.users) || {};
  const name = users[who] ? resolveUser(this, who).wikiName : who;
  await apiUnblock(this, name, 'Test account given back by a scenario');
});

/**
 * Open a page of the wiki by its title (index.php?title=…, with the skin of
 * `worldParameters.skin`), and wait for the scripts the page asked for.
 *
 * Example #1: When I open the page "Reading test page"
 * Example #2: Given I am on the page "Main Page"
 * Example #3: When we open the page "Category:Test guides"
 * Example #4: Given we are on the page "Special:RecentChanges"
 * Example #5: And I open the page "Talk:Reading test page"
 */
When(/^(?:I open|we open|I am on|we are on) the page "([^"]*)"$/, { timeout: 90000 }, async function (title) {
  await openPage(this, title);
  if (cutRequest(this)) throw friendly({ message: `The page "${title}" did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
  await pageModulesReady(this).catch(() => []);
});

/**
 * Assert that the browser shows a page by its title (the page's own name,
 * `wgPageName`, and the title it shows).
 *
 * Example #1: Then I should see the page "Reading test page"
 * Example #2: Then we should see the page "Talk:Reading test page"
 * Example #3: And I should see the page "Category:Test guides"
 * Example #4: Then I should see the page "File:Test square.png"
 * Example #5: Then I should see the page "Main Page"
 */
Then(/^(I |we )*should see the page "([^"]*)"$/, async function (pronounCase, title) {
  await eventually(this, async () => ({ name: await config(this, 'wgPageName'), shown: await shownTitle(this) }),
    (v) => v.name === titleKey(title) || v.shown === titleText(title),
    (v) => ({ message: `Expected the page "${titleText(title)}"; ${v.name ? `the browser shows "${titleText(v.name)}" (${v.shown})` : `the browser shows no page of the wiki (${this.page.url()})`}.`, hint: cutRequest(this) ? CUT_HINT : 'Titles are matched as the wiki writes them: the first letter upper case, spaces and underscores alike.' }));
});

/**
 * Assert the text of the page's body (the rendered content, without the skin
 * around it), or that a text is not there.
 *
 * Example #1: Then the page text should contain "First version of the page."
 * Example #2: Then the page text should not contain "Second version"
 * Example #3: And the page text should contain "Typed in the visual editor"
 * Example #4: Then the page text should contain "A wiki is a website"
 * Example #5: And the page text should not contain "Words to change."
 */
Then(/^the page text should( not)* contain "([^"]*)"$/, async function (notCase, expected) {
  const read = async () => clean(await this.page.locator('#mw-content-text .mw-parser-output, #mw-content-text').first().innerText({ timeout: 2000 }).catch(() => ''));
  await eventually(this, read, (text) => !!notCase !== text.includes(clean(expected)),
    (text) => ({ message: notCase ? `The page text contains "${expected}".` : `The page text does not contain "${expected}". It reads: "${text.slice(0, 300)}".`, hint: 'The page text is the content of the page (#mw-content-text), not the menus of the skin.' }));
});

/** The sections of the page: every heading of the content, with its anchor, in order. */
async function sections(world) {
  return world.page.evaluate(() => {
    const root = document.querySelector('#mw-content-text .mw-parser-output') || document.querySelector('#mw-content-text');
    if (!root) return [];
    const out = [];
    for (const h of root.querySelectorAll('h2, h3, h4, h5, h6')) {
      if (h.closest('#toc, .toc') || h.id === 'mw-toc-heading') continue;
      const headline = h.querySelector('.mw-headline');
      const clone = h.cloneNode(true);
      clone.querySelectorAll('.mw-editsection').forEach((e) => e.remove());
      const text = (headline ? headline.textContent : clone.textContent).replace(/\s+/g, ' ').trim();
      if (text) out.push({ id: h.id || (headline && headline.id) || '', text, level: Number(h.tagName[1]) });
    }
    return out;
  }).catch(() => []);
}

/**
 * Assert that the page has, or has not, a section by its heading.
 *
 * Example #1: Then the page should have the section "Overview"
 * Example #2: Then the page should not have the section "History"
 * Example #3: And the page should have the section "Source editing"
 * Example #4: Then the page should have the section "A question about this page"
 * Example #5: And the page should not have the section "Removed section"
 */
Then(/^the page should( not)* have the section "([^"]*)"$/, async function (notCase, name) {
  await pageModulesReady(this).catch(() => []);
  const found = await sections(this);
  const has = found.some((s) => s.text === clean(name));
  if (!!notCase === has) {
    throw friendly({ message: notCase ? `The page has the section "${name}".` : `The page has no section "${name}". Its sections: ${listed(found.map((s) => s.text))}.`, hint: 'A section is a heading of the content (== Heading == in wikitext), matched as written.' });
  }
});

/**
 * Assert the sections of the page, in order, with their levels (2 for
 * == Heading ==, 3 for === Heading ===).
 *
 * Example #1: Then the page should have these sections in order:
 * Example #2: And the page should have these sections in order:
 * Example #3: Then the page should have these sections in order:
 * Example #4: Then the page should have these sections in order:
 * Example #5: And the page should have these sections in order:
 */
Then(/^the page should have these sections in order:$/, async function (table) {
  const expected = table.hashes().map((row) => ({ text: clean(row.section), level: Number(row.level || 0) }));
  const found = await sections(this);
  const got = found.map((s) => `${s.text} (${s.level})`);
  const want = expected.map((s) => `${s.text} (${s.level || '?'})`);
  const ok = expected.length === found.length && expected.every((s, i) => s.text === found[i].text && (!s.level || s.level === found[i].level));
  if (!ok) {
    throw friendly({ message: `The sections of the page are ${listed(got)}, not ${listed(want)}.`, hint: 'The table has the columns "section" and "level" (2 for == Heading ==, 3 for === Heading ===).' });
  }
});

/** The entries of the contents list (the sidebar list of the default skin, or the list in the page). */
async function contentsEntries(world) {
  return world.page.evaluate(() => {
    const links = [...document.querySelectorAll('#vector-toc a.vector-toc-link, #toc a, .toc a, #mw-panel-toc a')];
    return links.filter((a) => a.getAttribute('href') && a.getAttribute('href') !== '#').map((a) => {
      const label = a.querySelector('.toctext, .vector-toc-text > span:not(.vector-toc-numb)') || a;
      return { href: a.getAttribute('href'), text: label.textContent.replace(/\s+/g, ' ').trim() };
    });
  }).catch(() => []);
}

/**
 * Assert that the contents list of the page lists, or does not list, a section.
 *
 * Example #1: Then the contents list should list "Overview"
 * Example #2: Then the contents list should not list "History"
 * Example #3: And the contents list should list "Source editing"
 * Example #4: Then the contents list should list "References"
 * Example #5: And the contents list should not list "Removed section"
 */
Then(/^the contents list should( not)* list "([^"]*)"$/, async function (notCase, name) {
  await pageModulesReady(this).catch(() => []);
  const entries = await contentsEntries(this);
  const has = entries.some((e) => e.text === clean(name));
  if (!!notCase === has) {
    throw friendly({ message: notCase ? `The contents list lists "${name}".` : `The contents list does not list "${name}". It lists: ${listed(entries.map((e) => e.text))}.`, hint: 'The wiki shows a contents list on a page with four sections or more (or __TOC__ in the wikitext).' });
  }
});

/**
 * Follow an entry of the contents list, as a person does: the page goes to the
 * section.
 *
 * Example #1: When I follow "Overview" in the contents list
 * Example #2: When we follow "Source editing" in the contents list
 * Example #3: And I follow "Links" in the contents list
 * Example #4: When I follow "References" in the contents list
 * Example #5: When I follow "Visual editing" in the contents list
 */
When(/^(I |we )*follow "([^"]*)" in the contents list$/, async function (pronounCase, name) {
  await pageModulesReady(this).catch(() => []);
  const entries = await contentsEntries(this);
  const entry = entries.find((e) => e.text === clean(name));
  if (!entry) throw friendly({ message: `The contents list has no entry "${name}". It lists: ${listed(entries.map((e) => e.text))}.`, hint: 'Name the entry as the list writes it, without its number.' });
  const link = this.page.locator(`#vector-toc a.vector-toc-link[href="${entry.href}"], #toc a[href="${entry.href}"], .toc a[href="${entry.href}"]`).filter({ visible: true }).first();
  await link.click();
  await settle(this, 1500);
});

/**
 * Assert that the page is at a section: the address ends with its anchor and its
 * heading is in view.
 *
 * Example #1: Then I should be at the section "Overview"
 * Example #2: Then we should be at the section "Source editing"
 * Example #3: And I should be at the section "Links"
 * Example #4: Then I should be at the section "A question about this page"
 * Example #5: Then I should be at the section "References"
 */
Then(/^(I |we )*should be at the section "([^"]*)"$/, async function (pronounCase, name) {
  const found = await sections(this);
  const section = found.find((s) => s.text === clean(name));
  if (!section) throw friendly({ message: `The page has no section "${name}". Its sections: ${listed(found.map((s) => s.text))}.`, hint: 'Name the section by its heading.' });
  await eventually(this, () => this.page.evaluate((id) => {
    const el = document.getElementById(id);
    const rect = el ? el.getBoundingClientRect() : null;
    return { hash: decodeURIComponent(location.hash.slice(1)), inView: !!rect && rect.top >= -2 && rect.top < window.innerHeight };
  }, section.id), (v) => v.hash === section.id && v.inView,
  (v) => ({ message: `The page is not at the section "${name}": the address ends with "#${v.hash}" (expected "#${section.id}") and the heading is ${v.inView ? '' : 'not '}in view.`, hint: 'Follow the section from the contents list or a link to it first.' }));
});

/** The links of the page's content, with the page each one leads to (its title), and their kind. */
async function contentLinks(world) {
  return world.page.evaluate(() => {
    const root = document.querySelector('#mw-content-text .mw-parser-output') || document.querySelector('#mw-content-text');
    const articlePath = (window.mw && mw.config.get('wgArticlePath') || '/index.php?title=$1').split('$1')[0];
    return [...(root ? root.querySelectorAll('a[href]') : [])].filter((a) => !a.closest('.mw-editsection, #toc, .toc')).map((a) => {
      let title = null;
      try {
        const u = new URL(a.href, location.href);
        title = u.searchParams.get('title');
        if (!title && articlePath.indexOf('?') === -1 && u.pathname.startsWith(articlePath)) title = decodeURIComponent(u.pathname.slice(articlePath.length));
      } catch (e) { /* not an address */ }
      return { text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href'), title: title ? title.replace(/_/g, ' ') : null, missing: a.classList.contains('new'), external: a.classList.contains('external') };
    });
  }).catch(() => []);
}

/**
 * Assert that the page links to another page of the wiki that exists (a blue
 * link), or to a page that does not exist yet (a red link), by the title the
 * link leads to. A red link to a page that exists says so: the page on screen
 * was drawn before that page was made.
 *
 * Example #1: Then the page should link to the page "Editing help"
 * Example #2: Then the page should link to the missing page "Page not written yet"
 * Example #3: And the page should link to the page "Second test page"
 * Example #4: Then the page should not link to the page "Unrelated page"
 * Example #5: Then the page should not link to the missing page "Second test page"
 */
Then(/^the page should( not)* link to the (page|missing page) "([^"]*)"$/, async function (notCase, kind, title) {
  const links = await contentLinks(this);
  const want = titleText(title);
  const has = links.some((l) => l.title && titleText(l.title) === want && !l.external && l.missing === (kind === 'missing page'));
  if (!notCase && !has && kind === 'page' && links.some((l) => l.title && titleText(l.title) === want && l.missing)) {
    // A red link to a page that exists: the page on screen was drawn before that page was made.
    const info = await pageInfo(this, want).catch(() => null);
    if (info && info.exists) {
      throw friendly({
        message: `The link to "${want}" is red, although the page exists: the wiki drew this page before "${want}" was made, and draws it again only when a job of the wiki runs (or the page is opened again later).`,
        hint: `Make "${want}" first, then the page that links to it ("Given the page "${want}" has the text …" before the page with the link).`,
      });
    }
  }
  if (!!notCase === has) {
    const internal = links.filter((l) => l.title && !l.external).map((l) => `${l.title}${l.missing ? ' (missing)' : ''}`);
    throw friendly({ message: notCase ? `The page links to the ${kind} "${want}".` : `The page has no link to the ${kind} "${want}". Its links to pages: ${listed(internal)}.`, hint: 'A link to a page that does not exist yet is a red link (class "new"); the title is the page the link leads to, not its text.' });
  }
});

/**
 * Assert that the page links to an address outside the wiki (an external link).
 *
 * Example #1: Then the page should link to the external site "https://example.org"
 * Example #2: Then the page should not link to the external site "https://example.com"
 * Example #3: And the page should link to the external site "https://example.org/"
 * Example #4: Then the page should link to the external site "https://example.org/docs"
 * Example #5: And the page should not link to the external site "https://example.net"
 */
Then(/^the page should( not)* link to the external site "([^"]*)"$/, async function (notCase, url) {
  const links = await contentLinks(this);
  const norm = (u) => String(u || '').replace(/\/+$/, '');
  const has = links.some((l) => l.external && norm(l.href) === norm(url));
  if (!!notCase === has) {
    throw friendly({ message: notCase ? `The page links to "${url}".` : `The page has no external link to "${url}". Its external links: ${listed(links.filter((l) => l.external).map((l) => l.href))}.`, hint: 'An external link is written [https://example.org text] in wikitext.' });
  }
});

/**
 * Follow a link of the page's content to another page of the wiki, by the title
 * it leads to.
 *
 * Example #1: When I follow the link to the page "Editing help"
 * Example #2: When we follow the link to the page "Second test page"
 * Example #3: And I follow the link to the page "Reading test page"
 * Example #4: When I follow the link to the page "Page not written yet"
 * Example #5: When I follow the link to the page "Main Page"
 */
When(/^(I |we )*follow the link to the page "([^"]*)"$/, { timeout: 60000 }, async function (pronounCase, title) {
  const links = await contentLinks(this);
  const link = links.find((l) => l.title && titleText(l.title) === titleText(title) && !l.external);
  if (!link) throw friendly({ message: `The page has no link to "${titleText(title)}". Its links: ${listed(links.filter((l) => l.title).map((l) => l.title))}.`, hint: 'Name the page the link leads to.' });
  await afterNavigation(this, () => this.page.locator(`#mw-content-text a[href="${link.href}"]`).filter({ visible: true }).first().click());
  if (cutRequest(this)) throw friendly({ message: `The link to "${title}" did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
});

/**
 * Assert that a reference of the page (a footnote: <ref>…</ref>) leads to a text
 * in the list of references, by its number as the page shows it.
 *
 * Example #1: Then the reference "1" should read "Every page keeps its history."
 * Example #2: And the reference "2" should read "A second source."
 * Example #3: Then the reference "1" should read "Every page keeps"
 * Example #4: Then the reference "3" should read "The third note."
 * Example #5: And the reference "1" should read "its history"
 */
Then(/^the reference "(\d+)" should read "([^"]*)"$/, async function (number, expected) {
  const note = await this.page.evaluate((n) => {
    const sup = [...document.querySelectorAll('#mw-content-text sup.reference a')].find((a) => a.textContent.replace(/[[\]\s]/g, '') === n);
    if (!sup) return { found: false, numbers: [...document.querySelectorAll('#mw-content-text sup.reference a')].map((a) => a.textContent.trim()) };
    const id = decodeURIComponent((sup.getAttribute('href') || '').replace(/^#/, ''));
    const li = document.getElementById(id);
    const text = li ? (li.querySelector('.reference-text') || li).textContent.replace(/\s+/g, ' ').trim() : '';
    return { found: true, id, text };
  }, String(number));
  if (!note.found || !note.text.includes(clean(expected))) {
    throw friendly({
      message: note.found ? `The reference [${number}] reads "${note.text}", not "${expected}".` : `The page has no reference [${number}]. Its references: ${listed(note.numbers)}.`,
      hint: 'References are made with <ref>…</ref> and listed by <references /> (the Cite extension).',
    });
  }
});

/** The categories the page is in, as its categories box lists them. */
async function pageCategories(world) {
  return world.page.evaluate(() => [...document.querySelectorAll('#mw-normal-catlinks ul li a')].map((a) => a.textContent.trim())).catch(() => []);
}

/**
 * Assert that the page is, or is not, in a category, as its categories box at
 * the foot of the page lists it.
 *
 * Example #1: Then the page should be in the category "Test guides"
 * Example #2: Then the page should not be in the category "Drafts"
 * Example #3: And the page should be in the category "Test pages"
 * Example #4: Then the page should be in the category "Editing guides"
 * Example #5: And the page should not be in the category "Test guides"
 */
Then(/^the page should( not)* be in the category "([^"]*)"$/, async function (notCase, name) {
  const cats = await pageCategories(this);
  if (!!notCase === cats.includes(titleText(name))) {
    throw friendly({ message: notCase ? `The page is in the category "${name}".` : `The page is not in the category "${name}". Its categories: ${listed(cats)}.`, hint: 'A page is put in a category with [[Category:Name]] in its wikitext.' });
  }
});

/**
 * Follow a category of the page's categories box to the category's page.
 *
 * Example #1: When I follow the category "Test guides"
 * Example #2: When we follow the category "Test pages"
 * Example #3: And I follow the category "Editing guides"
 * Example #4: When I follow the category "Test guides"
 * Example #5: When we follow the category "Editing guides"
 */
When(/^(I |we )*follow the category "([^"]*)"$/, { timeout: 60000 }, async function (pronounCase, name) {
  const link = this.page.locator('#mw-normal-catlinks ul li a').filter({ hasText: new RegExp(`^\\s*${titleText(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) });
  if (!(await link.count())) throw friendly({ message: `The categories box has no category "${name}". It lists: ${listed(await pageCategories(this))}.`, hint: 'Open a page of the category first.' });
  await afterNavigation(this, () => link.first().click());
  await pageModulesReady(this).catch(() => []);
});

/**
 * Assert that a category page lists, or does not list, a page or a subcategory.
 *
 * Example #1: Then the category should list the page "Reading test page"
 * Example #2: Then the category should list the subcategory "Editing guides"
 * Example #3: And the category should not list the page "Second test page"
 * Example #4: Then the category should not list the subcategory "Drafts"
 * Example #5: And the category should list the page "Second test page"
 */
Then(/^the category should( not)* list the (page|subcategory) "([^"]*)"$/, async function (notCase, kind, name) {
  const selector = kind === 'page' ? '#mw-pages a' : '#mw-subcategories a';
  const read = () => this.page.evaluate((s) => [...document.querySelectorAll(s)].map((a) => a.textContent.trim()).filter(Boolean), selector).catch(() => []);
  const want = kind === 'page' ? titleText(name) : titleText(name).replace(/^Category:/, '');
  await eventually(this, read, (names) => !!notCase !== names.includes(want),
    (names) => ({ message: notCase ? `The category lists the ${kind} "${want}".` : `The category does not list the ${kind} "${want}". It lists: ${listed(names)}.`, hint: 'Open the category\'s page first ("When I open the page "Category:…"").' }));
});

/** The item of the category tree for a category, by its name. */
function treeItem(world, name) {
  const want = titleText(name).replace(/^Category:/, '');
  return world.page.locator('.CategoryTreeItem').filter({ has: world.page.locator('a:not(.CategoryTreeToggle)', { hasText: new RegExp(`^\\s*${want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`) }) }).first();
}

/**
 * Expand or collapse a category in the category tree of a category page, as a
 * person does with its toggle. Expanding waits for the tree's own request
 * (api.php action=categorytree) and for the list it brings.
 *
 * Example #1: When I expand the category "Test guides" in the category tree
 * Example #2: When I collapse the category "Test guides" in the category tree
 * Example #3: And we expand the category "Editing guides" in the category tree
 * Example #4: When we collapse the category "Editing guides" in the category tree
 * Example #5: When I expand the category "Test pages" in the category tree
 */
When(/^(I |we )*(expand|collapse) the category "([^"]*)" in the category tree$/, { timeout: 60000 }, async function (pronounCase, action, name) {
  await pageModulesReady(this).catch(() => []);
  const item = treeItem(this, name);
  if (!(await item.count())) {
    const names = await this.page.locator('.CategoryTreeItem > bdi a, .CategoryTreeItem a:not(.CategoryTreeToggle)').allInnerTexts().catch(() => []);
    throw friendly({ message: `The category tree has no category "${name}". It shows: ${listed(names)}.`, hint: 'The category tree is on the page of a category with subcategories (the CategoryTree extension).' });
  }
  let toggle = item.locator('.CategoryTreeToggle');
  if (!(await toggle.count())) {
    // The page may have been drawn before the wiki's job wrote the category's counts: wait for them, then
    // draw it again.
    const behind = await waitForCategoryCounts(this, [name]);
    if (!behind.length) {
      await openPage(this, await config(this, 'wgPageName'));
      await pageModulesReady(this).catch(() => []);
      toggle = treeItem(this, name).locator('.CategoryTreeToggle');
    }
  }
  if (!(await toggle.count())) throw friendly({ message: `The category "${name}" has no toggle in the tree: the wiki counts no subcategory in it.`, hint: 'A category without subcategories shows a plain bullet. The counts are written by the wiki\'s job queue: the test-data steps wait for it.' });
  const open = (await toggle.getAttribute('aria-expanded')) === 'true';
  if ((action === 'expand') === open) return;
  const answered = action === 'expand' ? this.page.waitForResponse((r) => /action=categorytree/.test(r.url()), { timeout: budget(this) }).catch(() => null) : null;
  await toggle.click();
  if (answered) await answered;
  const want = action === 'expand' ? 'true' : 'false';
  await eventually(this, async () => ({
    expanded: await toggle.getAttribute('aria-expanded').catch(() => null),
    loading: await item.locator('xpath=..').locator(':scope > .CategoryTreeChildren').innerText().then((t) => /loading/i.test(t)).catch(() => false),
  }), (v) => v.expanded === want && !v.loading,
  (v) => ({ message: `The category "${name}" did not ${action} in the tree (aria-expanded ${v.expanded}${v.loading ? ', still loading' : ''}).`, hint: 'The tree asks the wiki for the subcategories (api.php action=categorytree); see the browser console.' }));
  await settle(this, 1500);
});

/**
 * Assert that the category tree shows, or does not show, a category under
 * another one (after expanding it).
 *
 * Example #1: Then the category tree should show "Editing guides" under "Test guides"
 * Example #2: Then the category tree should not show "Editing guides" under "Test guides"
 * Example #3: And the category tree should show "Test guides" under "Test pages"
 * Example #4: Then the category tree should not show "Drafts" under "Test guides"
 * Example #5: And the category tree should show "Editing guides" under "Test guides"
 */
Then(/^the category tree should( not)* show "([^"]*)" under "([^"]*)"$/, async function (notCase, child, parent) {
  const want = titleText(child).replace(/^Category:/, '');
  const parentName = titleText(parent).replace(/^Category:/, '');
  const read = () => this.page.evaluate(({ p }) => {
    const items = [...document.querySelectorAll('.CategoryTreeItem')].filter((i) => [...i.querySelectorAll('a:not(.CategoryTreeToggle)')].some((a) => a.textContent.trim() === p));
    const names = [];
    for (const item of items) {
      const children = item.parentElement && item.parentElement.querySelector(':scope > .CategoryTreeChildren');
      if (!children || getComputedStyle(children).display === 'none') continue;
      for (const a of children.querySelectorAll('.CategoryTreeItem a:not(.CategoryTreeToggle)')) names.push(a.textContent.trim());
    }
    return names;
  }, { p: parentName }).catch(() => []);
  await eventually(this, read, (names) => !!notCase !== names.includes(want),
    (names) => ({ message: notCase ? `The category tree shows "${want}" under "${parentName}".` : `The category tree does not show "${want}" under "${parentName}". Under it: ${listed(names)}.`, hint: 'Expand the category first ("When I expand the category ... in the category tree").' }));
});

/**
 * Open the talk page of the page on screen, as a person does with its
 * "Discussion" tab. A talk page that does not exist yet opens in the editor.
 *
 * Example #1: When I open the talk page
 * Example #2: When we open the talk page
 * Example #3: And I open the talk page
 * Example #4: Then I open the talk page
 * Example #5: Given I open the talk page
 */
When(/^(I |we )*open the talk page$/, { timeout: 60000 }, async function (pronounCase) {
  const tab = this.page.locator('#ca-talk a, a#ca-talk').filter({ visible: true }).first();
  if (!(await tab.count())) throw friendly({ message: `The page has no "Discussion" tab: ${await pageSummary(this)}.`, hint: 'Open a page of the wiki first; a talk page has no talk page of its own.' });
  await afterNavigation(this, () => tab.click());
  await closeWelcomeDialog(this);
});

/**
 * Add a topic to the talk page of a page (a new section with a subject and its
 * text), as a person does with "Add topic", and save it. On a talk page that does
 * not exist yet, the wiki's new-section form makes it.
 *
 * Example #1: When I add the topic "A question about this page" with the text "Is this page complete?"
 * Example #2: When we add the topic "Sources" with the text "Which sources are missing?"
 * Example #3: And I add the topic "Layout" with the text "The table is too wide."
 * Example #4: When I add the topic "Thanks" with the text "Thank you for the page."
 * Example #5: When we add the topic "A second question" with the text "Who wrote the overview?"
 */
When(/^(I |we )*add the topic "([^"]*)" with the text "([^"]*)"$/, { timeout: 90000 }, async function (pronounCase, subject, text) {
  const page = this.page;
  const add = page.locator('#ca-addsection a, a#ca-addsection').filter({ visible: true }).first();
  if (await add.count()) {
    await afterNavigation(this, () => add.click());
  } else {
    const name = await config(this, 'wgPageName');
    const ns = await config(this, 'wgNamespaceNumber');
    if (!name) throw friendly({ message: `No page of the wiki is open: ${await pageSummary(this)}.`, hint: 'Open the page or its talk page first.' });
    const talk = ns % 2 === 1 ? name : (talkTitle(name) || name);
    await openPage(this, talk, { action: 'edit', section: 'new' });
  }
  await closeWelcomeDialog(this);
  const form = page.locator('#editform');
  try {
    await form.waitFor({ state: 'visible', timeout: budget(this) });
  } catch (err) {
    throw friendly({ message: `The new topic form did not open: ${await pageSummary(this)}.`, cause: err, hint: cutRequest(this) ? CUT_HINT : 'The account must be allowed to edit the talk page.' });
  }
  await page.locator('#wpSummary').fill(subject);
  await page.locator('#wpTextbox1').fill(text);
  await afterNavigation(this, () => page.locator('#wpSave').click());
  const saved = await config(this, 'wgPostEdit');
  if (!saved) {
    throw friendly({ message: `The topic "${subject}" was not saved: ${await pageSummary(this)}. Errors: ${listed(await messages(this, 'error'))}.`, hint: cutRequest(this) ? CUT_HINT : 'The wiki answers a saved edit with the page and a notice ("Your edit was saved.").' });
  }
});

/**
 * Assert that the talk page on screen has, or has not, a topic (a section).
 *
 * Example #1: Then the talk page should have the topic "A question about this page"
 * Example #2: Then the talk page should not have the topic "Sources"
 * Example #3: And the talk page should have the topic "Layout"
 * Example #4: Then the talk page should have the topic "Thanks"
 * Example #5: And the talk page should not have the topic "A second question"
 */
Then(/^the talk page should( not)* have the topic "([^"]*)"$/, async function (notCase, subject) {
  const ns = await config(this, 'wgNamespaceNumber');
  if (ns === null || ns % 2 !== 1) throw friendly({ message: `The browser does not show a talk page: ${await pageSummary(this)}.`, hint: 'Open the talk page first ("When I open the talk page").' });
  const found = await sections(this);
  if (!!notCase === found.some((s) => s.text === clean(subject))) {
    throw friendly({ message: notCase ? `The talk page has the topic "${subject}".` : `The talk page has no topic "${subject}". Its topics: ${listed(found.map((s) => s.text))}.`, hint: 'A topic is a section of the talk page; "Add topic" makes one.' });
  }
});

/**
 * Assert that every script the page asked for loaded (the wiki's module loader
 * resolved them all): a module whose script failed is named.
 *
 * Example #1: Then the scripts of the page should all load
 * Example #2: And the scripts of the page should all load
 * Example #3: Then the scripts of the page should all load
 * Example #4: Then the scripts of the page should all load
 * Example #5: And the scripts of the page should all load
 */
Then(/^the scripts of the page should all load$/, async function () {
  const failed = await pageModulesReady(this);
  if (failed.length) {
    throw friendly({ message: `Some scripts of the page did not load: ${failed.join(', ')}.`, hint: 'See the browser console for the error of each module; "error" means its script threw.' });
  }
});

module.exports = { talkTitle, cleanUpAfter, sections, contentsEntries, contentLinks, pageCategories };
