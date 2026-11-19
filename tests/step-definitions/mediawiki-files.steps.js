'use strict';

// Files: the upload form (Special:Upload, when the wiki allows uploads), its
// warnings, and the page of an uploaded file.

const { When, Then } = require('@cucumber/cucumber');
const { friendly } = require('webship-js/tests/step-definitions/webship');
const {
  clean,
  listed,
  titleText,
  config,
  cutRequest,
  CUT_HINT,
  openPage,
  afterNavigation,
  eventually,
  pageSummary,
  fixturePath,
} = require('./mediawiki-helpers');

/**
 * Upload a file with the upload form, as a person does: the file, the name it
 * gets on the wiki, a summary, and "Ignore any warnings" when asked. The local
 * file is a path from the project, or from this pack (tests/fixtures/ ships with
 * it). The step waits for the wiki's answer: the file's page, or a warning.
 *
 * Example #1: When I upload the file "tests/fixtures/blue-square.png" as "Test square.png"
 * Example #2: When I upload the file "tests/fixtures/blue-square.png" as "Test square.png" with the summary "A blue square"
 * Example #3: When we upload the file "tests/fixtures/blue-square.png" as "Second square.png" ignoring warnings
 * Example #4: And I upload the file "tests/fixtures/blue-square.png" as "Test square.png" with the summary "A blue square" ignoring warnings
 * Example #5: When I upload the file "tests/fixtures/blue-square.png" as "Duplicate square.png"
 */
When(/^(I |we )*upload the file "([^"]*)" as "([^"]*)"(?: with the summary "([^"]*)")?( ignoring warnings)?$/, { timeout: 120000 }, async function (pronounCase, file, name, summary, ignoreCase) {
  const local = fixturePath(file);
  const page = this.page;
  await openPage(this, 'Special:Upload');
  if (!(await page.locator('#wpUploadFile').count())) {
    throw friendly({ message: `The upload form is not on Special:Upload: ${await pageSummary(this)}.`, hint: 'The wiki must allow uploads ($wgEnableUploads), and the account must have the "upload" right (logged in).' });
  }
  await page.locator('#wpUploadFile').setInputFiles(local);
  await page.locator('#wpDestFile').fill(name);
  if (summary) await page.locator('#wpUploadDescription').fill(summary);
  if (ignoreCase) await page.locator('#wpIgnoreWarning').check();
  await afterNavigation(this, () => page.locator('input[name="wpUpload"], button[name="wpUpload"]').first().click());
  if (cutRequest(this)) throw friendly({ message: `The upload did not reach the wiki: ${cutRequest(this)}.`, hint: CUT_HINT });
});

/**
 * Assert that the wiki held the upload back with a warning (or a part of it):
 * the upload form came back under "Upload warning".
 *
 * Example #1: Then the upload should be held back with the warning "This file is a duplicate of the following file"
 * Example #2: Then the upload should be held back with the warning "A file with this name exists already"
 * Example #3: And the upload should be held back with the warning "duplicate"
 * Example #4: Then the upload should be held back with the warning "This file is a duplicate of the following file: Test square.png"
 * Example #5: Then the upload should be held back with the warning "Please modify the file description below and try again."
 */
Then(/^the upload should be held back with the warning "([^"]*)"$/, async function (expected) {
  const state = await this.page.evaluate(() => {
    const heading = [...document.querySelectorAll('#mw-content-text h2')].find((h) => /Upload warning/i.test(h.textContent));
    let text = '';
    if (heading) {
      for (let el = heading.nextElementSibling; el && el.tagName !== 'FORM' && el.id !== 'mw-upload-form'; el = el.nextElementSibling) text += ' ' + el.textContent;
      if (!text.trim()) text = (heading.parentElement || document.body).textContent;
    }
    return { warned: !!heading, text: text.replace(/\s+/g, ' ').trim(), special: window.mw ? mw.config.get('wgCanonicalSpecialPageName') : null };
  }).catch(() => ({ warned: false, text: '', special: null }));
  if (!state.warned || state.special !== 'Upload' || !state.text.toLowerCase().includes(clean(expected).toLowerCase())) {
    throw friendly({ message: state.warned ? `The upload warning says "${state.text.slice(0, 300)}", not "${expected}".` : `The wiki did not hold the upload back with a warning: ${await pageSummary(this)}.`, hint: 'Upload with "When I upload the file ... as ..." (without "ignoring warnings").' });
  }
});

/**
 * Assert that the browser shows the page of an uploaded file, with its image
 * loaded.
 *
 * Example #1: Then I should see the file "Test square.png"
 * Example #2: Then we should see the file "Second square.png"
 * Example #3: And I should see the file "Test square.png"
 * Example #4: Then I should see the file "Duplicate square.png"
 * Example #5: Then I should see the file "Reading test image.png"
 */
Then(/^(I |we )*should see the file "([^"]*)"$/, async function (pronounCase, name) {
  const want = titleText(`File:${name}`);
  await eventually(this, async () => ({
    page: titleText(String(await config(this, 'wgPageName') || '')),
    image: await this.page.evaluate(() => { const img = document.querySelector('#file img, .fullImageLink img'); return img ? { loaded: img.complete && img.naturalWidth > 0, src: img.getAttribute('src') } : null; }).catch(() => null),
  }), (v) => v.page === want && v.image && v.image.loaded,
  (v) => ({ message: v.page === want ? `The page of "${name}" shows ${v.image ? `an image that did not load (${v.image.src})` : 'no image'}.` : `Expected the page "${want}"; the browser shows "${v.page || this.page.url()}".`, hint: 'Upload the file first; its page is File:<name>.' }));
});

module.exports = {};
