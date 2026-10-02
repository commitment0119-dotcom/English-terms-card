/* 生词本导入测试（用于跨设备同步进度）
   覆盖：
   A. 格式嗅探：JSON / CSV(带表头) / TXT(逐行) 三种都能解析
   B. 词条匹配：按 id、按「英文+中文」、英文唯一、中文唯一
   C. 合并 vs 替换 两种模式语义
   D. 预览结论：总数/新增/已存在/找不到 计数正确
   E. 答题记录：合并时不覆盖本机更新；替换时按文件重建
   F. 边界：空内容、坏 JSON、无表头 CSV、注入防护的 \t 前缀、重复条目去重
   G. 导入后：favs 落盘、角标更新、生词本板块可看到
   H. 面板：导出/导入 页签切换、文件拖入/选择、粘贴解析
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
/* 安全属性读取：元素缺失时返回 undefined，让断言干净 FAIL 而不是抛异常 */
const prop = (d, sel, k) => { const el = q(d, sel); return el ? el[k] : undefined; };
const isHidden = (d, sel) => prop(d, sel, 'hidden');
const isDisabled = (d, sel) => prop(d, sel, 'disabled');
const valOf = (d, sel) => { const el = q(d, sel); return el ? (el.value || '') : undefined; };
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

      // FileReader 桩：同步回调，方便测试
      w.FileReader = function () {
        this.onload = null; this.onerror = null; this.result = '';
        this.readAsText = function (file) {
          this.result = file.__text || '';
          if (this.onload) setTimeout(() => this.onload({ target: this }), 0);
        };
      };
      // File 桩
      w.__mkFile = (name, text) => ({ name, size: text.length, __text: text });
    },
  });
  const w = dom.window, d = w.document;
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { dom, w, d };
}

/* 打开数据面板并切到导入页 */
function openImport(w, d) {
  tryClick(w, d, '#importBtn');
  return q(d, '#paneImport');
}
/* 往粘贴框里写内容并触发解析 */
function paste(w, d, text) {
  const ta = q(d, '#importText');
  if (!ta) return false;
  try {
    ta.value = text;
    ta.dispatchEvent(new w.Event('input', { bubbles: true }));
    return true;
  } catch (e) { return false; }
}
const favsOf = () => { try { return JSON.parse(store.get('etf_favs') || '{}'); } catch (e) { return {}; } };
const resultsOf = () => { try { return JSON.parse(store.get('etf_results') || '{}'); } catch (e) { return {}; } };

const ID_A = 'names|Aristotle|亚里士多德';
const ID_P = 'names|Plato|柏拉图';

