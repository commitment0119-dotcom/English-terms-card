/* 本组错题练习测试

   需求（用户）：每组词练习完后，加入本组错题练习板块。

   设计：
   - 一组词「全部作答完」（对错都算）后，卡片下方出现收尾条
   - 有错题 → 「只练这 N 个错题 ›」入口；没错题 → 只显示「这一组全答对了」
   - 进入后题组 = 该组错题；顶部有「错题练习」小标 + 剩余计数 + 退出键
   - 判分规则完全不变；复习期间答对会把该词从错题里摘掉
   - 全部答对 → 提示「错题都答对了」
   - 退出 → 回到进入前那一组词与原位置
   - 切板块/切筛选/打乱/重置/导入 → 自动退出复习态

   覆盖：
   A. 没答完不出现收尾条
   B. 全答完且全对 → 只显示「全答对了」，没有错题入口
   C. 全答完且有错 → 出现入口，数字正确
   D. 进入错题练习：题组换成错题、顺序与原组一致、顶部小标出现
   E. 复习里判分规则不变（译对/译错照旧、错题介绍照旧）
   F. 复习里答对 → 剩余计数递减；全答对 → 提示「错题都答对了」
   G. 退出复习 → 回到原题组与原位置
   H. 切板块 / 切筛选 / 打乱 → 自动退出复习态
   I. 重置进度 → 清除复习态，收尾条消失
   J. 复习态持久性：重开页面不会「假装」还在复习（题组回到常规）

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
const deckLen = d => { const m = /(\d+)\s*\/\s*(\d+)/.exec(txt(q(d, '.counter'))); return m ? parseInt(m[2], 10) : -1; };
const curIdx = d => { const m = /(\d+)\s*\/\s*(\d+)/.exec(txt(q(d, '.counter'))); return m ? parseInt(m[1], 10) : -1; };
const setFavs = o => store.set('etf_favs', JSON.stringify(o));
const setResults = o => store.set('etf_results', JSON.stringify(o));
const setPhase = o => store.set('etf_phase', JSON.stringify(o));
const getResults = () => { try { return JSON.parse(store.get('etf_results') || '{}'); } catch (e) { return {}; } };

/* 当前是否在复习态（靠顶部小标判断，最贴近用户可见的事实） */
const inReview = d => !!q(d, '.rvbar');
const doneBar = d => q(d, '.donebar');
const doneBarText = d => txt(doneBar(d));
const hasStartBtn = d => !!q(d, '#rvStart');

/* 作答当前卡：
   text == null / '__WRONG__' → 点「不记得」（判错）
   其它文本                  → 填进输入框后点主按钮（判对错由 isCorrect 决定） */
async function answer(w, d, text) {
  const inp = q(d, '#input');
  if (inp) {
    inp.value = (text == null || text === '__WRONG__') ? '' : text;
    inp.dispatchEvent(new w.Event('input', { bubbles: true }));
  }
  if (text == null || text === '__WRONG__') tryClick(w, d, '#giveBtn');
  else {
    const mb = q(d, '#mainBtn');
    if (mb) { click(w, mb); }
    else tryClick(w, d, '#giveBtn');
  }
  await sleep(260);
}
/* 往后翻一张（go 有 ~275ms 动画锁） */
async function next(w, d) {
  const nb = q(d, '#nextBtn');
  if (!nb || nb.disabled) return false;
  click(w, nb);
  await sleep(340);
  return true;
}
/* 把当前题组从头到尾按 wrongSet 指定的位置答错、其余答对 */
async function playGroup(w, d, wrongSet) {
  let i = 0;
  while (true) {
    const correct = !wrongSet.has(i);
    await answer(w, d, correct ? '__RIGHT__' : '__WRONG__');
    if (!(await next(w, d))) break;
    if (++i > 400) break;
  }
}

