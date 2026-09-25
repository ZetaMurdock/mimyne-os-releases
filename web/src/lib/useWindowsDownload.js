import { useEffect, useState } from 'react';

const RELEASES = 'https://github.com/ZetaMurdock/mimyne-os-releases/releases/latest';
const LATEST_API = 'https://api.github.com/repos/ZetaMurdock/mimyne-os-releases/releases/latest';

// Link straight to the Windows installer in the latest release. Until GitHub
// answers, or if it can't, the link goes to the release page.
export function useWindowsDownload() {
  const [href, setHref] = useState(RELEASES);

  useEffect(() => {
    let cancelled = false;
    fetch(LATEST_API)
      .then((r) => (r.ok ? r.json() : null))
      .then((release) => {
        const exe = release?.assets?.find((a) => /_x64-setup\.exe$/.test(a.name));
        if (exe && !cancelled) setHref(exe.browser_download_url);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return href;
}
