'use strict';

// Editing: the source editor (the wikitext, the summary, a minor edit, the
// preview, the changes, saving) and the visual editor (opening it, typing,
// saving through its dialog), an edit conflict with another account, and the
// refusal of a page the account may not edit.
//
// Waits are the wiki's own signals: the editors' modules through the module
// loader, the visual editor's hooks (ve.activationComplete, postEdit,
// ve.deactivationComplete), and the page the wiki answers a saved edit with
// (`wgPostEdit`). The visual editor's welcome dialog, which opens over the first
// editor each account opens, is closed with "Start editing".

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
  openPage,
  afterNavigation,
  eventually,
  pageSummary,
  messages,
  hasMessage,
  signedInName,
  closeWelcomeDialog,
  visualEditorActive,
  countHook,
  waitForHook,
  apiEdit,
  adminApi,
  MARKER,
} = require('./mediawiki-helpers');

const SOURCE_HINT = 'Open the source editor first ("When I edit the page ...").';

/** The source editor's text box, once the editor is on screen. */
async function sourceBox(world) {
  const box = world.page.locator('#wpTextbox1');
  if (!(await box.count()) || await visualEditorActive(world)) {
    throw friendly({ message: `The source editor is not open: ${await pageSummary(world)}.`, hint: SOURCE_HINT });
  }
  return box;
}

/**
 * Open a page in the source editor (the "Edit source" tab, action=edit), as an
 * account of the users registry or a visitor. The step waits for the editor's
 * toolbar module and closes the visual editor's welcome dialog when it shows.
 *
 * Example #1: When I edit the page "Editing test page"
 * Example #2: When we edit the page "Page made in the source editor"
 * Example #3: And I edit the page "Conflict test page"
 * Example #4: When I edit the page "Protected test page"
 * Example #5: When I edit the page "Talk:Reading test page"
 */
When(/^(I |we )*edit the page "([^"]*)"$/, { timeout: 90000 }, async function (pronounCase, title) {
  await openPage(this, title, { action: 'edit' });
  if (cutRequest(this)) throw friendly({ message: `The editor of "${title}" did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
  await closeWelcomeDialog(this);
  if (!(await this.page.locator('#wpTextbox1').count())) {
    throw friendly({ message: `The source editor of "${titleText(title)}" did not open: ${await pageSummary(this)}. ${listed(await messages(this, 'error'))}`, hint: 'The account must be allowed to edit the page.' });
  }
  const editable = !(await this.page.locator('#wpTextbox1').evaluate((t) => t.readOnly).catch(() => true));
  if (editable && await this.page.evaluate(() => mw.loader.getState('ext.wikiEditor') !== null).catch(() => false)) {
    await waitForModules(this, 'ext.wikiEditor', { what: 'The toolbar of the source editor' });
  }
});

/**
 * Replace the wikitext in the source editor.
 *
 * Example #1: When I set the wikitext to:
 * Example #2: And I set the wikitext to:
 * Example #3: When we set the wikitext to:
 * Example #4: Then I set the wikitext to:
 * Example #5: When I set the wikitext to:
 */
When(/^(I |we )*set the wikitext to:$/, async function (pronounCase, text) {
  const box = await sourceBox(this);
  await box.fill(String(text));
});

/**
 * Replace the wikitext in the source editor with one line.
 *
 * Example #1: When I set the wikitext to "A page made in the source editor."
 * Example #2: And I set the wikitext to "My own first line."
 * Example #3: When we set the wikitext to "Changed words."
 * Example #4: When I set the wikitext to "== A section ==\nIts text."
 * Example #5: And we set the wikitext to "A line."
 */
When(/^(I |we )*set the wikitext to "([^"]*)"$/, async function (pronounCase, text) {
  const box = await sourceBox(this);
  await box.fill(text.replace(/\\n/g, '\n'));
});

/**
 * Add a line at the end of the wikitext in the source editor.
 *
 * Example #1: When I add the wikitext "A line added at the end."
 * Example #2: And I add the wikitext "[[Category:Test guides]]"
 * Example #3: When we add the wikitext "== New section =="
 * Example #4: When I add the wikitext "More words."
 * Example #5: And we add the wikitext "[[Second test page]]"
 */
When(/^(I |we )*add the wikitext "([^"]*)"$/, async function (pronounCase, text) {
  const box = await sourceBox(this);
  const current = await box.inputValue();
  await box.fill(`${current.replace(/\s+$/, '')}\n${text.replace(/\\n/g, '\n')}\n`);
});

/**
 * Show the preview of the source editor ("Show preview"), and wait for it.
 *
 * Example #1: When I preview the page
 * Example #2: When we preview the page
 * Example #3: And I preview the page
 * Example #4: Then I preview the page
 * Example #5: When I preview the page
 */
When(/^(I |we )*preview the page$/, { timeout: 60000 }, async function (pronounCase) {
  await sourceBox(this);
  await afterNavigation(this, () => this.page.locator('#wpPreview').click());
  if (cutRequest(this)) throw friendly({ message: `The preview did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
  await closeWelcomeDialog(this);
});

