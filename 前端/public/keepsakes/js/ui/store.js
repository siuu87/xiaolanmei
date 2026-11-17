// Local, per-browser state: names, rounds in progress, and the shelf of kept things.
// Nothing here leaves the device unless the person shares a link or exports a file.
const KEY = 'ck.v1';

function read() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function write(s) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); return true; } catch { return false; }
}

export const store = {
  names() { return { human: '', ai: '', ...(read().names || {}) }; },
  setNames(n) { const s = read(); s.names = { ...this.names(), ...n }; write(s); },

  lang() { return read().lang || 'zh'; },
  setLang(l) { const s = read(); s.lang = l; write(s); },
  mode() { return read().mode || 'companion'; },
  setMode(m) { const s = read(); s.mode = m; write(s); },

  rounds() { return Object.values(read().rounds || {}).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))); },
  round(id) { return (read().rounds || {})[id] || null; },
  saveRound(r) { const s = read(); s.rounds = { ...(s.rounds || {}), [r.id]: r }; write(s); return r; },
  dropRound(id) { const s = read(); if (s.rounds) delete s.rounds[id]; write(s); },

  shelf() { return (read().shelf || []).slice().sort((a, b) => String(b.keptAt).localeCompare(String(a.keptAt))); },
  keep(item) {
    const s = read();
    s.shelf = (s.shelf || []).filter(x => x.id !== item.id).concat(item);
    if (!write(s)) { // storage full: keep the object, drop the picture
      s.shelf = s.shelf.map(x => x.id === item.id ? { ...x, thumb: null } : x);
      write(s);
    }
  },
  onShelf(id) { return (read().shelf || []).some(x => x.id === id); }
};
