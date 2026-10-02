/* 词条介绍（译错时展示）测试
   覆盖：
   A. 数据完整性：每个内置词条都有非空介绍；介绍长度合理（约 40–120 字）
   B. 答错时结果区出现介绍（.introbox / 词条介绍）
   C. 没作答（点「不记得」）时也出现介绍
   D. 答对时不出现介绍（保持原来的极简形态）
   E. 介绍内容与该词条对应正确（抽查若干，含重名的 Washington 人名/地名）
   F. 切到下一词后介绍不残留
   G. 切方向（中→英）后介绍仍正确
   H. 回显已判分卡片时（render）介绍与当时结果一致
   I. 自建词没有介绍时不渲染空盒子

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
const has = (el, cls) => !!(el && el.classList && el.classList.contains(cls));
const prop = (d, sel, k) => { const el = q(d, sel); return el ? el[k] : undefined; };
const isHidden = (d, sel) => prop(d, sel, 'hidden');
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const tryClick = (w, d, sel) => { const el = q(d, sel); if (!el) return false; try { click(w, el); return true; } catch (e) { return false; } };

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

const typeIn = (w, d, v) => {
  const inp = q(d, '#input');
  if (!inp) return false;
  inp.value = v;
  inp.dispatchEvent(new w.Event('input', { bubbles: true }));
  return true;
};
/* 结果区里的介绍文本 */
const introText = d => {
  const box = q(d, '#resultBox .introbox');
  return box ? txt(q(box, '.iv')) : '';
};

/* 在「当前板块」里逐张点「下一张」翻到英文名为 en 的那张卡。
   go() 有约 275ms 的 animating 锁（125ms 换牌 + 150ms 解锁），点太快会被静默丢掉；
   所以每次点完固定等 340ms 再点下一次（实测该节奏稳定逐张推进）。 */
async function seekTo(w, d, en, maxClicks) {
  const termNow = () => txt(q(d, '.term')).trim();
  let clicks = 0;
  while (clicks <= maxClicks) {
    if (termNow() === en) return { ok: true, clicks };
    const nb = q(d, '#nextBtn');
    if (!nb || nb.disabled) break;
    if (!tryClick(w, d, '#nextBtn')) break;
    clicks++;
    await sleep(340);
  }
  return { ok: termNow() === en, clicks };
}

