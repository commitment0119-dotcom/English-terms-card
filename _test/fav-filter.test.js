/* 生词本板块筛选测试

   需求（用户）：
     ①「生词本标注区域设置成可以选择板块（人名/地名/专业名/机构名/其他）」
     ② 澄清：「不是归类，是按照词库既有的分类来选择单词进行翻译」

   即：这个选择器是**筛选器**，不是归类工具。
   选定某个板块后，这一轮只从生词本里拿「本来就属于该板块」的词来翻译；
   词的分类不变，收藏也不变。

   覆盖：
   A. 生词本页签里，顶部标签栏变成板块筛选条（含返回键）；其他页签不变
   B. 筛选生效：选「人名」后题组只剩人名板块的词，数量与卡片都吻合
   C. 筛选不归类：词的 sec 不变、原板块页签数量不变、导出里分类不变
   D. 筛选持久化：重开页面仍在筛选态
   E. 只筛生词本：板块页签本身仍显示全库数量，不受筛选影响
   F. 筛选不存在的板块：该板块没词就不给选项（选了也只会退回全部）
   G. 筛选不动收藏：生词本总数与「全部」数量不变
   H. 筛选后仍然能正常判分（译对/译错、介绍照旧）
   I. 换页签后筛选不影响别的页签；回生词本仍在筛选态
   J. 空筛选自动回到「全部」（生词本里没有该板块的词时）

   —— 安全性要求 ——
   所有 DOM 读取走安全访问器，旧版本上每条断言干净 FAIL 而不是抛异常。
*/
const fs = require('fs');
const { JSDOM } = require('jsdom');

const TARGET = process.env.TARGET || 'D:/alldata2026/download/2026-10-01-16-31-55/手机版/index.html';
const html = fs.readFileSync(TARGET, 'utf8');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, c, e = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + ' ' + e)); };

const q = (d, sel) => { try { return d.querySelector(sel); } catch (e) { return null; } };
const txt = el => (el ? (el.textContent || '') : '');
const click = (w, el) => { if (!el) return false; try { el.dispatchEvent(new w.MouseEvent('click', { bubbles: true })); return true; } catch (e) { return false; } };
const tryClick = (w, d, sel) => click(w, q(d, sel));

const store = new Map();
function makeStorage() {
  return {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: k => { store.delete(k); },
    clear: () => store.clear(),
    key: i => Array.from(store.keys())[i] ?? null,
    get length() { return store.size; },
  };
}

function boot() {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/',
    beforeParse(w) {
      let vh = 844; const L = {};
      const vv = {
        get height() { return vh; }, get offsetTop() { return 0; },
        addEventListener(t, f) { (L[t] = L[t] || []).push(f); }, removeEventListener() {},
      };
      Object.defineProperty(w, 'visualViewport', { value: vv, configurable: true });
      Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5, configurable: true });
      w.matchMedia = qq => ({
        matches: /hover:none|pointer:coarse/.test(qq),
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      });
      w.__setVV = h => { vh = h; (L.resize || []).forEach(f => f({})); };
      Object.defineProperty(w, 'localStorage', { value: makeStorage(), configurable: true });
    },
  });
  const w = dom.window, d = w.document;
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { dom, w, d };
}

const termNow = d => txt(q(d, '.term')).trim();
const chipNow = d => txt(q(d, '.chip')).trim();
/* 底部「n / m」计数里的 m = 当前题组总词数（最可靠的一组长度读数） */
const deckLen = d => {
  const m = /(\d+)\s*\/\s*(\d+)/.exec(txt(q(d, '.counter')));
  return m ? parseInt(m[2], 10) : -1;
};
const tabN = (d, key) => {
  const t = [...d.querySelectorAll('#tabs .tab')].find(b => b.dataset && b.dataset.tab === key);
  const n = t && t.querySelector('.n');
  return n ? (parseInt(txt(n), 10) || 0) : -1;
};
const hasTab = (d, key) => [...d.querySelectorAll('#tabs .tab')].some(b => b.dataset && b.dataset.tab === key);
const setFavs = o => store.set('etf_favs', JSON.stringify(o));
const setCustom = a => store.set('etf_custom', JSON.stringify(a));
const getFavFilter = () => { try { return JSON.parse(store.get('etf_favfilter') || '"all"'); } catch (e) { return null; } };

/* 选择板块筛选：生词本页签里，标签栏本身就是筛选条，点对应的 .tab.f 即可。 */
async function pickFilter(w, d, key) {
  const b = [...d.querySelectorAll('#tabs .tab')].find(x => x.dataset && x.dataset.fsec === key);
  if (!b) return false;
  click(w, b);
  await sleep(280);
  return true;
}
const filterOpts = d =>
  [...d.querySelectorAll('#tabs .tab')].filter(x => x.dataset && x.dataset.fsec)
    .map(x => x.dataset.fsec);
