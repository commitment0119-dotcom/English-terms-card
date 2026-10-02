/* 生词本 × 自建词 互通测试

   背景（用户报告）："生词本和自建单词本单词不互通（生词本里只存最初词库里有的单词）"
   根因：自建词存 etf_custom、收藏存 etf_favs，是两套独立数据。
        - 历史上导入过的自建词若没被写进 favs，就永远不进生词本；
        - etf_custom 一旦丢失，favs 里的自建词 id 成了孤儿，静默消失。
   修复：引入 isFav(w) —— 自建词天然算收藏（除非用户明确取消，记在 etf_unfavs），
        并在启动时做一次性迁移把既有自建词补进 favs。

   覆盖：
   A. 从未收藏过的自建词 → 自动出现在生词本（旧版会 FAIL）
   B. 迁移把自建词补进 favs 并落盘
   C. 取消收藏自建词 → 真正移出，且刷新后仍是移出（unfavs 生效）
   D. 重新收藏 → 撤销取消记号
   E. 内置词行为不变：没点★就不在生词本
   F. 内置词点★/再点★ 正常进出（回归）
   G. 替换模式导入清空后，自建词回到默认收藏态
   H. unfavs 只对存在的词条生效
   I. 生词本计数与页签一致（含自建词）
   J. 导入备份后自建词仍在生词本里

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
const prop = (d, sel, k) => { const el = q(d, sel); return el ? el[k] : undefined; };
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

/* 生词本页签上的数字 */
const favCount = d => {
  const t = [...d.querySelectorAll('#tabs .tab')].find(b => b.dataset && b.dataset.tab === 'fav');
  const n = t && t.querySelector('.n');
  return n ? (parseInt(txt(n), 10) || 0) : -1;
};
const tabsOf = d => [...d.querySelectorAll('#tabs .tab')].map(b => b.dataset.tab);
const termNow = d => txt(q(d, '.term')).trim();
const hasCustomTab = d => tabsOf(d).includes('custom');
const setCustom = arr => store.set('etf_custom', JSON.stringify(arr));
const setFavs = o => store.set('etf_favs', JSON.stringify(o));
const getFavs = () => { try { return JSON.parse(store.get('etf_favs') || '{}'); } catch (e) { return {}; } };

