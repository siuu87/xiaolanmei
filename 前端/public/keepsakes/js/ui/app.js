// Companion Keepsakes — the playable flow.
// Four ways to make something:
//   half each (companion): it seals its half first -> you make yours -> Open Together -> reveal -> keep
//   a gift (gift):         it makes and seals the whole thing -> you unwrap it -> reveal -> keep
//   slowly (solo):         you choose everything -> hold to finish -> it takes shape (reveal) -> keep
//   lucky (lucky):         everything is drawn at random, shown at once -> change what you like -> finish -> keep
import { newRound, sealHuman, sealSolo, readAiCode, acceptAi, roundFromAi, roundFromGift, drawAll, status, mergeRound, invitation, revealCard } from '../engine/round.js';
import { toLink, fromLink, toKeepsake } from '../engine/keepsake.js';
import { softDecode, toB64url, fromB64url } from '../engine/codec.js';
import { recipeByCode, recipes } from '../recipes/index.js';
import { loc } from '../recipes/loc.js';
import { store } from './store.js';
import { t, setLang, lang } from './i18n.js';
import { PROTOCOL_URL, SITE_URL, REPO_URL } from '../config.js';
import { openGreetingCards, preloadCardFonts } from './card.js';
import { sealSVG } from './seal.js';

const app = document.getElementById('app');
const stageHost = document.getElementById('stage');
const params = new URLSearchParams(location.search);
const EMBED = params.get('embed');               // "view" (read-only, e.g. inside a cabinet) or "play"
const HOST = safeOrigin(params.get('host'));     // a parent page that wants the keepsake when it is kept
const here = () => location.origin + location.pathname;
const site = () => (location.protocol.startsWith('http') && !/localhost|127\.0\.0\.1/.test(location.host)) ? here() : SITE_URL;
setLang(params.get('lang') || store.lang());

// Hosts may prefill the two names (e.g. ?you=Mira&companion=Orin); the person can still change them.
{ const you = (params.get('you') || '').slice(0, 24), comp = (params.get('companion') || '').slice(0, 24); const n = store.names();
  if (you && !n.human) store.setNames({ human: you }); if (comp && !n.ai) store.setNames({ ai: comp }); }

const ORDER = ['planet1', 'globe1', 'talisman1'];
const MODES = [
  { key: 'companion', group: 'withAI', icon: null }, { key: 'gift', group: 'withAI', icon: null },
  { key: 'solo', group: 'mine', icon: null }, { key: 'lucky', group: 'mine', icon: null }
];
const MINUTES = { planet1: 5, globe1: 4, talisman1: 4 };

/* ------------------------------------------------------------------ tiny DOM helpers */
function h(tag, attrs = {}, ...kids) {
  const [name, ...cls] = tag.split('.');
  const n = document.createElement(name || 'div');
  if (cls.length) n.className = cls.join(' ');
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) n.addEventListener(ev, fn);
    else if (k === 'class') n.className += ' ' + v;
    else if (k === 'style') n.style.cssText = v;
    else if (k === 'html') n.innerHTML = v; // only for our own static markup
    else n.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(3)) if (k != null && k !== false) n.append(k.nodeType ? k : document.createTextNode(String(k)));
  return n;
}
function put(node, ...kids) { node.append(...kids.flat(3).filter(k => k != null && k !== false)); return node; }
function screen(...kids) { document.querySelectorAll('.sheet').forEach(x => x.remove()); unframe(); const s = h('section.screen', {}, ...kids); app.replaceChildren(s); window.scrollTo(0, 0); return s; }
// While a 3D view is up, the object is framed in the space the overlays leave free (it glides as a card grows or shrinks).
let framing = null;
function frameAround(top, bottom, { topShare = 0.75 } = {}) {
  unframe();
  if (!stage) return;
  const upd = () => {
    const H = window.innerHeight || 1;
    const tb = top?.isConnected ? top.getBoundingClientRect().bottom : 0;
    const bt = bottom?.isConnected && bottom.offsetHeight ? H - bottom.getBoundingClientRect().top : 0;
    stage?.setInsets({ top: Math.max(0, tb) * topShare, bottom: Math.max(0, bt) + 4 });
  };
  const ro = new ResizeObserver(upd);
  [top, bottom].filter(Boolean).forEach(el => ro.observe(el));
  window.addEventListener('resize', upd);
  upd();
  framing = () => { ro.disconnect(); window.removeEventListener('resize', upd); };
}
function unframe() { framing?.(); framing = null; stage?.setInsets({}, { instant: true }); }
function toast(msg) { document.querySelectorAll('.toast').forEach(x => x.remove()); const t2 = h('div.toast', { role: 'status' }, msg); document.body.append(t2); setTimeout(() => t2.remove(), 2600); }
async function copy(text, done) {
  try { await navigator.clipboard.writeText(text); toast(done); }
  catch { const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); toast(done); }
}
function safeOrigin(s) { try { const u = new URL(s); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch { return null; } }
const fmtDate = iso => { const d = new Date(iso); if (!Number.isFinite(d.getTime())) return ''; return lang() === 'zh' ? `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日` : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); };
const fmtTime = iso => { const d = new Date(iso); return Number.isFinite(d.getTime()) ? d.toLocaleString(lang() === 'zh' ? 'zh-CN' : 'en-GB', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
const setHash = hash => history.replaceState(null, '', location.pathname + location.search + hash);
const names = () => { const n = store.names(); return { human: n.human || t('you2'), ai: n.ai || t('companionDefault') }; };
const isSolo = r => r?.mode === 'solo';
const isGift = r => r?.mode === 'gift';
const oneMaker = r => isSolo(r) || isGift(r);
// The merged spec, with a localised fallback title for an unnamed piece.
const merged = round => { const spec = mergeRound(round), l = L(recipeByCode(round.recipe)); if (!spec.words.length && l.untitled) spec.title = l.untitled; return spec; };
const L = R => loc(R, lang());
const CJK = /[⺀-鿿]/;

/* ------------------------------------------------------------------ hold-to-confirm */
function holdButton(label, { ms = 1100, side = '', onDone }) {
  const C = 2 * Math.PI * 64;
  const b = h('button.hold', { type: 'button', class: side, 'aria-label': label },
    h('span', { html: `<svg viewBox="0 0 132 132"><circle class="track" cx="66" cy="66" r="64"/><circle class="fill" cx="66" cy="66" r="64"/></svg>` }).firstChild,
    h('span.face', {}, label));
  const fill = b.querySelector('circle.fill');
  fill.style.strokeDasharray = C; fill.style.strokeDashoffset = C;
  let t0 = 0, raf = 0, done = false;
  const tick = () => { const k = Math.min(1, (performance.now() - t0) / ms); fill.style.strokeDashoffset = C * (1 - k); if (k >= 1) { finish(); return; } raf = requestAnimationFrame(tick); };
  const start = e => { if (done) return; e.preventDefault(); t0 = performance.now(); b.classList.add('is-holding'); navigator.vibrate?.(8); raf = requestAnimationFrame(tick); };
  const stop = () => { if (done) return; cancelAnimationFrame(raf); b.classList.remove('is-holding'); fill.style.strokeDashoffset = C; };
  const finish = () => { done = true; cancelAnimationFrame(raf); navigator.vibrate?.([12, 40, 18]); onDone(); };
  b.addEventListener('pointerdown', start); b.addEventListener('pointerup', stop); b.addEventListener('pointerleave', stop); b.addEventListener('pointercancel', stop);
  b.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); finish(); } });
  b.addEventListener('contextmenu', e => e.preventDefault());
  return b;
}

/* ------------------------------------------------------------------ wax seal */
// A pressed wax seal carrying the fingerprint of what was sealed (rose wax for the person, blue for the companion).
const WAX = { human: '#C4697F', ai: '#6F82BE' };
function wax(fp, who, side, { stamp = false, size = 120 } = {}) {
  const svg = sealSVG({ color: WAX[side] || WAX.human, text: fp, sub: who, seed: fp + side });
  return h('div.wax', { class: side + (stamp ? ' stamp' : ''), style: `--s:${size}px`, role: 'img', 'aria-label': `${fp} · ${who}` }, h('span', { html: svg }).firstChild);
}

/* ------------------------------------------------------------------ router */
async function route() {
  const raw = softDecode(location.hash.slice(1));
  stageHost.classList.add('hidden');
  if (raw.startsWith('ai~')) return handleAi(raw);
  if (raw.startsWith('k=')) { const r = fromLink(raw); return r ? explore(r, { visiting: true }) : home(t('badKeepsake')); }
  if (raw.startsWith('m=')) return importMine(raw.slice(2));
  if (raw.startsWith('r=')) { const r = store.round(raw.slice(2)); return r ? resume(r) : home(t('roundMissing')); }
  if (raw === 'shelf') return shelf();
  if (raw.startsWith('new=')) return begin(raw.slice(4));
  return home();
}
window.addEventListener('hashchange', route);

function resume(r) {
  setHash('#r=' + r.id);
  const st = status(r);
  if (st === 'choosing' && r.lucky) return lucky(r);
  if (st === 'choosing' || st === 'waiting-human') return choose(r);
  if (st === 'waiting-ai') return waiting(r);
  if (st === 'ready') return isSolo(r) ? reveal(r) : isGift(r) ? giftArrived(r) : arrived(r);
  return explore(r);
}
function begin(code, mode = store.mode()) {
  const R = recipeByCode(code) || recipes.planet1;
  if (mode === 'solo' || mode === 'lucky') {
    const r = newRound({ recipe: R.code, mode: 'solo', names: { human: store.names().human || '' } });
    if (mode === 'lucky') {
      const d = drawAll(R.code, r.id);
      Object.assign(r, { lucky: true, draft: { picks: d.picks, drawn: d.drawn, lines: {}, name: '', why: '', wish: '' } });
      store.saveRound(r);
      return lucky(r);
    }
    store.saveRound(r);
    return choose(r);
  }
  if (mode === 'gift') return askGift(R.code);
  return startWithAI(R.code);
}

