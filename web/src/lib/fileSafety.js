// What a shared file could do once it's on someone's computer. Anything
// here can run code when opened, so the site asks before downloading it.

const RUNS = new Set([
  // Windows programs, installers and scripts.
  'exe', 'msi', 'msix', 'msixbundle', 'appx', 'appxbundle', 'msp', 'mst', 'com', 'scr', 'pif', 'cpl', 'dll', 'sys', 'drv', 'ocx',
  'bat', 'cmd', 'ps1', 'psm1', 'psd1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta', 'reg', 'inf', 'lnk', 'url', 'chm', 'gadget',
  // Mac and Linux.
  'app', 'dmg', 'pkg', 'mpkg', 'command', 'workflow', 'action', 'sh', 'run', 'bin', 'deb', 'rpm', 'appimage',
  // Cross-platform and disk images.
  'jar', 'apk', 'xapk', 'aab', 'py', 'pyw', 'pl', 'rb', 'php', 'iso', 'img', 'vhd', 'vhdx',
  // Pages and documents that can carry scripts or macros.
  'html', 'htm', 'xhtml', 'svg', 'xml', 'docm', 'dotm', 'xlsm', 'xltm', 'xlam', 'pptm', 'potm', 'ppam',
]);

// What a disguised program pretends to be.
const LOOKS_HARMLESS = /^(jpe?g|png|gif|webp|heic|bmp|pdf|docx?|xlsx?|pptx?|txt|rtf|csv|mp[34]|m4a|mov|wav|mkv|avi|zip)$/;

/**
 * { ext, runs, disguised }: the real extension (the last one), whether it
 * can run code, and whether the name dresses it up as something else
 * ("holiday.jpg.exe").
 */
export function fileRisk(name) {
  const parts = String(name ?? '').trim().toLowerCase().split('.');
  const ext = parts.length > 1 ? parts.at(-1) : '';
  const runs = RUNS.has(ext);
  return { ext, runs, disguised: runs && parts.length > 2 && LOOKS_HARMLESS.test(parts.at(-2)) };
}
