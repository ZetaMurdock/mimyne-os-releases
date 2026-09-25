import { useEffect, useMemo, useRef, useState } from 'react';
import Button from '../Button.jsx';
import Dialog from '../Dialog.jsx';
import Icon from '../Icon.jsx';
import Menu from '../Menu.jsx';
import { shelveFile, unshelveFile, watchHubFiles } from '../../data/rooms.js';
import { usePerson } from '../../data/people.js';
import { convertFile, engineReady, familyOf, stopConverting, targetsFor } from '../../lib/convert.js';
import { downloadFile, fileLink, uploadFile } from '../../lib/files.js';
import { formatBytes, timeAgo } from '../../lib/format.js';
import './HubFiles.css';

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'pictures', label: 'Pictures', match: (f) => ['image', 'gif'].includes(familyOf(f)) },
  { id: 'video', label: 'Video', match: (f) => familyOf(f) === 'video' },
  { id: 'audio', label: 'Audio', match: (f) => familyOf(f) === 'audio' },
  { id: 'docs', label: 'Docs & data', match: (f) => ['csv', 'json', 'markdown', 'text'].includes(familyOf(f)) || /pdf|document|sheet|presentation|zip/.test(f.type ?? '') },
  { id: 'converted', label: 'Converted', match: (_, item) => !!item.fromId },
];

const extOf = (name) => (name.match(/\.([a-z0-9]{1,6})$/i)?.[1] ?? 'file').toUpperCase();

/**
 * A Hub's Files: a shelf people put files and media on, and a converter that
 * turns any of them into another format on the spot. It exists only here.
 */