/* ------------------------------------------------------------------ a gift: the AI companion makes the whole thing */
function askGift(code) {
  const R = recipeByCode(code) || recipes.planet1, l = L(R);
  const aboutIn = h('input.input', { maxlength: 140, placeholder: t('giftAboutPh') });
  const message = () => t('giftMsg', { noun: l.noun, repo: REPO_URL }) + (aboutIn.value.trim() ? '\n' + t('giftAbout', { theme: aboutIn.value.trim() }) : '');
  const msgBox = h('pre.invite.ask', {}, message());
  aboutIn.addEventListener('input', () => { msgBox.textContent = message(); });
  const paste = h('textarea.input', { placeholder: t('pastePh'), 'aria-label': t('pasteHead') });
  screen(
    h('div.eyebrow', {}, `${l.title} · ${t('modeGift')}`),
    h('h1.display', {}, t('giftStartTitle', { noun: l.noun, ai: names().ai })),
    h('ol.steps-guide', {},
      h('li', {}, h('b', {}, t('step1')),
        h('div.field', { style: 'margin:10px 0' }, h('label', {}, t('giftAboutAsk')), aboutIn),
        msgBox,
        h('div.row', { style: 'margin-top:10px' }, h('button.btn.primary', { type: 'button', on: { click: () => copy(message(), t('askCopied')) } }, t('copyAsk')))),
      h('li', {}, h('b', {}, t('giftStep2'))),
      h('li', {}, h('b', {}, t('giftStep3')),
        h('div.stack', { style: 'margin-top:10px' }, paste, h('button.btn', { type: 'button', on: { click: () => takeCode(paste.value) } }, t('open'))))),
    h('div.dock', {}, h('div.inner', {}, h('button.btn.ghost', { type: 'button', on: { click: () => home() } }, t('back'))))
  );
}

function giftArrived(round) {
  setHash('#r=' + round.id);
  const R = recipeByCode(round.recipe), l = L(R), ai = round.names.ai;
  screen(
    h('div.eyebrow.center', {}, `${l.title} · ${t('giftFrom', { ai })}`),
    h('div.gift-art', { html: GIFT_ART }),
    h('h1.display.center', {}, t('giftTitle', { ai, noun: l.noun })),
    h('p.lede.center', {}, t('giftLede')),
    round.theme ? h('p.quote.center', {}, round.theme) : null,
    h('div.seals', {}, h('figure', {}, wax(round.ai.fp, ai, 'ai', { stamp: true, size: 96 }))),
    ...(round.ai.warnings || []).map(w => h('p.note.center', {}, w)),
    h('div.hold-wrap', {}, holdButton(t('unwrap'), { side: 'ai', ms: 1200, onDone: () => reveal(round) }), h('small', {}, t('unwrapNote'))),
    h('div.dock', {}, h('div.inner', {}, h('button.btn.ghost', { type: 'button', on: { click: () => home() } }, t('later'))))
  );
}

