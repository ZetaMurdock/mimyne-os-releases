import { useEffect, useState } from 'react';

const RELEASES = 'https://github.com/ZetaMurdock/mimyne-os-releases/releases/latest';
const LATEST_API = 'https://api.github.com/repos/ZetaMurdock/mimyne-os-releases/releases/latest';

// Link straight to the Windows installer in the latest release, with the
// SHA-256 GitHub recorded for it, so people can check the file they got.
// Until GitHub answers, or if it can't, the link goes to the release page.
export function useWindowsDownload() {
  const [installer, setInstaller] = useState({ href: RELEASES, sha256: null });

  useEffect(() => {
    let cancelled = false;
    fetch(LATEST_API)
      .then((r) => (r.ok ? r.json() : null))
      .then((release) => {
        const exe = release?.assets?.find((a) => /_x64-setup\.exe$/.test(a.name));
        if (!exe || cancelled) return;
        const sha256 = /^sha256:([0-9a-f]{64})$/.exec(exe.digest ?? '')?.[1] ?? null;
        setInstaller({ href: exe.browser_download_url, sha256 });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return installer;
}
