// A feature file, a scenario (file:line), a folder or a rerun file named on
// the command line of cucumber-js runs alone: `npx cucumber-js
// tests/features/session.feature`. cucumber-js 12 adds the paths of the
// command line to the `paths` of this file instead of using them alone, so
// `paths` is left empty when the command line names any, as in webship-js.
const OPTIONS_WITH_A_VALUE = new Set([
  '-c', '--config', '-f', '--format', '--format-options', '--i18n-keywords',
  '-i', '--import', '-l', '--loader', '--language', '--name', '--order',
  '-p', '--profile', '--parallel', '--plugin', '--plugin-options',
  '-r', '--require', '--require-module', '--retry', '--retry-tag-filter',
  '--shard', '-t', '--tags', '--world-parameters',
]);

function commandLinePaths() {
  // Only when cucumber-js itself runs, not when another script reads this file.
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

// The default is the local DDEV wiki that .github/scripts/build-ddev-site.sh
// builds (project "mediawikisteps"), never a wiki of somebody else: the suite
// logs in with the accounts below and makes and deletes test pages. LAUNCH_URL
// points it at another wiki.
const launchUrl = process.env.LAUNCH_URL || 'https://mediawikisteps.ddev.site';

module.exports = {
  default: {
    // The step timeout is webship-js's (45 s, set when it loads): WEBSHIP_STEP_TIMEOUT=<milliseconds> changes it; a `timeout` key here is ignored.
    requireModule: ['tsx/cjs'],
    require: [
      'node_modules/webship-js/tests/step-definitions/**/*.js',          // Webship-js core step definitions (auto HTML report on exit; disable: WEBSHIP_REPORT_DISABLE=1).
      'tests/step-definitions/**/*.js',                                  // The step definitions of this pack.
    ],
    // FEATURES=tests/features/a.feature,tests/features/b.feature runs a subset too.
    paths: process.env.FEATURES ? process.env.FEATURES.split(',') : (commandLinePaths().length ? [] : ['tests/features/**/*.feature']),
    // CUCUMBER_TAGS=@reading runs a lane. The default leaves out work in progress and the assertions that
    // must fail (tests/check-must-fail.js runs them).
    tags: process.env.CUCUMBER_TAGS || 'not @wip and not @must-fail',
    format: [
      '@cucumber/pretty-formatter',
      // REPORT_NAME=must-fail keeps the report of another run (tests/check-must-fail.js) apart.
      `json:tests/reports/${process.env.REPORT_NAME || 'cucumber_report'}.json`,
    ],
    formatOptions: {
      // Colours follow the terminal (GitHub Actions counts as one); FORCE_COLOR=1
      // or FORCE_COLOR=0 sets them. cucumber-js 12 deprecated `colorsEnabled`.
      theme: {
        'feature keyword': ['bold', 'blue'],
        'feature name': ['blue', 'underline'],
        'feature description': ['blueBright'],
        'scenario keyword': ['bold', 'magenta'],
        'scenario name': ['magenta', 'underline'],
        'step keyword': ['bold', 'green'],
        'step text': ['greenBright', 'italic'],
      },
    },
    worldParameters: {
      launchUrl,
      // The folder of the wiki's index.php and api.php under launchUrl: '' when the wiki is at the root
      // (the test wiki), '/w' on a wiki that serves its pages at /wiki/<Title>.
      scriptPath: process.env.WIKI_SCRIPT_PATH || '',
      // A skin the steps ask for on every page they open (useskin=<skin>): '' keeps the wiki's default
      // (Vector 2022). WIKI_SKIN=monobook runs the reading steps on another bundled skin.
      skin: process.env.WIKI_SKIN || '',
      // The account the test-data steps work as, through the wiki's API: it makes and deletes the test
      // pages and files, protects them, and lifts the blocks a scenario left. A handle of `users`, with the
      // rights of an administrator.
      wikiAdmin: process.env.WIKI_ADMIN || 'administrator',
      // An account that logged in once keeps its session for the rest of the run: later scenarios take it
      // over instead of filling in the login form again.
      reuseSessions: process.env.REUSE_SESSIONS !== 'false',
      // Video of the browser: 'off', 'on', 'on-failure' or 'tag' (scenarios tagged @video; @no-video opts out).
      video: { mode: process.env.WEBSHIP_VIDEO || 'off', dir: './videos', size: { width: 1280, height: 720 }, filenamePattern: '{datetime}.{feature_file}.{scenario}.{status}.{ext}' },
      // JavaScript errors the page raises: 'warn' reports them, 'fail' fails the scenario, 'off' ignores them;
      // @js-fail, @js-warn and @js-off per scenario. The refused pages carry @js-off: the browser logs
      // "Failed to load resource: the server responded with a status of 4xx" for each of them.
      javascript: { mode: process.env.WEBSHIP_JS_ERROR_MODE || 'warn', levels: ['error'], ignore: '', beforeScenario: false, afterScenario: true },
      // The accounts that "I am a logged in user with the ... user" uses, by handle. They are configuration,
      // not test data: the build of the wiki creates them once (.github/scripts/build-ddev-site.sh, or the
      // Webship Workspace's builder) and a feature never creates or deletes an account. Point the suite at
      // another wiki with the *_USERNAME and *_PASSWORD variables.
      users: {
        // sysop and bureaucrat: protects, deletes, restores and blocks.
        administrator: {
          username: process.env.ADMINISTRATOR_USERNAME || 'administrator',
          password: process.env.ADMINISTRATOR_PASSWORD || 'dD.123123ddd',
          email: process.env.ADMINISTRATOR_EMAIL || 'administrator@example.com',
        },
        // the "confirmed" group: edits pages that only established accounts may edit.
        editor: {
          username: process.env.EDITOR_USERNAME || 'editor',
          password: process.env.EDITOR_PASSWORD || 'dD.123123ddd',
          email: process.env.EDITOR_EMAIL || 'editor@example.com',
        },
        // no group: a new account, refused the protected pages.
        reader: {
          username: process.env.READER_USERNAME || 'reader',
          password: process.env.READER_PASSWORD || 'dD.123123ddd',
          email: process.env.READER_EMAIL || 'reader@example.com',
        },
      },
      minWaitTime: {
        page: 3000,
        before_scenario: 0,
        after_scenario: 0,
        before_step: 0,
        after_step: 0,
      },
      selectors: {
        css: {},
        xpath: {},
        filesPath: './tests/selectors/',
        files: [],
        offset: 60,
        breakpoints: {
          xs:   { width: 375,  height: 667  },
          sm:   { width: 576,  height: 800  },
          md:   { width: 768,  height: 1024 },
          lg:   { width: 992,  height: 768  },
          xl:   { width: 1200, height: 900, default: true },
          xxl:  { width: 1400, height: 900  },
          xxxl: { width: 1920, height: 1080 },
        },
      },
      screenshot: {
        dir: './screenshots',
        purge: false,
        onFailed: true,
        onEveryStep: false,
        alwaysFullscreen: false,
        failedPrefix: 'failed_',
        filenamePattern: '{datetime}.{feature_file}.feature_{step_line}.{ext}',
        filenamePatternFailed: '{failed_prefix}{datetime}.{feature_file}.feature_{step_line}.{ext}',
        infoTypes: '',
      },
    },
  },
};