/**
 * Assert what the preview of the source editor shows (the rendered wikitext).
 *
 * Example #1: Then the preview should show "A page made in the source editor."
 * Example #2: Then the preview should not show "Words to change."
 * Example #3: And the preview should show "A section"
 * Example #4: Then the preview should show "More words."
 * Example #5: And the preview should not show "== A section =="
 */
Then(/^the preview should( not)* show "([^"]*)"$/, async function (notCase, expected) {
  const read = async () => clean(await this.page.locator('#wikiPreview').innerText({ timeout: 2000 }).catch(() => ''));
  await eventually(this, read, (text) => !!notCase !== text.includes(clean(expected)),
    (text) => ({ message: text ? (notCase ? `The preview shows "${expected}".` : `The preview does not show "${expected}". It shows: "${text.slice(0, 300)}".`) : `No preview is on the page: ${this.page.url()}.`, hint: 'Preview first ("When I preview the page"); the note "Remember that this is only a preview" heads it.' }));
});

/**
 * Show the changes of the source editor against the saved page ("Show changes").
 *
 * Example #1: When I show my changes
 * Example #2: When we show our changes
 * Example #3: And I show my changes
 * Example #4: Then I show my changes
 * Example #5: When I show my changes
 */
When(/^(I |we )*show (my|our) changes$/, { timeout: 60000 }, async function (pronounCase, possessive) {
  await sourceBox(this);
  await afterNavigation(this, () => this.page.locator('#wpDiff').click());
  if (cutRequest(this)) throw friendly({ message: `The changes did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
  await closeWelcomeDialog(this);
});

/**
 * Assert a line of a comparison (the changes of the source editor, or two
 * revisions compared from the history): a text added, or a text removed.
 *
 * Example #1: Then the changes should show "Second version of the page." added
 * Example #2: Then the changes should show "First version of the page." removed
 * Example #3: And the changes should show "A line added at the end." added
 * Example #4: Then the changes should show "Words to change." removed
 * Example #5: And the changes should show "My own first line." added
 */
Then(/^the changes should show "([^"]*)" (added|removed)$/, async function (expected, kind) {
  const selector = kind === 'added' ? 'table.diff td.diff-addedline, table.diff ins.diffchange' : 'table.diff td.diff-deletedline, table.diff del.diffchange';
  const read = () => this.page.evaluate((s) => [...document.querySelectorAll(s)].map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean), selector).catch(() => []);
  await eventually(this, read, (lines) => lines.some((l) => l.includes(clean(expected))),
    (lines) => ({ message: lines.length || kind ? `The comparison does not show "${expected}" ${kind}. The ${kind} lines: ${listed(lines)}.` : 'No comparison is on the page.', hint: 'Show the changes first ("When I show my changes"), or compare two revisions from the history.' }));
});

/**
 * Open a page in the visual editor, as a person does with its "Edit" tab, and
 * wait for the editor to be ready (its hook ve.activationComplete). The welcome
 * dialog is closed when it shows.
 *
 * Example #1: When I edit the page "Visual editor test page" in the visual editor
 * Example #2: When we edit the page "Editing test page" in the visual editor
 * Example #3: And I edit the page "Reading test page" in the visual editor
 * Example #4: When I edit the page "Second test page" in the visual editor
 * Example #5: When I edit the page "Visual editor test page" in the visual editor
 */
When(/^(I |we )*edit the page "([^"]*)" in the visual editor$/, { timeout: 120000 }, async function (pronounCase, title) {
  const page = this.page;
  await openPage(this, title);
  if (cutRequest(this)) throw friendly({ message: `The page "${title}" did not open: ${cutRequest(this)}.`, hint: CUT_HINT });
  const tab = page.locator('#ca-ve-edit a, a#ca-ve-edit').filter({ visible: true }).first();
  if (!(await tab.count())) {
    throw friendly({ message: `The page "${titleText(title)}" offers no visual editor ("Edit" tab): ${await pageSummary(this)}.`, hint: 'The wiki needs the VisualEditor extension, and the account must be allowed to edit the page; a page that does not exist yet opens it from its red link or its "Create" tab.' });
  }
  await waitForModules(this, 'ext.visualEditor.desktopArticleTarget.init', { what: 'The visual editor' });
  const seen = await countHook(this, 've.activationComplete');
  await tab.click();
  await closeWelcomeDialog(this);
  try {
    await waitForHook(this, 've.activationComplete', seen, budget(this) * 3);
  } catch (err) {
    throw friendly({ message: `The visual editor did not open on "${titleText(title)}" (no ve.activationComplete): ${await pageSummary(this)}.`, cause: err, hint: 'The visual editor reads the page through the REST API (rest.php): on nginx it needs the rule MediaWiki documents for rest.php/. See the browser console.' });
  }
  await closeWelcomeDialog(this);
  await page.locator('.ve-ce-documentNode[contenteditable="true"]').first().waitFor({ state: 'visible', timeout: budget(this) });
});

/**
 * Type a text at the end of the page in the visual editor, as a person does.
 *
 * Example #1: When I type " Typed in the visual editor." in the visual editor
 * Example #2: And I type "A new sentence." in the visual editor
 * Example #3: When we type " More words." in the visual editor
 * Example #4: When I type " The end." in the visual editor
 * Example #5: And we type "A line." in the visual editor
 */
When(/^(I |we )*type "([^"]*)" in the visual editor$/, async function (pronounCase, text) {
  if (!(await visualEditorActive(this))) throw friendly({ message: `The visual editor is not open: ${await pageSummary(this)}.`, hint: 'Open it first ("When I edit the page ... in the visual editor").' });
  const surface = this.page.locator('.ve-ce-documentNode[contenteditable="true"]').first();
  await surface.click();
  await this.page.keyboard.press('Control+End');
  await this.page.keyboard.type(text);
  await this.page.waitForFunction(() => ve.init.target.edited === true, null, { timeout: budget(this) }).catch(() => {});
});

/**
 * Assert that the visual editor is, or is not, open on the page.
 *
 * Example #1: Then the visual editor should be open
 * Example #2: Then the visual editor should not be open
 * Example #3: And the visual editor should be open
 * Example #4: And the visual editor should not be open
 * Example #5: Then the visual editor should be open
 */
Then(/^the visual editor should( not)* be open$/, async function (notCase) {
  await eventually(this, () => visualEditorActive(this), (open) => !!notCase !== open,
    () => ({ message: notCase ? 'The visual editor is still open.' : `The visual editor is not open: ${this.page.url()}.`, hint: 'The visual editor marks the page with the class ve-active while it is open.' }));
});

/** Save the page from the visual editor: its "Save changes…" dialog. */
async function saveFromVisualEditor(world, summary, minor) {
  const page = world.page;
  // The toolbar's "Save changes…" (its accessible name carries the access key: "Save changes… Alt+S").
  const toolbarSave = page.locator('a.ve-ui-toolbar-saveButton, .ve-ui-toolbar-saveButton a').or(page.getByRole('button', { name: /^Save changes…/ })).filter({ visible: true }).first();
  await toolbarSave.click();
  const dialog = page.getByRole('dialog', { name: 'Save your changes' });
  try {
    await dialog.waitFor({ state: 'visible', timeout: budget(world) });
  } catch (err) {
    throw friendly({ message: 'The save dialog of the visual editor did not open ("Save your changes").', cause: err, hint: 'The visual editor saves only a page with changes; type something first.' });
  }
  if (summary !== null) await dialog.getByRole('combobox', { name: 'Describe what you changed' }).fill(summary);
  if (minor) await dialog.getByRole('checkbox', { name: 'This is a minor edit' }).check();
  const seen = await countHook(world, 'postEdit');
  const deactivated = await countHook(world, 've.deactivationComplete');
  await dialog.getByRole('button', { name: 'Save changes' }).click();
  try {
    await waitForHook(world, 'postEdit', seen, budget(world) * 3);
  } catch (err) {
    const errors = await page.evaluate(() => [...document.querySelectorAll('.ve-ui-mwSaveDialog .oo-ui-processDialog-errors, .ve-ui-mwSaveDialog .oo-ui-messageWidget')].map((e) => e.innerText.replace(/\s+/g, ' ').trim()).filter(Boolean)).catch(() => []);
    throw friendly({ message: `The visual editor did not save the page (no postEdit). ${errors.length ? `The dialog says: ${listed(errors)}.` : ''}`.trim(), cause: err, hint: cutRequest(world) ? CUT_HINT : 'See the dialog\'s message: an edit conflict, a protected page, or a lost session.' });
  }
  await waitForHook(world, 've.deactivationComplete', deactivated, budget(world)).catch(() => {});
  world.__lastSave = 'saved';
}

/** Save the page from the source editor, and read what the wiki answered. */
async function saveFromSourceEditor(world, summary, minor) {
  const page = world.page;
  await sourceBox(world);
  if (summary !== null) await page.locator('#wpSummary').fill(summary);
  if (minor) {
    const box = page.locator('#wpMinoredit');
    if (!(await box.count())) throw friendly({ message: 'The editor offers no "This is a minor edit" box: a new page cannot be a minor edit.', hint: 'Mark only an edit of a page that exists as minor.' });
    await box.check();
  }
  await afterNavigation(world, () => page.locator('#wpSave').click());
  if (cutRequest(world)) throw friendly({ message: `The save did not reach the wiki: ${cutRequest(world)}.`, hint: CUT_HINT });
  const posted = await config(world, 'wgPostEdit');
  const heading = clean(await page.locator('#firstHeading').innerText().catch(() => ''));
  if (posted) { world.__lastSave = posted; return; }
  if (/^Edit conflict:/.test(heading)) { world.__lastSave = 'conflict'; return; }
  throw friendly({
    message: `The wiki did not save the page: ${await pageSummary(world)}. Its messages: ${listed((await messages(world, 'error')).concat(await messages(world, 'warning')))}.`,
    hint: 'A protected page, a blocked account or an expired session refuses a save; the wiki says why above the editor.',
  });
}

/**
 * Save the page from the editor that is open (the source editor or the visual
 * editor), with an edit summary and as a minor edit when asked. The step waits
 * for the wiki's answer: the saved page, or an edit conflict (assert it with
 * "Then I should see an edit conflict").
 *
 * Example #1: When I save the page
 * Example #2: When I save the page with the summary "First version"
 * Example #3: When I save the page as a minor edit with the summary "A typo"
 * Example #4: And we save the page as a minor edit
 * Example #5: When we save the page with the summary "A sentence in the visual editor"
 */
When(/^(I |we )*save the page( as a minor edit)?(?: with the summary "([^"]*)")?$/, { timeout: 120000 }, async function (pronounCase, minorCase, summary) {
  if (await visualEditorActive(this)) await saveFromVisualEditor(this, summary === undefined ? null : summary, !!minorCase);
  else await saveFromSourceEditor(this, summary === undefined ? null : summary, !!minorCase);
});

/**
 * Assert that the last save went through: the wiki answered with the page and
 * says it was saved (or made, for a new page).
 *
 * Example #1: Then the edit should be saved
 * Example #2: Then the page should be created
 * Example #3: And the edit should be saved
 * Example #4: And the page should be created
 * Example #5: Then the edit should be saved
 */
Then(/^the (edit should be saved|page should be created)$/, async function (kind) {
  const posted = await config(this, 'wgPostEdit');
  const ok = kind === 'page should be created' ? posted === 'created' : ['saved', 'created'].includes(posted) || this.__lastSave === 'saved';
  if (!ok) {
    throw friendly({ message: `The wiki did not ${kind === 'page should be created' ? 'make the page' : 'save the edit'} (wgPostEdit ${posted || 'not set'}, last save ${this.__lastSave || 'none'}): ${await pageSummary(this)}.`, hint: 'Save first ("When I save the page"). A page saved again without changes is no new edit.' });
  }
});

/**
 * Change a page through the API as the administrator of the users registry, while
 * the browser's editor is open on it: the next save of the browser meets an edit
 * conflict when both changed the same lines. The browser's account must not be
 * that administrator.
 *
 * Example #1: When another account saves the page "Conflict test page" with the text "Changed by another account."
 * Example #2: And another account saves the page "Conflict test page" with the text "Their line."
 * Example #3: When another account saves the page "Editing test page" with the text "Changed meanwhile."
 * Example #4: When another account saves the page "Conflict test page" with the text "The first line, changed."
 * Example #5: And another account saves the page "Editing test page" with the text "Another change."
 */
When(/^another account saves the page "([^"]*)" with the text "([^"]*)"$/, { timeout: 60000 }, async function (title, text) {
  const api = await adminApi(this);
  const me = await signedInName(this);
  if (me && me === api.admin.wikiName) {
    throw friendly({ message: `The browser is signed in as ${me}, the account the API works as: the wiki does not raise an edit conflict with yourself.`, hint: 'Edit in the browser as another account of the users registry ("editor").' });
  }
  await apiEdit(this, title, text, `Changed meanwhile by another account ${MARKER}`);
});

/**
 * Assert that the wiki answered the save with an edit conflict: the page
 * "Edit conflict: <title>" with the current text above and the browser's own
 * text below.
 *
 * Example #1: Then I should see an edit conflict
 * Example #2: Then we should see an edit conflict
 * Example #3: And I should see an edit conflict
 * Example #4: Then I should see an edit conflict
 * Example #5: And we should see an edit conflict
 */
Then(/^(I |we )*should see an edit conflict$/, async function (pronounCase) {
  const heading = clean(await this.page.locator('#firstHeading').innerText().catch(() => ''));
  const explained = await this.page.locator('.mw-explainconflict').count();
  if (!/^Edit conflict:/.test(heading) || !explained) {
    throw friendly({ message: `The wiki did not answer with an edit conflict: ${await pageSummary(this)}.`, hint: 'Both edits must change the same lines; the wiki merges changes to different lines on its own.' });
  }
});

/**
 * Assert the browser's own text that the edit conflict page keeps ("Your text").
 *
 * Example #1: Then the edit conflict should keep my text "My own first line."
 * Example #2: And the edit conflict should keep my text "My own first"
 * Example #3: Then the edit conflict should keep my text "first line"
 * Example #4: Then the edit conflict should keep my text "My own first line."
 * Example #5: And the edit conflict should keep my text "line"
 */
Then(/^the edit conflict should keep my text "([^"]*)"$/, async function (expected) {
  const mine = await this.page.locator('#wpTextbox2').inputValue().catch(() => null);
  if (mine === null || !mine.includes(expected)) {
    throw friendly({ message: mine === null ? `No edit conflict is on the page: ${await pageSummary(this)}.` : `The edit conflict keeps "${clean(mine).slice(0, 200)}" as my text, not "${expected}".`, hint: 'The lower text box of the edit conflict page holds the text the browser tried to save.' });
  }
});

/**
 * Assert that the account in the browser may not edit a page: the wiki opens it
 * read only ("View source for <title>") with a message, or a part of it.
 *
 * Example #1: Then editing the page "Protected test page" should be refused with "This page has been protected to prevent editing or other actions."
 * Example #2: Then editing the page "Reading test page" should be refused with "Your username or IP address has been blocked."
 * Example #3: And editing the page "Protected test page" should be refused with "protected"
 * Example #4: Then editing the page "Second test page" should be refused with "This page has been protected"
 * Example #5: Then editing the page "Reading test page" should be refused with "has been blocked"
 */
Then(/^editing the page "([^"]*)" should be refused with "([^"]*)"$/, { timeout: 60000 }, async function (title, expected) {
  await openPage(this, title, { action: 'edit' });
  await closeWelcomeDialog(this);
  const heading = clean(await this.page.locator('#firstHeading').innerText().catch(() => ''));
  const errors = await messages(this, 'error');
  const readOnly = await this.page.locator('#wpTextbox1').evaluate((t) => t.readOnly).catch(() => true);
  const save = await this.page.locator('#wpSave').count();
  if (!/^View source for /.test(heading) || !readOnly || save || !hasMessage(errors, expected)) {
    throw friendly({
      message: `The wiki did not refuse "${titleText(title)}" with "${expected}": ${/^View source for /.test(heading) ? `it says ${listed(errors)}` : `the page is "${heading}" ${readOnly ? '' : 'with an editable text box'}`}.`,
      hint: cutRequest(this) ? CUT_HINT : 'Log in as the account that is refused first ("reader" for a protected page); a page any account may edit opens in the editor.',
    });
  }
});

module.exports = { saveFromSourceEditor, saveFromVisualEditor };