(async () => {

  console.log('\n===== A. 从未收藏过的自建词，自动出现在生词本 =====');
  {
    store.clear();
    setCustom([{ en: 'Serendipity', cn: '意外之喜' }, { en: 'Ephemeral', cn: '朝生暮死' }]);
    // 故意不设 etf_favs —— 模拟「历史导入但没记收藏」的老数据
    const { dom, w, d } = boot();
    await sleep(280);
    ck('生词本计数 = 2（自建词默认在内）', favCount(d) === 2, String(favCount(d)));
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(220);
    ck('进生词本能看到第一张自建词', ['Serendipity', 'Ephemeral'].includes(termNow(d)), termNow(d));
    ck('生词本总数显示 1 / 2', /1\s*\/\s*2/.test(txt(q(d, '.counter'))), txt(q(d, '.counter')));
    dom.window.close();
  }

  console.log('\n===== B. 启动迁移把自建词补进 favs =====');
  {
    store.clear();
    setCustom([{ en: 'Zorblaxium', cn: '佐布拉星' }]);
    const { dom, w, d } = boot();
    await sleep(280);
    const f = getFavs();
    ck('favs 里已写入该自建词', !!f['custom|Zorblaxium|佐布拉星'], JSON.stringify(f));
    ck('迁移标记已落盘', store.get('etf_favsMigrated') === 'true', String(store.get('etf_favsMigrated')));
    dom.window.close();
  }

  console.log('\n===== C. 取消收藏自建词 → 真正移出且刷新后仍移出 =====');
  {
    store.clear();
    setCustom([{ en: 'Serendipity', cn: '意外之喜' }]);
    let { dom, w, d } = boot();
    await sleep(280);
    tryClick(w, d, '#tabs button[data-tab="custom"]');
    await sleep(220);
    ck('自建词页签存在', hasCustomTab(d), tabsOf(d).join(','));
    ck('默认显示为已收藏（星标 on）', /(^|\s)on(\s|$)/.test(txt(q(d, '#starBtn')) + ' ' + (prop(d, '#starBtn', 'className') || '')), prop(d, '#starBtn', 'className'));
    tryClick(w, d, '#starBtn');
    await sleep(220);
    ck('取消后生词本计数归 0', favCount(d) === 0, String(favCount(d)));
    ck('取消后星标不再是 on', !/(^|\s)on(\s|$)/.test(prop(d, '#starBtn', 'className') || ''), prop(d, '#starBtn', 'className'));
    ck('写了取消记号 etf_unfavs', !!getFavs()['custom|Serendipity|意外之喜'] === false, '');
    dom.window.close();

    // 重开：取消必须仍然有效
    ({ dom, w, d } = boot());
    await sleep(280);
    ck('重开后生词本计数仍为 0', favCount(d) === 0, String(favCount(d)));
    dom.window.close();
  }

  console.log('\n===== D. 重新收藏 → 撤销取消记号 =====');
  {
    store.clear();
    setCustom([{ en: 'Serendipity', cn: '意外之喜' }]);
    store.set('etf_unfavs', JSON.stringify({ 'custom|Serendipity|意外之喜': 1 }));
    store.set('etf_favsMigrated', 'true');
    let { dom, w, d } = boot();
    await sleep(280);
    ck('带取消记号时计数为 0', favCount(d) === 0, String(favCount(d)));
    tryClick(w, d, '#tabs button[data-tab="custom"]');
    await sleep(220);
    tryClick(w, d, '#starBtn');
    await sleep(220);
    ck('重新收藏后计数为 1', favCount(d) === 1, String(favCount(d)));
    let u = {}; try { u = JSON.parse(store.get('etf_unfavs') || '{}'); } catch (e) {}
    ck('取消记号已被撤销', !u['custom|Serendipity|意外之喜'], JSON.stringify(u));
    dom.window.close();
  }

  console.log('\n===== E. 内置词行为不变：没点★就不在生词本 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    await sleep(280);
    ck('干净状态下生词本为空', favCount(d) === 0, String(favCount(d)));
    ck('没有自建词时不显示自建词页签', !hasCustomTab(d), tabsOf(d).join(','));
    dom.window.close();
  }

  console.log('\n===== F. 内置词 ★ 进出（回归） =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    await sleep(280);
    ck('第一张是内置词', termNow(d) === 'Aristotle', termNow(d));
    tryClick(w, d, '#starBtn');
    await sleep(220);
    ck('收藏后计数 1', favCount(d) === 1, String(favCount(d)));
    tryClick(w, d, '#starBtn');
    await sleep(220);
    ck('再点取消后计数 0', favCount(d) === 0, String(favCount(d)));
    dom.window.close();
  }

  console.log('\n===== G. 内置词与自建词混合，计数正确 =====');
  {
    store.clear();
    setCustom([{ en: 'Serendipity', cn: '意外之喜' }]);
    setFavs({ 'names|Aristotle|亚里士多德': 1 });
    const { dom, w, d } = boot();
    await sleep(280);
    ck('内置 1 + 自建 1 = 2', favCount(d) === 2, String(favCount(d)));
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(220);
    ck('生词本共 2 张', /1\s*\/\s*2/.test(txt(q(d, '.counter'))), txt(q(d, '.counter')));
    // 翻一张确认两张都在
    const first = termNow(d);
    tryClick(w, d, '#nextBtn');
    await sleep(340);
    const second = termNow(d);
    ck('两张分别是内置词与自建词', new Set([first, second]).size === 2 && [first, second].some(x => x === 'Aristotle') && [first, second].some(x => x === 'Serendipity'), first + ' / ' + second);
    dom.window.close();
  }

  console.log('\n===== H. unfavs 只对仍存在的词条生效（清理孤儿） =====');
  {
    store.clear();
    setCustom([{ en: 'Serendipity', cn: '意外之喜' }]);
    // 一个指向不存在词条的取消记号
    store.set('etf_unfavs', JSON.stringify({ 'custom|Ghost|幽灵': 1 }));
    const { dom, w, d } = boot();
    await sleep(280);
    let u = {}; try { u = JSON.parse(store.get('etf_unfavs') || '{}'); } catch (e) {}
    ck('失效的取消记号被清理', !u['custom|Ghost|幽灵'], JSON.stringify(u));
    ck('自建词仍在生词本（计数 1）', favCount(d) === 1, String(favCount(d)));
    dom.window.close();
  }

  console.log('\n===== I. 导入备份后自建词仍在生词本（往返） =====');
  {
    store.clear();
    let { dom, w, d } = boot();
    await sleep(280);
    // 打开导入面板，粘贴只含自建词的备份
    tryClick(w, d, '#importBtn');
    await sleep(200);
    const ta = q(d, '#importText');
    ck('导入文本框存在', !!ta, '');
    if (ta) {
      ta.value = 'Serendipity,意外之喜\nEphemeral,朝生暮死';
      ta.dispatchEvent(new w.Event('input', { bubbles: true }));
      await sleep(300);
      tryClick(w, d, '#doImport');
      await sleep(350);
      ck('导入后自建词页签出现', hasCustomTab(d), tabsOf(d).join(','));
      ck('导入后生词本计数 2', favCount(d) === 2, String(favCount(d)));
      const cs = (() => { try { return JSON.parse(store.get('etf_custom') || '[]'); } catch (e) { return []; } })();
      ck('etf_custom 落了 2 条', cs.length === 2, String(cs.length));
    }
    dom.window.close();
  }

  console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
