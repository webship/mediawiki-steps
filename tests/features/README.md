# Features

Reference features for the test wiki that `.github/scripts/build-ddev-site.sh`
builds (or the Webship Workspace's builder, with `--install --add-users
--visual-editor`): the release with WikiEditor, VisualEditor, CategoryTree and
Cite, uploads on, and the three accounts of `cucumber.js` (`administrator`,
`editor`, `reader`). Each scenario makes the pages and files it needs and deletes
them after it, so a feature runs as it is on any such wiki.

| Feature | Covers |
| --- | --- |
| `session` | Each account logging in through the form, a session taken over, "Keep me logged in", a refused login, logging out. |
| `account-creation` | The account creation form refusing two different passwords, a name in use, a short and a common password. No account is created. |
| `reading` | A page read as a visitor: its sections in order, its contents list leading to a section, its links followed, its reference, its category. |
| `search` | The search box suggesting and opening a page, a full search that finds one page and highlights the word, a search that finds nothing. |
| `source-editor` | A page made in the source editor with a preview and a summary; a minor edit checked with "Show changes". |
| `edit-conflict` | An edit conflict with another account. |
| `visual-editor` | A page changed in the visual editor and saved with a summary. |
| `history` | Two revisions compared, a change undone. |
| `talk-page` | A talk page with two topics. |
| `categories` | A category with its pages and subcategories, the category tree opened and closed. |
| `watchlist` | A page watched and unwatched, the watchlist and recent changes. |
| `preferences` | A preference ticked, saved and put back. |
| `upload` | An image uploaded, and a duplicate held back. |
| `administration` | A page protected for autoconfirmed users and for administrators, deleted and restored; an account blocked and unblocked. |
| `accessibility` | The landmarks, the skip link, the one main heading and the language of a page. |
