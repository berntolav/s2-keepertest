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
  const { w } = app(t);
  const timers = [];
  w.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
  w.eval("t5phase='input'; t5seq=['L','M','R']; t5inp=[]; t5len=3;");
  w.seqTap('L'); w.seqTap('M'); w.seqTap('R'); w.seqTap('R');
  assert.equal(w.document.getElementById('t5s').textContent, 'Riktig!');
  assert.equal(timers.filter(t => t.fn === w.showResults).length, 0);
  assert.equal(timers.filter(t => t.fn === w.t5show).length, 1);
  assert.equal(w.eval('t5inp.length'), 3);
});

test('makslengd planlegg resultat berre éin gong ved dobbelttrykk', t => {
  const { w } = app(t);
  const timers = [];
  w.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
  w.eval("t5phase='input'; t5seq=['L','M','R','L','M','R','L']; t5inp=[]; t5len=7;");
  for (const dir of ['L','M','R','L','M','R','L','L']) w.seqTap(dir);
  assert.equal(timers.filter(t => t.fn === w.showResults).length, 1);
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