(async () => {

  console.log('\n===== H. 面板与页签 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    ck('存在导入按钮', !!q(d, '#importBtn'), 'no #importBtn');
    ck('存在数据面板', !!q(d, '#dataSheet'), 'no #dataSheet');
    ck('存在两个页签', !!q(d, '#tabExport') && !!q(d, '#tabImport'), '');

    tryClick(w, d, '#exportBtn');
    await sleep(30);
    ck('默认停在导出页', !has(q(d, '#paneExport'), '') && !isHidden(d, '#paneExport'), '');
    ck('导出页签高亮', has(q(d, '#tabExport'), 'on'), '');
    ck('导入页隐藏', isHidden(d, '#paneImport'), '');
    ck('标题是「导出数据」', txt(q(d, '#sheetTitle')) === '导出数据', txt(q(d, '#sheetTitle')));

    tryClick(w, d, '#tabImport');
    await sleep(20);
    ck('切到导入页后导出页隐藏', isHidden(d, '#paneExport'), '');
    ck('导入页显示', !isHidden(d, '#paneImport'), '');
    ck('导入页签高亮', has(q(d, '#tabImport'), 'on'), '');
    ck('标题变成「导入数据」', txt(q(d, '#sheetTitle')) === '导入数据', txt(q(d, '#sheetTitle')));

    tryClick(w, d, '#tabExport');
    await sleep(20);
    ck('可以切回导出页', !isHidden(d, '#paneExport'), '');

    // 直接用「导入」按钮打开应直达导入页
    tryClick(w, d, '#sheetClose');
    await sleep(20);
    tryClick(w, d, '#importBtn');
    await sleep(30);
    ck('点工具条「导入」直达导入页', !isHidden(d, '#paneImport'), '');
    dom.window.close();
  }

  console.log('\n===== A. JSON 格式解析 + 合并导入 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    const json = JSON.stringify({
      app: '英语专有名词记忆卡', version: 1, count: 2,
      favs: [
        { id: ID_A, en: 'Aristotle', cn: '亚里士多德', result: 'ok' },
        { id: ID_P, en: 'Plato', cn: '柏拉图', result: 'no' },
      ],
    });
    paste(w, d, json);
    await sleep(320);

    ck('识别出 2 个词条', txt(q(d, '#rTotal')) === '2', txt(q(d, '#rTotal')));
    ck('新增 2 个', txt(q(d, '#rNew')) === '2', txt(q(d, '#rNew')));
    ck('已在生词本 0 个', txt(q(d, '#rDup')) === '0', txt(q(d, '#rDup')));
    ck('找不到 0 个', txt(q(d, '#rMiss')) === '0', txt(q(d, '#rMiss')));
    ck('报告区可见', !isHidden(d, '#importReport'), '');
    ck('按钮文案含数量', /合并导入 2 个新词/.test(txt(q(d, '#doImport'))), txt(q(d, '#doImport')));
    ck('按钮可用', !isDisabled(d, '#doImport'), '');

    tryClick(w, d, '#doImport');
    await sleep(60);
    const f = favsOf();
    ck('导入后收藏落盘 2 个', Object.keys(f).length === 2, JSON.stringify(f));
    ck('Aristotle 已收藏', f[ID_A] === 1, '');
    ck('Plato 已收藏', f[ID_P] === 1, '');
    const r = resultsOf();
    ck('答题记录一并写入', r[ID_A] === 'ok' && r[ID_P] === 'no', JSON.stringify(r));
    ck('面板自动关闭', !has(q(d, '#dataSheet'), 'show'), '');
    ck('工具条角标更新为 2', txt(q(d, '#exportCnt')) === '2', txt(q(d, '#exportCnt')));
    dom.window.close();
  }

  console.log('\n===== A2. CSV（带表头）解析 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    const csv = [
      '\ufeff英文,中文,板块,类别,学习状态,答题结果',
      'Aristotle,亚里士多德,人名,哲学家/思想家,已掌握,正确',
      'Plato,柏拉图,人名,哲学家/思想家,待复习,错误',
      'Einstein,爱因斯坦,人名,科学家,未测验,未答',
    ].join('\r\n');
    paste(w, d, csv);
    await sleep(320);
    ck('CSV 识别出 3 个词条', txt(q(d, '#rTotal')) === '3', txt(q(d, '#rTotal')));
    ck('CSV 全部命中词库', txt(q(d, '#rMiss')) === '0', txt(q(d, '#rMiss')));

    tryClick(w, d, '#doImport');
    await sleep(60);
    const f = favsOf(), r = resultsOf();
    ck('CSV 导入 3 个收藏', Object.keys(f).length === 3, String(Object.keys(f).length));
    ck('「已掌握/正确」→ ok', r[ID_A] === 'ok', String(r[ID_A]));
    ck('「待复习/错误」→ no', r[ID_P] === 'no', String(r[ID_P]));
    ck('「未测验」不写答题记录', !r['names|Einstein|爱因斯坦'], '');
    dom.window.close();
  }

  console.log('\n===== A3. TXT（逐行 / 无表头）解析 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    paste(w, d, ['# 生词本 · 英语专有名词记忆卡', '# 共 2 条', '', 'Aristotle,亚里士多德', 'Plato,柏拉图'].join('\r\n'));
    await sleep(320);
    ck('TXT 跳过注释行，识别 2 条', txt(q(d, '#rTotal')) === '2', txt(q(d, '#rTotal')));
    ck('TXT 全部命中', txt(q(d, '#rMiss')) === '0', txt(q(d, '#rMiss')));
    tryClick(w, d, '#doImport');
    await sleep(60);
    ck('TXT 导入成功', Object.keys(favsOf()).length === 2, String(Object.keys(favsOf()).length));
    dom.window.close();
  }

  console.log('\n===== F. 边界：坏 JSON / 空内容 / 无表头 / 制表符前缀 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);

    paste(w, d, '{ this is not json');
    await sleep(320);
    ck('坏 JSON 不崩溃', true, '');
    ck('坏 JSON 显示错误提示', !isHidden(d, '#rErr'), '');
    ck('坏 JSON 时按钮禁用', isDisabled(d, '#doImport'), '');
    ck('坏 JSON 报告区隐藏', isHidden(d, '#importReport'), '');

    paste(w, d, '   ');
    await sleep(320);
    ck('空内容时按钮禁用', isDisabled(d, '#doImport'), '');

    // 无表头 CSV + 注入防护的 \t 前缀 + 重复条目
    paste(w, d, ['Aristotle,亚里士多德', 'Aristotle,亚里士多德', '\tPlato,柏拉图'].join('\n'));
    await sleep(320);
    ck('重复条目被去重（2 条）', txt(q(d, '#rTotal')) === '2', txt(q(d, '#rTotal')));
    ck('\\t 前缀被剥离后仍能命中', txt(q(d, '#rMiss')) === '0', txt(q(d, '#rMiss')));
    dom.window.close();
  }

  console.log('\n===== B. 词条匹配策略 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    // 无 id，只给 en+cn  → 靠 BY_PAIR 命中
    paste(w, d, 'Aristotle,亚里士多德');
    await sleep(320);
    ck('en+cn 匹配成功', txt(q(d, '#rTotal')) === '1' && txt(q(d, '#rMiss')) === '0', '');

    // 只给英文（词库中唯一）→ 命中
    paste(w, d, 'Einstein,');
    await sleep(320);
    ck('仅英文（唯一）也能命中', txt(q(d, '#rMiss')) === '0', txt(q(d, '#rMiss')));

    // 词库里完全没有的词 → 不再丢弃，而是收为「自建词」（新能力）
    // 只有「信息不全」（缺英文或中文）才会进 miss。
    paste(w, d, 'NotARealWordXYZ,不存在的词');
    await sleep(320);
    ck('词库外的词不再计入 miss', txt(q(d, '#rMiss')) === '0', txt(q(d, '#rMiss')));
    ck('词库外的词计入「新增自建词」', txt(q(d, '#rCustom')) === '1', txt(q(d, '#rCustom')));
    ck('有自建词时按钮仍可用', !isDisabled(d, '#doImport'), '');

    // 信息不全（单列纯中文、没有英文）→ 根本没法建卡。
    // 解析阶段就会把它丢掉（不会变成自建词），因此没有可导入内容、按钮禁用。
    // 先清空输入框，避免上一条用例的预览结论残留造成误判。
    paste(w, d, '   ');
    await sleep(320);
    paste(w, d, '绝不会重名的中文词条甲乙丙');
    await sleep(320);
    ck('信息不全时不产生自建词', txt(q(d, '#rCustom')) === '0', txt(q(d, '#rCustom')));
    ck('信息不全时按钮禁用', isDisabled(d, '#doImport'), '');
    dom.window.close();
  }

  console.log('\n===== C/E. 合并 vs 替换 语义 + 答题记录保护 =====');
  {
    store.clear();
    // 本机已收藏 Aristotle 且答对了
    store.set('etf_favs', JSON.stringify({ [ID_A]: 1 }));
    store.set('etf_results', JSON.stringify({ [ID_A]: 'ok' }));
    const { dom, w, d } = boot();
    openImport(w, d);

    // 导入文件里 Aristotle 是「错误」——合并模式不应覆盖本机的 ok
    const json = JSON.stringify({ favs: [
      { id: ID_A, en: 'Aristotle', cn: '亚里士多德', result: 'no' },
      { id: ID_P, en: 'Plato', cn: '柏拉图', result: 'no' },
    ]});
    paste(w, d, json);
    await sleep(320);
    ck('合并：新增 1（Plato）', txt(q(d, '#rNew')) === '1', txt(q(d, '#rNew')));
    ck('合并：已存在 1（Aristotle）', txt(q(d, '#rDup')) === '1', txt(q(d, '#rDup')));

    tryClick(w, d, '#doImport');
    await sleep(60);
    ck('合并后共 2 个收藏', Object.keys(favsOf()).length === 2, JSON.stringify(favsOf()));
    ck('合并不覆盖本机更新（仍为 ok）', resultsOf()[ID_A] === 'ok', String(resultsOf()[ID_A]));

    // —— 换成替换模式 ——
    tryClick(w, d, '#importBtn');
    await sleep(30);
    // 先手动给本机加一个额外词，验证替换会清掉它
    const extra = 'names|Newton|牛顿';
    const f0 = favsOf(); f0[extra] = 1;
    store.set('etf_favs', JSON.stringify(f0));
    tryClick(w, d, '#sheetClose');
    await sleep(20);
    tryClick(w, d, '#importBtn');
    await sleep(30);
    tryClick(w, d, '#modeReplace');
    await sleep(20);
    ck('替换模式被选中', has(q(d, '#modeReplace'), 'on'), '');
    ck('替换模式取消合并高亮', !has(q(d, '#modeMerge'), 'on'), '');

    // 先粘内容再断言文案（文案依赖已解析的数据）
    paste(w, d, json);
    await sleep(320);
    ck('替换模式按钮文案变化', /替换导入/.test(txt(q(d, '#doImport'))), txt(q(d, '#doImport')));
    ck('替换模式提示会清空', /清空/.test(txt(q(d, '#rNote'))), txt(q(d, '#rNote')));

    tryClick(w, d, '#doImport');
    await sleep(60);
    const fAfter = favsOf();
    ck('替换后不再包含额外词 Newton', !fAfter[extra], JSON.stringify(fAfter));
    ck('替换后只剩导入的 2 个', Object.keys(fAfter).length === 2, JSON.stringify(Object.keys(fAfter)));
    ck('替换后 Aristotle 结果为导入值 no', resultsOf()[ID_A] === 'no', String(resultsOf()[ID_A]));
    dom.window.close();
  }

  console.log('\n===== H2. 文件读入 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    const file = w.__mkFile('生词本备份.json', JSON.stringify({ favs: [
      { id: ID_A, en: 'Aristotle', cn: '亚里士多德', result: 'ok' },
    ]}));
    // 直接把文件塞进 change 事件
    const fi = q(d, '#fileInput');
    ck('存在文件输入节点', !!fi, 'no #fileInput');
    if (fi) {
      Object.defineProperty(fi, 'files', { value: [file], configurable: true });
      fi.dispatchEvent(new w.Event('change', { bubbles: true }));
    }
    await sleep(60);
    ck('文件名显示在拖拽区', txt(q(d, '#dropTitle')) === '生词本备份.json', txt(q(d, '#dropTitle')));
    ck('拖拽区进入 loaded 态', has(q(d, '#dropzone'), 'loaded'), '');
    ck('文件解析出 1 条', txt(q(d, '#rTotal')) === '1', txt(q(d, '#rTotal')));

    tryClick(w, d, '#doImport');
    await sleep(60);
    ck('文件导入成功', Object.keys(favsOf()).length === 1, JSON.stringify(favsOf()));
    dom.window.close();
  }

  console.log('\n===== 重置导入面板状态 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    paste(w, d, 'Aristotle,亚里士多德');
    await sleep(320);
    ck('解析后有报告', !isHidden(d, '#importReport'), '');

    tryClick(w, d, '#sheetClose');
    await sleep(30);
    tryClick(w, d, '#importBtn');
    await sleep(30);
    ck('重开导入页后清空了粘贴框', (valOf(d, '#importText') || '') === '', '');
    ck('重开导入页后报告隐藏', isHidden(d, '#importReport'), '');
    ck('重开导入页后按钮禁用', isDisabled(d, '#doImport'), '');
    ck('重开导入页默认合并模式', has(q(d, '#modeMerge'), 'on'), '');
    dom.window.close();
  }

  console.log('\n===== G. 导入后生词本可见 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    openImport(w, d);
    paste(w, d, 'Aristotle,亚里士多德\nPlato,柏拉图');
    await sleep(320);
    tryClick(w, d, '#doImport');
    await sleep(80);
    // 切到生词本板块
    tryClick(w, d, '#tabs button[data-tab="fav"]');
    await sleep(120);
    ck('生词本板块不再是空态', !/还不空|还是空的/.test(txt(q(d, '#card'))) || !!q(d, '#starBtn'),
       txt(q(d, '#card')).slice(0, 40));
    ck('生词本卡片显示已收藏星标', has(q(d, '#starBtn'), 'on'), '');
    dom.window.close();
  }

  console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
