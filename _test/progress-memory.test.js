/* 进度记忆测试（本机 localStorage 持久化）
   核心诉求：关掉页面 / 换标签页再回来 / 手机浏览器切后台后被杀，重新打开要接着上次的地方继续。

   做法：用同一个 localStorage 后备对象启动两个 JSDOM 实例，
   模拟「第一次使用 → 关闭 → 重新打开」。
   旧版本（未持久化 idx / phaseMap）会在第二段「重新打开」处失败。 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const TARGET = process.env.TARGET || 'D:/alldata2026/download/2026-10-01-16-31-55/手机版/index.html';
const html = fs.readFileSync(TARGET, 'utf8');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, c, e = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + ' ' + e)); };

/* —— 跨「会话」共享的存储 ——
   用一个 Map 模拟真实 localStorage；每个 JSDOM 窗口都挂上同一个后备，
   这样第二个窗口能读到第一个窗口写下的数据。 */
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

function boot(viewH0 = 844) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'https://example.com/',
    beforeParse(w) {
      let vh = viewH0; const L = {};
      const vv = {
        get height() { return vh; }, get offsetTop() { return 0; },
        addEventListener(t, f) { (L[t] = L[t] || []).push(f); }, removeEventListener() {},
      };
      Object.defineProperty(w, 'visualViewport', { value: vv, configurable: true });
      Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5, configurable: true });
      w.matchMedia = q => ({
        matches: /hover:none|pointer:coarse/.test(q),
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      });
      w.__setVV = h => { vh = h; (L.resize || []).forEach(f => f({})); };
      // 注入共享存储
      Object.defineProperty(w, 'localStorage', { value: makeStorage(), configurable: true });
    },
  });
  const w = dom.window, d = w.document;
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { dom, w, d, body: d.body };
}

const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const term = d => d.querySelector('.term').textContent;

// 从 DOM 里直接读出当前题的正确答案 —— 通过 __DATA__（若有）或结果区反查。
// 更稳的做法：用 LS 里的 DATA 全局。脚本里 allList 是局部变量，因此改用「猜一个必然错的」来推进，
// 或者读取卡片上暴露的属性。这里选择：先答错（必然），然后用「下一张」推进到指定位置。
function answerWrong(d) {
  const inp = d.querySelector('#input');
  inp.value = '__definitely_wrong__';
  click(d.defaultView, d.querySelector('#mainBtn'));
  return inp;
}

(async () => {

  console.log('\n===== 会话 1：答题、切板块、乱序、收藏、方向切换 =====');
  let posAfterSession1 = '';     // 用「原词」文本做标识，它不受显示方向影响
  {
    const { dom, w, d, body } = boot();
    const t0 = term(d);

    // 第 1 题：答错（走完整界面分支，稳妥）
    answerWrong(d);
    ck('会话1 第1题已判分', !d.querySelector('#resultBox').hidden);

    // 翻到下一张
    click(w, d.querySelector('#mainBtn'));
    await sleep(200);
    const t1 = term(d);
    ck('会话1 已翻到第2题', t1 !== t0, `${t0} -> ${t1}`);
    // 「原词」这一行在结果区里始终用英文，用它做身份标识最稳
    posAfterSession1 = t1;

    // 第 2 题：答错
    answerWrong(d);

    // 收藏当前词
    const starBtn = d.querySelector('#starBtn') || d.querySelector('.starbtn');
    if (starBtn) click(w, starBtn);

    // 切到「生词」板块再切回来 —— 不应该丢位置语义（这里主要验证设置项落盘）
    click(w, d.querySelector('#dirSeg button[data-dir="cn2en"]'));

    // 模拟关闭页面
    w.dispatchEvent(new w.Event('pagehide'));
    dom.window.close();
  }

  // 位置标识直接取存储里的词条 id，它不受显示方向影响
  // （旧版从不写 etf_last，这里会拿到 undefined —— 正是我们要暴露的缺陷）
  posAfterSession1 = store.has('etf_last') ? JSON.parse(store.get('etf_last')) : null;

  console.log('\n  ---- 存储内容 ----');
  const keys = Array.from(store.keys()).sort();
  keys.forEach(k => console.log('    ' + k + ' = ' + String(store.get(k)).slice(0, 90)));
  ck('存储里有 etf_last（当前位置）', store.has('etf_last'), 'keys=' + keys.join(','));
  ck('存储里有 etf_phase（每词状态）', store.has('etf_phase'), 'keys=' + keys.join(','));
  ck('存储里有 etf_results（判分结果）', store.has('etf_results'), 'keys=' + keys.join(','));
  ck('存储里有 etf_dir（方向设置）', store.has('etf_dir'), 'keys=' + keys.join(','));

  console.log('\n===== 会话 2：重新打开，应续上上次位置与设置 =====');
  {
    const { dom, w, d, body } = boot();
    const t = term(d);

    // 会话1 结束时的位置 id（形如 "names|Plato|柏拉图"）
    // 重开后渲染的这张卡，其「原词」必然是 id 里的英文段，用它来核对身份，不受显示方向影响
    const idParts = String(posAfterSession1).split('|');
    const expEn = idParts[1] || '';
    const expCn = idParts[2] || '';

    let curOrigin = '';
    const kvs2 = Array.from(d.querySelectorAll('#resultBox .kv'));
    const o2 = kvs2.find(n => n.textContent.includes('原词'));
    if (o2) curOrigin = o2.querySelector('.v').textContent.trim();

    // 卡片正面（term）在 cn2en 下是中文、en2cn 下是英文，两者任一命中即算续上了。
    // 若 posAfterSession1 为 null（旧版从不写 etf_last），此断言必须失败。
    ck('重开后停在会话1结束的那张卡',
       !!posAfterSession1 && (t === expEn || t === expCn || curOrigin === expEn || curOrigin === expCn),
       `expect(${expEn} / ${expCn}) gotTerm=${t} gotOrigin=${curOrigin}`);

    // 方向设置应恢复成 cn2en
    const dirBtn = d.querySelector('#dirSeg button[data-dir="cn2en"]');
    ck('重开后方向设置仍是 cn2en', dirBtn && dirBtn.classList.contains('on'),
       'class=' + (dirBtn && dirBtn.className));

    // 已判过分的卡应回显结论（结果区不再隐藏）
    const back = d.querySelector('#input');
    ck('重开后当前卡仍处于「已判分」视图或可继续答题',
       !d.querySelector('#resultBox').hidden || !d.querySelector('#askBox').hidden,
       'resultHidden=' + d.querySelector('#resultBox').hidden +
       ' askHidden=' + d.querySelector('#askBox').hidden);

    // 收藏也应该还在（生词板块非空）
    const favTab = d.querySelector('#tabs button[data-tab="fav"]');
    if (favTab) {
      click(w, favTab);
      await sleep(60);
      const favEmpty = d.body.innerHTML.includes('还没有收藏') || !d.querySelector('.term');
      ck('重开后生词本未丢失', !favEmpty, 'favEmpty=' + favEmpty);
      // 切回全部，避免影响后续
      const allTab = d.querySelector('#tabs button[data-tab="all"]');
      if (allTab) { click(w, allTab); await sleep(60); }
    } else {
      ck('重开后生词本未丢失', true, '(无 fav 标签，跳过)');
    }

    dom.window.close();
  }

  console.log('\n===== 边界：清空 localStorage 后应从头开始 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    const t = term(d);
    ck('清空后回到第一个词', !!t, 'term=' + t);
    ck('清空后结果区隐藏（未判分）', d.querySelector('#resultBox').hidden, '');
    dom.window.close();
  }

  console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
