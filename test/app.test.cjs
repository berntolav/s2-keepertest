const { readFileSync } = require('node:fs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { runInContext } = require('node:vm');

const html = readFileSync(process.env.S2_TEST_HTML || require.resolve('../index.html'), 'utf8');

function app(t, { insertError = null, readError = null, scores = [{ score: 70 }], insertWait = null } = {}) {
  // Ingen ressurslasting: CDN og produksjons-Supabase blir aldri kontakta.
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://example.test/' });
  t.after(() => dom.window.close());
  const w = dom.window;
  const saved = [];
  w.scrollTo = () => {};
  w.supabase = { createClient: () => ({ from: () => ({
    insert: async row => { saved.push(row); if (insertWait) await insertWait; return { error: insertError }; },
    select: () => ({ order: () => ({ limit: async () => ({ data: scores, error: readError }) }) }),
  }) }) };
  runInContext([...w.document.querySelectorAll('script:not([src])')].map(s => s.textContent).join('\n'), dom.getInternalVMContext());
  return { w, saved };
}

for (const name of ['<img src=x onerror="window.injected=1">', '<svg onload="window.injected=2"></svg>', "O'Våg & Åse", '&lt;b&gt;Test&lt;/b&gt;']) {
  test(`namn er rein tekst i resultat og toppliste: ${name}`, async t => {
    const { w, saved } = app(t);
    w.document.getElementById('pname').value = name;
    w.start();
    w.showResults();
    await new Promise(setImmediate);
    const comment = w.document.getElementById('rcom');
    assert.ok(comment.textContent.includes(name));
    assert.equal(comment.querySelectorAll('img,svg,script').length, 0);
    assert.equal(saved[0].name, name);
    w.lbRender([{ name, score: 70, date: '<img src=x>' }]);
    const list = w.document.getElementById('lblist');
    assert.equal(list.querySelector('.lbname').textContent, name);
    assert.equal(list.querySelector('.lbsub').textContent, '<img src=x>');
    assert.equal(list.querySelectorAll('img,svg,script').length, 0);
  });
}

test('ekstra trykk etter rett sekvens blir ignorert gjennom overgangen', t => {
  const { w, saved } = app(t);
  const c = clock(w);
  w.eval("t5phase='input'; t5seq=['L','M','R']; t5inp=[]; t5len=3;");
  w.seqTap('L'); w.seqTap('M'); w.seqTap('R'); w.seqTap('R');
  assert.equal(w.document.getElementById('t5s').textContent, 'Riktig!');
  assert.equal(w.eval('t5inp.length'), 3);
  c.drain();
  assert.equal(w.eval('t5len'), 4);
  assert.equal(w.eval('t5phase'), 'input');
  assert.equal(saved.length, 0);
});

test('makslengd planlegg resultat berre éin gong ved dobbelttrykk', async t => {
  const { w, saved } = app(t);
  const c = clock(w);
  w.eval("t5phase='input'; t5seq=['L','M','R','L','M','R','L']; t5inp=[]; t5len=7;");
  for (const dir of ['L','M','R','L','M','R','L','L']) w.seqTap(dir);
  c.drain();
  await new Promise(setImmediate);
  assert.equal(saved.length, 1);
  assert.equal(w.document.querySelector('.screen.active').id, 'sr');
});

test('avvist insert viser lagringsfeil utan topplassering', async t => {
  const { w } = app(t, { insertError: { message: 'denied' } });
  w.showResults();
  await new Promise(setImmediate);
  const text = w.document.getElementById('rcom').textContent;
  assert.match(text, /ikkje lagra/i);
  assert.doesNotMatch(text, /Ny toppscore|Nr\. 0|på topplista/);
  assert.equal(w._lastEntry, null);
});

test('vellukka lagring og rangering held fram med å virke', async t => {
  const { w, saved } = app(t, { scores: [{ score: 0 }] });
  w.document.getElementById('pname').value = 'Testkeeper'; w.start();
  w.showResults();
  await new Promise(setImmediate);
  assert.equal(saved.length, 1);
  assert.equal(w._lastEntry.name, 'Testkeeper');
  assert.match(w.document.getElementById('rcom').textContent, /Ny toppscore/);
});

test('vellukka lagring med feila rangering viser lagra utan falsk rang', async t => {
  const { w } = app(t, { readError: { message: 'denied' }, scores: null });
  w.showResults();
  await new Promise(setImmediate);
  const text = w.document.getElementById('rcom').textContent;
  assert.match(text, /lagra/i);
  assert.doesNotMatch(text, /Nr\. 0|Ny toppscore/);
});

test('seint lagringssvar etter nullstilling gjenopplivar ikkje førre resultat', async t => {
  let complete;
  const insertWait = new Promise(resolve => { complete = resolve; });
  const { w } = app(t, { insertWait, scores: [{ score: 0 }] });
  w.showResults();
  w.resetAll();
  complete();
  await new Promise(setImmediate);
  assert.equal(w._lastEntry, null);
  assert.doesNotMatch(w.document.getElementById('rcom').textContent, /Ny toppscore/);
});

function clock(w) {
  let now = 0, nextId = 0;
  const pending = new Map();
  w.setTimeout = (fn, delay) => { const id = ++nextId; pending.set(id, { fn, at: now + delay }); return id; };
  w.clearTimeout = id => pending.delete(id);
  function tick() {
    const first = [...pending.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (!first) return false;
    pending.delete(first[0]); now = first[1].at; first[1].fn(); return true;
  }
  return { pending, tick, drain() { let n = 0; while (tick()) assert.ok(++n < 1000, 'timerløkkja må avsluttast'); } };
}

for (const stage of ['startT1', 'startT2', 'startT3', 'startT4', 'startT5', 't5blink', 't5next', 't5fail', 't5max']) {
  test(`resetAll avbryt alle tidsstyrte overgangar: ${stage}`, async t => {
    const { w, saved } = app(t);
    const c = clock(w);
    if (stage.startsWith('start')) w[stage]();
    else if (stage === 't5blink') { w.startT5(); c.tick(); }
    else {
      const seq = stage === 't5max' ? ['L','M','R','L','M','R','L'] : ['L','M','R'];
      w.eval(`t5phase='input';t5seq=${JSON.stringify(seq)};t5inp=[];t5len=${seq.length};`);
      if (stage === 't5fail') w.seqTap('R');
      else for (const dir of seq) w.seqTap(dir);
    }
    assert.ok(c.pending.size > 0);
    const queued = [...c.pending.values()].map(t => t.fn);
    w.resetAll();
    assert.equal(c.pending.size, 0);
    // Sjølv ein callback som alt var køa før clearTimeout skal vere harmlaus.
    for (const fn of queued) fn();
    c.drain();
    await new Promise(setImmediate);
    assert.equal(w.document.querySelector('.screen.active').id, 's0');
    assert.equal(saved.length, 0);
    assert.equal(w._lastEntry, null);
    assert.equal(w.eval('t1wait || t2wait || t3wait || t4wait'), false);
    assert.equal(w.eval('t5phase'), 'idle');
  });
}

test('ny sekvenstest etter reset fullfører og lagrar éin gong', async t => {
  const { w, saved } = app(t);
  const c = clock(w);
  w.startT5(); w.resetAll();
  w.document.getElementById('pname').value = 'Ny keeper'; w.start(); w.startT5();
  for (let length = 3; length <= 7; length++) {
    c.drain();
    assert.equal(w.eval('t5phase'), 'input');
    for (const dir of w.eval('t5seq.slice()')) w.seqTap(dir);
    w.seqTap('L'); // ekstratrykk i overgangen
  }
  c.drain();
  await new Promise(setImmediate);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, 'Ny keeper');
  assert.equal(w.document.querySelector('.screen.active').id, 'sr');
});