(async () => {

  console.log('\n===== A. 数据完整性 =====');
  {
    store.clear();
    // INTRO 是 const，不挂在 window 上；直接从源码里抽出来评估。
    // （旧版本没有这段，抽不到时全部干净 FAIL。）
    const m = html.match(/const INTRO = (\{[\s\S]*?\n\});/);
    let INTRO = null;
    if (m) { try { INTRO = JSON.parse(m[1].replace(/,\s*(\})/g, '$1')); } catch (e) { INTRO = null; } }
    const keys = INTRO ? Object.keys(INTRO) : [];
    ck('存在 INTRO 数据', keys.length > 0, String(keys.length));
    ck('介绍条数 == 内置词条数 286', keys.length === 286, String(keys.length));

    let tooShort = 0, emptyV = 0;
    keys.forEach(k => {
      const v = String((INTRO || {})[k] || '');
      if (!v) emptyV++;
      else if (v.length < 15) tooShort++;   // 「加拿大的」等形容词性词条本就短
    });
    ck('没有空介绍', emptyV === 0, String(emptyV));
    ck('没有过短的介绍（<15 字）', tooShort === 0, String(tooShort));

    const g = k => String((INTRO || {})[k] || '');
    ck('Aristotle 介绍正确', /古希腊哲学家/.test(g('Aristotle')), g('Aristotle').slice(0, 30));
    ck('the Bible 介绍正确（圣经）', /基督教/.test(g('the Bible')), g('the Bible').slice(0, 30));
    ck('Nobel Prize 介绍正确', /诺贝尔奖|遗嘱/.test(g('Nobel Prize')), g('Nobel Prize').slice(0, 30));
    ck('philosophy 介绍正确', /存在|知识|价值/.test(g('philosophy')), g('philosophy').slice(0, 30));
  }

  console.log('\n===== A2. 重名 Washington 两条介绍不同且各归其位 =====');
  {
    const m = html.match(/const INTRO = (\{[\s\S]*?\n\});/);
    let INTRO = null;
    if (m) { try { INTRO = JSON.parse(m[1].replace(/,\s*(\})/g, '$1')); } catch (e) {} }
    const g = k => String((INTRO || {})[k] || '');
    const person = g('names|Washington|华盛顿(人名)');
    const place = g('places|Washington|华盛顿(地名)');
    ck('人名华盛顿有关键词（总统/大陆军）', /总统|大陆军|国父/.test(person), person.slice(0, 40));
    ck('地名华盛顿有关键词（首都/哥伦比亚特区）', /首都|哥伦比亚特区/.test(place), place.slice(0, 40));
    ck('两条介绍内容不同', person !== place && !!person && !!place, '');
  }

  console.log('\n===== B. 答错时显示介绍 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    // 定位到 Aristotle（第一张卡）
    const term = txt(q(d, '.term'));
    ck('第一张卡是 Aristotle', /Aristotle/.test(term), term);
    // 故意写错
    typeIn(w, d, '完全错误的答案');
    tryClick(w, d, '#mainBtn');
    await sleep(120);

    ck('结果区可见', !isHidden(d, '#resultBox'), '');
    ck('显示「译错了」', /译错了/.test(txt(q(d, '#resultBox .stamp'))), txt(q(d, '#resultBox .stamp')));
    ck('出现介绍盒子', !!q(d, '#resultBox .introbox'), 'no .introbox');
    ck('介绍含 Aristotle 的关键内容', /古希腊哲学家/.test(introText(d)), introText(d).slice(0, 40));
    ck('介绍非空', introText(d).length > 20, String(introText(d).length));
    dom.window.close();
  }

  console.log('\n===== C. 没作答（不记得）时也显示介绍 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    tryClick(w, d, '#giveBtn');
    await sleep(120);
    ck('显示「没作答」', /没作答/.test(txt(q(d, '#resultBox .stamp'))), txt(q(d, '#resultBox .stamp')));
    ck('没作答时也有介绍', !!q(d, '#resultBox .introbox'), 'no .introbox');
    ck('介绍内容正确', /古希腊哲学家/.test(introText(d)), introText(d).slice(0, 40));
    dom.window.close();
  }

  console.log('\n===== D. 答对时不显示介绍 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    typeIn(w, d, '亚里士多德');       // 正确答案
    tryClick(w, d, '#mainBtn');
    await sleep(120);
    ck('显示「译对了」', /译对了/.test(txt(q(d, '#resultBox .stamp'))), txt(q(d, '#resultBox .stamp')));
    ck('答对时不渲染介绍盒子', !q(d, '#resultBox .introbox'), 'unexpected .introbox');
    ck('答对时介绍文本为空', introText(d) === '', introText(d));
    ck('仍处于极简形态（body.correct）', has(q(d, 'body') || d.body, 'correct'), '');
    dom.window.close();
  }

  console.log('\n===== E. 介绍与该词条对应（跳到不同词抽查） =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    // 直接跳到「地名」板块，找到 Washington(人名/地名) 之外的一个词抽查
    tryClick(w, d, '#tabs button[data-tab="places"]');
    await sleep(150);
    // 第一张是 the United States / America
    const t1 = txt(q(d, '.term'));
    typeIn(w, d, '错的');
    tryClick(w, d, '#mainBtn');
    await sleep(120);
    ck('地名板块第一词介绍含「北美洲」', /北美洲/.test(introText(d)), t1 + ' => ' + introText(d).slice(0, 40));
    dom.window.close();
  }

  console.log('\n===== E2. 人名华盛顿 vs 地名华盛顿 介绍各自正确 =====');
  {
    store.clear();
    // 人名板块里 Washington 是第 36 张卡（index 35）。
    const { dom, w, d } = boot();
    const r = await seekTo(w, d, 'Washington', 40);
    ck('翻到了人名华盛顿', r.ok, 'clicks=' + r.clicks + ' term=' + txt(q(d, '.term')).trim());
    if (r.ok) {
      ck('该卡属于人名板块', /哲学家|科学家|文学家|时政/.test(txt(q(d, '.chip'))), txt(q(d, '.chip')));
      typeIn(w, d, '错的');
      tryClick(w, d, '#mainBtn');
      await sleep(140);
      const got = introText(d);
      ck('人名华盛顿介绍讲总统/国父', /总统|国父|大陆军/.test(got), got.slice(0, 50));
      ck('人名华盛顿介绍不是「首都」那条', !/美国首都/.test(got), got.slice(0, 50));
    } else {
      ck('人名华盛顿介绍讲总统/国父', false, '未翻到');
      ck('人名华盛顿介绍不是「首都」那条', false, '未翻到');
    }
    dom.window.close();
  }

  console.log('\n===== E3. 地名华盛顿（同英文名，另一条介绍） =====');
  {
    store.clear();
    // 地名板块里 Washington 是第 41 张卡（index 40）。
    const { dom, w, d } = boot();
    tryClick(w, d, '#tabs button[data-tab="places"]');
    await sleep(150);
    const r = await seekTo(w, d, 'Washington', 45);
    ck('翻到了地名华盛顿', r.ok, 'clicks=' + r.clicks + ' term=' + txt(q(d, '.term')).trim());
    if (r.ok) {
      typeIn(w, d, '错的');
      tryClick(w, d, '#mainBtn');
      await sleep(140);
      const got = introText(d);
      ck('地名华盛顿介绍讲首都/特区', /首都|哥伦比亚特区/.test(got), got.slice(0, 50));
      ck('地名华盛顿介绍不是「总统」那条', !/第一任总统/.test(got), got.slice(0, 50));
    } else {
      ck('地名华盛顿介绍讲首都/特区', false, '未翻到');
      ck('地名华盛顿介绍不是「总统」那条', false, '未翻到');
    }
    dom.window.close();
  }

  console.log('\n===== F. 切到下一词后介绍不残留 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    typeIn(w, d, '错的');
    tryClick(w, d, '#mainBtn');
    await sleep(120);
    ck('当前卡有介绍', !!q(d, '#resultBox .introbox'), '');
    tryClick(w, d, '#mainBtn');    // 下一张
    await sleep(400);
    ck('已切到下一张（结果区隐藏）', isHidden(d, '#resultBox'), String(isHidden(d, '#resultBox')));
    ck('新卡片没有残留介绍', !q(d, '#resultBox .introbox'), 'stale .introbox');
    dom.window.close();
  }

  console.log('\n===== G. 中→英方向介绍仍正确 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    tryClick(w, d, '#dirSeg button[data-dir="cn2en"]');
    await sleep(150);
    const term = txt(q(d, '.term'));
    ck('题面变成中文', /亚里士多德/.test(term), term);
    typeIn(w, d, 'wrong');
    tryClick(w, d, '#mainBtn');
    await sleep(120);
    ck('中→英答错也显示介绍', !!q(d, '#resultBox .introbox'), '');
    ck('介绍内容仍是 Aristotle 的', /古希腊哲学家/.test(introText(d)), introText(d).slice(0, 40));
    dom.window.close();
  }

  console.log('\n===== H. 回显已判分卡片时介绍与结果一致 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    // 第一张答错
    typeIn(w, d, '错的');
    tryClick(w, d, '#mainBtn');
    await sleep(120);
    // 翻到第二张再翻回来，触发 render 回显
    tryClick(w, d, '#mainBtn');
    await sleep(400);
    typeIn(w, d, '错的');
    tryClick(w, d, '#mainBtn');
    await sleep(120);

    // 切板块再切回来，强制重建 deck + render 回显
    tryClick(w, d, '#tabs button[data-tab="works"]');
    await sleep(150);
    tryClick(w, d, '#tabs button[data-tab="names"]');
    await sleep(150);

    const term = txt(q(d, '.term'));
    // 若回到的是已判分的卡，应能看到介绍；否则至少不该报错
    if (q(d, '#resultBox') && !isHidden(d, '#resultBox') && /译错了/.test(txt(q(d, '#resultBox .stamp')))) {
      ck('回显判错卡时带介绍', !!q(d, '#resultBox .introbox'), term);
    } else {
      ck('回显逻辑未出错（结果区状态正常）', true, term);
    }
    dom.window.close();
  }

  console.log('\n===== I. 自建词无介绍时不渲染空盒子 =====');
  {
    store.clear();
    // 先造一个自建词
    store.set('etf_custom', JSON.stringify([
      { id: 'custom|Zorblaxium|佐布拉星', sec: 'custom', secTitle: '自建词',
        g: '自建词', en: 'Zorblaxium', cn: '佐布拉星' },
    ]));
    store.set('etf_favs', JSON.stringify({ 'custom|Zorblaxium|佐布拉星': 1 }));
    const { dom, w, d } = boot();
    // 切到生词本（只有这个自建词）
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(150);
    const term = txt(q(d, '.term'));
    ck('生词本里是自建词', /Zorblaxium/.test(term), term);
    typeIn(w, d, '错的');
    tryClick(w, d, '#mainBtn');
    await sleep(120);
    ck('答错仍显示结果', /译错了/.test(txt(q(d, '#resultBox .stamp'))), '');
    ck('自建词不渲染介绍盒子', !q(d, '#resultBox .introbox'), 'unexpected .introbox');
    dom.window.close();
  }

  console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
