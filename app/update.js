'use strict';

const semver = require('semver');
const RELEASES_URL = 'https://api.github.com/repos/Redstoner875/Ravenswatcher/releases';
const TAG_PAGE = 'https://github.com/Redstoner875/Ravenswatcher/releases/tag/';
const LATEST_URL = RELEASES_URL;

function parseVersion(s) {
  const version = typeof s === 'string' && /^v?\d+\.\d+\.\d+$/.test(s) ? semver.parse(s) : null;
  return version ? [version.major, version.minor, version.patch] : null;
}

function newerVersion(current, tag) {
  const a = semver.valid(current), b = semver.valid(tag);
  return a && b && semver.gt(b, a) ? b : null;
}

// Portable copies can discover a release, but must install once to enable updates.
async function checkForUpdate(fetch, current) {
  const failed = reason => ({ current, ok: false, latest: null, url: null, reason });
  try {
    const response = await fetch(RELEASES_URL, {
      headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return failed(`status ${response.status}`);
    const releases = await response.json();
    if (!Array.isArray(releases)) return failed('Invalid release list');
    const release = releases.filter(r => !r.draft && semver.valid(r.tag_name)
      && r.assets?.some(a => /^Ravenswatcher-.*-Setup\.exe$/.test(a.name)))
      .sort((a, b) => semver.rcompare(semver.valid(a.tag_name), semver.valid(b.tag_name)))
      .find(r => newerVersion(current, r.tag_name));
    return { current, ok: true, latest: release ? semver.valid(release.tag_name) : null,
      url: release ? TAG_PAGE + encodeURIComponent(release.tag_name) : null, reason: null };
  } catch (error) { return failed(error.message); }
}

function createUpdateController({ updater, current, onState, beforeInstall = async () => {} }) {
  let state = { current, ok: true, latest: null, url: null, reason: null, automatic: true, status: 'idle', percent: 0 };
  let pending = null, installing = false;
  const publish = patch => { state = { ...state, ...patch }; onState({ ...state }); };
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = true;
  updater.allowDowngrade = false;
  const fail = error => publish({ status: 'error', ok: false, reason: error.message || String(error) });
  updater.on('error', fail);
  updater.on('checking-for-update', () => publish({ status: 'checking', ok: true, reason: null }));
  updater.on('update-not-available', () => publish({ status: 'idle', ok: true, latest: null, url: null, reason: null }));
  updater.on('update-available', info => publish({ status: 'downloading', ok: true, latest: info.version,
    url: TAG_PAGE + 'v' + encodeURIComponent(info.version), reason: null, percent: 0 }));
  updater.on('download-progress', info => publish({ status: 'downloading', percent: Math.max(0, Math.min(100, Number(info.percent) || 0)) }));
  updater.on('update-downloaded', info => publish({ status: 'downloaded', ok: true, latest: info.version,
    url: TAG_PAGE + 'v' + encodeURIComponent(info.version), percent: 100, reason: null }));
  return {
    get state() { return { ...state }; },
    check() {
      if (pending) return pending;
      if (['downloading', 'downloaded', 'installing'].includes(state.status)) return Promise.resolve(state);
      // Keep the download rejection handled too: checkForUpdates resolves before the download does.
      pending = Promise.resolve().then(() => updater.checkForUpdates()).then(result => {
        if (result?.downloadPromise) result.downloadPromise.catch(fail);
      }).catch(fail).finally(() => { pending = null; });
      return pending;
    },
    async install() {
      if (installing || state.status !== 'downloaded') return { ok: false, error: 'No downloaded update is ready.' };
      installing = true;
      publish({ status: 'installing' });
      try {
        await beforeInstall();
        updater.quitAndInstall(true, true);
        return { ok: true };
      } catch (error) {
        installing = false;
        fail(error);
        return { ok: false, error: error.message };
      }
    },
  };
}

module.exports = { parseVersion, newerVersion, checkForUpdate, createUpdateController, LATEST_URL };
