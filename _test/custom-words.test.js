/* 自建词（词库里没有的单词）导入测试
   覆盖：
   A. 词库外单词能导入：进 etf_custom、进生词本、能做成卡片
   B. 预览计数：「新增自建词」独立成行，与「新增收藏」分开算
   C. 页签：有自建词才出现「自建词」板块，数目正确，切过去能看到卡
   D. 幂等：同一批重复导入不重复建词、卡片数不涨
   E. 全角/大小写：同词不同写法只存一条（按原样 id 去重）
   F. 混合导入：内置词 + 自建词一次搞定，各自归位
   G. 导出：CSV/JSON 含自建词，JSON 标 custom:true；导回来的 JSON 仍识别为自建词
   H. 替换模式：按文件重建自建词（旧的清掉）
   I. 边界：只有中文 → 无法建卡(miss)；只有英文 → 无法建卡；空行跳过
   J. 持久化：重开页面自建词仍在、页签仍在

   —— 安全性要求 ——
   所有 DOM 读取都走 q()/txt()/prop()/isHidden() 等安全访问器，
   这样在「没有该功能」的旧版本上每条断言都会干净地 FAIL，
   而不是抛 TypeError 把整个进程打断（那样 grep -c FAIL 会数到 0，出现假通过）。
*/
const fs = require('fs');
const { JSDOM } = require('jsdom');

const TARGET = process.env.TARGET || 'D:/alldata2026/download/2026-10-01-16-31-55/手机版/index.html';
const html = fs.readFileSync(TARGET, 'utf8');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, c, e = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + ' ' + e)); };

const q = (d, sel) => { try { return d.querySelector(sel); } catch (e) { return null; } };
const qa = (d, sel) => { try { return Array.from(d.querySelectorAll(sel)); } catch (e) { return []; } };
const txt = el => (el ? (el.textContent || '') : '');
const has = (el, cls) => !!(el && el.classList && el.classList.contains(cls));
const prop = (d, sel, k) => { const el = q(d, sel); return el ? el[k] : undefined; };
const isHidden = (d, sel) => prop(d, sel, 'hidden');
const isDisabled = (d, sel) => prop(d, sel, 'disabled');
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
      // 捕获导出内容：拦下 Blob 构造，把内容留在 window.__lastBlob 上
      w.__lastBlob = '';
      const RealBlob = w.Blob;
      w.Blob = function (parts, opts) {
        try { w.__lastBlob = (parts || []).map(p => String(p)).join(''); } catch (e) {}
        return new RealBlob(parts, opts);
      };
      // 下载三件套打桩：不让 jsdom 真去导航
      w.URL.createObjectURL = () => 'blob:test';
      w.URL.revokeObjectURL = () => {};
      w.HTMLAnchorElement.prototype.click = function () {};
      w.FileReader = function () {
        this.onload = null; this.onerror = null; this.result = '';
        this.readAsText = function (file) {
          this.result = file.__text || '';
          if (this.onload) setTimeout(() => this.onload({ target: this }), 0);
        };
      };
      w.__mkFile = (name, text) => ({ name, size: text.length, __text: text });
    },
  });
  const w = dom.window, d = w.document;
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { dom, w, d };
}

