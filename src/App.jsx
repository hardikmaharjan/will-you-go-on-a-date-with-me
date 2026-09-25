import { useEffect, useRef, useState } from 'react';
import AdminDashboard from './AdminDashboard.jsx';

const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

const hearts = Array.from({ length: 26 }, (_, index) => ({
  id: index,
  symbol: ['♥', '♡', '♥', '♡'][index % 4],
  left: `${3 + Math.random() * 94}%`,
  top: `${4 + Math.random() * 90}%`,
  size: `${11 + Math.random() * 20}px`,
  opacity: 0.18 + Math.random() * 0.35,
  duration: `${3.8 + Math.random() * 4}s`,
  delay: `${-Math.random() * 5}s`,
  drift: `${-12 + Math.random() * 24}px`,
  color: ['#e993a8', '#f0b49b', '#db8da4'][index % 3],
}));

function Bouquet() {
  return <img className="reference-bouquet" src="/lily-bouquet.png" alt="A colorful, hand-tied bouquet of lilies and small pastel flowers" />;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getSuggestedDays() {
  const today = new Date();
  const untilFriday = (5 - today.getDay() + 7) % 7 || 7;
  const friday = new Date(today.getFullYear(), today.getMonth(), today.getDate() + untilFriday, 12);
  return [0, 1, 2].map((offset) => {
    const date = new Date(friday.getFullYear(), friday.getMonth(), friday.getDate() + offset, 12);
    return {
      value: dateKey(date),
      weekday: new Intl.DateTimeFormat(undefined, { weekday: 'long' }).format(date),
      label: new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(date),
    };
  });
}

function prettyDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
    .format(new Date(`${value}T12:00:00`));
}