export default function HubFiles({ hub, user, access, onSignIn }) {
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [uploads, setUploads] = useState([]); // { id, name, size, progress, error }
  const [dragging, setDragging] = useState(false);
  const [job, setJob] = useState(null); // { item, target }
  const picker = useRef(null);

  useEffect(() => watchHubFiles(hub.id, setItems, () => setError("This Hub's files couldn't load.")), [hub.id]);

  const canAdd = !!user && access.canPost;
  const shown = useMemo(() => {
    const f = FILTERS.find((x) => x.id === filter);
    const q = search.trim().toLowerCase();
    return (items ?? []).filter((item) => (!f.match || f.match(item.file, item)) && (!q || item.file.name.toLowerCase().includes(q)));
  }, [items, filter, search]);
  const totalSize = (items ?? []).reduce((n, i) => n + i.file.size, 0);

  async function add(list) {
    if (!canAdd) return;
    const picked = [...list].map((file) => ({ id: `${file.name}-${file.size}-${Math.random()}`, file }));
    setUploads((prev) => [...prev, ...picked.map((p) => ({ id: p.id, name: p.file.name, size: p.file.size, progress: 0 }))]);
    for (const { id, file } of picked) {
      try {
        const label = await uploadFile(file, (progress) => setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, progress } : u))));
        await shelveFile(hub.id, user.uid, label);
        setUploads((prev) => prev.filter((u) => u.id !== id));
      } catch (err) {
        setUploads((prev) => prev.map((u) => (u.id === id ? { ...u, error: err.code === 'permission-denied' ? "The Hub didn't take it." : err.message } : u)));
      }
    }
  }

  async function remove(item) {
    if (!window.confirm(`Take ${item.file.name} off the shelf?`)) return;
    try {
      await unshelveFile(hub.id, item.id);
    } catch {
      setError("That file couldn't be taken down.");
    }
  }

  return (
    <div
      className={`shelf ${dragging ? 'is-dragging' : ''}`}
      onDragOver={(e) => {
        if (!canAdd || ![...e.dataTransfer.types].includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => e.currentTarget.contains(e.relatedTarget) || setDragging(false)}
      onDrop={(e) => {
        if (!canAdd || !e.dataTransfer.files.length) return;
        e.preventDefault();
        setDragging(false);
        add(e.dataTransfer.files);
      }}
    >
      <header className="shelf__head">
        <div>
          <h2 className="shelf__title">Files</h2>
          <p className="muted shelf__sub">
            {items ? `${items.length} ${items.length === 1 ? 'file' : 'files'} · ${formatBytes(totalSize)}` : 'Loading…'}
          </p>
        </div>
        {canAdd ? (
          <Button icon="upload" onClick={() => picker.current.click()}>Upload</Button>
        ) : !user ? (
          <Button variant="inverse" onClick={onSignIn}>Sign in to upload</Button>
        ) : null}
        <input
          ref={picker}
          type="file"
          multiple
          hidden
          onChange={(e) => {
            add(e.target.files);
            e.target.value = '';
          }}
        />
      </header>

      {canAdd && (
        <button type="button" className="shelf__drop" onClick={() => picker.current.click()}>
          <Icon name="upload" size={18} />
          <span>
            Drop files here, or <span className="shelf__browse">browse</span>. Anything on the shelf can be converted to another format.
          </span>
        </button>
      )}

      {uploads.length > 0 && (
        <ul className="shelf__uploads">
          {uploads.map((u) => (
            <li key={u.id} className={u.error ? 'is-error' : ''}>
              <Icon name={u.error ? 'close' : 'upload'} size={14} />
              <span className="shelf__upload-name">{u.name}</span>
              <span className="muted">{u.error ?? `${Math.round(u.progress * 100)}% of ${formatBytes(u.size)}`}</span>
              {!u.error && <span className="shelf__bar"><span style={{ width: `${u.progress * 100}%` }} /></span>}
              {u.error && (
                <button type="button" aria-label="Dismiss" onClick={() => setUploads((prev) => prev.filter((x) => x.id !== u.id))}>
                  <Icon name="close" size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="shelf__bar-row">
        <div className="shelf__filters" role="tablist" aria-label="Show">
          {FILTERS.map((f) => (
            <button key={f.id} type="button" role="tab" aria-selected={filter === f.id} className={`hf-chip ${filter === f.id ? 'is-on' : ''}`} onClick={() => setFilter(f.id)}>
              {f.label}
            </button>
          ))}
        </div>
        <label className="shelf__search">
          <Icon name="search" size={15} />
          <input value={search} placeholder="Find a file" aria-label="Find a file" onChange={(e) => setSearch(e.target.value)} />
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}

      {items && shown.length === 0 && (
        <div className="shelf__empty">
          <Icon name="folder" size={34} />
          <p>{items.length === 0 ? 'Nothing on the shelf yet.' : 'Nothing matches.'}</p>
          {items.length === 0 && canAdd && <p className="muted">Add a file and convert it into anything from here.</p>}
        </div>
      )}

      <ul className="shelf__grid">
        {items === null && [0, 1, 2, 3].map((i) => <li key={i} className="tile tile--skeleton" aria-hidden="true" />)}
        {shown.map((item) => (
          <Tile
            key={item.id}
            item={item}
            user={user}
            canRemove={!!user && (item.by === user.uid || access.canModerate)}
            onConvert={(target) => (user ? setJob({ item, target }) : onSignIn())}
            onRemove={() => remove(item)}
            onSignIn={onSignIn}
          />
        ))}
      </ul>

      {dragging && (
        <div className="shelf__dropping" aria-hidden="true">
          <Icon name="upload" size={34} />
          <span>Drop to upload to {hub.name}</span>
        </div>
      )}

      {job && <ConvertDialog hub={hub} user={user} canAdd={canAdd} item={job.item} target={job.target} onClose={() => setJob(null)} onRetarget={(target) => setJob({ ...job, target })} />}
    </div>
  );
}

function Tile({ item, user, canRemove, onConvert, onRemove, onSignIn }) {
  const { file } = item;
  const by = usePerson(item.by);
  const targets = targetsFor(file);
  const groups = [...new Set(targets.map((t) => t.group))];
  const family = familyOf(file);

  async function download() {
    if (!user) return onSignIn();
    await downloadFile(file.path).catch(() => {});
  }

  return (
    <li className="tile">
      <Thumb file={file} family={family} signedIn={!!user} />
      <div className="tile__text">
        <span className="tile__name" title={file.name}>{file.name}</span>
        <span className="tile__meta">
          {formatBytes(file.size)} · {by.name} · {timeAgo(item.at)}
        </span>
        {item.fromName && (
          <span className="tile__from" title={`Converted from ${item.fromName}`}>
            Converted from {item.fromName}
          </span>
        )}
      </div>
      <div className="tile__actions">
        {targets.length > 0 ? (
          <Menu
            label={`Convert ${file.name}`}
            align="start"
            trigger={(props) => (
              <button type="button" className="tile__convert" onClick={props.toggle} aria-expanded={props['aria-expanded']} aria-controls={props['aria-controls']} aria-label={props['aria-label']}>
                Convert
                <Icon name="arrowDown" size={13} />
              </button>
            )}
          >
            <div className="convert-menu">
              <p className="convert-menu__from">
                <span className="convert-menu__badge">{extOf(file.name)}</span> into…
              </p>
              {groups.map((g) => (
                <div key={g} className="convert-menu__group">
                  <span className="convert-menu__group-name">{g}</span>
                  {targets.filter((t) => t.group === g).map((t) => (
                    <button key={t.id} type="button" className="convert-menu__item" onClick={() => onConvert(t)}>
                      <span className="convert-menu__fmt">{t.label}</span>
                      <span className="convert-menu__hint">{t.hint}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </Menu>
        ) : (
          <span className="tile__no-convert" title="Nothing to convert this into yet">No conversions</span>
        )}
        <button type="button" className="tile__icon" aria-label={`Download ${file.name}`} title="Download" onClick={download}>
          <Icon name="download" size={16} />
        </button>
        {canRemove && (
          <button type="button" className="tile__icon is-danger" aria-label={`Take ${file.name} off the shelf`} title="Take off the shelf" onClick={onRemove}>
            <Icon name="trash" size={16} />
          </button>
        )}
      </div>
    </li>
  );
}

function Thumb({ file, family, signedIn }) {
  const [url, setUrl] = useState(null);
  const [failed, setFailed] = useState(false);
  const visual = ['image', 'gif', 'video'].includes(family);
  useEffect(() => {
    if (!visual || !signedIn) return undefined;
    let live = true;
    fileLink(file.path).then((link) => live && setUrl(link)).catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [file.path, visual, signedIn]);

  if (url && !failed && (family === 'image' || family === 'gif')) {
    return <div className="tile__thumb"><img src={url} alt="" loading="lazy" onError={() => setFailed(true)} /></div>;
  }
  if (url && !failed && family === 'video') {
    return (
      <div className="tile__thumb">
        <video src={`${url}#t=0.5`} muted preload="metadata" onError={() => setFailed(true)} />
        <span className="tile__play"><Icon name="play" size={16} /></span>
      </div>
    );
  }
  const icon = { image: 'image', gif: 'image', video: 'video', audio: 'music', csv: 'table', json: 'file', markdown: 'file', text: 'file' }[family] ?? 'file';
  return (
    <div className={`tile__thumb tile__thumb--icon is-${family ?? 'other'}`}>
      <Icon name={icon} size={30} strokeWidth={1.5} />
      <span className="tile__ext">{extOf(file.name)}</span>
    </div>
  );
}

const STAGES = { fetch: 'Fetching the file', engine: 'Getting the converter ready', convert: 'Converting', done: 'Done' };

function ConvertDialog({ hub, user, canAdd, item, target, onClose, onRetarget }) {
  const [stage, setStage] = useState({ step: 'fetch', progress: 0 });
  const [result, setResult] = useState(null);
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(null); // progress 0..1
  const [saved, setSaved] = useState(false);
  const firstRun = useRef(!engineReady());
  const run = useRef(0);

  useEffect(() => {
    const id = ++run.current;
    setResult(null);
    setError(null);
    setSaved(false);
    setStage({ step: 'fetch', progress: 0 });
    const started = performance.now();
    convertFile(item.file, target, (step, progress) => run.current === id && setStage({ step, progress }))
      .then((file) => {
        if (run.current !== id) return;
        setResult({ file, ms: performance.now() - started });
      })
      .catch((err) => run.current === id && setError(err.message || "This file couldn't be converted."));
    return () => {
      run.current += 1;
    };
  }, [item.file, target]);

  useEffect(() => {
    if (!result) return undefined;
    const url = URL.createObjectURL(result.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [result]);

  function download() {
    const a = document.createElement('a');
    a.href = preview;
    a.download = result.file.name;
    a.click();
  }

  async function shelve() {
    setSaving(0);
    setError(null);
    try {
      const label = await uploadFile(result.file, setSaving);
      await shelveFile(hub.id, user.uid, label, item);
      setSaved(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(null);
    }
  }

  async function stop() {
    run.current += 1;
    await stopConverting();
    onClose();
  }

  const others = targetsFor(item.file).filter((t) => t.id !== target.id);
  const busy = !result && !error;
  const pct = Math.round(stage.progress * 100);
  const family = target.type.split('/')[0];
  const smaller = result && result.file.size < item.file.size;

  return (
    <Dialog title="Convert file" onClose={busy ? undefined : onClose} width={520}>
      <div className="convert">
        <div className="convert__route">
          <span className="convert__file">
            <span className="convert__badge">{extOf(item.file.name)}</span>
            <span className="convert__name" title={item.file.name}>{item.file.name}</span>
            <span className="muted">{formatBytes(item.file.size)}</span>
          </span>
          <span className={`convert__arrow ${busy ? 'is-busy' : ''}`} aria-hidden="true"><Icon name="convert" size={18} /></span>
          <span className="convert__file">
            <span className="convert__badge convert__badge--to">{target.label.split(',')[0]}</span>
            <span className="convert__name">{result?.file.name ?? target.hint}</span>
            <span className="muted">{result ? formatBytes(result.file.size) : '…'}</span>
          </span>
        </div>

        {busy && (
          <div className="convert__progress" role="status" aria-live="polite">
            <div className="convert__steps">
              {['fetch', ...(target.media ? ['engine'] : []), 'convert'].map((s) => (
                <span key={s} className={`convert__step ${stage.step === s ? 'is-now' : ''} ${order(stage.step) > order(s) ? 'is-done' : ''}`}>
                  {order(stage.step) > order(s) ? <Icon name="check" size={12} strokeWidth={2.4} /> : null}
                  {STAGES[s]}
                </span>
              ))}
            </div>
            <div className={`convert__meter ${stage.step === 'engine' ? 'is-indeterminate' : ''}`}>
              <span style={{ width: `${stage.step === 'engine' ? 30 : pct}%` }} />
            </div>
            <p className="muted convert__note">
              {stage.step === 'engine'
                ? firstRun.current
                  ? 'The first video or audio conversion loads the converter (about 30 MB). After that it starts right away.'
                  : 'Starting the converter…'
                : stage.step === 'fetch'
                  ? `${pct}% downloaded`
                  : `${pct}%, on your own computer. Nothing leaves it until you say so.`}
            </p>
            {target.media && <Button size="sm" onClick={stop}>Stop</Button>}
          </div>
        )}

        {error && (
          <div className="convert__error">
            <p className="form-error">{error}</p>
            <div className="convert__actions">
              <Button onClick={onClose}>Close</Button>
            </div>
          </div>
        )}

        {result && preview && (
          <div className="convert__done">
            <div className="convert__preview">
              {family === 'image' && target.id !== 'ico' && <img src={preview} alt={`Preview of ${result.file.name}`} />}
              {target.id === 'ico' && <img src={preview} alt="" className="convert__icon-preview" />}
              {family === 'video' && <video src={preview} controls />}
              {family === 'audio' && <audio src={preview} controls />}
              {!['image', 'video', 'audio'].includes(family) && (
                <div className="convert__doc">
                  <Icon name={target.id === 'csv' ? 'table' : 'file'} size={28} />
                  <span>{result.file.name}</span>
                </div>
              )}
            </div>
            <p className="convert__stats">
              Done in {(result.ms / 1000).toFixed(1)}s · {formatBytes(item.file.size)} → {formatBytes(result.file.size)}
              {smaller && ` (${Math.round((1 - result.file.size / item.file.size) * 100)}% smaller)`}
            </p>
            {error && <p className="form-error">{error}</p>}
            <div className="convert__actions">
              <Button icon="download" onClick={download}>Download</Button>
              {canAdd && (
                <Button variant="inverse" icon={saved ? 'check' : undefined} onClick={shelve} loading={saving !== null} disabled={saved}>
                  {saved ? 'Saved to Files' : saving !== null ? `Saving ${Math.round(saving * 100)}%` : 'Save to Files'}
                </Button>
              )}
            </div>
            {others.length > 0 && (
              <div className="convert__again">
                <span className="muted">Convert to</span>
                {others.slice(0, 6).map((t) => (
                  <button key={t.id} type="button" className="hf-chip" onClick={() => onRetarget(t)}>{t.label}</button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  );
}

const order = (step) => ['fetch', 'engine', 'convert', 'done'].indexOf(step);
