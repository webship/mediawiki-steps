#!/usr/bin/env bash
# Builds the wiki the suite runs against: the MediaWiki release tarball, installed with
# its own command-line installer on the database of a DDEV project of type php (DDEV has
# no project type of its own for it), the wiki at the docroot.
#
#   - the extensions a default wiki uses, from the tarball: WikiEditor, VisualEditor
#     (Parsoid is in core), CategoryTree, Cite; every bundled skin, Vector 2022 the default;
#   - uploads on (Special:Upload);
#   - the rule MediaWiki documents for nginx, so that rest.php/v1/... reaches the REST API
#     (the search suggestions and the visual editor use it);
#   - the job queue as a service of the web container (runJobs --wait), as MediaWiki
#     recommends for a wiki: category counts and the other jobs run within a second;
#   - the object cache and the sessions in the database, shared with the maintenance
#     scripts;
#   - a new account earns the rights of an established one ("autoconfirmed") after 4 days
#     and 10 edits, as on large public wikis, and a "confirmed" group gives them at once.
#
# Settings (environment variables, all optional):
#   PROJECT_NAME       the DDEV project name                    (default mediawikisteps)
#   SITE_DIR           the project folder                       (default a new temporary folder)
#   MEDIAWIKI_VERSION  the release                              (default 1.46.2)
#   PHP_VERSION        the PHP of the web container             (default 8.4)
#   ACCOUNT_PASSWORD   the password of the accounts below       (default dD.123123ddd)
#   ACCOUNTS_ONLY      1: build nothing, give the accounts of the wiki in SITE_DIR back
#                      their password, address and groups, and lift any block on them
#                      (after a run that was stopped half way)
#
# The accounts are configuration: this script creates them with the maintenance script
# createAndPromote, and cucumber.js names them; the features never create or delete one.
#   administrator  administrator@example.com  sysop and bureaucrat (the installer's account)
#   editor         editor@example.com         the "confirmed" group
#   reader         reader@example.com         no group: a new account
#
# Nothing is installed that the release does not bring: no paid service, no account
# anywhere.
set -euo pipefail

PROJECT_NAME="${PROJECT_NAME:-mediawikisteps}"
MEDIAWIKI_VERSION="${MEDIAWIKI_VERSION:-1.46.2}"
PHP_VERSION="${PHP_VERSION:-8.4}"
ACCOUNT_PASSWORD="${ACCOUNT_PASSWORD:-dD.123123ddd}"
SITE_DIR="${SITE_DIR:-$(mktemp -d)}"

# The accounts (see the header). createAndPromote --force gives an account that is there
# its password and groups back; it cannot set the address of an account that is there,
# so resetUserEmail does.
write_accounts() {
  local spec name groups
  for spec in "administrator:--sysop --bureaucrat" "editor:--custom-groups=confirmed" "reader:"; do
    name="${spec%%:*}"
    groups="${spec#*:}"
    # shellcheck disable=SC2086
    ddev exec php maintenance/run.php createAndPromote --force $groups "$name" "$ACCOUNT_PASSWORD" </dev/null
    ddev exec php maintenance/run.php resetUserEmail --no-reset-password "$name" "$name@example.com" </dev/null
  done
  # A block a stopped run left on an account is lifted (an account without one is skipped).
  printf 'administrator\neditor\nreader\n' | ddev exec php maintenance/run.php blockUsers --unblock --performer="Maintenance script" --reason="Test accounts given back" 2>&1 | grep -v -i "not found" || true
}

mkdir -p "$SITE_DIR"
cd "$SITE_DIR"

if [ "${ACCOUNTS_ONLY:-}" = "1" ]; then
  write_accounts
  exit 0
fi

# Node.js 24, the line of the Webship Workspace (the wiki itself needs none).
ddev config --project-type=php --docroot="" --project-name="$PROJECT_NAME" --php-version="$PHP_VERSION" --nodejs-version=24

mkdir -p .ddev/nginx
cat > .ddev/nginx/mediawiki-rest.conf <<'NGINXEOF'
# The REST API of the wiki (rest.php/v1/...): the rule MediaWiki documents for nginx.
location /rest.php/ {
    try_files $uri $uri/ /rest.php?$query_string;
}
NGINXEOF

ddev start -y

# The release tarball, from the release server, unpacked at the docroot in the container.
MAJOR="$(echo "$MEDIAWIKI_VERSION" | cut -d. -f1,2)"
ddev exec "curl -sSfL https://releases.wikimedia.org/mediawiki/${MAJOR}/mediawiki-${MEDIAWIKI_VERSION}.tar.gz | tar -xz --strip-components=1" </dev/null

SITE_URL="$(ddev describe -j | python3 -c "import json,sys; print(json.load(sys.stdin)['raw']['primary_url'])")"

# The installer of the release, on the database of the DDEV project (db, db, db on the
# host db). It writes LocalSettings.php and makes the first account, "administrator".
ddev exec php maintenance/run.php install --server="$SITE_URL" --scriptpath= \
  --dbtype=mysql --dbserver=db --dbname=db --dbuser=db --dbpass=db --installdbuser=db --installdbpass=db \
  --lang=en --pass="$ACCOUNT_PASSWORD" --extensions=WikiEditor,VisualEditor,CategoryTree,Cite \
  "Webship test wiki" administrator </dev/null

cat >> LocalSettings.php <<'PHPEOF'

# The test wiki of the step pack (added by build-ddev-site.sh).
# Uploads, for the upload form (Special:Upload).
$wgEnableUploads = true;
# A new account earns the rights of an established one ("autoconfirmed") after 4 days and
# 10 edits, as on large public wikis; the "confirmed" group gives those rights at once.
$wgAutoConfirmAge = 4 * 86400;
$wgAutoConfirmCount = 10;
$wgGroupPermissions['confirmed']['autoconfirmed'] = true;
$wgGroupPermissions['confirmed']['editsemiprotected'] = true;
# The job queue runs as a service (.ddev/config.mediawiki-jobs.yaml), not in web requests.
$wgJobRunRate = 0;
# The object cache and the sessions in the database: the maintenance scripts and the job
# runner share them with the web requests, and a restart keeps the sessions.
$wgMainCacheType = CACHE_DB;
$wgSessionCacheType = CACHE_DB;
PHPEOF

# The names of the "confirmed" group on the wiki's pages.
printf 'Confirmed users' | ddev exec php maintenance/run.php edit --user=administrator --summary="The name of the confirmed group" "MediaWiki:Group-confirmed"
printf 'confirmed user' | ddev exec php maintenance/run.php edit --user=administrator --summary="The name of a member of the confirmed group" "MediaWiki:Group-confirmed-member"

write_accounts

# The job queue as a service of the web container (it needs the wiki in place, so it is
# added now), started with the restart that also loads the new settings.
cat > .ddev/config.mediawiki-jobs.yaml <<'JOBSEOF'
# The job queue of the wiki as a service of the web container.
web_extra_daemons:
  - name: "mediawiki-jobs"
    command: "php maintenance/run.php runJobs --wait --maxtime=3600 --memory-limit=256M"
    directory: /var/www/html
JOBSEOF
ddev restart

if [ -n "${GITHUB_ENV:-}" ]; then
  echo "LAUNCH_URL=$SITE_URL" >> "$GITHUB_ENV"
fi
VERSION="$(sed -n "s/^define( 'MW_VERSION', '\\(.*\\)' );/\\1/p" includes/Defines.php)"
echo "Built the wiki ${VERSION:-(unknown version)} at $SITE_URL"
