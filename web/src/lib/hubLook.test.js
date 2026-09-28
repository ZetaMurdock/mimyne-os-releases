import { describe, expect, it } from 'vitest';
import { canSeePage, cleanHubLook, cleanPages, cleanPicture, hasBackdrop, visiblePages, withPage } from './hubLook.js';

const LINK = 'https://files.mimyne.com/files/p-abc/banner.png';

describe("a Hub's look", () => {
  it('takes an https link or a small inline still as a picture, nothing else', () => {
    expect(cleanPicture(LINK)).toBe(LINK);
    expect(cleanPicture('data:image/png;base64,AAAA')).toBe('data:image/png;base64,AAAA');
    expect(cleanPicture('http://plain.example/a.png')).toBeNull();
    expect(cleanPicture('javascript:alert(1)')).toBeNull();
    expect(cleanPicture(`https://x.example/${'a'.repeat(600)}`)).toBeNull();
    expect(cleanPicture(null)).toBeNull();
  });

  it('reads a record with its defaults filled in and junk left out', () => {
    const look = cleanHubLook({
      icon: LINK, banner: 'nope', bannerCrop: { zoom: 9, x: 3, y: -3 },
      background: LINK, backgroundDim: 4, bgMode: 'sideways',
      bgPanels: [{ id: 'p0', src: LINK }, { id: 'p1', src: 'C:/disk/picture.png' }],
      bgDividers: [{ id: 'd0', ax: 50, ay: 0, bx: 50, by: 100 }],
      bgPanelGap: 40, bgPanelLineColor: 'red', pages: { board: 'pledged', shop: 'owner', files: 'friends' },
    });
    expect(look.icon).toBe(LINK);
    expect(look.banner).toBeNull();
    expect(look.bannerCrop).toEqual({ zoom: 5, x: 1, y: -1 });
    expect(look.backgroundDim).toBe(0.9);
    // A background with no mode said is a picture.
    expect(look.bgMode).toBe('image');
    expect(look.bgPanels.map((p) => p.src)).toEqual([LINK, '']);
    expect(look.bgPanelGap).toBe(12);
    expect(look.bgPanelLineColor).toBe('#000000');
    expect(look.pages).toEqual({ board: 'pledged' });
    expect(cleanHubLook(null).bgMode).toBe('none');
    expect(cleanHubLook(null).pages).toEqual({});
  });

  it('knows whether anything is drawn behind the page', () => {
    expect(hasBackdrop(cleanHubLook({ bgMode: 'image', background: LINK }))).toBe(true);
    expect(hasBackdrop(cleanHubLook({ bgMode: 'none', background: LINK }))).toBe(false);
    expect(hasBackdrop(cleanHubLook({ bgMode: 'panels', bgPanels: [{ id: 'p0', src: LINK }] }))).toBe(true);
    expect(hasBackdrop(cleanHubLook({ bgMode: 'panels', bgPanels: [] }))).toBe(false);
  });

  it('keeps a page for whoever reaches its level, and shows the tabs that way', () => {
    const look = cleanHubLook({ pages: { board: 'pledged', files: 'mods', rules: 'owner' } });
    expect(canSeePage(look, 'rooms', -1)).toBe(true);
    expect(canSeePage(look, 'board', 0)).toBe(false);
    expect(canSeePage(look, 'board', 1)).toBe(true);
    expect(canSeePage(look, 'files', 1)).toBe(false);
    expect(canSeePage(look, 'files', 2)).toBe(true);
    expect(canSeePage(look, 'rules', 2)).toBe(false);
    expect(canSeePage(look, 'rules', 3)).toBe(true);
    expect(visiblePages(look, 0).map((p) => p.id)).toEqual(['rooms', 'clips', 'pledged']);
    expect(visiblePages(look, 3).map((p) => p.id)).toEqual(['rooms', 'board', 'clips', 'files', 'pledged', 'rules']);
  });

  it('sets a page, and everyone takes the entry away', () => {
    let pages = withPage({}, 'board', 'mods');
    expect(pages).toEqual({ board: 'mods' });
    pages = withPage(pages, 'board', 'everyone');
    expect(pages).toEqual({});
    expect(withPage({}, 'shop', 'mods')).toEqual({});
    expect(cleanPages({ board: 'everyone', files: 'owner' })).toEqual({ files: 'owner' });
  });
});
