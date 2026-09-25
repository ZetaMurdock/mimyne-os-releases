// Point every "Get Mimyne" button straight at the Windows installer in the
// latest release. If GitHub can't be asked, the button keeps its link to the
// release page.
(function () {
  var buttons = document.querySelectorAll('a[data-download="windows"]');
  if (!buttons.length || !window.fetch) return;
  fetch('https://api.github.com/repos/ZetaMurdock/mimyne-os-releases/releases/latest')
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (release) {
      var exe = release && (release.assets || []).filter(function (a) {
        return /_x64-setup\.exe$/.test(a.name);
      })[0];
      if (!exe) return;
      buttons.forEach(function (b) { b.href = exe.browser_download_url; });
    })
    .catch(function () {});
})();