/* 当前高亮的筛选项 */
const curFilter = d => {
  const b = q(d, '#tabs .tab.f.on');
  return b && b.dataset ? b.dataset.fsec : null;
};
const hasBackTab = d => !!q(d, '#tabs .tab.back');
const tabLabels = d => [...d.querySelectorAll('#tabs .tab')].map(b => txt(b).trim());
/* 走一遍当前题组，返回所有出现过的词面（用于验证"这一组里都是某板块的词"） */
async function readAllTerms(w, d, max) {
  const seen = [];
  const t0 = termNow(d);
  if (t0) seen.push(t0);
  for (let i = 0; i < (max || 60); i++) {
    const nb = q(d, '#nextBtn');
    // 到末尾按钮会 disabled —— 注意 dispatchEvent 对 disabled 按钮依然返回 true，
    // 不显式判断就会一直"点"在同一张卡上，把同一个词读 60 遍。
    if (!nb || nb.disabled) break;
    if (!tryClick(w, d, '#nextBtn')) break;
    await sleep(340);                                 // go() 有 ~275ms 动画锁
    const t = termNow(d);
    if (t) seen.push(t);
  }
  return seen;
}

(async () => {

  console.log('\n===== A. 生词本里有板块筛选器 =====');
  {
    store.clear();
    setFavs({ 'names|Walt Disney|华特·迪士尼': 1, 'places|Greece|希腊': 1, 'orgs|United Nations (UN)|联合国': 1 });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    ck('标签栏变成筛选条：有返回键', hasBackTab(d), '');
    ck('第一格是「全部板块」返回键', /全部板块/.test(txt(q(d, '#tabs .tab.back'))), txt(q(d, '#tabs .tab.back')));
    ck('有筛选项（.tab.f）', filterOpts(d).length > 0, filterOpts(d).join(','));
    ck('默认选中「all」', curFilter(d) === 'all', String(curFilter(d)));
    ck('筛选条里第一格是「生词本」全部', filterOpts(d)[0] === 'all', filterOpts(d).join(','));
    ck('标注区仍是原分类标注（不是选择器）', !!q(d, '.chip') && !q(d, '#secSel'), 'chip=' + chipNow(d));
    ck('卡片区没有再塞一行工具带', !q(d, '.fbar'), 'unexpected fbar');
    ck('卡片区没有下拉筛选器', !q(d, '#favSel'), 'unexpected select');
    // 从生词本筛选态点返回 → 回到板块导航，其余页签都回来
    tryClick(w, d, '#tabs .tab.back');
    await sleep(260);
    tryClick(w, d, '#tabs button[data-tab="names"]');
    await sleep(240);
    ck('人名页签里没有返回键', !hasBackTab(d), 'unexpected back');
    ck('人名页签里没有筛选项', filterOpts(d).length === 0, filterOpts(d).join(','));
    ck('人名页签的标注仍是普通 chip', !!q(d, '.chip'), 'missing chip');
    ck('人名页签仍能看到「生词本」页签', !!q(d, '#tabs button[data-tab="fav"]'), '');
    dom.window.close();
  }

  console.log('\n===== B. 筛选生效：只刷该板块的词 =====');
  {
    store.clear();
    // 生词本 2 个人名 + 1 个地名 + 1 个机构
    setFavs({
      'names|Walt Disney|华特·迪士尼': 1, 'names|Aristotle|亚里士多德': 1,
      'places|Greece|希腊': 1, 'orgs|United Nations (UN)|联合国': 1,
    });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    ck('筛选前题组 = 生词本全部 4 词', deckLen(d) === 4, String(deckLen(d)));
    ck('筛选项里有「人名」', filterOpts(d).includes('names'), filterOpts(d).join(','));
    await pickFilter(w, d, 'names');
    ck('选「人名」后题组 = 2 词', deckLen(d) === 2, String(deckLen(d)));
    ck('「人名」筛选项呈选中态', curFilter(d) === 'names', String(curFilter(d)));
    ck('第一张就是人名板块的词', /Disney|迪士尼|Aristotle|亚里士多德/.test(termNow(d)), termNow(d));
    const terms = await readAllTerms(w, d, 6);
    ck('组内每张都是人名板块的词（无地名/机构混入）',
      terms.length === 2 && terms.every(t => /Disney|迪士尼|Aristotle|亚里士多德/.test(t)),
      terms.join(' | '));
    dom.window.close();
  }

  console.log('\n===== C. 筛选不是归类：分类与导出都不变 =====');
  {
    store.clear();
    setFavs({ 'names|Walt Disney|华特·迪士尼': 1, 'places|Greece|希腊': 1 });
    const namesBefore = null;
    const { dom, w, d } = boot();
    await sleep(280);
    const namesN0 = tabN(d, 'names'), placesN0 = tabN(d, 'places');
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    await pickFilter(w, d, 'places');
    ck('筛选时筛选条显示的是「生词本里的地名数」=1',
      (() => { const t = [...d.querySelectorAll('#tabs .tab.f')].find(x => x.dataset.fsec === 'places');
               return t && /\b1\b/.test(txt(t)); })(),
      (() => { const t = [...d.querySelectorAll('#tabs .tab.f')].find(x => x.dataset.fsec === 'places');
               return t ? txt(t) : 'missing'; })());
    // 切回板块导航：各板块数量必须与筛选前一致（筛选不改动分类）
    tryClick(w, d, '#tabs .tab.back');
    await sleep(260);
    ck('返回后，人名页签数量不变', tabN(d, 'names') === namesN0, tabN(d, 'names') + ' vs ' + namesN0);
    ck('返回后，地名页签数量不变', tabN(d, 'places') === placesN0, tabN(d, 'places') + ' vs ' + placesN0);
    // 再回生词本筛选态，确认筛选值还在
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(260);
    // 卡片左上角的标注仍是「这个词自己的细分标签」，筛选不改变它。
    // Greece 的 g = 国家/地区（chipText 在 g !== secTitle 时显示 g）。
    ck('筛选后仍是该词自己的标注（不是筛选器）', chipNow(d) === '国家/地区', chipNow(d));
    ck('卡片上没有把标注变成选择器', !q(d, '#secSel'), '');
    ck('筛选条也没被当成归类工具（只切筛选）', curFilter(d) === 'places', String(curFilter(d)));
    // 导出里的分类字段应与筛选无关
    const json = (() => {
      try { return JSON.parse(store.get('etf_favs') || '{}'); } catch (e) { return {}; }
    })();
    ck('生词本记录里没有人名被搬走', !!json['names|Walt Disney|华特·迪士尼'], JSON.stringify(json));
    ck('没有写入任何归类记录（etf_secov 不存在）', !store.has('etf_secov'), String(store.get('etf_secov')));
    dom.window.close();
  }

  console.log('\n===== D. 筛选持久化：重开仍在筛选态 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'places|Greece|希腊': 1 });
    store.set('etf_favfilter', JSON.stringify('places'));
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    ck('重开后筛选值是 places', curFilter(d) === 'places', String(curFilter(d)));
    ck('重开后题组 = 1 词（只有地名）', deckLen(d) === 1, String(deckLen(d)));
    ck('重开后第一张是地名板块的词', /Greece|希腊/.test(termNow(d)), termNow(d));
    dom.window.close();
  }

  console.log('\n===== E. 只筛生词本：板块页签仍显示全库数量 =====');
  {
    store.clear();
    setFavs({ 'names|Walt Disney|华特·迪士尼': 1 });
    const { dom, w, d } = boot();
    await sleep(280);
    const namesAll = tabN(d, 'names');            // 全库人名数（94）
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    await pickFilter(w, d, 'names');
    ck('筛选后题组 = 生词本里人名 1 词', deckLen(d) === 1, String(deckLen(d)));
    ck('筛选条上「人名」显示的是生词本里的 1（不是全库 94）',
      (() => { const t = [...d.querySelectorAll('#tabs .tab.f')].find(x => x.dataset.fsec === 'names');
               return t && /\b1\b/.test(txt(t)) && !/94/.test(txt(t)); })(),
      (() => { const t = [...d.querySelectorAll('#tabs .tab.f')].find(x => x.dataset.fsec === 'names');
               return t ? txt(t) : 'missing'; })());
    // 返回板块导航 → 人名仍是全库 94（筛选只作用于生词本，没改分类）
    tryClick(w, d, '#tabs .tab.back');
    await sleep(260);
    ck('返回后人名页签仍是全库 94（筛选只作用于生词本）', tabN(d, 'names') === namesAll, tabN(d, 'names') + ' vs ' + namesAll);
    dom.window.close();
  }

  console.log('\n===== F. 生词本里没有的板块不给选项 =====');
  {
    store.clear();
    setFavs({ 'names|Walt Disney|华特·迪士尼': 1 });   // 只有人名
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    const opts = filterOpts(d);
    ck('筛选条含「all」', opts.includes('all'), opts.join(','));
    ck('筛选条含「人名」', opts.includes('names'), opts.join(','));
    ck('不含没有词的「地名」', !opts.includes('places'), opts.join(','));
    ck('不含没有词的「作品名」', !opts.includes('works'), opts.join(','));
    ck('不含没有词的「其他」', !opts.includes('other'), opts.join(','));
    ck('含返回键，能回到板块导航', hasBackTab(d), '');
    dom.window.close();
  }

  console.log('\n===== G. 筛选不动收藏：生词本/全部数量不变 =====');
  {
    store.clear();
    setFavs({ 'names|Walt Disney|华特·迪士尼': 1, 'names|Aristotle|亚里士多德': 1, 'places|Greece|希腊': 1 });
    const { dom, w, d } = boot();
    await sleep(280);
    const allBefore = tabN(d, 'all'), favBefore = tabN(d, 'fav');
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    await pickFilter(w, d, 'names');       // 生词本 3 词里只有 2 个人名
    // 筛选条上「生词本」那格显示的是收藏总数，不该因筛选而变化
    ck('筛选条上「生词本」总数仍是 3',
      (() => { const t = [...d.querySelectorAll('#tabs .tab.f')].find(x => x.dataset.fsec === 'all');
               return t && /\b3\b/.test(txt(t)); })(),
      (() => { const t = [...d.querySelectorAll('#tabs .tab.f')].find(x => x.dataset.fsec === 'all');
               return t ? txt(t) : 'missing'; })());
    tryClick(w, d, '#tabs .tab.back');
    await sleep(260);
    ck('「全部」数量不变', tabN(d, 'all') === allBefore, tabN(d, 'all') + ' vs ' + allBefore);
    ck('「生词本」页签数量不变', tabN(d, 'fav') === favBefore, tabN(d, 'fav') + ' vs ' + favBefore);
    dom.window.close();
  }

  console.log('\n===== H. 筛选后仍能正常判分 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'places|Greece|希腊': 1 });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    await pickFilter(w, d, 'names');
    ck('已筛到人名（1 词）', deckLen(d) === 1, String(deckLen(d)));
    ck('当前是亚里士多德', /Aristotle|亚里士多德/.test(termNow(d)), termNow(d));
    // 故意答错 → 应出结果 + 词条介绍
    const inp = q(d, '#input');
    if (inp) { inp.value = '完全错误'; inp.dispatchEvent(new w.Event('input', { bubbles: true })); }
    tryClick(w, d, '#mainBtn');
    await sleep(200);
    ck('译错后有判定结果', !!q(d, '#resultBox .stamp'), '');
    ck('译错后仍显示该词的介绍', /古希腊哲学家/.test(txt(q(d, '#resultBox .introbox .iv'))), txt(q(d, '#resultBox .introbox .iv')).slice(0, 24));
    dom.window.close();
  }

  console.log('\n===== I. 筛选不串页签 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'places|Greece|希腊': 1 });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    await pickFilter(w, d, 'names');
    // 从筛选态返回板块导航，再进别的页签
    tryClick(w, d, '#tabs .tab.back');
    await sleep(260);
    tryClick(w, d, '#tabs button[data-tab="orgs"]');
    await sleep(240);
    ck('机构名页签里没有筛选项', filterOpts(d).length === 0, filterOpts(d).join(','));
    ck('机构名页签题组 = 全库机构数 38', deckLen(d) === 38, String(deckLen(d)));
    // 回生词本，筛选还在
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    ck('回到生词本筛选值仍是 names', curFilter(d) === 'names', String(curFilter(d)));
    ck('回到生词本题组仍是 1 词', deckLen(d) === 1, String(deckLen(d)));
    // 点返回键 → 回板块导航，其余板块页签都回来
    tryClick(w, d, '#tabs .tab.back');
    await sleep(260);
    ck('返回后不再是筛选条', !hasBackTab(d), '');
    ck('返回后能看到「地名」板块页签', !!q(d, '#tabs button[data-tab="places"]'), '');
    ck('返回后题组 = 该板块全库数', deckLen(d) === tabN(d, 'all') || deckLen(d) > 1, String(deckLen(d)));
    dom.window.close();
  }

  console.log('\n===== J. 筛选的板块被清空 → 自动回「全部」 =====');
  {
    store.clear();
    setFavs({ 'places|Greece|希腊': 1 });
    store.set('etf_favfilter', JSON.stringify('names'));   // 存了一个已无词的筛选
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    ck('自动退回 all', curFilter(d) === 'all', String(curFilter(d)));
    ck('题组 = 生词本全部 1 词（不会空组）', deckLen(d) === 1, String(deckLen(d)));
    dom.window.close();
  }

  console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
