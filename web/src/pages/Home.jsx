import Button from '../components/Button.jsx';
import Collapsible from '../components/Collapsible.jsx';
import { AvatarStack } from '../components/Avatar.jsx';
import { useWindowsDownload } from '../lib/useWindowsDownload.js';
import './Home.css';

const PREVIEW_PEOPLE = [
  { uid: 'kai', username: 'Kai' },
  { uid: 'dex', username: 'Dex' },
  { uid: 'rae', username: 'Rae' },
];

export default function Home() {
  const download = useWindowsDownload();

  return (
    <div className="home">
      <section className="home__hero">
        <h1 className="home__headline">
          Build a room.
          <br />
          Bring your people in.
        </h1>
        <p className="home__lead">A desktop workspace and social profile for gamers, creators and game builders.</p>
        <Button variant="primary" size="lg" href={download} icon="download">
          Get Mimyne for Windows
        </Button>
        <p className="home__small">Windows x64 · Updates itself</p>
      </section>

      <section className="home__preview" aria-label="A room in Mimyne">
        <div className="home__window">
          <div className="home__window-bar">
            <span className="home__window-name">Level 3 blockout</span>
            <span className="home__spacer" />
            <AvatarStack people={PREVIEW_PEOPLE} size={26} />
            <span className="muted home__here">3 here now</span>
          </div>
          <div className="home__canvas">
            <div className="home__note" style={{ left: '5%', top: '10%' }}>
              <span className="label">Note</span>
              <strong>Boss arena: sightlines</strong>
              <span className="muted">Move the east pillar 2m and test the dash again.</span>
            </div>
            <div className="home__media placeholder">[Clip or screenshot]</div>
            <div className="home__note home__note--shared" style={{ right: '5%', top: '34%' }}>
              <span className="label home__shared-label">Shared note · Kai</span>
              <span>Dash clears now. Ledge for phase two?</span>
            </div>
            <div className="home__cursor" aria-hidden="true">
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path d="M4 3l16 7-7 2-2 7z" fill="#f9a8d4" />
              </svg>
              <span>Rae</span>
            </div>
          </div>
        </div>
      </section>

      <section className="home__more">
        <Collapsible title="Workspaces" defaultOpen>
          <p>Rooms of notes, media, web pages and automations on one canvas. Invite people to view, add notes, or edit with you live.</p>
        </Collapsible>
        <Collapsible title="Post anything">
          <p>A feed for your Hubs and Buddies: words, clips, links and files. Comment, approve, message.</p>
        </Collapsible>
        <Collapsible title="Profiles">
          <p>A banner, your Medal clips, the song you're on, the game you're in, and the workspaces and Hubs you want seen.</p>
        </Collapsible>
        <Collapsible title="Hubs" badge="COMING NEXT">
          <p>Pledge to a crew and it sits in your notch. Its rooms are live workspaces, and anyone can look in before signing up.</p>
        </Collapsible>
      </section>
    </div>
  );
}
