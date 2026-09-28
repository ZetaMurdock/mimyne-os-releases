import { createContext, useContext, useMemo, useState } from 'react';
import { parseMessage } from '../lib/messageFormat.js';
import { MAX_PREVIEWS } from '../lib/links.js';
import './MessageText.css';

// How a mention is drawn, from whoever mounts the message (a Room links it
// to the person); a plain mark by default.
const MentionContext = createContext(null);

/** The links a message has, in order, once each, quiet <links> left out. */
function linksIn(blocks) {
  const found = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.type === 'link' && !node.quiet && !found.includes(node.href)) found.push(node.href);
      if (node.children) walk(node.children);
    }
  };
  for (const block of blocks) {
    if (block.lines) block.lines.forEach(walk);
    if (block.children) walk(block.children);
    if (block.items) block.items.forEach((item) => walk(item.children));
  }
  return found;
}

// A message's text, formatted the way it was written (lib/messageFormat.js):
// each node of the parsed tree becomes an element here, and nothing else
// becomes anything - there is no HTML in between, so a message can only
// ever be text, marks, links and mentions.
//
// A spoiler is hidden until it is clicked. A link opens in a new tab, and
// only an http(s) one is a link at all. A mention is a mark for now; the
// slice that makes it a link to the person, and tells them, comes later.

/**
 * `preview(url)` draws a link's preview card below the words, for the first
 * few links; a message that is nothing but one link shows only the card,
 * as a sent GIF always has. `after` goes at the end of the words (an
 * "(edited)" mark). `mention(name)` draws a mention.
 */
export default function MessageText({ text, className = '', preview = null, after = null, mention = null }) {
  const blocks = useMemo(() => parseMessage(text), [text]);
  const links = useMemo(() => (preview ? linksIn(blocks).slice(0, MAX_PREVIEWS) : []), [blocks, preview]);
  const bare = links.length === 1 && String(text ?? '').trim() === links[0];
  return (
    <MentionContext.Provider value={mention}>
      {!bare && (
        <div className={`fmt ${className}`.trim()}>
          {blocks.map((block, index) => <Block key={index} block={block} />)}
          {after}
        </div>
      )}
      {links.map((url) => preview(url))}
    </MentionContext.Provider>
  );
}

function Block({ block }) {
  switch (block.type) {
    case 'code':
      return (
        <pre className="fmt__pre" data-language={block.language || undefined}>
          <code>{block.text}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote className="fmt__quote">
          {block.lines.map((line, index) => <Line key={index} nodes={line} />)}
        </blockquote>
      );
    case 'heading':
      return <div className={`fmt__h fmt__h${block.level}`} role="heading" aria-level={block.level + 3}><Inline nodes={block.children} /></div>;
    case 'subtext':
      return <div className="fmt__subtext"><Inline nodes={block.children} /></div>;
    case 'list': {
      const Tag = block.ordered ? 'ol' : 'ul';
      return (
        <Tag className="fmt__list">
          {block.items.map((item, index) => (
            <li key={index} className={item.depth ? 'fmt__item fmt__item--nested' : 'fmt__item'}><Inline nodes={item.children} /></li>
          ))}
        </Tag>
      );
    }
    default:
      return (
        <p className="fmt__p">
          {block.lines.map((line, index) => <Line key={index} nodes={line} />)}
        </p>
      );
  }
}

/** One line of a paragraph or quote, ended by a line break unless it is the last. */
function Line({ nodes }) {
  return <span className="fmt__line"><Inline nodes={nodes} /></span>;
}

function Inline({ nodes }) {
  return nodes.map((node, index) => <Node key={index} node={node} />);
}

function Node({ node }) {
  switch (node.type) {
    case 'text':
      return node.text;
    case 'bold':
      return <strong><Inline nodes={node.children} /></strong>;
    case 'italic':
      return <em><Inline nodes={node.children} /></em>;
    case 'underline':
      return <u><Inline nodes={node.children} /></u>;
    case 'strike':
      return <s><Inline nodes={node.children} /></s>;
    case 'code':
      return <code className="fmt__code">{node.text}</code>;
    case 'spoiler':
      return <Spoiler><Inline nodes={node.children} /></Spoiler>;
    case 'link':
      return /^https?:\/\//.test(node.href)
        ? <a className="fmt__link" href={node.href} target="_blank" rel="noopener noreferrer">{node.text}</a>
        : node.text;
    case 'mention':
      return <Mention name={node.name} />;
    default:
      return null;
  }
}

function Mention({ name }) {
  const draw = useContext(MentionContext);
  return draw ? draw(name) : <span className="fmt__mention">@{name}</span>;
}

function Spoiler({ children }) {
  const [shown, setShown] = useState(false);
  return (
    <span
      className={`fmt__spoiler${shown ? ' is-shown' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={shown ? undefined : 'Spoiler, click to show'}
      aria-pressed={shown}
      onClick={() => setShown(true)}
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setShown(true); } }}
    >
      {children}
    </span>
  );
}
