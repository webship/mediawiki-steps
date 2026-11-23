<p align="center"><img src="https://raw.githubusercontent.com/webship/mediawiki-steps/2.0.x/assets/logo.svg" alt="MediaWiki logo" width="96"></p>

# mediawiki-steps

[![Test](https://github.com/webship/mediawiki-steps/actions/workflows/test.yml/badge.svg)](https://github.com/webship/mediawiki-steps/actions/workflows/test.yml)

Cucumber step definitions for testing wikis that run on MediaWiki, with
[webship-js](https://webship.co/docs/webship-js/2.0.x), a BDD browser automation
harness built on Playwright and Cucumber-js.

`@webship-js/mediawiki-steps` covers what every wiki of the release shows, with
the extensions a default wiki uses (WikiEditor, VisualEditor, CategoryTree,
Cite):

- **reading**: a page by its title, its sections in order, its contents list
  (and a section reached from it), its links (to a page, to a page not written
  yet, to another site), its references, its categories;
- **search**: the search box with its suggestions (they load late, and the
  steps wait for them), choosing a suggestion, a full search and its results
  page;
- **the source editor**: the wikitext, the edit summary, a minor edit, the
  preview, the changes, saving, and an edit conflict with another account;
- **the visual editor**: opening it, typing, saving through its dialog;
- **the history**: the revisions by their summary and author, comparing two,
  undoing one;
- **the talk page** and its topics, **categories** and the **category tree**,
  the **watchlist**, **recent changes** and the **preferences**;
- **file uploads** (Special:Upload) and the duplicate warning;
- **the administrator's pages**: protecting a page, deleting and restoring it,
  blocking and unblocking an account, and the refusals a protected page and a
  blocked account get;
- **login and logout**, and the refusals of the account creation form;
- **test pages**: a scenario makes the pages and files it needs through the
  wiki's API and deletes them after it, whatever happens in it.

No step phrase names the platform: a scenario reads `When I edit the page
"Editing test page" in the visual editor` and `Then the history should list the
revision "First version" by "editor"`.

CI builds a real wiki with [DDEV](https://ddev.com) on the runner (the release
tarball, installed with its own installer, at the current release 1.46.2 and the
long-term-support release 1.43.11), and runs the whole suite against it twice on
every push and pull request, then the assertions that must fail and the reading
steps on a second bundled skin; see
[`.github/workflows/test.yml`](.github/workflows/test.yml).

## From nothing to a green run

What the machine needs: Docker, [DDEV](https://ddev.com), git, python3, and
Node.js 24 or later with npm. PHP, the database, the job runner and the release
download run in DDEV's containers.

**1. The wiki.** The pack's own build script (the one CI runs) makes the wiki in
a DDEV project of type `php` with the wiki at the docroot: the release tarball
(1.46.2 by default, `MEDIAWIKI_VERSION` picks another), installed with its own
command-line installer, the four extensions above, uploads on, the job queue run
by a service of the container, and the three accounts of
[Test users](#test-users). It takes about two minutes.

```bash
git clone https://github.com/webship/mediawiki-steps.git
SITE_DIR="$PWD/mediawiki-wiki" mediawiki-steps/.github/scripts/build-ddev-site.sh
```

The wiki answers at `https://mediawikisteps.ddev.site`. Its accounts are
`administrator`, `editor` and `reader`, each with the password `dD.123123ddd`
(step 3 names them).

In the [Webship Workspace](https://github.com/webship/workspace), its MediaWiki
plugin builds the same wiki instead, in a sites folder of the workspace (`dev/`
here, the one `--with-needs` adds to a new workspace; `test/`, `sandboxes/` and
`demos/` work the same):

```bash
bash core/scripts/plugins.sh --require mediawiki --with-needs
bash core/scripts/plugins.sh --activate mediawiki --with-needs
bash core/scripts/plugins.sh --install mediawiki
bash dev/cmd-mediawiki-project.sh mwsite --install --add-users --visual-editor
```

That wiki answers at `https://mwsite.ddev.site`. `--visual-editor` turns the
visual editor on (the visual editor feature needs it). Its accounts are the
plugin's, the same three with the workspace's shared password `dD.123123ddd`:
`administrator`, `editor` and `reader`. The workspace's own account is the
installer's; the suite does not use it.

**2. A test project.**

```bash
mkdir mediawiki-tests && cd mediawiki-tests
npm init -y
npm install --save-dev webship-js @webship-js/mediawiki-steps
npx init-webship-js
```

`npx init-webship-js` writes `cucumber.js`, `playwright.config.ts`, the `tests/`
folders with a first feature and the `npm test` scripts, and installs Chromium.
npm usually runs it already when it installs webship-js; a second run changes
nothing.

**3. `cucumber.js`.** Replace the file with the wiring of the pack: the step
files of webship-js and of the pack, the tags that keep the assertions that must
fail out of a normal run, the address of the wiki, and the accounts (the JSON of
[Test users](#test-users)). The first lines are the starter's own: a feature
named on the command line runs alone (step 5).

```javascript
// A feature file or a scenario (file:line) named on the command line runs alone:
// cucumber-js 12 would add it to the paths below, so `paths` is left empty then.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  if (!/cucumber(-js|\.js)?$/.test(String(process.argv[1] || ''))) return [];
  const args = process.argv.slice(2);
  const paths = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i].startsWith('-')) {
      if (OPTIONS_WITH_A_VALUE.has(args[i])) i += 1;
    } else {
      paths.push(args[i]);
    }
  }
  return paths;
}

module.exports = {
  default: {
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',
      'node_modules/@webship-js/mediawiki-steps/tests/step-definitions/**/*.js',
      'tests/step-definitions/**/*.js',
    ],
    paths: commandLinePaths().length ? [] : ['tests/features/**/*.feature'],
    // Work in progress and the assertions that must fail stay out of a normal run.
    tags: 'not @wip and not @must-fail',
    format: ['@cucumber/pretty-formatter', 'json:tests/reports/cucumber_report.json'],
    worldParameters: {
      launchUrl: process.env.LAUNCH_URL || 'https://mediawikisteps.ddev.site',
      // The account the test-page steps work as, through the wiki's API (a handle of `users`).
      wikiAdmin: 'administrator',
      minWaitTime: { page: 3000, before_scenario: 0, after_scenario: 0, before_step: 0, after_step: 0 },
      users: {
        administrator: { username: 'administrator', password: 'dD.123123ddd', email: 'administrator@example.com' },
        editor: { username: 'editor', password: 'dD.123123ddd', email: 'editor@example.com' },
        reader: { username: 'reader', password: 'dD.123123ddd', email: 'reader@example.com' },
      },
    },
  },
};
```

On a wiki from the Webship Workspace (step 1) the accounts are the same; its
address goes in `LAUNCH_URL` (step 5).

**4. A first feature**, `tests/features/first-run.feature`:

```gherkin
Feature: First run
  Scenario: A visitor reads a page with its sections
    Given the page "First run page" has the text "A first page.\n== Overview ==\nIts words."
    And I am an anonymous user
    When I open the page "First run page"
    Then I should see the page "First run page"
    And the page should have the section "Overview"

  Scenario: The editor logs in
    Given I am an anonymous user
    When I log in as "editor" with the login form
    Then I should be logged in as "editor"
```

The first scenario makes the page "First run page" through the wiki's API, as
`administrator`, and deletes it again after the scenario.

**5. Run it.** Set `LAUNCH_URL` to the address of the wiki:
`https://mediawikisteps.ddev.site` for the build script's wiki,
`https://mwsite.ddev.site` for the Workspace's.

```bash
LAUNCH_URL=https://mediawikisteps.ddev.site npm test
```

A green first run prints every step, then the summary (the starter feature of
`npx init-webship-js` and the two scenarios above, passed) and the HTML report
it wrote:

```
3 scenarios (3 passed)
10 steps (10 passed)
0m09.000s (executing steps: 0m09.000s)
[webship-js] HTML report → …/mediawiki-tests/tests/reports/cucumber_report.html
```

One feature runs alone when the command line names it (a scenario too, with
its line):

```bash
LAUNCH_URL=https://mediawikisteps.ddev.site npx cucumber-js tests/features/first-run.feature
```

From there, copy the features of [`tests/features/`](tests/features/) (they
also ship in the package, under
`node_modules/@webship-js/mediawiki-steps/tests/features/`): together they use
every step of the pack. Each makes its own test pages, and the upload features
read `tests/fixtures/blue-square.png` from the project or, when the project has
none, from the pack. They run as they are on the wiki of either way of step 1.

### What the suite tests

The features of this repository run every step of the pack against the test
wiki, twice in a row in CI on every change, then the assertions that must fail:
each account logging in through the form and taking its session over, "Keep me
logged in", a refused login and logging out; the account creation form refusing
two different passwords, a name in use, a short and a common password (and never
sending a form it would accept); a page read as a visitor with its sections in
order, its contents list leading to a section, its links (a page, a page not
written yet, another site) followed, its reference and its category; the search
box suggesting and opening a page, a full search that finds one page and
highlights the word, and one that finds nothing; a page made in the source
editor with a preview and a summary, a minor edit checked with "Show changes",
an edit conflict with another account; a page changed in the visual editor;
two revisions compared and a change undone; a talk page with two topics; a
category with its pages and subcategories and the category tree opened and
closed; a page watched and unwatched, the watchlist and recent changes; a
preference ticked, saved and put back; an image uploaded, and a duplicate held
back; a page protected for autoconfirmed users (the new account refused, the
confirmed editor not) and for administrators (until the protection is removed),
a page deleted and restored, an account blocked (and refused) and unblocked; and
the landmarks of a page.

Every page and file a scenario makes is deleted after it, and a block it makes
is lifted: the suite leaves the wiki as it found it. A preference it changes it
puts back.

Not tested: the mail of the wiki (password reset, e-mail confirmation), page
moves and redirects, templates and the parser functions, user rights changes,
the extensions the build does not turn on, the mobile skin, and wikis in another
language than English (the steps read the English texts of the wiki's messages
in a few places, named in the hints).

## Requirements

- Node.js 24 or later
- A webship-js 2.0 test project (webship-js 2.0.16 or later)
- A wiki on MediaWiki 1.43 or later, with the VisualEditor and CategoryTree
  extensions for their steps, uploads on for the upload steps, and accounts on
  it for the suite (an administrator among them)
- On nginx, the rule MediaWiki documents for its REST API
  (`location /rest.php/ { try_files $uri $uri/ /rest.php?$query_string; }`):
  the search suggestions and the visual editor use it

## Install

```bash
npm install --save-dev @webship-js/mediawiki-steps
```

## How the steps find things and wait

- **By what a person reads.** A page is opened and found by its title, a section
  by its heading, a link by the page it leads to, a revision by its edit
  summary, a field by its label, a preference by its label, an option of a list
  by its text. The wiki's stable hooks are the fallback: its configuration on
  every page (`mw.config`: the page's name, the signed-in account, the action,
  `wgPostEdit` after a save), the ids of its forms (`#wpTextbox1`, `#wpSummary`,
  `#wpSave`), the classes of its messages and of its lists.
- **No fixed sleeps.** The steps wait on the wiki's own signals:
  - its module loader: `mw.loader.using()` resolved for the modules a page
    asked for, the skin's search module, the editors' modules;
  - its hooks: `ve.activationComplete` when the visual editor is ready,
    `postEdit` and `ve.deactivationComplete` after its save;
  - the answer of the request a widget sends: the search suggestions
    (`rest.php/v1/search/title`, or `action=opensearch` on other skins), the
    category tree (`action=categorytree`), the watch star (`action=watch`), the
    checks of the account creation form (`list=users`, `validatepassword`);
  - the filters app of the watchlist and recent changes
    (`body.mw-rcfilters-ui-initialized`);
  - the category counts after a test page is made: a page is listed in its
    category at once, but the counts the category tree reads are written by a
    job of the wiki, so the step waits until the counts (`categoryinfo`) match
    the members (`categorymembers`).
- **The visual editor's welcome dialog** opens over the first editor each
  account opens, and makes the page behind it inert: the editing steps close it
  with "Start editing".
- **Leaving an editor with changes** asks "Leave site?": a step that opens
  another page accepts it, as a person who opens another page means to leave.
- **A cut request says so.** When the browser shows its own error page
  (`chrome-error://`, a network change on the machine aborted the request), the
  step says that the request was cut before the wiki answered, with a hint to
  run the scenario again, instead of blaming the scenario.
- **Failures say what was found.** `The page has no section "History". Its
  sections: "Overview", "Editing", …` with a hint on where to look.

## Accounts

The suite never creates or deletes an account: the account creation steps send
the form only when the wiki will refuse it. Accounts are configuration: list the
ones the wiki has in `worldParameters.users`, by a handle the scenarios use, each
with its `username` and `password`. `worldParameters.wikiAdmin` names the handle
of an administrator: the test-page steps make, protect and delete the test pages
and files as that account, through the wiki's API, in a session of their own (the
browser's session is never touched).

The wiki allows 5 failed logins of one account from one address in 5 minutes (a
successful login clears the count): the refusal scenarios try a name that no
other scenario logs in with.

## Test users

The accounts this repository's suite logs in as, exactly as `cucumber.js` lists
them in `worldParameters.users` (the default values; the `<HANDLE>_USERNAME`,
`<HANDLE>_PASSWORD` and `<HANDLE>_EMAIL` variables replace them). The build
script creates them with the maintenance script `createAndPromote`; the
Workspace's MediaWiki plugin creates the same three.

```json
{
  "administrator": { "username": "administrator", "password": "dD.123123ddd", "email": "administrator@example.com" },
  "editor": { "username": "editor", "password": "dD.123123ddd", "email": "editor@example.com" },
  "reader": { "username": "reader", "password": "dD.123123ddd", "email": "reader@example.com" }
}
```

`administrator` is in the sysop and bureaucrat groups (in the build script it is
also the installer's account, which adds interface-admin); `editor` is in the
"confirmed" group, which gives at once the rights an account otherwise earns
with age and edits ("autoconfirmed"): it edits the pages protected for
autoconfirmed users; `reader` is in no group: a new account, refused those
pages. The wiki names the accounts with an upper-case first letter
("Administrator"); the steps do too. They are placeholder credentials of a
throwaway test wiki, not of any real one.

## A test wiki

[`.github/scripts/build-ddev-site.sh`](.github/scripts/build-ddev-site.sh)
builds the wiki the suite of this repository runs against, in a DDEV project of
type `php` (DDEV has no project type of its own for it) with PHP 8.4 and Node.js
24, the wiki at the docroot:

- the release tarball from the release server (`MEDIAWIKI_VERSION`, 1.46.2 by
  default; CI also builds 1.43.11, the long-term-support line, on PHP 8.3);
- its own installer (`maintenance/run.php install`) on the project's database,
  with WikiEditor, VisualEditor, CategoryTree and Cite, and every bundled skin
  (Vector 2022 the default);
- uploads on;
- the rule MediaWiki documents for nginx, so `rest.php/v1/…` reaches the REST
  API (without it, the server answers those addresses with the main page and the
  search box waits for ever);
- the job queue run by a service of the web container (`runJobs --wait`, as a
  DDEV `web_extra_daemons` entry), as MediaWiki recommends for a wiki, and
  `$wgJobRunRate = 0`;
- the object cache and the sessions in the database (the installer picks the
  PHP process cache, which the maintenance scripts cannot see and a restart
  empties);
- a new account earns the "autoconfirmed" rights after 4 days and 10 edits, as
  on large public wikis, and a "confirmed" group gives them at once;
- the three accounts.

Run again with `ACCOUNTS_ONLY=1` and the same `SITE_DIR`, it gives the accounts
back their password, address and groups and lifts any block on them (after a run
that was stopped half way).

`WIKI_SKIN=monobook CUCUMBER_TAGS=@reading npx cucumber-js` runs the reading
steps on another bundled skin (the steps ask for it with `useskin=` on every
page they open).

## Steps

84 steps in 8 files, every one with five examples in its JSDoc (`npm run test:examples` checks them).

| File | Steps | Covers |
| --- | --- | --- |
| `mediawiki-session.steps.js` | 9 | The session: logging in by a handle or through the form, refusals, logging out, who is signed in, the account creation refusals. |
| `mediawiki-pages.steps.js` | 27 | Test pages and files made and deleted through the API, opening a page, its title and text, sections and contents list, links, references, categories, the category tree, talk pages, the page's scripts. |
| `mediawiki-search.steps.js` | 7 | The search box and its suggestions, choosing one, a full search and its results page. |
| `mediawiki-editing.steps.js` | 17 | The source editor (wikitext, preview, changes, saving with a summary or as a minor edit), the visual editor, edit conflicts, the refusal of a page the account may not edit. |
| `mediawiki-history.steps.js` | 5 | The history: its revisions, comparing two, undoing one. |
| `mediawiki-watchlist.steps.js` | 8 | The watch star, the watchlist, recent changes, the preferences. |
| `mediawiki-files.steps.js` | 3 | The upload form, its warnings, the page of a file. |
| `mediawiki-admin.steps.js` | 8 | Protecting a page, deleting and restoring it, blocking and unblocking an account. |
| `mediawiki-helpers.js` | | Shared plumbing: the addresses of the wiki, the waits on its module loader, hooks and job queue, the users registry and the session cache, the messages of a page, the cut request, the client of the wiki's API for the test data. It registers no step. |

Text, links, fields, buttons, the status code of a page and the accessibility checks are webship-js's own steps (`I should see "..."`, `I fill in "..." with "..."`, `I press "..."`, `the page should have a main landmark`); this pack adds what the wiki decides.

### `mediawiki-session.steps.js` (9)

- `Given I am a logged in user with the "editor" user`
- `When I log in as "editor" with the login form`
- `When I log in with the user name "No such account here" and the password "Wrong-password-1"`
- `Then the login should be refused with "Incorrect username or password entered. Please try again."`
- `When I log out`
- `Then I should be logged in as "editor"`
- `Then I should be logged in`
- `When I try to create the account "Never created account" with the password "Unique-pass-2026-x" and the confirmation "Unique-pass-2026-y"`
- `Then the account creation should be refused with "The passwords you entered do not match."`

### `mediawiki-pages.steps.js` (27)

- `Given the page "Reading test page" has the text:`
- `Given the page "History test page" has the text "First version of the page." with the summary "First version"`
- `Given the page "Page made in the source editor" does not exist`
- `Given the page "Protected test page" is protected so that only autoconfirmed users can edit it`
- `Given the file "Test square.png" is uploaded from "tests/fixtures/blue-square.png"`
- `Given the account "reader" is not blocked`
- `When I open the page "Reading test page"`
- `Then I should see the page "Reading test page"`
- `Then the page text should contain "First version of the page."`
- `Then the page should have the section "Overview"`
- `Then the page should have these sections in order:`
- `Then the contents list should list "Overview"`
- `When I follow "Overview" in the contents list`
- `Then I should be at the section "Overview"`
- `Then the page should link to the page "Editing help"`
- `Then the page should link to the external site "https://example.org"`
- `When I follow the link to the page "Editing help"`
- `Then the reference "1" should read "Every page keeps its history."`
- `Then the page should be in the category "Test guides"`
- `When I follow the category "Test guides"`
- `Then the category should list the page "Reading test page"`
- `When I expand the category "Test guides" in the category tree`
- `Then the category tree should show "Editing guides" under "Test guides"`
- `When I open the talk page`
- `When I add the topic "A question about this page" with the text "Is this page complete?"`
- `Then the talk page should have the topic "A question about this page"`
- `Then the scripts of the page should all load`

### `mediawiki-search.steps.js` (7)

- `When I type "Readi" in the search box`
- `Then the search suggestions should list "Reading test page"`
- `When I choose the suggestion "Reading test page"`
- `When I search for "readers"`
- `Then the search results should list the page "Reading test page"`
- `Then the search result "Reading test page" should mention "readers"`
- `Then the search should find 1 page`

### `mediawiki-editing.steps.js` (17)

- `When I edit the page "Editing test page"`
- `When I set the wikitext to:`
- `When I set the wikitext to "A page made in the source editor."`
- `When I add the wikitext "A line added at the end."`
- `When I preview the page`
- `Then the preview should show "A page made in the source editor."`
- `When I show my changes`
- `Then the changes should show "Second version of the page." added`
- `When I edit the page "Visual editor test page" in the visual editor`
- `When I type " Typed in the visual editor." in the visual editor`
- `Then the visual editor should be open`
- `When I save the page`
- `Then the edit should be saved`
- `When another account saves the page "Conflict test page" with the text "Changed by another account."`
- `Then I should see an edit conflict`
- `Then the edit conflict should keep my text "My own first line."`
- `Then editing the page "Protected test page" should be refused with "This page has been protected to prevent editing or other actions."`

### `mediawiki-history.steps.js` (5)

- `When I open the history of the page "History test page"`
- `Then the history should list the revision "First version"`
- `Then the history should list 2 revisions`
- `When I compare the revisions "First version" and "Second version"`
- `When I undo the revision "Second version"`

### `mediawiki-watchlist.steps.js` (8)

- `When I watch the page`
- `Then I should be watching the page`
- `Then my watchlist should list the page "Reading test page"`
- `Then the recent changes should show a change to "Reading test page"`
- `When I open my preferences`
- `When I tick the preference "Mark all edits minor by default"`
- `When I save my preferences`
- `Then the preference "Mark all edits minor by default" should be ticked`

### `mediawiki-files.steps.js` (3)

- `When I upload the file "tests/fixtures/blue-square.png" as "Test square.png"`
- `Then the upload should be held back with the warning "This file is a duplicate of the following file"`
- `Then I should see the file "Test square.png"`

### `mediawiki-admin.steps.js` (8)

- `When I protect the page "Protection test page" so that only autoconfirmed users can edit it`
- `Then the page "Protection test page" should be protected so that only autoconfirmed users can edit it`
- `When I delete the page "Deletion test page" with the reason "A test of the deletion"`
- `When I restore the page "Deletion test page" with the reason "Deleted by mistake"`
- `Then the page "Deletion test page" should not exist`
- `When I block the account "reader" for "1 day" with the reason "A test of the block"`
- `When I unblock the account "reader" with the reason "The test is over"`
- `Then the account "reader" should be blocked`

## Phrases shared with other packs

The session phrases are the ones every platform pack has, so a feature reads
the same on every system (one cucumber.js profile per system; the platform packs
are not meant to be loaded together). Loaded beside each of the 24 published
packs, these phrases of this pack also match one of theirs:

| Phrase of this pack | Also in |
| --- | --- |
| `I am a logged in user with the "editor" user` | codeigniter, django-cms, drupal-core, joomla, laravel, odoo, symfony, typo3, wordpress |
| `I log in as "editor" with the login form` | codeigniter, laravel, symfony |
| `I log out` | codeigniter, django-cms, drupal-core, laravel, odoo, symfony, typo3, wordpress |
| `I should be logged in` / `I should be logged in as "editor"` | backdrop-cms, codeigniter, django-cms, drupal-core, laravel, odoo, symfony, typo3, wordpress |
| `I preview the page` | django-cms, ghost |
| `the preview should show "…"` | craft-cms, ghost |
| `I search for "…"` | drupal-core, wordpress |
| `I save the page` | typo3 |
| `the account "reader" should be blocked` | backdrop-cms |

None matches a webship-js step, and none matches a phrase of the component
packs (Bootstrap), which can be loaded beside this one.

## Testing this package

```bash
npm ci
npm run test:examples    # every step's JSDoc examples match it and nothing else; every feature step resolves
npm run test:paths       # a feature named on the command line runs alone
npx cucumber-js --dry-run
SITE_DIR="$PWD/../mediawiki-wiki" .github/scripts/build-ddev-site.sh
npx cucumber-js          # the whole suite
npm run test:must-fail   # the assertions that must fail, each with its message and a hint
```

## How the steps were written

Every step was written from a round of manual testing of a real local wiki in
the browser first: each screen it touches was opened, its roles, labels and
messages noted, and the signal it gives while it loads or saves found. The
failures of the first runs went back to the browser before the step changed.

## License

MIT, see [LICENSE](LICENSE).

## Logo

The logo is the MediaWiki logo the release ships
(`resources/assets/mediawiki_compact.svg` of MediaWiki 1.46.2), unmodified: by
Serhio Magpie, under the Creative Commons Attribution-ShareAlike 4.0 licence. It
names the software these steps test; MediaWiki and its logo are trademarks of
the Wikimedia Foundation.