/* ------------------------------------------------------------------ lucky: drawn at random, shown at once, then changed by hand */
async function lucky(round) {
  const R = recipeByCode(round.recipe), l = L(R);
  setHash('#r=' + round.id);
  const draft = round.draft;
  draft.drawn ||= [];
  const save = () => { round = { ...round, draft }; store.saveRound(round); };
  const nm = () => store.names().human || '';
  const previewRound = () => sealSolo({ ...round, human: null, names: { human: nm(), ai: nm() } }, draft);
  app.replaceChildren();
  const st = await getStage();
  let first = true, lastSpec = null;
  const chips = h('div.chips', { role: 'list' });
  const top = h('div.over.top-bar', {},
    h('div.title-plate', {}, h('div.eyebrow', {}, t('luckyEyebrow', { title: l.title })), h('h1', {}, t('luckyTitle')), h('p', {}, t('luckyLede'))),
    h('button.iconbtn', { type: 'button', 'aria-label': t('home'), on: { click: () => { stageHost.classList.add('hidden'); stage?.pause(); home(); } } }, '✕'));
  const panel = h('div.over.lucky-panel', {}, h('div.inner', {}, chips,
    h('div.row.lucky-actions', {},
      h('button.btn', { type: 'button', on: { click: () => { const d = drawAll(R.code); draft.picks = d.picks; draft.drawn = d.drawn; save(); navigator.vibrate?.(8); rebuild(); } } }, h('span', { html: ICON_DICE_SMALL }), t('reroll')),
      h('button.btn.primary', { type: 'button', on: { click: () => finishSheet() } }, t('keepIt')))));
  app.replaceChildren(top, panel);
  frameAround(top, panel, { topShare: 0.6 });

  async function rebuild() {
    const r = previewRound(), spec = merged(r);
    lastSpec = spec;
    const p = await buildWorld(st, R, spec, r);
    p.revealAll();
    st.setWorld(p, { keepRotation: !first }); first = false;
    st.autoSpin = 0.1;
    st.backdrop(spec.palette.bg, spec.palette.dark, round.id, spec.palette.ink);
    stageHost.querySelector('.stage-ornament').style.opacity = '1';
    [top, panel].forEach(n => n.classList.toggle('on-dark', spec.palette.dark));
    st.onPick = what => { const x = spec.ledger.find(e => (e.pick || e.slot) === what); if (x) { const k = keyOfLedger(x); if (k) slotSheet(k); } };
    renderChips();
  }
  // which solo key a ledger entry came from (a shared slot's second pick is '<slot>#2')
  const keyOfLedger = x => !R.shared.includes(x.slot) ? x.slot : (x.by === 'human' ? x.slot : x.slot + '#2');
  function renderChips() {
    chips.replaceChildren(...R.soloOrder.map(k => {
      const slot = k.replace(/#\d$/, ''), o = R.option(slot, draft.picks[k]), z = l.opt(slot, o), drawn = draft.drawn.includes(k);
      return h('button.chip', { type: 'button', role: 'listitem', class: drawn ? 'drawn' : 'mine', on: { click: () => slotSheet(k) } },
        swatch(o), h('span.chip-text', {}, h('small', {}, l.slotTitle(slot) + (k.endsWith('#2') ? ' ²' : '')), h('b', {}, z.name)));
    }));
  }
  function slotSheet(k) {
    const slot = k.replace(/#\d$/, ''), S = R.slots[slot];
    const s = sheet(
      h('div.eyebrow', {}, draft.drawn.includes(k) ? t('drawnTag') : t('chosenTag')),
      h('h2', {}, l.slotPrompt(slot)),
      h('div.options.compact', { class: 'human' }, S.options.map((o, i) => [
        S.grouped && o.group !== S.options[i - 1]?.group ? h('div.opt-group', {}, l.group(o.group)) : null,
        h('button.opt', { type: 'button', 'aria-pressed': String(draft.picks[k] === o.n), on: { click: () => { draft.picks[k] = o.n; draft.drawn = draft.drawn.filter(x => x !== k); save(); s.close(); rebuild(); } } },
          swatch(o), h('span.num', {}, o.n), h('b', {}, l.opt(slot, o).name), h('span', {}, l.opt(slot, o).meaning), o.month ? h('em.month', {}, l.month(o.month)) : null)])),
      h('div.row', { style: 'margin-top:14px' }, h('button.btn', { type: 'button', on: { click: () => {
        const list = S.options.filter(o => o.n !== draft.picks[k]);
        draft.picks[k] = list[Math.floor(Math.random() * list.length)].n;
        if (!draft.drawn.includes(k)) draft.drawn.push(k);
        save(); s.close(); rebuild();
      } } }, h('span', { html: ICON_DICE_SMALL }), t('rerollOne'))));
    s.panel.classList.add('tall');
  }
  function finishSheet() {
    const f = (key, label, hint, max, area, ph, get, set) => h('div.field', {}, h('label', {}, label),
      h(area ? 'textarea.input' : 'input.input', { maxlength: max, placeholder: ph || null, value: area ? null : get(), on: { input: e => { set(e.target.value); save(); } } }, area ? get() : null),
      hint ? h('small', {}, hint) : null);
    const s = sheet(
      h('div.eyebrow', {}, l.title),
      h('h2', {}, t('luckyWordsTitle')),
      h('p.note', {}, t('luckyWordsLede')),
      h('div.stack', {},
        f('name', t('soloName'), '', 40, false, t('soloNamePh'), () => draft.name || '', v => { draft.name = v; }),
        ...Object.keys(R.halves).map(hf => f('line-' + hf, l.lineLabel(hf), l.lineHint(hf), R.text.line.max, true, '', () => draft.lines[hf] || '', v => { draft.lines[hf] = v; })),
        f('wish', t('soloWish'), t('soloWishHint'), R.text.wish.max, true, '', () => draft.wish || '', v => { draft.wish = v; })),
      h('div.hold-wrap', { class: 'human' }, holdButton(t('holdFinish'), { side: 'human', onDone: () => { s.close(); finish(); } }), h('small', {}, t('finishNote'))));
    s.panel.classList.add('tall');
  }
  function finish() {
    try {
      const r = sealSolo({ ...round, human: null, names: { human: nm(), ai: nm() } }, draft);
      delete r.draft; delete r.step;
      r.openedAt = new Date().toISOString();
      store.saveRound(r);
      unframe();
      // a short seal over the thing itself; they have already watched it take shape
      const stampEl = h('div.over.stamp-over', {}, wax(r.human.fp, nm() || '✦', 'human', { stamp: true, size: 112 }), h('p.hand', {}, t('soloSealed')));
      app.replaceChildren(stampEl);
      setTimeout(() => explore(r), 1300);
    } catch (e) { toast(e.message); }
  }
  rebuild();
}

/* ------------------------------------------------------------------ with an AI companion: the simple way (it goes first) */
function startWithAI(code) {
  const R = recipeByCode(code) || recipes.planet1, l = L(R);
  const repo = REPO_URL;
  const momentIn = code === 'globe1' ? h('input.input', { maxlength: 140, placeholder: l.themePrompt(false)?.placeholder || '' }) : null;
  const message = () => t('askMsg', { noun: l.noun, repo }) + (momentIn?.value.trim() ? '\n' + t('askMoment', { theme: momentIn.value.trim() }) : '');
  const msgBox = h('pre.invite.ask', {}, message());
  momentIn?.addEventListener('input', () => { msgBox.textContent = message(); });
  const paste = h('textarea.input', { placeholder: t('pastePh'), 'aria-label': t('pasteHead') });
  screen(
    h('div.eyebrow', {}, l.title),
    h('h1.display', {}, t('startTitle', { noun: l.noun })),
    h('ol.steps-guide', {},
      h('li', {}, h('b', {}, t('step1')),
        momentIn ? h('div.field', { style: 'margin:10px 0' }, h('label', {}, t('momentAsk')), momentIn) : null,
        msgBox,
        h('div.row', { style: 'margin-top:10px' }, h('button.btn.primary', { type: 'button', on: { click: () => copy(message(), t('askCopied')) } }, t('copyAsk')))),
      h('li', {}, h('b', {}, t('step2'))),
      h('li', {}, h('b', {}, t('step3')),
        h('div.stack', { style: 'margin-top:10px' }, paste, h('button.btn', { type: 'button', on: { click: () => takeCode(paste.value) } }, t('addHalf'))))),
    h('div.advanced', {}, h('span.note', {}, t('advanced')), ' ', h('button.linkish', { type: 'button', on: { click: () => chooseHalf(R.code) } }, t('advancedBtn'))),
    h('div.dock', {}, h('div.inner', {}, h('button.btn.ghost', { type: 'button', on: { click: () => home() } }, t('back'))))
  );
}

/* ------------------------------------------------------------------ home */
function home(error) {
  setHash('');
  const mode = store.mode();
  const n = store.names();
  const nameIn = (k, label, ph) => h('div.field', {}, h('label', { for: 'n-' + k }, label),
    h('input.input', { id: 'n-' + k, value: n[k] || '', placeholder: ph, maxlength: 24, on: { change: e => store.setNames({ [k]: e.target.value.trim() }) } }));
  const pending = store.rounds().filter(r => !r.openedAt && (r.human || r.ai || r.draft));
  const kept = store.shelf().length;
  const modeBtn = m => h('button.mode-btn', { type: 'button', 'aria-pressed': String(mode === m.key), on: { click: () => { store.setMode(m.key); home(); } } },
    h('span.mode-icon', { html: m.icon }), h('span.mode-text', {}, h('b', {}, t('modeName.' + m.key)), h('small', {}, t('modeSub.' + m.key))));
  const withAI = mode === 'companion' || mode === 'gift';
  const paste = h('input.input', { placeholder: t('pastePh'), 'aria-label': t('pasteHead') });
  screen(
    h('header.topline', {},
      h('div.brand', {}, h('b', {}, t('brand')), h('span.hand', {}, t('brandHand'))),
      h('button.lang', { type: 'button', on: { click: () => { const l = lang() === 'zh' ? 'en' : 'zh'; store.setLang(l); setLang(l); home(); } } }, t('langSwitch'))),
    h('div.hero', {},
      h('span.hero-orn', { html: ORNAMENT }),
      h('h1.display.hero-title', {}, t('heroTitle')),
      h('p.lede', {}, t('heroLede'))),
    error ? h('p.warn', {}, error) : null,
    h('div.modes', {},
      h('div.eyebrow', {}, t('modeQ')),
      h('div.mode-grid', {}, ['withAI', 'mine'].map(g => h('div.mode-group', {},
        h('div.mode-group-title', {}, t('group.' + g)),
        h('div.mode-row', {}, MODES.filter(m => m.group === g).map(modeBtn))))),
      h('p.mode-note', {}, t('modeNote.' + mode))),
    withAI
      ? h('div.names', {}, nameIn('human', t('you'), t('yourNamePh')), nameIn('ai', t('companion'), t('companionPh')))
      : h('div.names.one', {}, nameIn('human', t('yourName'), t('yourNamePh'))),
    h('div.section-head', {}, h('span.hand', {}, t('recipesHead'))),
    h('div.recipes', {}, ORDER.map((code, i) => recipeCard(code, i, mode))),
    withAI ? h('div.paste', {}, h('div.eyebrow', {}, t('pasteHead')), h('div.row', {}, paste, h('button.btn.small', { type: 'button', on: { click: () => takeCode(paste.value) } }, t('open')))) : null,
    h('div.row.shelf-link', {}, h('button.btn.ghost', { type: 'button', on: { click: () => { location.hash = 'shelf'; } } }, h('span', { html: ICON_CABINET }), kept ? t('shelfCount', { n: kept }) : t('shelf'))),
    pending.length ? h('div.pending', {}, h('div.eyebrow', {}, t('inProgress')), h('ul', {}, pending.map(r => {
      const R = recipeByCode(r.recipe);
      const st = status(r), nm = r.names?.ai || names().ai;
      return h('li', {},
        h('span', {}, h('b', {}, L(R).title), ' · ', r.lucky ? t('stLucky') : isSolo(r) ? t('st.choosing') : isGift(r) ? t('stGift', { ai: nm }) : t('st.' + st, { ai: nm })),
        h('button.btn.small', { type: 'button', on: { click: () => resume(r) } }, t('continue')));
    }))) : null,
    h('footer.foot', {}, h('span', {}, t('footer')), ' · ', h('a', { href: REPO_URL, target: '_blank', rel: 'noopener' }, t('footerLink')))
  );
}

function recipeCard(code, i, mode) {
  const R = recipeByCode(code), l = L(R);
  return h('button.invite-card', { type: 'button', style: `--i:${i}`, 'data-recipe': code, on: { click: () => { location.hash = 'new=' + code; } } },
    h('span.tape', { 'aria-hidden': 'true' }),
    h('span.arch', { html: ART[code] }),
    h('span.card-body', {},
      h('span.hand', {}, l.hand),
      h('h3', {}, l.title),
      h('p', {}, mode === 'gift' ? l.tagline : l.card(mode === 'solo' || mode === 'lucky')),
      h('span.card-foot', {}, h('span.begin', {}, t(mode === 'gift' ? 'beginGift' : mode === 'lucky' ? 'beginLucky' : 'begin'), ' →'),
        h('span.meta', {}, mode === 'gift' ? t('metaGift') : mode === 'lucky' ? t('metaLucky') : t('minutes', { n: MINUTES[code] })))));
}

function takeCode(text) {
  const s = softDecode(String(text || ''));
  const ai = s.match(/ai~[^\s)>\]"']+/);
  if (ai) return handleAi(ai[0]);
  const k = s.match(/k=[A-Za-z0-9_-]+/);
  if (k) { const r = fromLink(k[0]); if (r) return explore(r, { visiting: true }); }
  toast(t('noCode'));
}

/* ------------------------------------------------------------------ choosing (companion: one half; solo: everything) */
function chooseHalf(code) {
  const R = recipeByCode(code) || recipes.planet1, l = L(R);
  const n = names();
  const tp = l.themePrompt(false) || { label: '', placeholder: '' };
  screen(
    h('div.eyebrow', {}, l.title),
    h('h1.display', {}, t('whichHalf')),
    h('p.lede', {}, t('whichHalfLede', { ai: n.ai })),
    h('div.options.halves', {}, Object.keys(R.halves).map(half => h('button.opt', { type: 'button', class: 'human', on: { click: () => start(half) } },
      h('b', {}, l.halfTitle(half)), h('span', {}, l.halfBlurb(half) + (l.sharedBlurb ? (lang() === 'zh' ? '，' : ', ') + l.sharedBlurb : ''))))),
    h('div.field', {}, h('label', { for: 'theme' }, tp.label), h('input.input', { id: 'theme', maxlength: 140, placeholder: tp.placeholder }), h('small', {}, t('themeShared', { ai: n.ai }))),
    h('div.dock', {}, h('div.inner', {}, h('button.btn.ghost', { type: 'button', on: { click: () => home() } }, t('back'))))
  );
  function start(half) {
    const r = newRound({ recipe: R.code, humanHalf: half, theme: document.getElementById('theme').value, names: names() });
    store.saveRound(r);
    choose(r);
  }
}

function choose(round) {
  const R = recipeByCode(round.recipe), l = L(R);
  const solo = isSolo(round);
  const half = round.humanHalf;
  const keys = solo ? R.soloOrder : R.slotsOf(half);
  const draft = round.draft || { picks: {}, word: '', line: '', why: '', wish: '', name: '', lines: {}, theme: round.theme || '' };
  draft.lines ||= {};
  const steps = [...keys, 'words', 'review'];
  let i = Math.min(round.step || 0, steps.length - 1);
  const save = () => store.saveRound({ ...round, draft, step: i });
  setHash('#r=' + round.id);

  function render() {
    const step = steps[i];
    const bar = h('div.steps', { class: 'human' }, steps.map((_, k) => h('i', { class: k <= i ? 'on' : '' })));
    const head = h('div', {},
      h('div.eyebrow', {}, solo ? t('soloEyebrow', { title: l.title }) : t('yourHalfEyebrow', { half: l.halfTitle(half), id: round.id })), bar,
      !solo && round.ai ? h('p.note', {}, t('aiSealedNote', { ai: round.names.ai, half: l.halfTitle(round.ai.half) })) : null);
    const back = h('button.btn.ghost', { type: 'button', on: { click: () => { if (i === 0) { solo || round.ai ? home() : chooseHalf(round.recipe); return; } i--; save(); render(); } } }, t('back'));
    if (keys.includes(step)) {
      const slot = step.replace(/#\d$/, ''), S = R.slots[slot], second = step.endsWith('#2');
      const next = h('button.btn.primary', { type: 'button', disabled: !draft.picks[step], on: { click: () => { i++; save(); render(); } } }, t('next'));
      const lede = R.shared.includes(slot) ? l.pairLede(solo) : null;
      screen(head,
        h('h1.display', {}, second ? (lang() === 'zh' ? '再放一件。' : 'And one more.') : l.slotPrompt(slot)),
        lede ? h('p.lede', {}, lede) : null,
        h('div.options', { class: 'human' }, S.options.map((o, k) => [
          S.grouped && o.group !== S.options[k - 1]?.group ? h('div.opt-group', {}, l.group(o.group)) : null,
          h('button.opt', {
            type: 'button', 'aria-pressed': String(draft.picks[step] === o.n),
            on: { click: e => { draft.picks[step] = o.n; save(); e.currentTarget.parentNode.querySelectorAll('.opt').forEach(b => b.setAttribute('aria-pressed', String(b === e.currentTarget))); next.disabled = false; navigator.vibrate?.(5); } }
          }, swatch(o), h('span.num', {}, o.n), h('b', {}, l.opt(slot, o).name), h('span', {}, l.opt(slot, o).meaning), o.month ? h('em.month', {}, l.month(o.month)) : null)])),
        h('div.dock', {}, h('div.inner', {}, back, next)));
    } else if (step === 'words') {
      const f = (key, label, hint, max, area, ph, get, set) => h('div.field', {}, h('label', { for: 'f-' + key }, label),
        h(area ? 'textarea.input' : 'input.input', { id: 'f-' + key, maxlength: max, placeholder: ph || null, value: area ? null : get(), on: { input: e => { set(e.target.value); save(); } } }, area ? get() : null),
        hint ? h('small', {}, hint) : null);
      const dv = k => [() => draft[k] || '', v => { draft[k] = v; }];
      let fields;
      if (solo) {
        const tp = l.themePrompt(true);
        fields = [
          f('name', t('soloName'), t('soloNameHint'), 40, false, t('soloNamePh'), ...dv('name')),
          tp ? f('theme', tp.label, '', 140, false, tp.placeholder, ...dv('theme')) : null,
          ...Object.keys(R.halves).map(hf => f('line-' + hf, l.lineLabel(hf), l.lineHint(hf), R.text.line.max, true, '', () => draft.lines[hf] || '', v => { draft.lines[hf] = v; })),
          f('why', t('soloWhy'), t('soloWhyHint'), R.text.why.max, true, '', ...dv('why')),
          f('wish', t('soloWish'), t('soloWishHint'), R.text.wish.max, true, '', ...dv('wish'))
        ];
      } else {
        fields = [
          f('word', l.text('word').label, l.text('word').hint, R.text.word.max, false, '', ...dv('word')),
          f('line', l.lineLabel(half), l.lineHint(half), R.text.line.max, true, '', ...dv('line')),
          f('why', l.text('why').label, l.text('why').hint, R.text.why.max, true, '', ...dv('why')),
          f('wish', l.text('wish').label, l.text('wish').hint, R.text.wish.max, true, '', ...dv('wish'))
        ];
      }
      screen(head,
        h('h1.display', {}, t('wordsTitle')),
        h('p.lede', {}, solo ? t('wordsLedeSolo') : t('wordsLede')),
        h('div.stack', {}, fields),
        h('div.dock', {}, h('div.inner', {}, back, h('button.btn.primary', { type: 'button', on: { click: () => { i++; save(); render(); } } }, t('review')))));
    } else {
      const rows = keys.map(k => { const slot = k.replace(/#\d$/, ''), o = R.option(slot, draft.picks[k]); const z = l.opt(slot, o); return h('div', {}, h('dt', {}, l.slotTitle(slot)), h('dd', {}, h('b', {}, z.name), h('span', {}, z.meaning))); });
      const words = solo
        ? [[t('soloName'), draft.name], ...Object.keys(R.halves).map(hf => [l.lineLabel(hf), draft.lines[hf]]), [t('soloWhy'), draft.why], [t('hiddenLine'), draft.wish ? t('sealedDots') : '']]
        : [[t('nameWord'), draft.word], [l.lineLabel(half), draft.line], [t('why'), draft.why], [t('hiddenLine'), draft.wish ? t('sealedDots') : '']];
      screen(head,
        h('h1.display', {}, solo ? t('soloReviewTitle') : t('yourHalfTitle')),
        h('dl.ledger', {}, rows, words.filter(([, v]) => v).map(([k, v]) => h('div', {}, h('dt', {}, k), h('dd', {}, v)))),
        h('div.hold-wrap', { class: 'human' }, solo
          ? holdButton(t('holdFinish'), { side: 'human', onDone: () => finishSolo() })
          : holdButton(t('holdSeal'), { side: 'human', onDone: () => seal() }), h('small', {}, solo ? t('finishNote') : t('sealNote'))),
        h('div.dock', {}, h('div.inner', {}, back, h('span'))));
    }
  }
  function seal() {
    try {
      const r = sealHuman(round, draft);
      delete r.draft; delete r.step;
      store.saveRound(r);
      r.ai ? arrived(r, { justSealed: true }) : waiting(r, { justSealed: true });
    } catch (e) { toast(e.message); }
  }
  function finishSolo() {
    try {
      const nm = store.names().human || '';
      const r = sealSolo({ ...round, theme: (draft.theme || '').slice(0, 140), names: { human: nm, ai: nm } }, draft);
      delete r.draft; delete r.step;
      store.saveRound(r);
      soloCeremony(r);
    } catch (e) { toast(e.message); }
  }
  render();
}

function swatch(o) {
  const cols = o.colors || o.bg || o.bands || (o.color ? [o.color] : null);
  if (!cols) return null;
  return h('span.sw', {}, cols.slice(0, 3).map(c => h('i', { style: 'background:' + c })));
}

/* ------------------------------------------------------------------ solo: a seal, then it takes shape */
function soloCeremony(round) {
  setHash('#r=' + round.id);
  screen(
    h('div.ceremony', {},
      h('div.seals', {}, h('figure', {}, wax(round.human.fp, round.names.human || '✦', 'human', { stamp: true }))),
      h('h1.display', {}, t('soloSealed')),
      h('p.lede', {}, t('soloSealedLede'))));
  setTimeout(() => reveal(round), 1500);
}

/* ------------------------------------------------------------------ waiting for the companion */
function waiting(round, { justSealed = false } = {}) {
  setHash('#r=' + round.id);
  const R = recipeByCode(round.recipe), l = L(R);
  const inv = invitation(round, { site: site(), repo: PROTOCOL_URL, lang: lang() });
  const paste = h('textarea.input', { placeholder: t('pasteReplyPh', { ai: round.names.ai }), 'aria-label': t('pasteHead') });
  screen(
    h('div.eyebrow', {}, `${t('roundN', { id: round.id })} · ${l.title}`),
    h('div.seals', {}, h('figure', {}, wax(round.human.fp, round.names.human, 'human', { stamp: justSealed }))),
    h('h1.display.center', {}, t('sealedTitle')),
    h('p.lede.center', {}, t('sealedLede', { ai: round.names.ai })),
    h('pre.invite', {}, inv),
    h('div.row.center', { style: 'margin:12px 0 4px' }, h('button.btn.primary', { type: 'button', on: { click: () => copy(inv, t('inviteCopied')) } }, t('copyInvite'))),
    h('div.waiting', {}, h('div.orb', { 'aria-hidden': 'true' }), h('div.hand', {}, l.waitingLine), h('p.note', {}, t('waitingNote', { ai: round.names.ai }))),
    h('div.stack', {}, paste, h('button.btn', { type: 'button', on: { click: () => { const s = softDecode(paste.value), m = s.match(/ai~[^\s)>\]"']+/); m ? handleAi(m[0]) : toast(t('noCode')); } } }, t('addHalf'))),
    h('p.note', { style: 'margin-top:22px' }, t('otherDevice'), ' ', h('button.linkish', { type: 'button', on: { click: () => copy(here() + '#m=' + toB64url(round), t('roundLinkCopied')) } }, t('copyRoundLink'))),
    h('div.dock', {}, h('div.inner', {}, h('button.btn.ghost', { type: 'button', on: { click: () => home() } }, t('home'))))
  );
}

function importMine(b64) {
  const r = fromB64url(b64);
  if (!r || !r.id || !r.recipe) return home(t('roundMissing'));
  const mine = store.round(r.id);
  if (!mine || (!mine.human && r.human)) store.saveRound(r);
  resume(store.round(r.id));
}

/* ------------------------------------------------------------------ a companion half arrives */
function handleAi(raw) {
  const parsed = readAiCode(raw);
  if (!parsed.ok) return home(parsed.error);
  if (parsed.gift) {
    const nm = store.names();
    const gift = roundFromGift(parsed, { human: nm.human || t('you2'), ai: nm.ai || t('companionDefault') });
    const known = store.round(gift.id);
    if (known) return resume(known); // the same gift, opened again: exactly as it was first received
    store.saveRound(gift);
    return giftArrived(gift);
  }
  let r = parsed.roundId ? store.round(parsed.roundId) : null;
  if (r) {
    try { r = acceptAi(r, parsed); } catch (e) { toast(e.message); return resume(r); }
    store.saveRound(r);
    setHash('#r=' + r.id);
    return status(r) === 'ready' ? arrived(r, { justArrived: true }) : resume(r);
  }
  const nm = store.names();
  const fresh = roundFromAi(parsed, { human: nm.human || t('you2'), ai: nm.ai || t('companionDefault') });
  const known = store.round(fresh.id);
  if (known) return resume(known);
  const R = recipeByCode(fresh.recipe), l = L(R);
  if (parsed.roundId && parsed.echoed) {
    return screen(
      h('div.eyebrow', {}, t('roundN', { id: parsed.roundId })),
      h('h1.display', {}, t('elsewhereTitle')),
      h('p.lede', {}, t('elsewhereLede', { ai: fresh.names.ai, id: parsed.roundId })),
      h('div.row', {}, h('button.btn', { type: 'button', on: { click: () => home() } }, t('home')),
        h('button.btn.ghost', { type: 'button', on: { click: () => { store.saveRound(fresh); choose(fresh); } } }, t('startFresh'))));
  }
  store.saveRound(fresh);
  setHash('#r=' + fresh.id);
  screen(
    h('div.eyebrow.center', {}, `${t('roundN', { id: fresh.id })} · ${l.title}`),
    h('div.seals', {}, h('figure', {}, wax(fresh.ai.fp, fresh.names.ai, 'ai', { stamp: true }))),
    h('h1.display.center', {}, t('aiStarted', { ai: fresh.names.ai, noun: l.noun })),
    h('p.lede.center', {}, t('aiStartedLede', { half: l.halfTitle(fresh.ai.half), other: l.halfTitle(fresh.humanHalf) })),
    h('div.row.center', {}, h('button.btn.primary', { type: 'button', on: { click: () => choose(fresh) } }, t('chooseMine'))));
}

function arrived(round, { justSealed = false, justArrived = false } = {}) {
  setHash('#r=' + round.id);
  const ai = round.ai;
  const prov = round.order === 'ai-first' ? h('p.ok', {}, t('provAiFirst', { ai: round.names.ai }))
    : ai.sealMatch ? h('p.ok', {}, t('provMatch', { ai: round.names.ai, fp: round.human.fp }))
      : h('p.note', {}, t('provNoEcho', { ai: round.names.ai }));
  screen(
    h('div.eyebrow.center', {}, t('roundN', { id: round.id })),
    h('div.seals', {},
      h('figure', {}, wax(round.human.fp, round.names.human, 'human', { stamp: justSealed, size: 104 }), h('figcaption', { class: 'human who' }, t('you'))),
      h('figure', {}, wax(ai.fp, round.names.ai, 'ai', { stamp: justArrived, size: 104 }), h('figcaption', { class: 'ai who' }, round.names.ai))),
    h('h1.display.center', {}, justArrived ? t('added') : t('bothSealed')),
    h('p.lede.center', {}, t('readyTogether')),
    h('div.center', {}, prov, ...(ai.warnings || []).map(w => h('p.note', {}, w))),
    h('div.hold-wrap', {}, holdButton(t('openTogether'), { side: 'ai', ms: 1300, onDone: () => reveal(round) }), h('small', {}, t('openNote'))),
    h('div.dock', {}, h('div.inner', {}, h('button.btn.ghost', { type: 'button', on: { click: () => home() } }, t('later'))))
  );
}

/* ------------------------------------------------------------------ the stage (lazy: three.js loads only when needed) */
let stage = null, world3d = null;
const renderers = {};
async function getStage() {
  if (!stage) { const { createStage } = await import('../render/stage.js'); stage = createStage(stageHost); }
  stageHost.classList.remove('hidden');
  stage.resume();
  return stage;
}
const plaqueOf = round => ({ name: round.plaque?.name || '', date: round.plaque?.date || fmtDate(round.openedAt || round.ai?.sealedAt || Date.now()) });
async function buildWorld(st, R, spec, round) {
  const mod = renderers[R.renderer] ||= await import('../render/' + R.renderer + '.js');
  world3d = mod.build(spec, round.id, { renderer: st.renderer, date: round.openedAt || round.ai?.sealedAt, plaque: plaqueOf(round) });
  return world3d;
}

/* ------------------------------------------------------------------ reveal */
async function reveal(round) {
  const R = recipeByCode(round.recipe), l = L(R);
  const solo = isSolo(round), gift = isGift(round), one = oneMaker(round);
  round = { ...round, openedAt: round.openedAt || new Date().toISOString() };
  const spec = merged(round);
  if (spec.wish.human || spec.wish.ai) preloadCardFonts(); // the card's handwriting font, fetched while the reveal plays
  app.replaceChildren();
  const st = await getStage();
  const p = await buildWorld(st, R, spec, round);
  st.setWorld(p);
  st.autoSpin = 0.1;
  st.backdrop(['#F7F1E8', '#E8DED3'], false, round.id, '#8C8499');
  stageHost.querySelector('.stage-ornament').style.opacity = '0';
  p.prepareReveal();

  const top = h('div.over.top-bar', {}, h('div.title-plate', {}, h('div.eyebrow', {}, solo ? t('openingSolo') : gift ? t('openingGift', { ai: round.names.ai }) : t('opening', { id: round.id }))),
    h('button.iconbtn', { type: 'button', 'aria-label': t('skip'), on: { click: () => finish() } }, '»'));
  const cap = h('div.over.caption');
  app.replaceChildren(top, cap);
  frameAround(top, cap, { topShare: 0.5 });
  const steps = R.revealSteps(spec);
  const extra = [];
  if (spec.why.human || spec.why.ai) extra.push({ kind: 'why' });
  if (spec.wish.human || spec.wish.ai) extra.push({ kind: 'wishes' });
  const all = [...steps, ...extra];
  let i = -1, busy = false, ended = false;

  const sideOf = by => solo ? 'human' : gift ? 'ai' : by === 'human' ? 'human' : 'ai';
  const nameOf = by => gift || by !== 'human' ? round.names.ai : round.names.human;
  const dots = () => h('div.dots', {}, all.map((_, k) => h('i', { class: k <= i ? 'on' : '' })));
  const nextBtn = (label = t('next')) => h('button.btn.small.primary', { type: 'button', on: { click: () => advance() } }, label);
  const outBack = k2 => { const c1 = 1.5, c3 = c1 + 1; return 1 + c3 * Math.pow(k2 - 1, 3) + c1 * Math.pow(k2 - 1, 2); };

  function show(slot, delay = 0) {
    if (p.reveal?.(slot, (d, fn, e, dl = 0) => st.tween(d, fn, e, dl + delay))) return;
    (p.parts[slot] || []).forEach((o, k) => {
      const target = o.scale.clone(), from = o.position.length() > 0.5 ? 0.001 : 0.6;
      o.scale.copy(target).multiplyScalar(from);
      o.visible = true;
      st.tween(0.9, e => o.scale.copy(target).multiplyScalar(from + (1 - from) * e), outBack, delay + k * 0.08);
    });
  }
  const focus = name => { if (name && p.spots?.[name]) return st.focus(p.spots[name], 1.1); };
  function setDark(on) { [top, cap].forEach(n => n.classList.toggle('on-dark', on)); }

  async function play(s) {
    const card = h('div.card');
    if (s.kind === 'pick') {
      if (s.slot === R.backdropSlot) { st.backdrop(spec.palette.bg, spec.palette.dark, round.id, spec.palette.ink); stageHost.querySelector('.stage-ornament').style.opacity = '1'; setDark(spec.palette.dark); }
      show(s.slot);
      focus(s.focus);
      const chance = (spec.chance[s.by] || []).includes(s.slot);
      const z = l.opt(s.slot, s.pick);
      card.classList.add(sideOf(s.by));
      put(card, h('div.by', {}, h('i'), solo ? t('placedSolo', { slot: l.slotTitle(s.slot) }) : t('placedBy', { name: nameOf(s.by), slot: l.slotTitle(s.slot) })),
        h('h2', {}, z.name), h('div.meaning', {}, z.meaning), chance ? h('div.note', {}, solo ? t('drawnLucky') : t('leftToStars')) : null);
    } else if (s.kind === 'pair') {
      (s.show || []).forEach((slot, k) => show(slot, k * 0.35));
      focus(s.focus);
      const echoR = spec.resonances.find(r => r.id === 'echo');
      put(card, h('div.by', {}, h('i'), l.pairTitle || s.title),
        h('div.pair', {}, s.picks.map(w => { const z = l.opt(R.shared[0], w); return h('div', { class: sideOf(w.by) }, one ? null : h('div.by', {}, h('i'), nameOf(w.by)), h('b', {}, z.name), h('span.meaning', { style: 'font-size:15px' }, z.meaning)); })),
        echoR ? h('p.hand', { style: 'margin:10px 0 0;color:var(--gold)' }, l.resonance(echoR)) : null);
    } else if (s.kind === 'resonance') {
      const r = spec.resonances.find(x => x.text === s.text) || { text: s.text };
      put(card, h('div.by', {}, h('i', { style: 'background:var(--gold)' }), t('somethingNew')), h('div.meaning', { style: 'margin-top:8px;font-size:19px;color:var(--ink)' }, l.resonance(r)));
    } else if (s.kind === 'name') {
      put(card, h('div.by', {}, h('i'), t('itsName')),
        h('h2', {}, !one && s.words.length > 1 ? s.words.map((w, k) => [k && !CJK.test(w.text) ? ' ' : '', h('span', { class: sideOf(w.by), style: 'border-bottom:2px solid var(--side)' }, w.text)]) : spec.title),
        solo ? null : gift ? h('div.note', {}, t('namedBy', { ai: round.names.ai })) : h('div.note', {}, s.words.map(w => `${nameOf(w.by)}：“${w.text}”`).join(' · ')));
    } else if (s.kind === 'lines') {
      const shown = s.lines.filter(x => x.text);
      if (!shown.length) return advance();
      shown.forEach((ln, k) => {
        const label = l.lineLabel(ln.half) || ln.label;
        const box = h('div', { class: sideOf(ln.by), style: k ? 'margin-top:10px' : '' }, h('div.by', {}, h('i'), one ? label : `${label} · ${nameOf(ln.by)}`));
        if (ln.find) {
          const find = h('button.btn.small', { type: 'button', on: { click: async () => { show(ln.find); await focus(ln.find); find.replaceWith(h('p.quote', {}, ln.text)); } } }, l.findLabel(ln.key) || ln.findLabel || 'Find it');
          box.append(find);
          st.onPick = what => { if (what === ln.find && find.isConnected) find.click(); };
        } else box.append(h('p.quote', {}, ln.text));
        put(card, box);
      });
    } else if (s.kind === 'why') {
      put(card, h('div.by', {}, h('i'), solo ? t('whySolo') : gift ? t('whyGift', { ai: round.names.ai }) : t('whyTogether')), h('div.pair', { class: one ? 'one' : '' },
        ['human', 'ai'].filter(k => spec.why[k]).map(k => h('div', { class: sideOf(k) }, one ? null : h('div.by', {}, h('i'), nameOf(k)), h('span.meaning', { style: 'color:var(--ink)' }, spec.why[k])))));
    } else if (s.kind === 'wishes') {
      // the sealed lines come out last, each written inside a small pop-up greeting card
      const n = ['human', 'ai'].filter(k => spec.wish[k]);
      const quotes = h('div.card-quotes');
      const showQuotes = () => quotes.replaceChildren(...n.map(k => h('p', {}, h('small', {}, solo ? t('hiddenLine') : t('cardCover', { name: nameOf(k) })), spec.wish[k])));
      const invite = h('button.card-invite', { type: 'button', on: { click: () => openCards(round, spec, n, () => { invite.remove(); showQuotes(); }) } },
        h('span.mini', { 'aria-hidden': 'true', html: sealSVG({ color: '#CF7C8B', motif: 'rose', seed: round.id }) }), h('span', {}, h('b', {}, t(n.length > 1 ? 'cardOpen2' : 'cardOpen')), h('small', {}, t('cardOpenSub'))));
      put(card, h('div.by', {}, h('i'), l.wishTitle(n.length)), invite, quotes);
      setTimeout(() => { if (invite.isConnected && !document.querySelector('.gc-overlay')) invite.click(); }, 900);
    }
    put(card, h('div.next', {}, dots(), i === all.length - 1 ? nextBtn(t('done')) : nextBtn()));
    cap.replaceChildren(card);
  }
  async function advance() {
    if (busy || ended) return;
    i++;
    if (i >= all.length) return finish();
    busy = true; setTimeout(() => { busy = false; }, 450);
    play(all[i]);
  }
  function finish() {
    if (ended) return; ended = true;
    p.revealAll();
    st.backdrop(spec.palette.bg, spec.palette.dark, round.id, spec.palette.ink);
    stageHost.querySelector('.stage-ornament').style.opacity = '1';
    if (store.round(round.id)) store.saveRound(round);
    explore(round, { keepWorld: true });
  }
  advance();
}

/* ------------------------------------------------------------------ explore + keep */
async function explore(round, { keepWorld = false, visiting = false } = {}) {
  const R = recipeByCode(round.recipe), l = L(R);
  const solo = isSolo(round), gift = isGift(round), one = oneMaker(round);
  const spec = merged(round);
  const st = await getStage();
  if (!keepWorld) {
    const p = await buildWorld(st, R, spec, round);
    p.revealAll();
    st.setWorld(p);
    st.backdrop(spec.palette.bg, spec.palette.dark, round.id, spec.palette.ink);
    stageHost.querySelector('.stage-ornament').style.opacity = '1';
  }
  st.autoSpin = 0.12;
  const hidden = spec.lines.find(x => x.find && x.text);
  const who = by => solo ? t('you2') : gift || by !== 'human' ? round.names.ai : round.names.human;
  st.onPick = what => {
    if (hidden && what === hidden.find) return toast('“' + hidden.text + '”');
    const x = spec.ledger.find(e => (e.pick || e.slot) === what);
    if (x) { const z = l.opt(x.slot, x.id || x); toast(`${z.name} —— ${z.meaning} · ${who(x.by)}`); }
  };
  const id = `${round.recipe}-${round.id}-${round.human.fp}`;
  const refreshHash = () => { const k = toLink(round); setHash(k.slice(k.indexOf('#'))); };
  refreshHash();
  const sideOf = by => solo ? 'human' : gift ? 'ai' : by === 'human' ? 'human' : 'ai';
  const dateStr = fmtDate(round.openedAt || round.ai.sealedAt);
  const by = solo ? (round.names.human ? t('bySolo', { a: round.names.human, date: dateStr }) : t('bySoloNoName', { date: dateStr }))
    : gift ? t('byGift', { ai: round.names.ai, date: dateStr }) : t('byTwo', { a: round.names.human, b: round.names.ai, date: dateStr });
  const top = h('div.over.top-bar', {},
    h('div.title-plate', {},
      h('div.eyebrow', {}, solo ? l.title : gift ? `${l.title} · ${t('giftFrom', { ai: round.names.ai })}` : `${l.title} · ${t('roundN', { id: round.id })}`),
      h('h1', {}, !one && spec.words.length > 1 ? spec.words.map((w, k) => [k && !CJK.test(w.text) ? ' ' : '', h('span.w', { class: sideOf(w.by) }, w.text)]) : spec.title),
      h('p', {}, by)),
    EMBED === 'view' ? null : h('button.iconbtn', { type: 'button', 'aria-label': t('home'), on: { click: () => { stageHost.classList.add('hidden'); stage?.pause(); home(); } } }, '✕'));
  const kept = () => !HOST && store.onShelf(id);
  const keepBtn = h('button.btn', { type: 'button', class: kept() ? '' : 'primary', on: { click: () => keepSheet() } }, kept() ? t('onShelf') : t('keep'));
  const bar = h('div.over.toolbar', {}, h('div.inner', {},
    h('button.btn', { type: 'button', on: { click: () => storySheet(round, spec) } }, t('story')),
    EMBED === 'view' ? null : keepBtn,
    h('button.btn', { type: 'button', on: { click: () => share() } }, t('share')),
    h('button.btn', { type: 'button', 'aria-label': t('more'), on: { click: () => moreSheet() } }, '…')));
  const hint = h('div.hint', {}, t('turnHint'));
  [top, bar].forEach(n => n.classList.toggle('on-dark', spec.palette.dark));
  hint.style.color = spec.palette.dark ? '#C9C3DE' : '';
  app.replaceChildren(top, hint, bar);
  frameAround(top, bar);
  setTimeout(() => hint.remove(), 4200);

  async function share() {
    const url = toLink(round, site());
    const text = solo ? t('shareTextSolo', { title: spec.title, a: round.names.human || t('you2'), noun: l.noun })
      : gift ? t('shareTextGift', { title: spec.title, ai: round.names.ai, noun: l.noun }) : t('shareText', { title: spec.title, a: round.names.human, b: round.names.ai, noun: l.noun });
    if (navigator.share) { try { await navigator.share({ title: spec.title, text, url }); return; } catch { } }
    copy(url, t('linkCopied'));
  }

  // The plaque on a globe's base can be engraved with any name and date. It is display, not a sealed choice.
  const engraving = () => {
    if (!world3d?.setPlaque) return null;
    const cur = plaqueOf(round);
    const nameIn = h('input.input', { maxlength: 30, value: cur.name || spec.title });
    const dateIn = h('input.input', { maxlength: 30, value: cur.date, placeholder: t('plaqueDatePh') });
    const live = () => world3d.setPlaque(nameIn.value.trim() || spec.title, dateIn.value.trim() || fmtDate(round.openedAt));
    nameIn.addEventListener('input', live); dateIn.addEventListener('input', live);
    return { el: h('div.engrave', {}, h('h3', {}, t('plaqueHead')), h('div.field', {}, h('label', {}, t('plaqueName')), nameIn), h('div.field', {}, h('label', {}, t('plaqueDate')), dateIn)),
      value: () => ({ name: nameIn.value.trim() === spec.title ? '' : nameIn.value.trim(), date: dateIn.value.trim() === fmtDate(round.openedAt) ? '' : dateIn.value.trim() }) };
  };
  const applyPlaque = v => {
    if (!v) return;
    round.plaque = v.name || v.date ? { name: v.name, date: v.date } : null;
    if (store.round(round.id)) store.saveRound(round);
    if (store.onShelf(id)) { const it = store.shelf().find(x => x.id === id); const d = toKeepsake(round); store.keep({ ...it, title: v.name || spec.title, link: d.link, doc: d }); }
    refreshHash();
  };

  function keepSheet() {
    const plaque = h('div.plaque', {}, h('b', {}, round.plaque?.name || spec.title), h('span', {}, round.plaque?.date || dateStr));
    const already = kept();
    const eng = already ? null : engraving();
    eng?.el.querySelectorAll('input').forEach((inp, k) => inp.addEventListener('input', () => { if (k === 0) plaque.querySelector('b').textContent = inp.value || spec.title; else plaque.querySelector('span').textContent = inp.value || dateStr; }));
    const panel = sheet(h('div.eyebrow', {}, t('keepEyebrow')), h('h2', {}, already ? t('keptAlready') : t('keepTitle')),
      h('p.note', {}, HOST ? t('keepNoteHost') : solo ? t('keepNoteSolo') : gift ? t('keepNoteGift', { ai: round.names.ai }) : t('keepNote')),
      plaque, eng?.el,
      already ? null : h('div.hold-wrap', {}, holdButton(t('holdPlace'), { ms: 1000, onDone: () => place() })));
    async function place() {
      if (eng) applyPlaque(eng.value());
      plaque.classList.add('engrave');
      round.keptAt = new Date().toISOString();
      const thumb = await thumbnail(st);
      const d = toKeepsake(round);
      store.keep({ id, title: round.plaque?.name || spec.title, recipe: round.recipe, keptAt: round.keptAt, link: d.link, thumb, doc: d, names: round.names, mode: round.mode, dark: spec.palette.dark, bg: spec.palette.bg });
      if (store.round(round.id)) store.saveRound(round);
      if (HOST && window.parent !== window) window.parent.postMessage({ type: 'companion-keepsake', action: 'keep', keepsake: { ...d, display: { ...d.display, thumbnail: thumb } } }, HOST);
      if (!HOST) { keepBtn.textContent = t('onShelf'); keepBtn.classList.remove('primary'); }
      setTimeout(() => { panel.close(); toast(t('placed')); }, 1300);
    }
  }

  function moreSheet() {
    const s = sheet(h('h2', {}, t('takeWith')), h('div.stack', {},
      world3d?.setPlaque ? h('button.btn', { type: 'button', on: { click: () => { s.close(); engraveSheet(); } } }, t('engrave')) : null,
      h('button.btn', { type: 'button', on: { click: () => { s.close(); postcard(st, round, spec); } } }, t('postcard')),
      solo ? null : h('button.btn', { type: 'button', on: { click: () => copy(revealCard(round, lang()), t('tellCopied', { ai: round.names.ai })) } }, t(gift ? 'tellAIGift' : 'tellAI', { ai: round.names.ai })),
      h('button.btn', { type: 'button', on: { click: () => download(`${spec.title.replace(/[^\w\- ⺀-鿿]+/g, '').trim() || 'keepsake'}.keepsake.json`, JSON.stringify(toKeepsake(round), null, 2), 'application/json') } }, t('download')),
      h('button.btn', { type: 'button', on: { click: () => copy(toLink(round, site()), t('linkCopied')) } }, t('copyLink')),
      EMBED ? null : h('button.btn.ghost', { type: 'button', on: { click: () => { s.close(); stageHost.classList.add('hidden'); stage?.pause(); location.hash = 'shelf'; } } }, t('openShelf'))));
  }
  function engraveSheet() {
    const eng = engraving();
    const s = sheet(eng.el, h('div.row', { style: 'margin-top:14px' }, h('button.btn.primary', { type: 'button', on: { click: () => { applyPlaque(eng.value()); s.close(); toast(t('engraved')); } } }, t('save'))));
  }
}

function storySheet(round, spec) {
  const R = recipeByCode(round.recipe), l = L(R);
  const solo = isSolo(round), gift = isGift(round);
  const drawn = x => (spec.chance[x.by] || []).includes(x.slot);
  const item = x => { const z = l.opt(x.slot, x.id || x); return h('div.story-item', {}, h('dt', {}, l.slotTitle(x.slot), solo && drawn(x) ? h('em.tag', {}, t('drawnTag')) : null), h('dd', {}, h('b', {}, z.name), h('span', {}, z.meaning))); };
  const quote = (label, text) => text ? h('div', {}, h('div.eyebrow', { style: 'margin-top:12px' }, label), h('p.quote', {}, text)) : null;
  const col = who => {
    const half = who === 'human' ? round.human : round.ai;
    const items = spec.ledger.filter(x => x.by === who).map(item);
    if (half.word) items.push(h('div.story-item', {}, h('dt', {}, t('nameWord')), h('dd', {}, h('b', {}, half.word))));
    const ln = spec.lines.find(x => x.by === who) || {};
    return h('div', { class: who }, h('h3', {}, t('addedBy', { name: who === 'human' ? round.names.human : round.names.ai, half: l.halfTitle(half.half) })),
      h('div.story-col', {}, items), quote(l.lineLabel(ln.half), ln.text), quote(t('why'), half.why), quote(t('hiddenLine'), half.wish));
  };
  const soloCol = () => h('div', { class: gift ? 'ai' : 'human' }, h('h3', {}, gift ? t('addedGift', { ai: round.names.ai }) : t('addedSolo')), h('div.story-col', {}, spec.ledger.map(item)),
    spec.lines.map(ln => quote(l.lineLabel(ln.half), ln.text)), quote(gift ? t('why') : t('soloWhy'), round.human.why), quote(t('hiddenLine'), round.human.wish));
  const tt = round.human.sealedAt, ta = round.ai.sealedAt;
  sheet(
    h('div.eyebrow', {}, solo ? l.title : gift ? `${l.title} · ${t('giftFrom', { ai: round.names.ai })}` : `${l.title} · ${t('roundN', { id: round.id })}`),
    h('h2', {}, round.plaque?.name || spec.title),
    round.theme ? h('p.meaning', {}, round.theme) : null,
    solo || gift ? soloCol() : [col('human'), col('ai')],
    spec.resonances.length ? h('div', {}, h('h3', {}, t('between')), spec.resonances.map(r => h('p.meaning', {}, l.resonance(r)))) : null,
    h('h3', {}, t('seals')),
    h('p.prov', {}, solo ? t('sealSolo', { name: round.names.human || t('you2'), t: fmtTime(tt) }) : gift ? t('sealGift', { ai: round.names.ai, fp: round.ai.fp, t: fmtTime(ta) }) : [
      t('sealHuman', { name: round.names.human, fp: round.human.fp, t: fmtTime(tt) }),
      t('sealAi', { name: round.names.ai, fp: round.ai.fp, t: fmtTime(ta) }),
      round.order === 'ai-first' ? t('sealAiFirst', { name: round.names.human }) : round.ai.sealMatch ? t('sealAnswered', { fp: round.human.fp }) : (lang() === 'zh' ? '。' : '. ')
    ], ' ', t('notRegenerated')),
    !solo && round.ai.code ? h('details', {}, h('summary', { class: 'prov' }, t('codeAsSent', { ai: round.names.ai })), h('pre.invite', {}, round.ai.code)) : null,
    spec.wish.human || spec.wish.ai ? h('div.row', { style: 'margin-top:18px' }, h('button.card-invite', { type: 'button', on: { click: () => openCards(round, spec, ['human', 'ai'].filter(k => spec.wish[k])) } },
      h('span.mini', { 'aria-hidden': 'true', html: sealSVG({ color: '#CF7C8B', motif: 'rose', seed: round.id }) }), h('span', {}, h('b', {}, t('cardAgain')), h('small', {}, t('cardOpenSub'))))) : null
  );
}

/** Open the sealed lines as greeting cards: who wrote each, to whom, and in which colour (rose for the person, lilac for the companion). */
function openCards(round, spec, who, onClose) {
  const solo = isSolo(round), gift = isGift(round);
  const date = fmtDate(round.human?.sealedAt || round.openedAt);
  const items = who.map(k => {
    const from = gift || k === 'ai' ? round.names.ai : round.names.human;
    const to = solo ? '' : gift ? round.names.human : k === 'human' ? round.names.ai : round.names.human;
    return {
      text: spec.wish[k], side: solo || gift ? 'human' : k,
      to: to ? t('cardTo', { name: to }) : '',
      sign: solo ? t('cardSignSolo', { date }) : t('cardSign', { name: from }),
      motif: solo ? 'tulips' : gift ? 'bow' : k === 'ai' ? 'moon' : 'rose',
      coverLine: solo ? t('cardCoverSolo') : t('cardCover', { name: from })
    };
  });
  openGreetingCards(items, { seed: round.id, lang: lang(), heading: t('cardHead'), tapHint: t('cardTap'), nextLabel: t('cardNext'), doneLabel: t('cardDone'), onClose });
}

function sheet(...kids) {
  const panel = h('div.panel', { role: 'dialog', 'aria-modal': 'true' }, ...kids);
  const s = h('div.sheet', { on: { click: e => { if (e.target === s) close(); } } }, panel);
  const close = () => { s.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  document.body.append(s);
  return { close, panel };
}

function download(name, text, type) {
  const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
  document.body.append(a); a.click(); a.remove();
}

async function thumbnail(st) {
  const png = st.capture(360, 360, { object: true });
  return new Promise(res => {
    const img = new Image();
    img.onload = () => { const c = document.createElement('canvas'); c.width = c.height = 240; c.getContext('2d').drawImage(img, 0, 0, 240, 240); res(c.toDataURL('image/webp', 0.86)); };
    img.onerror = () => res(null);
    img.src = png;
  });
}

async function postcard(st, round, spec) {
  const R = recipeByCode(round.recipe), l = L(R);
  const W = 1200, H = 1560, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(W / 2, 620, 80, W / 2, 620, 900);
  grad.addColorStop(0, spec.palette.bg[0]); grad.addColorStop(1, spec.palette.bg[1]);
  g.fillStyle = grad; g.fillRect(0, 0, W, H);
  const svg = stageHost.querySelector('.stage-ornament');
  try {
    const src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg).replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'));
    const im = await loadImg(src); g.drawImage(im, 40, 60, W - 80, W - 80);
  } catch { }
  const shot = await loadImg(st.capture(1100, 1100)); g.drawImage(shot, 50, 70, 1100, 1100);
  await document.fonts?.ready;
  const ink = spec.palette.dark ? '#F2EFFA' : '#2E2A3C', ink2 = spec.palette.dark ? '#C9C3DE' : '#6A6379';
  const serif = '"Cormorant Garamond", "Noto Serif SC", Georgia, serif';
  g.textAlign = 'center'; g.fillStyle = ink;
  g.font = `500 78px ${serif}`; g.fillText(round.plaque?.name || spec.title, W / 2, 1250, W - 120);
  g.font = '500 26px "DM Sans", "Noto Serif SC", sans-serif'; g.fillStyle = ink2;
  const solo = isSolo(round), gift = isGift(round), d = fmtDate(round.openedAt || new Date());
  g.fillText(solo ? `${round.names.human ? round.names.human + '   ·   ' : ''}${d}` : gift ? `${t('giftFrom', { ai: round.names.ai })}   ·   ${d}` : `${round.names.human}  &  ${round.names.ai}   ·   ${d}`, W / 2, 1306);
  const shown = spec.lines.find(x => x.text && !x.find);
  if (shown) { g.font = `italic 400 38px ${serif}`; g.fillStyle = ink; wrap(g, '“' + shown.text + '”', W / 2, 1390, 940, 50); }
  g.font = '500 32px Caveat, "Noto Serif SC", cursive'; g.fillStyle = ink2;
  g.fillText(solo ? t('postcardLineSolo', { noun: l.noun }) : gift ? t('postcardLineGift', { noun: l.noun, ai: round.names.ai }) : t('postcardLine', { noun: l.noun }), W / 2, 1510);
  c.toBlob(b => { const a = h('a', { href: URL.createObjectURL(b), download: `${spec.title}.png` }); document.body.append(a); a.click(); a.remove(); }, 'image/png');
}
function loadImg(src) { return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; }); }
function wrap(g, text, x, y, max, lh) {
  const cjk = CJK.test(text);
  const words = cjk ? [...text] : text.split(/(\s+)/); let line = '';
  for (const w of words) { const test = line + w; if (g.measureText(test).width > max && line.trim()) { g.fillText(line.trim(), x, y); y += lh; line = cjk ? w : w.trimStart(); } else line = test; }
  if (line.trim()) g.fillText(line.trim(), x, y);
}

/* ------------------------------------------------------------------ the cabinet */
function shelf() {
  stageHost.classList.add('hidden'); stage?.pause();
  const items = store.shelf();
  const rows = [];
  for (let k = 0; k < items.length; k += 3) rows.push(items.slice(k, k + 3));
  screen(
    h('header.topline', {}, h('div.brand', {}, h('b', {}, t('brand')))),
    h('h1.display', {}, t('shelfTitle')),
    h('p.lede', {}, t('shelfLede')),
    items.length ? h('div.shelf', {}, rows.map(row => h('div.shelf-row', {}, row.map(it => h('button.curio', { type: 'button', 'data-recipe': it.recipe, on: { click: () => { const r = fromLink(it.link); if (r) explore({ ...r, keptAt: it.keptAt }); } } },
      it.thumb ? h('img', { src: it.thumb, alt: it.title }) : h('span.art', { html: ART[it.recipe] || ART.planet1 }),
      h('span.label', {}, it.title), h('span.when', {}, fmtDate(it.keptAt))))))) : h('div.empty', {}, h('span', { html: ICON_CABINET }), h('p', {}, t('shelfEmpty'))),
    h('div.dock', {}, h('div.inner', {}, h('button.btn.ghost', { type: 'button', on: { click: () => home() } }, t('home')), h('button.btn', { type: 'button', on: { click: () => home() } }, t('makeAnother'))))
  );
}

/* ------------------------------------------------------------------ small art (hand-drawn feeling, soft pastel) */
const INK = '#4A4560';
const ART = {
  planet1: `<svg viewBox="0 0 120 120" aria-hidden="true"><defs><radialGradient id="pg" cx="38%" cy="32%" r="75%"><stop offset="0" stop-color="#EEF4E6"/><stop offset=".55" stop-color="#BAD5B2"/><stop offset="1" stop-color="#94BBA6"/></radialGradient></defs>
    <ellipse cx="60" cy="66" rx="46" ry="11" fill="none" stroke="#D3A9B9" stroke-width="1.2" transform="rotate(-14 60 66)" stroke-dasharray="1 3.4" stroke-linecap="round"/>
    <circle cx="60" cy="64" r="27" fill="url(#pg)" stroke="${INK}" stroke-width="1.1"/>
    <path d="M42 70c7-4 11 3 18 0s8-8 15-5" fill="none" stroke="#9DC6E4" stroke-width="5" stroke-linecap="round" opacity=".85"/>
    <circle cx="51" cy="54" r="2.2" fill="#F2B8C6"/><circle cx="69" cy="57" r="1.8" fill="#FFF6DA"/><circle cx="57" cy="77" r="1.6" fill="#F2B8C6"/><circle cx="72" cy="72" r="1.4" fill="#FFFFFF"/>
    <path d="M56.5 41.5l3.5-6 3.5 6z" fill="#E6A5A3" stroke="${INK}" stroke-width=".8"/><rect x="57" y="41.5" width="6" height="4.5" fill="#FBF6EE" stroke="${INK}" stroke-width=".8"/>
    <path d="M24 60a46 11 -14 0 0 72 -14" fill="none" stroke="#D3A9B9" stroke-width="1.4" transform="rotate(-14 60 66)" opacity=".6"/>
    <path d="M93 31a8.5 8.5 0 1 1-6.5-12.5 7 7 0 0 0 6.5 12.5z" fill="#F4DD9C" stroke="${INK}" stroke-width=".9"/>
    <path d="M25 30l1.4 3.6 3.6 1.4-3.6 1.4L25 40l-1.4-3.6-3.6-1.4 3.6-1.4z" fill="#A9C4E6"/>
    <path d="M98 88l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#E7B7C8"/><circle cx="20" cy="88" r="1.6" fill="#C8B8E8"/><circle cx="100" cy="52" r="1.2" fill="#E3C47E"/></svg>`,
  globe1: `<svg viewBox="0 0 120 120" aria-hidden="true"><defs><radialGradient id="gg" cx="35%" cy="30%" r="80%"><stop offset="0" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset=".6" stop-color="#E7ECF7" stop-opacity=".75"/><stop offset="1" stop-color="#CCD5EC" stop-opacity=".85"/></radialGradient></defs>
    <circle cx="60" cy="54" r="30" fill="url(#gg)" stroke="${INK}" stroke-width="1.1"/>
    <path d="M36 70c6-6 42-6 48 0" fill="#F7F8FC" stroke="${INK}" stroke-width=".8"/>
    <path d="M51 65v-7l6-5 6 5v7z" fill="#F2DCC8" stroke="${INK}" stroke-width=".8"/><rect x="55" y="60" width="4" height="5" fill="#F6D88A"/>
    <path d="M69 67l4.5-11 4.5 11z" fill="#9EBEA6" stroke="${INK}" stroke-width=".7"/><path d="M43 67l3-7 3 7z" fill="#B4CDB8" stroke="${INK}" stroke-width=".6"/>
    <g fill="#fff" stroke="#B9C2DA" stroke-width=".5"><circle cx="46" cy="40" r="1.3"/><circle cx="66" cy="33" r="1.1"/><circle cx="75" cy="45" r="1.2"/><circle cx="54" cy="47" r=".9"/><circle cx="62" cy="42" r=".8"/><circle cx="40" cy="55" r=".9"/></g>
    <path d="M37 47a24 24 0 0 1 10-16" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".9"/>
    <path d="M33 82h54l-5 14H38z" fill="#CBAA86" stroke="${INK}" stroke-width="1.1"/><path d="M36 86h48" stroke="#E7D3B4" stroke-width="1"/>
    <rect x="51" y="88" width="18" height="5" rx="1" fill="#E8D39C" stroke="${INK}" stroke-width=".6"/>
    <path d="M60 82c-6-5-11-1-7 3 2 2 7 0 7-3zm0 0c6-5 11-1 7 3-2 2-7 0-7-3z" fill="#E9B9C5" stroke="${INK}" stroke-width=".7"/><path d="M58 83l-3 6m5-6l3 6" stroke="#E9B9C5" stroke-width="1.6" stroke-linecap="round"/>
    <path d="M98 26l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#E7B7C8"/><path d="M20 40l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#A9C4E6"/><circle cx="100" cy="64" r="1.3" fill="#E3C47E"/></svg>`,
  talisman1: `<svg viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="13" r="6" fill="none" stroke="#BDB2A2" stroke-width="2"/><path d="M57 19h6l-1 11h-4z" fill="#DCD6CF" stroke="${INK}" stroke-width=".8"/>
    <circle cx="60" cy="36" r="5.4" fill="#F7F1EA" stroke="${INK}" stroke-width=".9"/><circle cx="58.3" cy="34.4" r="1.4" fill="#fff"/>
    <path d="M53.6 47.5l6.4-5.2 6.4 5.2-6.4 5.2z" fill="#B9CBEF" stroke="${INK}" stroke-width=".9"/>
    <circle cx="60" cy="58.6" r="5.4" fill="#F2C9D3" stroke="${INK}" stroke-width=".9"/><circle cx="58.3" cy="57" r="1.3" fill="#fff" opacity=".8"/>
    <path d="M53.6 69.7l6.4-5.2 6.4 5.2-6.4 5.2z" fill="#D4C7F0" stroke="${INK}" stroke-width=".9"/>
    <circle cx="60" cy="81" r="3" fill="none" stroke="#BDB2A2" stroke-width="1.6"/>
    <path d="M47 90l3.2-3h19.6l3.2 3v21H47z" fill="#EBC6CD" stroke="${INK}" stroke-width="1"/>
    <rect x="50" y="92.5" width="20" height="16" rx="2" fill="none" stroke="#C6A15C" stroke-width=".8" stroke-dasharray="1.6 1.4"/>
    <path d="M62.5 98a4.6 4.6 0 1 1-3.6-5.6 3.7 3.7 0 0 0 3.6 5.6z" fill="#D6B166"/>
    <path d="M57.5 86.5c-3-2-5-1-4 1m9-1c3-2 5-1 4 1" fill="none" stroke="#C0545F" stroke-width="1.2"/>
    <path d="M80 89a6.4 6.4 0 1 1-5.2-8.4 5 5 0 0 0 5.2 8.4z" fill="#EAD49E" stroke="${INK}" stroke-width=".8"/>
    <path d="M25 50l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#E7B7C8"/><path d="M95 62l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#A9C4E6"/><circle cx="91" cy="30" r="1.5" fill="#C8B8E8"/><circle cx="28" cy="88" r="1.2" fill="#E3C47E"/></svg>`
};
const ORNAMENT = `<svg viewBox="0 0 240 40" aria-hidden="true"><path d="M20 22c30-10 60 8 100 0s70-10 100 0" fill="none" stroke="#C9A96E" stroke-width="1" stroke-dasharray="1 4" stroke-linecap="round"/>
  <path d="M120 8l2.4 6.6 6.6 2.4-6.6 2.4L120 26l-2.4-6.6-6.6-2.4 6.6-2.4z" fill="#E3C47E"/><path d="M96 20l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#A9C2E6"/><path d="M146 18l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#E8B8C6"/>
  <circle cx="70" cy="18" r="1.6" fill="#C9BDE6"/><circle cx="172" cy="24" r="1.6" fill="#C9BDE6"/></svg>`;
const ICON_TWO = `<svg viewBox="0 0 36 24" aria-hidden="true"><circle cx="13" cy="12" r="8" fill="#F2D3DA" stroke="#4A4560" stroke-width="1"/><circle cx="23" cy="12" r="8" fill="#CFDBF2" fill-opacity=".85" stroke="#4A4560" stroke-width="1"/></svg>`;
const ICON_ONE = `<svg viewBox="0 0 36 24" aria-hidden="true"><circle cx="18" cy="12" r="8" fill="#F3E3C6" stroke="#4A4560" stroke-width="1"/><path d="M18 7l1.2 3.4 3.4 1.2-3.4 1.2L18 16l-1.2-3.4-3.4-1.2 3.4-1.2z" fill="#C9A96E"/></svg>`;
const ICON_GIFT = `<svg viewBox="0 0 36 24" aria-hidden="true"><rect x="9" y="9" width="18" height="12" rx="1.5" fill="#E3EAF6" stroke="#4A4560" stroke-width="1"/><rect x="7.5" y="6" width="21" height="4" rx="1" fill="#F2D3DA" stroke="#4A4560" stroke-width="1"/><path d="M18 6v15" stroke="#BF9C5E" stroke-width="1.6"/><path d="M18 6c-3-4-7-3-5 0m5 0c3-4 7-3 5 0" fill="none" stroke="#BF9C5E" stroke-width="1.2"/></svg>`;
const ICON_DICE = `<svg viewBox="0 0 36 24" aria-hidden="true"><rect x="10" y="4" width="16" height="16" rx="4" fill="#F7EBD3" stroke="#4A4560" stroke-width="1" transform="rotate(-10 18 12)"/><g fill="#4A4560"><circle cx="14.6" cy="9.2" r="1.3"/><circle cx="18" cy="12" r="1.3"/><circle cx="21.4" cy="14.8" r="1.3"/></g><path d="M29 5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z" fill="#C9A96E"/></svg>`;
const ICON_DICE_SMALL = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" style="vertical-align:-3px;margin-right:6px"><rect x="4" y="4" width="16" height="16" rx="4" fill="none" stroke="currentColor" stroke-width="1.4"/><g fill="currentColor"><circle cx="8.6" cy="8.6" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="15.4" cy="15.4" r="1.4"/></g></svg>`;
const GIFT_ART = `<svg viewBox="0 0 160 120" aria-hidden="true"><defs><linearGradient id="gb" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#E9EEF8"/><stop offset="1" stop-color="#CFDAF0"/></linearGradient></defs>
  <ellipse cx="80" cy="108" rx="46" ry="5" fill="#3D3950" opacity=".08"/>
  <rect x="42" y="52" width="76" height="54" rx="4" fill="url(#gb)" stroke="#4A4560" stroke-width="1.2"/>
  <rect x="36" y="40" width="88" height="16" rx="3" fill="#F6E3E7" stroke="#4A4560" stroke-width="1.2"/>
  <path d="M80 40v66" stroke="#BF9C5E" stroke-width="5"/><path d="M80 40v66" stroke="#E6CF98" stroke-width="1.4"/>
  <path d="M80 40c-10-16-30-16-24-2 3 6 16 4 24 2zm0 0c10-16 30-16 24-2-3 6-16 4-24 2z" fill="#F2D3DA" stroke="#4A4560" stroke-width="1.1"/>
  <circle cx="80" cy="40" r="4" fill="#BF9C5E"/>
  <path d="M128 22l1.6 4.2 4.2 1.6-4.2 1.6-1.6 4.2-1.6-4.2-4.2-1.6 4.2-1.6z" fill="#E3C47E"/><path d="M30 30l1.2 3 3 1.2-3 1.2-1.2 3-1.2-3-3-1.2 3-1.2z" fill="#A9C2E6"/><circle cx="138" cy="60" r="1.8" fill="#C9BDE6"/><circle cx="24" cy="70" r="1.6" fill="#E8B8C6"/></svg>`;
const ICON_CABINET = `<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style="vertical-align:-3px;margin-right:6px"><path d="M5 21V9a7 7 0 0 1 14 0v12z" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M3.5 21h17M5 15h14" stroke="currentColor" stroke-width="1.1"/><circle cx="12" cy="11.6" r="2" fill="none" stroke="currentColor" stroke-width="1.1"/></svg>`;

Object.assign(MODES[0], { icon: ICON_TWO }); Object.assign(MODES[1], { icon: ICON_GIFT }); Object.assign(MODES[2], { icon: ICON_ONE }); Object.assign(MODES[3], { icon: ICON_DICE });
route();