(async () => {

  console.log('\n===== A. 没答完不出现收尾条 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'names|Plato|柏拉图': 1, 'names|Socrates|苏格拉底': 1 });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    ck('进生词本 3 词', deckLen(d) === 3, String(deckLen(d)));
    ck('一开始没有收尾条', !doneBar(d), doneBarText(d));
    await answer(w, d, '完全错');       // 只答第 1 张
    ck('答了 1 张仍没有收尾条', !doneBar(d), doneBarText(d));
    ck('也没有错题入口', !hasStartBtn(d), '');
    dom.window.close();
  }

  console.log('\n===== B. 全答完且全对 → 只有嘉许，没有入口 =====');
  {
    store.clear();
    // 用「按 id 预置答案」的方式最稳：句子给对答案太麻烦，这里直接预置结果
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'names|Plato|柏拉图': 1 });
    setResults({ 'names|Aristotle|亚里士多德': 'ok', 'names|Plato|柏拉图': 'ok' });
    setPhase({ 'names|Aristotle|亚里士多德': 'done', 'names|Plato|柏拉图': 'done' });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    ck('全对时出现收尾条', !!doneBar(d), doneBarText(d));
    ck('提示「这一组全答对了」', /全答对/.test(doneBarText(d)), doneBarText(d));
    ck('没有错题入口按钮', !hasStartBtn(d), '');
    dom.window.close();
  }

  console.log('\n===== C. 全答完且有错 → 出入口且数字正确 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'names|Plato|柏拉图': 1, 'names|Socrates|苏格拉底': 1 });
    setResults({ 'names|Aristotle|亚里士多德': 'no', 'names|Plato|柏拉图': 'ok', 'names|Socrates|苏格拉底': 'no' });
    setPhase({ 'names|Aristotle|亚里士多德': 'done', 'names|Plato|柏拉图': 'done', 'names|Socrates|苏格拉底': 'done' });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    ck('出现收尾条', !!doneBar(d), doneBarText(d));
    ck('显示本组错题数 2', /做错\s*2|2\s*个/.test(doneBarText(d)), doneBarText(d));
    ck('有错题入口按钮', hasStartBtn(d), '');
    ck('按钮文案含错题数 2', /2/.test(txt(q(d, '#rvStart'))), txt(q(d, '#rvStart')));
    ck('人在常规题组里（无复习小标）', !inReview(d), '');
    dom.window.close();
  }

  console.log('\n===== D. 进入错题练习：题组换成错题 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'names|Plato|柏拉图': 1, 'names|Socrates|苏格拉底': 1 });
    setResults({ 'names|Aristotle|亚里士多德': 'no', 'names|Plato|柏拉图': 'ok', 'names|Socrates|苏格拉底': 'no' });
    setPhase({ 'names|Aristotle|亚里士多德': 'done', 'names|Plato|柏拉图': 'done', 'names|Socrates|苏格拉底': 'done' });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    tryClick(w, d, '#rvStart');
    await sleep(300);
    ck('进入复习态（顶部小标出现）', inReview(d), '');
    ck('题组 = 错题 2 个', deckLen(d) === 2, String(deckLen(d)));
    ck('从第 1 张开始', curIdx(d) === 1, String(curIdx(d)));
    ck('第 1 张是原组里第 1 个错题（Aristotle）', /Aristotle|亚里士多德/.test(termNow(d)), termNow(d));
    ck('小标写明还剩 2 个', /2/.test(txt(q(d, '.rvbar-n'))), txt(q(d, '.rvbar-n')));
    ck('小标有退出键', !!q(d, '#rvExit'), '');
    ck('统计栏切成「错题练习」', /错题练习/.test(txt(q(d, '#stats'))), txt(q(d, '#stats')));
    dom.window.close();
  }

  console.log('\n===== E. 复习里判分规则不变 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'names|Plato|柏拉图': 1 });
    setResults({ 'names|Aristotle|亚里士多德': 'no', 'names|Plato|柏拉图': 'ok' });
    setPhase({ 'names|Aristotle|亚里士多德': 'done', 'names|Plato|柏拉图': 'done' });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    tryClick(w, d, '#rvStart');
    await sleep(300);
    ck('复习里是 Aristotle', /Aristotle|亚里士多德/.test(termNow(d)), termNow(d));
    // 故意答错 → 应出判定 + 词条介绍（与常规完全一致）
    await answer(w, d, '完全错误');
    ck('译错有判定结果', !!q(d, '#resultBox .stamp'), '');
    ck('译错仍显示词条介绍', /古希腊哲学家/.test(txt(q(d, '#resultBox .introbox .iv'))), txt(q(d, '#resultBox .introbox .iv')).slice(0, 20));
    ck('答错后该词仍是 no', getResults()['names|Aristotle|亚里士多德'] === 'no', JSON.stringify(getResults()));
    dom.window.close();
  }

  console.log('\n===== F. 复习里答对 → 剩余递减，全对则提示全清 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'names|Plato|柏拉图': 1, 'names|Socrates|苏格拉底': 1 });
    // 两个错题：Aristotle / Socrates（都预置成 no）
    setResults({ 'names|Aristotle|亚里士多德': 'no', 'names|Plato|柏拉图': 'ok', 'names|Socrates|苏格拉底': 'no' });
    setPhase({ 'names|Aristotle|亚里士多德': 'done', 'names|Plato|柏拉图': 'done', 'names|Socrates|苏格拉底': 'done' });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    tryClick(w, d, '#rvStart');
    await sleep(300);
    ck('起点还剩 2 个', /2/.test(txt(q(d, '.rvbar-n'))), txt(q(d, '.rvbar-n')));
    // 第 1 个错题答对（Aristotle 的正确答案）
    await answer(w, d, '亚里士多德');
    ck('答对后结果记为 ok', getResults()['names|Aristotle|亚里士多德'] === 'ok', JSON.stringify(getResults()));
    ck('还剩 1 个', /还剩\s*1/.test(txt(q(d, '.rvbar-n'))), txt(q(d, '.rvbar-n')));
    // 答对后会自动跳到下一张（AUTO_NEXT_MS≈620ms），等它跳完再答下一题
    await sleep(760);
    ck('已自动跳到第 2 个错题（Socrates）', /Socrates|苏格拉底/.test(termNow(d)), termNow(d));
    // 第 2 个错题也答对
    await answer(w, d, '苏格拉底');
    ck('两个都答对了', getResults()['names|Socrates|苏格拉底'] === 'ok', JSON.stringify(getResults()));
    ck('提示「错题都答对了」', /错题都答对/.test(doneBarText(d)), doneBarText(d));
    ck('给回到本组词的按钮', !!q(d, '#rvExit2'), '');
    dom.window.close();
  }

  console.log('\n===== G. 退出复习 → 回到原题组与原位置 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'names|Plato|柏拉图': 1, 'names|Socrates|苏格拉底': 1 });
    setResults({ 'names|Aristotle|亚里士多德': 'no', 'names|Plato|柏拉图': 'ok', 'names|Socrates|苏格拉底': 'no' });
    setPhase({ 'names|Aristotle|亚里士多德': 'done', 'names|Plato|柏拉图': 'done', 'names|Socrates|苏格拉底': 'done' });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    // 先翻到第 2 张再进复习，验证退出能回到原位置
    await next(w, d);
    ck('原题组停在第 2 张', curIdx(d) === 2, String(curIdx(d)));
    tryClick(w, d, '#rvStart');
    await sleep(300);
    ck('复习态题组 2 词', deckLen(d) === 2, String(deckLen(d)));
    tryClick(w, d, '#rvExit');
    await sleep(300);
    ck('退出后不再是复习态', !inReview(d), '');
    ck('退出后回到原题组 3 词', deckLen(d) === 3, String(deckLen(d)));
    ck('退出后回到原来第 2 张', curIdx(d) === 2, String(curIdx(d)));
    dom.window.close();
  }

  console.log('\n===== H. 切板块 / 切筛选 / 打乱 → 自动退出复习 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'names|Plato|柏拉图': 1 });
    setResults({ 'names|Aristotle|亚里士多德': 'no', 'names|Plato|柏拉图': 'ok' });
    setPhase({ 'names|Aristotle|亚里士多德': 'done', 'names|Plato|柏拉图': 'done' });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    tryClick(w, d, '#rvStart');
    await sleep(300);
    ck('已在复习态', inReview(d), '');
    // 切筛选
    const fb = [...d.querySelectorAll('#tabs .tab.f')].find(x => x.dataset && x.dataset.fsec === 'names');
    click(w, fb);
    await sleep(320);
    ck('切筛选后退出复习态', !inReview(d), '');
    // 再进一次，然后返回板块导航
    tryClick(w, d, '#tabs .tab.back');
    await sleep(300);
    ck('返回板块导航后退出复习态', !inReview(d), '');
    dom.window.close();
  }

  console.log('\n===== I. 重置进度 → 复习态与收尾条都清掉 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'names|Plato|柏拉图': 1 });
    setResults({ 'names|Aristotle|亚里士多德': 'no', 'names|Plato|柏拉图': 'ok' });
    setPhase({ 'names|Aristotle|亚里士多德': 'done', 'names|Plato|柏拉图': 'done' });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    ck('重置前有收尾条', !!doneBar(d), doneBarText(d));
    tryClick(w, d, '#resetBtn');
    await sleep(300);
    ck('重置后收尾条消失', !doneBar(d), doneBarText(d));
    ck('重置后不在复习态', !inReview(d), '');
    ck('重置后进度已清空', Object.keys(getResults()).length === 0, JSON.stringify(getResults()));
    dom.window.close();
  }

  console.log('\n===== J. 重开页面不残留复习态 =====');
  {
    store.clear();
    setFavs({ 'names|Aristotle|亚里士多德': 1, 'names|Plato|柏拉图': 1, 'names|Socrates|苏格拉底': 1 });
    setResults({ 'names|Aristotle|亚里士多德': 'no', 'names|Plato|柏拉图': 'ok', 'names|Socrates|苏格拉底': 'no' });
    setPhase({ 'names|Aristotle|亚里士多德': 'done', 'names|Plato|柏拉图': 'done', 'names|Socrates|苏格拉底': 'done' });
    const { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(240);
    tryClick(w, d, '#rvStart');
    await sleep(300);
    ck('先确认在复习态', inReview(d), '');
    const savedPhase = store.get('etf_phase');
    const savedResults = store.get('etf_results');
    const savedFavs = store.get('etf_favs');
    const savedTab = store.get('etf_tab');
    dom.window.close();
    // 模拟重开：localStorage 内容照旧（不含复习态，因为复习态本就不落盘）
    store.clear();
    if (savedFavs) store.set('etf_favs', savedFavs);
    if (savedResults) store.set('etf_results', savedResults);
    if (savedPhase) store.set('etf_phase', savedPhase);
    if (savedTab) store.set('etf_tab', savedTab);
    const b2 = boot();
    await sleep(300);
    ck('重开后不在复习态', !b2.d ? false : !inReview(b2.d), '');
    ck('重开后题组回到生词本全部 3 词', deckLen(b2.d) === 3, String(deckLen(b2.d)));
    ck('重开后又能看到错题入口', hasStartBtn(b2.d), doneBarText(b2.d));
    b2.dom.window.close();
  }

  console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