function InviteApp() {
  const [screen, setScreen] = useState('bouquet');
  const [escapeCount, setEscapeCount] = useState(0);
  const [celebration, setCelebration] = useState([]);
  const [activity, setActivity] = useState('');
  const [selectedDate, setSelectedDate] = useState('');
  const [customDayOpen, setCustomDayOpen] = useState(false);
  const [personalNote, setPersonalNote] = useState('I really enjoy spending time with you, and I’d love to get to know you even better.');
  const [suggestedDays] = useState(getSuggestedDays);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [submissionId] = useState(() => crypto.randomUUID());
  const musicRef = useRef(null);
  const noButtonRef = useRef(null);
  const zoneRef = useRef(null);

  useEffect(() => {
    document.title = screen === 'yes' || screen === 'done' ? 'Yay! It’s a date ♡' : 'A little question for you ♡';
  }, [screen]);

  function moveNoButton() {
    const zone = zoneRef.current?.getBoundingClientRect();
    const button = noButtonRef.current;
    if (!zone || !button) return;
    const bounds = button.getBoundingClientRect();
    const x = Math.round(Math.random() * Math.max(10, zone.width - bounds.width - 10));
    const y = Math.round(-22 + Math.random() * 46);
    button.classList.add('is-escaping');
    button.style.left = `${x}px`;
    button.style.top = `${y}px`;
    button.style.transform = `rotate(${Math.round(-8 + Math.random() * 16)}deg)`;
    setEscapeCount((count) => count + 1);
  }

  function sayYes() {
    setScreen('yes');
    setCelebration(Array.from({ length: 15 }, (_, id) => ({
      id,
      left: `${40 + Math.random() * 20}%`,
      top: `${45 + Math.random() * 10}%`,
      size: `${18 + Math.random() * 20}px`,
      duration: `${1 + Math.random() * 2}s`,
      drift: `${-100 + Math.random() * 200}px`,
    })));
  }

  const escapeLines = [
    'Nice try, but it is feeling extra shy!',
    'It seems to have somewhere else to be…',
    'That answer is playing hard to get.',
    'Maybe it just needs a little encouragement!',
  ];

  function acceptBouquet() {
    const music = musicRef.current;
    if (music) {
      music.volume = 0.4;
      music.play().catch(() => {});
    }
    setScreen('invite');
  }

  async function submitPlan() {
    setIsSubmitting(true);
    setSubmissionError('');
    try {
      const response = await fetch(`${apiBaseUrl}/api/plans`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId, activity, date: selectedDate, note: personalNote }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Could not save the plan. Please try again.');
      setHasSubmitted(true);
      setScreen('done');
    } catch (error) {
      setSubmissionError(error.message || 'Could not reach the server. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page-shell">
      <audio ref={musicRef} src="/background-music.mp3" loop preload="auto" />
      <div className="sun-glow glow-one" />
      <div className="sun-glow glow-two" />
      <div className="heart-field" aria-hidden="true">
        {hearts.map((heart) => <span key={heart.id} className="floating-heart" style={{ left: heart.left, top: heart.top, '--size': heart.size, '--opacity': heart.opacity, '--duration': heart.duration, '--delay': heart.delay, '--drift': heart.drift, '--color': heart.color }}>{heart.symbol}</span>)}
        {celebration.map((heart) => <span key={`yay-${heart.id}`} className="floating-heart" aria-hidden="true" style={{ left: heart.left, top: heart.top, '--size': heart.size, '--duration': heart.duration, '--drift': heart.drift, '--color': '#dd6f8b' }}>♥</span>)}
      </div>

      {screen === 'bouquet' && <section className="bouquet-card" aria-labelledby="bouquetTitle">
        <div className="top-note"><span>something small, just for you</span> <b>♡</b></div>
        <div className="bouquet-art"><Bouquet /></div>
        <p className="eyebrow">a little bouquet of lilies</p>
        <h1 id="bouquetTitle">For you, <em>with love.</em></h1>
        <p className="subcopy">A few lilies to make you smile.<br />Will you accept them?</p>
        <button className="yes-button accept-button" onClick={acceptBouquet}>I’d love to <span>♡</span></button>
        <p className="tiny-note">tap to unwrap your surprise</p>
      </section>}

      {screen === 'invite' && <section className="invite-card" aria-labelledby="dateTitle">
        <div className="top-note"><span>made with a whole lot of</span> <b>♡</b></div>
        <div className="heart-orbit" aria-hidden="true"><span className="orbit-heart heart-a">♥</span><span className="orbit-heart heart-b">♥</span><span className="orbit-heart heart-c">♥</span><div className="main-heart">♥</div></div>
        <p className="eyebrow">a tiny question for you</p>
        <h1 id="dateTitle">Would you go on<br /><em>a date with me?</em></h1>
        <p className="subcopy">I promise good conversation, lots of laughs,<br />and maybe your favourite dessert.</p>
        <div className="button-zone" id="buttonZone" ref={zoneRef}>
          <button className="yes-button" onClick={sayYes}>Yes, absolutely! <span>♡</span></button>
          <button className="no-button" ref={noButtonRef} aria-label="No, but this button is feeling shy" onMouseEnter={moveNoButton} onFocus={moveNoButton} onClick={(event) => { event.preventDefault(); moveNoButton(); }}>No</button>
        </div>
        <p className="tiny-note">{escapeCount ? escapeLines[(escapeCount - 1) % escapeLines.length] : 'P.S. The “no” button is a little shy.'}</p>
      </section>}

      {screen === 'yes' && <section className="yes-card" aria-live="polite">
        <div className="celebration-hearts" aria-hidden="true">♥ ♡ ♥ ♡ ♥</div>
        <p className="eyebrow">best. answer. ever.</p>
        <h1>Yay! It’s a date <em>♡</em></h1>
        <p className="subcopy">I’m already looking forward to it.<br />Let’s pick something fun together.</p>
        <div className="sparkle-line"><span>✦</span><i /><span>✦</span></div>
        <button className="yes-button flow-continue" onClick={() => setScreen('activity')}>Let’s plan it <span>♡</span></button>
      </section>}

      {screen === 'activity' && <section className="flow-card" aria-labelledby="activityTitle">
        <p className="step-label">01 <i /> 03 &nbsp; · &nbsp; THE DATE</p>
        <p className="eyebrow">first, pick your vibe</p>
        <h1 id="activityTitle">What sounds <em>lovely?</em></h1>
        <p className="subcopy">Choose the kind of date you’d enjoy most.</p>
        <div className="choice-grid" role="group" aria-label="Date activity">
          {[
            { name: 'Coffee', icon: '☕', detail: 'A cozy café & a long chat' },
            { name: 'Dinner', icon: '🍝', detail: 'Something delicious together' },
            { name: 'Picnic', icon: '🧺', detail: 'Fresh air & little treats' },
          ].map((option) => <button key={option.name} className={`choice-card${activity === option.name ? ' is-selected' : ''}`} aria-pressed={activity === option.name} onClick={() => setActivity(option.name)}>
            <span className="choice-icon" aria-hidden="true">{option.icon}</span>
            <span className="choice-name">{option.name}</span>
            <span className="choice-detail">{option.detail}</span>
          </button>)}
        </div>
        <div className="flow-actions"><button className="text-button" onClick={() => setScreen('yes')}>← Back</button><button className="yes-button" disabled={!activity} onClick={() => setScreen('day')}>Pick a day <span>♡</span></button></div>
      </section>}

      {screen === 'day' && <section className="flow-card" aria-labelledby="dayTitle">
        <p className="step-label">02 <i /> 03 &nbsp; · &nbsp; WHEN WORKS?</p>
        <p className="eyebrow">save a little time for us</p>
        <h1 id="dayTitle">Pick a <em>day.</em></h1>
        <p className="subcopy">Here are a few upcoming options—choose one that works.</p>
        <div className="day-grid" role="group" aria-label="Suggested dates">
          {suggestedDays.map((day) => <button key={day.value} className={`day-card${selectedDate === day.value ? ' is-selected' : ''}`} aria-pressed={selectedDate === day.value} onClick={() => { setSelectedDate(day.value); setCustomDayOpen(false); }}>
            <span>{day.weekday}</span><strong>{day.label}</strong>
          </button>)}
          <button className={`day-card another-day${customDayOpen ? ' is-selected' : ''}`} aria-expanded={customDayOpen} onClick={() => { setCustomDayOpen(true); setSelectedDate(''); }}><span>Something else?</span><strong>Suggest another day</strong></button>
        </div>
        {customDayOpen && <label className="date-picker-label">Choose a date<input type="date" min={dateKey(new Date())} value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /></label>}
        <div className="flow-actions"><button className="text-button" onClick={() => setScreen('activity')}>← Back</button><button className="yes-button" disabled={!selectedDate} onClick={() => setScreen('note')}>Add a note <span>♡</span></button></div>
      </section>}

      {screen === 'note' && <section className="flow-card" aria-labelledby="noteTitle">
        <p className="step-label">03 <i /> 03 &nbsp; · &nbsp; A LITTLE NOTE</p>
        <p className="eyebrow">make it personal</p>
        <h1 id="noteTitle">One more <em>thing…</em></h1>
        <p className="subcopy">Here’s a little note for them. Make it sound like you.</p>
        <label className="note-label" htmlFor="personalNote">Your message</label>
        <textarea id="personalNote" className="personal-note" maxLength={180} value={personalNote} onChange={(event) => setPersonalNote(event.target.value)} />
        <p className="character-count">{personalNote.length}/180</p>
        {submissionError && <p className="submission-error" role="alert">{submissionError}</p>}
        <div className="flow-actions"><button className="text-button" onClick={() => setScreen('day')}>← Back</button><button className="yes-button" disabled={isSubmitting} onClick={submitPlan}>{isSubmitting ? 'Sending…' : 'Send our plan'} <span>♡</span></button></div>
      </section>}

      {screen === 'done' && <section className="flow-card final-plan" aria-labelledby="planTitle" aria-live="polite">
        <div className="celebration-hearts" aria-hidden="true">♥ ♡ ♥</div>
        <p className="eyebrow">it’s a date!</p>
        <h1 id="planTitle">Our little <em>plan.</em></h1>
        <div className="plan-summary">
          <div><span>THE DATE</span><strong>{activity}</strong></div>
          <div><span>THE DAY</span><strong>{prettyDate(selectedDate)}</strong></div>
          <blockquote>“{personalNote}”</blockquote>
        </div>
        {hasSubmitted && <p className="submission-success" role="status">Your plan has been sent ♡</p>}
        <p className="subcopy">Can’t wait to spend time with you ♡</p>
        <button className="text-button edit-plan" onClick={() => setScreen('activity')}>Change our plan</button>
      </section>}
    </main>
  );
}

function App() {
  return window.location.pathname === '/admin' ? <AdminDashboard /> : <InviteApp />;
}

export default App;
