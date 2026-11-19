# Step definitions

| File | Covers |
| --- | --- |
| `mediawiki-session.steps.js` | The session: logging in by a handle of the users registry (a session taken over when the account has one) or through the login form, a refused login, logging out, who is signed in, the refusals of the account creation form. |
| `mediawiki-pages.steps.js` | Test pages and files made and deleted through the wiki's API (and the cleanup after a scenario), opening a page, its title and text, its sections and contents list, its links, references and categories, the category tree, the talk page, the page's scripts. |
| `mediawiki-search.steps.js` | The search box and its suggestions, choosing one, a full search and its results page. |
| `mediawiki-editing.steps.js` | The source editor, the visual editor, edit conflicts, the refusal of a page the account may not edit. |
| `mediawiki-history.steps.js` | The history: its revisions, comparing two, undoing one. |
| `mediawiki-watchlist.steps.js` | The watch star, the watchlist, recent changes, the preferences. |
| `mediawiki-files.steps.js` | The upload form, its warnings, the page of a file. |
| `mediawiki-admin.steps.js` | Protecting a page, deleting and restoring it, blocking and unblocking an account. |
| `mediawiki-helpers.js` | Shared plumbing: the addresses of the wiki, the waits on its module loader, its hooks and its job queue, the users registry and the session cache, the messages of a page, the request the browser cut, the client of the wiki's API for the test data. It registers no step. |

## Rules for a new step

- Check `node_modules/webship-js/tests/step-definitions/` first: a step that the
  generic click, fill and see vocabulary already covers is not added here.
- No step phrase names the platform. A name appears only as an
  argument a step asserts.
- The regular expression starts with the pronoun group `(I |we )*` where a
  person acts, and an assertion takes `should( not)*`, so one definition reads
  both polarities.
- A JSDoc block above the step holds at least five `Example #N:` lines. Run
  `npm run test:examples`: every example must match its own step and no step of
  webship-js.
- Find things the way a person does: a label, a role, a text. The stable hooks
  of the pages (`mw.config`, the ids of the wiki's forms, the classes of its
  messages) are the fallback.
- Wait on the wiki, never on a fixed time: on the locator, on the navigation a
  form or a link starts, on the module loader (`mw.loader.using()`), on the
  wiki's hooks (`mw.hook`), on the request a widget sends, on the job queue.
- Fail with `friendly({ message, hint })`: what was expected, what was found
  and where to look.
- A step never creates or deletes a user: accounts are configuration, named in
  the `users` registry of `cucumber.js` and created by the build of the wiki.
  A page or a file a scenario makes is deleted after it.
- Open the page in a real browser before writing or changing its step, and
  write the step from what is there: the roles and names of the accessibility
  tree, the stable attributes, what the page does while it loads or saves.
- Give every assertion a scenario in `tests/must-fail/` that makes it fail.
