import { useRef, useState } from 'react';
import { HubIcon } from '../Avatar.jsx';
import Button from '../Button.jsx';
import CropBox from '../CropBox.jsx';
import Dialog from '../Dialog.jsx';
import PanelBackground from '../PanelBackground.jsx';
import { updateHubLook } from '../../data/api.js';
import { uploadFile } from '../../lib/files.js';
import { MAX_PICTURE_LINK, PAGES, WHO, cleanPicture, hasBackdrop, isVideoLink, withPage } from '../../lib/hubLook.js';
import { cropStyle } from '../../lib/profileShapes.js';
import './HubLook.css';

const PICTURES = 'image/png,image/jpeg,image/webp,image/gif,image/avif';
const MEDIA = `${PICTURES},video/mp4,video/webm,video/quicktime`;

/**
 * A Hub's look, for its owner: an icon, a banner, a background (a picture
 * or video, or panels set up in the app's designer), and which pages are
 * kept for whom. Pictures go up as public uploads (lib/files.js) and the
 * Hub keeps the link, the way a profile's banner does; a link pasted in is
 * kept as it is. `panelsDesigner` is the app's designer when this runs in
 * the app (appSlots), else null and panels are read only here.
 */
export default function HubLook({ hub, look, roles, onClose, onSaved, panelsDesigner: Designer = null }) {
  const [draft, setDraft] = useState(look);
  const [links, setLinks] = useState({ icon: '', banner: '', background: '' });
  const [progress, setProgress] = useState({});
  const [designing, setDesigning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const inputs = { icon: useRef(null), banner: useRef(null), background: useRef(null) };
  const set = (patch) => setDraft((d) => ({ ...d, ...patch }));

  async function upload(which, file) {
    if (!file) return;
    setError(null);
    setProgress((p) => ({ ...p, [which]: 0 }));
    try {
      const label = await uploadFile(file, (fraction) => setProgress((p) => ({ ...p, [which]: fraction })), { public: true });
      if (!label.url) throw new Error("The file service didn't give a public link.");
      set({ [which]: label.url, ...(which === 'banner' ? { bannerCrop: null } : which === 'background' ? { backgroundCrop: null, bgMode: 'image' } : {}) });
    } catch (err) {
      setError(err.message);
    } finally {
      setProgress((p) => ({ ...p, [which]: null }));
    }
  }
  function useLink(which) {
    const clean = cleanPicture(links[which].trim());
    if (!clean) return setError('A link has to start with https:// and be under 500 characters.');
    setError(null);
    set({ [which]: clean, ...(which === 'banner' ? { bannerCrop: null } : which === 'background' ? { backgroundCrop: null, bgMode: 'image' } : {}) });
    setLinks((l) => ({ ...l, [which]: '' }));
  }

  async function save() {
    setSaving(true);
    setError(null);
    try {
      await updateHubLook(hub.id, draft);
      onSaved?.(draft);
      onClose();
    } catch (err) {
      setError(err.code === 'permission-denied' ? "The Hub didn't take that. Only its owner changes its look." : err.message);
      setSaving(false);
    }
  }

  const picker = (which, accept) => (
    <div className="hublook__pick">
      <input ref={inputs[which]} type="file" accept={accept} hidden onChange={(e) => { upload(which, e.target.files?.[0]); e.target.value = ''; }} />
      <Button size="sm" icon="upload" onClick={() => inputs[which].current?.click()} loading={progress[which] != null}>
        {progress[which] != null ? `Uploading ${Math.round(progress[which] * 100)}%` : 'Upload'}
      </Button>
      <form className="hublook__link" onSubmit={(e) => { e.preventDefault(); useLink(which); }}>
        <input className="field__input" placeholder="https://… a picture or video link" maxLength={MAX_PICTURE_LINK} value={links[which]} onChange={(e) => setLinks((l) => ({ ...l, [which]: e.target.value }))} aria-label={`${which} link`} />
        <Button size="sm" type="submit" disabled={!links[which].trim()}>Use</Button>
      </form>
      {draft[which] && <Button size="sm" variant="ghost" icon="trash" onClick={() => set({ [which]: null, ...(which === 'banner' ? { bannerCrop: null } : which === 'background' ? { backgroundCrop: null } : {}) })}>Remove</Button>}
    </div>
  );
  const whoLabel = (who) => ({
    everyone: hub.visibility === 'public' ? 'Anyone' : 'Everyone in the Hub',
    pledged: 'Pledged people',
    mods: `${roles.find((r) => r.level === 'mod')?.name ?? 'Mods'} and the ${roles.find((r) => r.level === 'owner')?.name ?? 'owner'}`,
    owner: `Only the ${roles.find((r) => r.level === 'owner')?.name ?? 'owner'}`,
  })[who];

  return (
    <Dialog title={`${hub.name}: its look`} onClose={onClose} width={640}>
      <div className="hublook">
        <section className="hublook__section">
          <h3 className="label">Icon</h3>
          <div className="hublook__row">
            <HubIcon hub={{ ...hub, icon: draft.icon }} size={72} />
            {picker('icon', PICTURES)}
          </div>
        </section>

        <section className="hublook__section">
          <h3 className="label">Banner</h3>
          {draft.banner ? (
            <CropBox src={draft.banner} crop={draft.bannerCrop} onChange={(crop) => set({ bannerCrop: crop })} aspect={5} width={320} label="How it sits" />
          ) : (
            <p className="muted">A wide strip behind the name. About 5 to 1: 1600 by 320 looks right.</p>
          )}
          {picker('banner', MEDIA)}
        </section>

        <section className="hublook__section">
          <h3 className="label">Background</h3>
          <div className="hublook__modes" role="radiogroup" aria-label="Background">
            {[['none', 'None'], ['image', 'A picture or video'], ['panels', 'Panels']].map(([id, text]) => (
              <label key={id} className={`hublook__mode ${draft.bgMode === id ? 'is-on' : ''}`}>
                <input type="radio" name="bgMode" value={id} checked={draft.bgMode === id} onChange={() => set({ bgMode: id })} />
                {text}
              </label>
            ))}
          </div>
          {draft.bgMode === 'image' && (
            <>
              {draft.background ? (
                <CropBox src={draft.background} crop={draft.backgroundCrop} onChange={(crop) => set({ backgroundCrop: crop })} aspect={16 / 9} width={320} label="How it sits" />
              ) : (
                <p className="muted">Fills the screen behind the page. 1920 by 1080, or a video.</p>
              )}
              {picker('background', MEDIA)}
              <label className="hublook__dim">
                <span>Dim it, so the words read</span>
                <input type="range" min={0} max={0.9} step={0.05} value={draft.backgroundDim} onChange={(e) => set({ backgroundDim: Number(e.target.value) })} aria-label="Dim the background" />
                <span className="muted">{Math.round(draft.backgroundDim * 100)}%</span>
              </label>
            </>
          )}
          {draft.bgMode === 'panels' && (
            <>
              <div className="hublook__panels" aria-label="The panels, as they are">
                {draft.bgPanels.some((p) => p.src)
                  ? <PanelBackground panels={draft.bgPanels} dividers={draft.bgDividers} lineWidth={draft.bgPanelGap} lineColor={draft.bgPanelLineColor} active={false} />
                  : <p className="muted hublook__panels-empty">No panels yet.</p>}
              </div>
              {Designer ? (
                <Button size="sm" onClick={() => setDesigning(true)}>Set up the panels</Button>
              ) : (
                <p className="muted">Panels are set up in the Mimyne app, with the same designer the home screen has: open this Hub there and choose Customize.</p>
              )}
              {designing && Designer && (
                <Designer
                  look={draft}
                  onDone={(next) => { set(next); setDesigning(false); }}
                  onClose={() => setDesigning(false)}
                />
              )}
            </>
          )}
        </section>

        <section className="hublook__section">
          <h3 className="label">Pages</h3>
          <p className="muted">Who can see each page. A page kept from someone is not shown to them, and what is on it cannot be read.</p>
          <div className="hublook__pages">
            {PAGES.map((page) => (
              <label key={page.id} className="hublook__page">
                <span>{page.label}</span>
                <select value={draft.pages[page.id] ?? 'everyone'} onChange={(e) => set({ pages: withPage(draft.pages, page.id, e.target.value) })}>
                  {WHO.map((who) => <option key={who} value={who}>{whoLabel(who)}</option>)}
                </select>
              </label>
            ))}
          </div>
        </section>

        {error && <p className="form-error" role="alert">{error}</p>}
        <div className="hublook__actions">
          {hasBackdrop(draft) && draft.bgMode === 'image' && draft.background && (
            <span className="muted hublook__peek" aria-hidden="true">
              {isVideoLink(draft.background)
                ? <video src={draft.background} muted loop autoPlay playsInline style={cropStyle(draft.backgroundCrop)} />
                : <img src={draft.background} alt="" referrerPolicy="no-referrer" style={cropStyle(draft.backgroundCrop)} />}
            </span>
          )}
          <span className="hublook__spacer" />
          <Button onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={saving}>Save the look</Button>
        </div>
      </div>
    </Dialog>
  );
}