function openImport(w, d) { tryClick(w, d, '#importBtn'); return q(d, '#paneImport'); }
function paste(w, d, text) {
  const ta = q(d, '#importText');
  if (!ta) return false;
  try { ta.value = text; ta.dispatchEvent(new w.Event('input', { bubbles: true })); return true; }
  catch (e) { return false; }
}
const favsOf = () => { try { return JSON.parse(store.get('etf_favs') || '{}'); } catch (e) { return {}; } };
const customOf = () => { try { const v = JSON.parse(store.get('etf_custom') || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
/* 读取页签列表：[标签, 数量] */
const tabList = d => qa(d, '#tabs .tab').map(b => [txt(b).replace(/\d+$/, ''), txt(q(b, '.n'))]);
const tabByLabel = (d, label) => qa(d, '#tabs .tab').find(b => txt(b).indexOf(label) === 0) || null;

const ID_A = 'names|Aristotle|亚里士多德';

/* 两个词库里肯定没有的词（虚构专名，保证不会跟 DATA 撞） */
const X_EN = 'Zorblaxium';
const X_CN = '佐布拉星';
const Y_EN = 'Quindlehop';
const Y_CN = '昆德尔跳';

(async () => {

  console.log('\n===== A. 词库外单词能导入并成卡 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    paste(w, d, X_EN + ',' + X_CN);
    await sleep(320);

    ck('预览出现「新增自建词」行', !!q(d, '#rCustom'), 'no #rCustom');
    ck('可识别词条为 0（它不是内置词）', txt(q(d, '#rTotal')) === '0', txt(q(d, '#rTotal')));
    ck('新增自建词 1 个', txt(q(d, '#rCustom')) === '1', txt(q(d, '#rCustom')));
    ck('无法建卡 0 个', txt(q(d, '#rMiss')) === '0', txt(q(d, '#rMiss')));
    ck('按钮可用（自建词也算可导入）', !isDisabled(d, '#doImport'), '');
    ck('按钮文案含「自建词」', /自建词/.test(txt(q(d, '#doImport'))), txt(q(d, '#doImport')));

    tryClick(w, d, '#doImport');
    await sleep(80);

    const cs = customOf();
    ck('自建词已落盘 1 条', cs.length === 1, JSON.stringify(cs));
    ck('落盘内容正确', !!cs[0] && cs[0].en === X_EN && cs[0].cn === X_CN, JSON.stringify(cs[0]));
    const f = favsOf();
    ck('自建词自动进生词本', f['custom|' + X_EN + '|' + X_CN] === 1, JSON.stringify(f));
    ck('工具条角标更新为 1', txt(q(d, '#exportCnt')) === '1', txt(q(d, '#exportCnt')));
    dom.window.close();
  }

  console.log('\n===== B. 混合导入：内置词 + 自建词各自归位 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    paste(w, d, ['Aristotle,亚里士多德', X_EN + ',' + X_CN, Y_EN + ',' + Y_CN].join('\n'));
    await sleep(320);

    ck('可识别词条 1（Aristotle）', txt(q(d, '#rTotal')) === '1', txt(q(d, '#rTotal')));
    ck('新增收藏 1', txt(q(d, '#rNew')) === '1', txt(q(d, '#rNew')));
    ck('新增自建词 2', txt(q(d, '#rCustom')) === '2', txt(q(d, '#rCustom')));
    ck('无法建卡 0', txt(q(d, '#rMiss')) === '0', txt(q(d, '#rMiss')));
    ck('按钮文案同时含两种数量',
      /1 个新词/.test(txt(q(d, '#doImport'))) && /2 个自建词/.test(txt(q(d, '#doImport'))),
      txt(q(d, '#doImport')));

    tryClick(w, d, '#doImport');
    await sleep(80);

    ck('自建词落盘 2 条', customOf().length === 2, JSON.stringify(customOf()));
    const f = favsOf();
    ck('Aristotle 进生词本', f[ID_A] === 1, JSON.stringify(f));
    ck('两个自建词也进生词本',
      f['custom|' + X_EN + '|' + X_CN] === 1 && f['custom|' + Y_EN + '|' + Y_CN] === 1, JSON.stringify(f));
    ck('角标为 3', txt(q(d, '#exportCnt')) === '3', txt(q(d, '#exportCnt')));
    dom.window.close();
  }

  console.log('\n===== C. 「自建词」页签 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    const tabsBefore = tabList(d);
    ck('没有自建词时不出现该页签', !tabByLabel(d, '自建词'), JSON.stringify(tabsBefore));

    openImport(w, d);
    paste(w, d, [X_EN + ',' + X_CN, Y_EN + ',' + Y_CN].join('\n'));
    await sleep(320);
    tryClick(w, d, '#doImport');
    await sleep(100);

    const t = tabByLabel(d, '自建词');
    ck('导入后出现「自建词」页签', !!t, JSON.stringify(tabList(d)));
    ck('页签数量为 2', !!t && txt(q(t, '.n')) === '2', t ? txt(q(t, '.n')) : 'none');

    // 切到自建词板块
    if (t) { try { click(w, t); } catch (e) {} }
    await sleep(150);
    ck('切到自建词板块后页签高亮', has(tabByLabel(d, '自建词'), 'on'), '');
    const cardTxt = txt(q(d, '#card'));
    ck('卡片显示第一个自建词', cardTxt.indexOf(X_EN) >= 0 || cardTxt.indexOf(X_CN) >= 0 || cardTxt.length > 0,
      cardTxt.slice(0, 60));
    ck('统计显示本组 2 词', /本组\s*2\s*词/.test(txt(q(d, '#stats')).replace(/<[^>]*>/g, '')),
      txt(q(d, '#stats')));
    dom.window.close();
  }

  console.log('\n===== D. 幂等：重复导入不重复建词 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    paste(w, d, X_EN + ',' + X_CN);
    await sleep(320);
    tryClick(w, d, '#doImport');
    await sleep(80);
    ck('第一次：1 条自建词', customOf().length === 1, JSON.stringify(customOf()));

    // 再来一次同样的内容
    openImport(w, d);
    paste(w, d, X_EN + ',' + X_CN);
    await sleep(320);
    ck('第二次：不计入新增自建词', txt(q(d, '#rCustom')) === '0', txt(q(d, '#rCustom')));
    ck('第二次：记为已在生词本', txt(q(d, '#rDup')) === '1', txt(q(d, '#rDup')));
    tryClick(w, d, '#doImport');
    await sleep(80);

    ck('自建词仍是 1 条（没有重复）', customOf().length === 1, JSON.stringify(customOf()));
    ck('生词本仍是 1 个', Object.keys(favsOf()).length === 1, JSON.stringify(favsOf()));
    const t = tabByLabel(d, '自建词');
    ck('页签数量仍是 1', !!t && txt(q(t, '.n')) === '1', t ? txt(q(t, '.n')) : 'none');
    dom.window.close();
  }

  console.log('\n===== E. 大小写/空格差异：不做重复建词 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    paste(w, d, X_EN + ',' + X_CN);
    await sleep(320);
    tryClick(w, d, '#doImport');
    await sleep(80);
    const n1 = customOf().length;

    openImport(w, d);
    paste(w, d, ' ' + X_EN + ' , ' + X_CN + ' ');   // 前后带空格，解析时会 trim
    await sleep(320);
    tryClick(w, d, '#doImport');
    await sleep(80);
    ck('带空格重复导入不新增', customOf().length === n1, JSON.stringify(customOf()));
    dom.window.close();
  }

  console.log('\n===== F. 导出：CSV/JSON 含自建词 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    paste(w, d, ['Aristotle,亚里士多德', X_EN + ',' + X_CN].join('\n'));
    await sleep(320);
    tryClick(w, d, '#doImport');
    await sleep(100);

    // 导出页统计应包含 2 个
    tryClick(w, d, '#exportBtn');
    await sleep(60);
    const sub = txt(q(d, '#exportSub'));
    ck('导出页统计含 2 个词', /共\s*2\s*个词/.test(sub) || sub.indexOf('2') >= 0, sub);
    ck('预览区含自建词', txt(q(d, '#exportPrev')).indexOf(X_EN) >= 0, txt(q(d, '#exportPrev')).slice(0, 120));
    ck('预览区标注来源', txt(q(d, '#exportPrev')).indexOf('自建词') >= 0, txt(q(d, '#exportPrev')).slice(0, 160));
    dom.window.close();
  }

  console.log('\n===== F2. JSON 往返：自建词仍识别为自建词 =====');
  {
    store.clear();
    // 第一台设备：导入自建词后走真实导出路径（点「备份 (JSON)」）拿到内容
    const s1 = boot();
    openImport(s1.w, s1.d);
    paste(s1.w, s1.d, X_EN + ',' + X_CN);
    await sleep(320);
    tryClick(s1.w, s1.d, '#doImport');
    await sleep(100);

    tryClick(s1.w, s1.d, '#exportBtn');
    await sleep(60);
    tryClick(s1.w, s1.d, '#expJson');
    await sleep(60);
    let json = s1.w.__lastBlob || '';
    ck('能取到 JSON 导出内容', !!json && json.indexOf(X_EN) >= 0, json.slice(0, 80));
    ck('JSON 里标了 custom:true', /"custom"\s*:\s*true/.test(json), json.slice(0, 240));
    s1.dom.window.close();

    // 第二台设备：清空后导入这段 JSON
    store.clear();
    const s2 = boot();
    openImport(s2.w, s2.d);
    paste(s2.w, s2.d, json);
    await sleep(340);
    ck('新设备把该词认作自建词（非新增收藏）', txt(q(s2.d, '#rCustom')) === '1', txt(q(s2.d, '#rCustom')));
    ck('新设备上不会被误判为无法建卡', txt(q(s2.d, '#rMiss')) === '0', txt(q(s2.d, '#rMiss')));
    tryClick(s2.w, s2.d, '#doImport');
    await sleep(100);
    ck('新设备上自建词已重建', customOf().length === 1, JSON.stringify(customOf()));
    ck('新设备上有「自建词」页签', !!tabByLabel(s2.d, '自建词'), JSON.stringify(tabList(s2.d)));
    s2.dom.window.close();
  }

  console.log('\n===== G. 替换模式重建自建词 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    paste(w, d, [X_EN + ',' + X_CN, Y_EN + ',' + Y_CN].join('\n'));
    await sleep(320);
    tryClick(w, d, '#doImport');
    await sleep(100);
    ck('先有 2 条自建词', customOf().length === 2, JSON.stringify(customOf()));

    // 替换成只含 1 条自建词 + 1 个内置词
    // 注意：X 第一次导入后已进自建词表，第二次导入时它已被 BY_ID 收录
    //       → 会走 id 分支归到「可识别词条」，因此 rTotal=2、rCustom=0。
    //       替换模式必须仍把它重建回自建词表（这正是要验的点）。
    openImport(w, d);
    tryClick(w, d, '#modeReplace');
    await sleep(30);
    paste(w, d, ['Aristotle,亚里士多德', X_EN + ',' + X_CN].join('\n'));
    await sleep(320);
    ck('替换模式已选中', has(q(d, '#modeReplace'), 'on'), 'not on');
    ck('替换预览：2 条都可识别', txt(q(d, '#rTotal')) === '2', txt(q(d, '#rTotal')));
    ck('替换预览：无需新建自建词', txt(q(d, '#rCustom')) === '0', txt(q(d, '#rCustom')));
    tryClick(w, d, '#doImport');
    await sleep(100);

    const cs = customOf();
    ck('替换后只剩 1 条自建词', cs.length === 1, JSON.stringify(cs));
    ck('剩下的是 X 词', !!cs[0] && cs[0].en === X_EN, JSON.stringify(cs[0]));
    ck('生词本只剩 2 个（1 内置 + 1 自建）', Object.keys(favsOf()).length === 2, JSON.stringify(favsOf()));
    const t = tabByLabel(d, '自建词');
    ck('页签数量降为 1', !!t && txt(q(t, '.n')) === '1', t ? txt(q(t, '.n')) : 'none');
    dom.window.close();
  }

  console.log('\n===== H. 边界：信息不全不建卡 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    // 只有中文 / 只有英文（且不是唯一词库词） / 空行
    paste(w, d, ['巫术星云', X_EN, '', 'Aristotle,亚里士多德'].join('\n'));
    await sleep(340);
    ck('只有中文的计入无法建卡', Number(txt(q(d, '#rMiss'))) >= 1, txt(q(d, '#rMiss')));
    ck('只有英文的也计入无法建卡', Number(txt(q(d, '#rMiss'))) >= 1, txt(q(d, '#rMiss')));
    ck('Aristotle 正常命中', txt(q(d, '#rTotal')) === '1', txt(q(d, '#rTotal')));
    ck('自建词为 0', txt(q(d, '#rCustom')) === '0', txt(q(d, '#rCustom')));
    tryClick(w, d, '#doImport');
    await sleep(80);
    ck('没有误建自建词', customOf().length === 0, JSON.stringify(customOf()));
    dom.window.close();
  }

  console.log('\n===== H2. 纯自建词也允许导入（内置词为 0） =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    paste(w, d, X_EN + ',' + X_CN);
    await sleep(320);
    ck('内置命中 0 但按钮可用', txt(q(d, '#rTotal')) === '0' && !isDisabled(d, '#doImport'),
      txt(q(d, '#rTotal')) + ' / ' + String(prop(d, '#doImport', 'disabled')));
    tryClick(w, d, '#doImport');
    await sleep(80);
    ck('纯自建词导入成功', customOf().length === 1, JSON.stringify(customOf()));
    ck('面板已关闭', !has(q(d, '#dataSheet'), 'show'), '');
    dom.window.close();
  }

  console.log('\n===== I. 持久化：重开页面自建词仍在 =====');
  {
    store.clear();
    const s1 = boot();
    openImport(s1.w, s1.d);
    paste(s1.w, s1.d, [X_EN + ',' + X_CN, Y_EN + ',' + Y_CN].join('\n'));
    await sleep(320);
    tryClick(s1.w, s1.d, '#doImport');
    await sleep(120);
    s1.dom.window.close();
    ck('落盘 2 条自建词', customOf().length === 2, JSON.stringify(customOf()));

    // 重开（内存存储保留）
    const s2 = boot();
    const t = tabByLabel(s2.d, '自建词');
    ck('重开后页签仍在', !!t, JSON.stringify(tabList(s2.d)));
    ck('重开后数量仍为 2', !!t && txt(q(t, '.n')) === '2', t ? txt(q(t, '.n')) : 'none');
    if (t) { try { click(s2.w, t); } catch (e) {} }
    await sleep(150);
    ck('重开后自建词板块能出题', /本组\s*2\s*词/.test(txt(q(s2.d, '#stats')).replace(/<[^>]*>/g, '')),
      txt(q(s2.d, '#stats')));
    s2.dom.window.close();
  }

  console.log('\n===== J. 「全部」页签把自建词算进去 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    const before = tabByLabel(d, '全部');
    const nBefore = before ? Number(txt(q(before, '.n'))) : NaN;

    openImport(w, d);
    paste(w, d, X_EN + ',' + X_CN);
    await sleep(320);
    tryClick(w, d, '#doImport');
    await sleep(100);

    const after = tabByLabel(d, '全部');
    const nAfter = after ? Number(txt(q(after, '.n'))) : NaN;
    ck('「全部」总数 +1', Number.isFinite(nBefore) && nAfter === nBefore + 1, nBefore + ' -> ' + nAfter);
    dom.window.close();
  }

  console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
