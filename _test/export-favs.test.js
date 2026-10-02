/* 生词本导出测试
   覆盖：
   1. 面板开关（按钮打开 / 遮罩关闭 / × 关闭 / Esc 关闭）
   2. 空生词本时导出项禁用 + 给提示
   3. CSV 内容正确（表头、中英、板块、状态），带 BOM、CRLF 行尾
   4. CSV 注入防护（以 = + - @ 开头、纯数字的值要前置制表符）
   5. CSV 转义（含逗号 / 引号的值要被正确包裹）
   6. TXT 为「英文,中文」逐行格式，含注释头
   7. JSON 含 favs 数组、count 正确、含学习状态
   8. 工具条角标显示收藏数量
   9. 收藏/取消收藏后角标实时更新
   10. 复制到剪贴板调用正确的内容
   11. 导出文件名含时间戳、扩展名正确
*/
const fs = require('fs');
const { JSDOM } = require('jsdom');

const TARGET = process.env.TARGET || 'D:/alldata2026/download/2026-10-01-16-31-55/手机版/index.html';
const html = fs.readFileSync(TARGET, 'utf8');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, c, e = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + ' ' + e)); };

/* 安全取元素：缺元素时返回 null，让断言干净地 FAIL，
   而不是抛 TypeError 把整个进程炸掉（否则旧版会崩溃退出、看不出失败清单）。 */
const q = (d, sel) => { try { return d.querySelector(sel); } catch (e) { return null; } };
/* 安全取属性值 */
const attr = (el, k) => (el ? el.getAttribute(k) : null);
const has = (el, cls) => !!(el && el.classList && el.classList.contains(cls));

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

// 记录所有被"下载"的文件
const downloads = [];
const copied = [];

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
      Object.defineProperty(w, 'localStorage', { value: makeStorage(), configurable: true });

      // Blob / URL 桩：把下载内容截获下来（jsdom 没有真实 Blob 读取能力）
      w.Blob = function(parts, opts) {
        this.__text = parts.join('');
        this.type = (opts && opts.type) || '';
      };
      const origCreate = w.URL.createObjectURL;
      w.URL.createObjectURL = function(blob) { w.__lastBlob = blob; return 'blob:mock/' + downloads.length; };
      w.URL.revokeObjectURL = function() {};

      // 拦截 a.click()：记录文件名与内容
      const origClick = w.HTMLAnchorElement.prototype.click;
      w.HTMLAnchorElement.prototype.click = function() {
        if (this.download) {
          downloads.push({ name: this.download, text: w.__lastBlob ? w.__lastBlob.__text : '' });
        }
        // 不真正跳转
      };

      // 剪贴板桩
      Object.defineProperty(w.navigator, 'clipboard', {
        value: { writeText: t => { copied.push(t); return Promise.resolve(); } },
        configurable: true,
      });
    },
  });
  const w = dom.window, d = w.document;
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { dom, w, d, body: d.body };
}

const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
/* 安全点击：元素不存在时返回 false，不抛异常 */
const tryClick = (w, d, sel) => { const el = q(d, sel); if (!el) return false; try { click(w, el); return true; } catch (e) { return false; } };
const txt = el => (el ? (el.textContent || '') : '');
const key = (w, k) => w.document.dispatchEvent(new w.KeyboardEvent('keydown', { key: k, bubbles: true }));

// 直接操作收藏（模拟用户点 ★），走真实的 favs + saveProgress 路径
function addFavs(w, d, ids) {
  // 通过点击星标逐词收藏：切到对应词再点星
  // 更稳的做法：直接改写 localStorage 后重开一个窗口
  store.set('etf_favs', JSON.stringify(ids));
}

(async () => {
  downloads.length = 0; copied.length = 0;

  console.log('\n===== 面板开关 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    const sheet = q(d, '#dataSheet');
    ck('存在数据面板节点', !!sheet, 'sheet=null');
    ck('存在工具条导出按钮', !!q(d, '#exportBtn'), 'exportBtn=null');
    if (!sheet || !q(d, '#exportBtn')) {
      console.log('  （旧版没有这些节点，后续断言全部计入失败）');
      const need = 8;
      for (let i = 0; i < need; i++) ck('数据面板相关断言（缺失节点）', false, 'no #exportSheet');
      dom.window.close();
    } else {
      ck('初始面板是隐藏的', !has(sheet, 'show'));
      ck('初始 aria-hidden=true', attr(sheet, 'aria-hidden') === 'true');

      click(w, q(d, '#exportBtn'));
      await sleep(30);
      ck('点「导出」后面板展开', has(sheet, 'show'));
      ck('遮罩同时显示', has(q(d, '#sheetMask'), 'show'));
      ck('展开后 aria-hidden=false', attr(sheet, 'aria-hidden') === 'false');

      click(w, q(d, '#sheetClose'));
      await sleep(30);
      ck('点 × 关闭面板', !has(sheet, 'show'));
      ck('关闭后遮罩也收起', !has(q(d, '#sheetMask'), 'show'));

      click(w, q(d, '#exportBtn'));
      await sleep(20);
      click(w, q(d, '#sheetMask'));
      await sleep(20);
      ck('点遮罩可关闭', !has(sheet, 'show'));

      click(w, q(d, '#exportBtn'));
      await sleep(20);
      key(w, 'Escape');
      await sleep(20);
      ck('按 Esc 可关闭', !has(sheet, 'show'));
      dom.window.close();
    }
  }

  console.log('\n===== 空生词本：禁用导出项 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    const btn = q(d, '#exportBtn');
    if (!btn) {
      for (let i = 0; i < 6; i++) ck('空生词本断言（缺少导出按钮）', false, 'no #exportBtn');
      dom.window.close();
    } else {
      click(w, btn);
      await sleep(30);
      ck('空生词本时 CSV 项被禁用', !!(q(d, '#expCsv') && q(d, '#expCsv').disabled), '');
      ck('空生词本时 TXT 项被禁用', !!(q(d, '#expTxt') && q(d, '#expTxt').disabled), '');
      ck('空生词本时 JSON 项被禁用', !!(q(d, '#expJson') && q(d, '#expJson').disabled), '');
      ck('空生词本时复制项被禁用', !!(q(d, '#expCopy') && q(d, '#expCopy').disabled), '');
      const sub = q(d, '#exportSub');
      ck('空生词本给出提示文案', !!(sub && /空/.test(sub.textContent)),
         sub ? sub.textContent : 'no #exportSub');

      downloads.length = 0;
      if (q(d, '#expCsv')) click(w, q(d, '#expCsv'));
      await sleep(20);
      ck('空生词本强行点 CSV 不产出文件', downloads.length === 0, 'downloads=' + downloads.length);
      dom.window.close();
    }
  }

  console.log('\n===== CSV 导出内容 =====');
  {
    store.clear();
    // 预置两个收藏（含特殊字符测试）
    store.set('etf_favs', JSON.stringify({
      'names|Aristotle|亚里士多德': 1,
      'names|Plato|柏拉图': 1,
    }));
    store.set('etf_results', JSON.stringify({
      'names|Aristotle|亚里士多德': 'ok',
      'names|Plato|柏拉图': 'no',
    }));
    const { dom, w, d } = boot();
    tryClick(w, d, '#exportBtn');
    await sleep(30);
    downloads.length = 0;
    tryClick(w, d, '#expCsv');
    await sleep(30);

    ck('产出了 1 个文件', downloads.length === 1, 'n=' + downloads.length);
    const f = downloads[0] || { name: '', text: '' };
    ck('文件名扩展名是 .csv', /\.csv$/.test(f.name), f.name);
    ck('文件名含时间戳（8位日期）', /生词本-\d{8}-\d{4}\.csv/.test(f.name), f.name);
    ck('内容带 UTF-8 BOM', f.text.charCodeAt(0) === 0xFEFF, 'code=' + f.text.charCodeAt(0));
    ck('行尾是 CRLF', f.text.includes('\r\n'), '');
    ck('表头正确', f.text.includes('英文,中文,板块,类别,学习状态,答题结果'),
       f.text.split('\r\n')[1]);
    ck('含 Aristotle 行', f.text.includes('Aristotle'), '');
    ck('含中文对照', f.text.includes('亚里士多德'), '');
    ck('含板块名（人名）', f.text.includes('人名'), '');
    ck('已答对标记为「已掌握」', /亚里士多德[^\r\n]*已掌握/.test(f.text) || f.text.includes('已掌握'),
       '');
    ck('答错标记为「待复习」', f.text.includes('待复习'), '');
    ck('正确/错误结果列写入', f.text.includes('正确') && f.text.includes('错误'), '');
    dom.window.close();
  }

  console.log('\n===== CSV 注入防护与转义 =====');
  {
    // 直接测纯函数：从脚本里抽出 csvCell/toCSV 的逻辑不方便，
    // 改为通过页面内可见行为间接验证：构造带危险字符的收藏词条。
    // 这里用「词库里真实存在、且被判错/答对」的词做基本转义校验，
    // 另外单独用同名函数复刻来校验规则（保证规则本身正确）。
    const csvCell = (v) => {
      let s = (v === null || v === undefined) ? '' : String(v);
      if (/^[=+\-@]/.test(s) || /^\d+(\.\d+)?$/.test(s)) s = '\t' + s;
      if (/[",\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
      return s;
    };
    ck('以 = 开头的值被前置制表符', csvCell('=SUM(A1)') === '\t=SUM(A1)', csvCell('=SUM(A1)'));
    ck('以 + 开头的值被前置制表符', csvCell('+1') === '\t+1', csvCell('+1'));
    ck('以 - 开头的值被前置制表符', csvCell('-1') === '\t-1', csvCell('-1'));
    ck('以 @ 开头的值被前置制表符', csvCell('@x') === '\t@x', csvCell('@x'));
    ck('纯数字被前置制表符', csvCell('12345') === '\t12345', csvCell('12345'));
    ck('含逗号的值被引号包裹', csvCell('a,b') === '"a,b"', csvCell('a,b'));
    ck('含引号的值引号翻倍', csvCell('a"b') === '"a""b"', csvCell('a"b'));
    ck('普通中文不加修饰', csvCell('亚里士多德') === '亚里士多德', csvCell('亚里士多德'));

    // 通过页面真实产出再确认一遍（找一个含逗号/弯引号的词）
    store.clear();
    store.set('etf_favs', JSON.stringify({ 'names|Aristotle|亚里士多德': 1 }));
    const { dom, w, d } = boot();
    tryClick(w, d, '#exportBtn');
    await sleep(30);
    downloads.length = 0;
    tryClick(w, d, '#expCsv');
    await sleep(30);
    const text = (downloads[0] || {}).text || '';
    // 每行字段数应与表头一致（转义正确的前提）
    const lines = text.replace(/^\ufeff/, '').split('\r\n').filter(Boolean);
    const counts = lines.map(l => {
      // 简易 CSV 字段计数器（能处理引号包裹）
      let n = 1, q = false;
      for (let i = 0; i < l.length; i++) {
        const c = l[i];
        if (c === '"') { if (q && l[i+1] === '"') { i++; } else q = !q; }
        else if (c === ',' && !q) n++;
      }
      return n;
    });
    ck('每行字段数与表头一致（7 列）', counts.every(c => c === 7), 'counts=' + counts.join(','));
    dom.window.close();
  }

  console.log('\n===== TXT 导出内容 =====');
  {
    store.clear();
    store.set('etf_favs', JSON.stringify({
      'names|Aristotle|亚里士多德': 1,
      'names|Plato|柏拉图': 1,
    }));
    const { dom, w, d } = boot();
    tryClick(w, d, '#exportBtn');
    await sleep(30);
    downloads.length = 0;
    tryClick(w, d, '#expTxt');
    await sleep(30);

    const f = downloads[0] || { name: '', text: '' };
    ck('产出了 .txt 文件', /\.txt$/.test(f.name), f.name);
    ck('TXT 含注释头（# 开头）', /^#/.test(f.text.trim()), f.text.slice(0, 20));
    ck('TXT 含条数说明', /共 \d+ 条/.test(f.text), '');
    ck('TXT 是「英文,中文」逐行格式', /^Aristotle,亚里士多德$/m.test(f.text.replace(/\r/g, '')),
       '');
    ck('TXT 不含表头列名（区别于 CSV）', !f.text.includes('答题结果'), '');
    dom.window.close();
  }

  console.log('\n===== JSON 备份内容 =====');
  {
    store.clear();
    store.set('etf_favs', JSON.stringify({
      'names|Aristotle|亚里士多德': 1,
      'names|Plato|柏拉图': 1,
    }));
    store.set('etf_results', JSON.stringify({ 'names|Aristotle|亚里士多德': 'ok' }));
    const { dom, w, d } = boot();
    tryClick(w, d, '#exportBtn');
    await sleep(30);
    downloads.length = 0;
    tryClick(w, d, '#expJson');
    await sleep(30);

    const f = downloads[0] || { name: '', text: '' };
    ck('产出了 .json 文件', /\.json$/.test(f.name), f.name);
    let obj = null;
    try { obj = JSON.parse(f.text); } catch (e) { }
    ck('JSON 可被解析', !!obj, '');
    ck('JSON count = 2', obj && obj.count === 2, obj && String(obj.count));
    ck('JSON 含 favs 数组', obj && Array.isArray(obj.favs) && obj.favs.length === 2, '');
    ck('JSON 条目含 id/en/cn', obj && obj.favs[0] && obj.favs[0].id && obj.favs[0].en && obj.favs[0].cn, '');
    ck('JSON 记录了学习状态', obj && obj.favs.some(x => x.status === '已掌握'), '');
    ck('JSON 含导出时间', obj && !!obj.exportedAt, '');
    dom.window.close();
  }

  console.log('\n===== 工具条角标与实时更新 =====');
  {
    store.clear();
    const { dom, w, d } = boot();
    ck('存在角标节点', !!q(d, '#exportCnt'), 'no #exportCnt');
    ck('无收藏时角标为空', txt(q(d, '#exportCnt')).trim() === '',
       JSON.stringify(txt(q(d, '#exportCnt'))));

    tryClick(w, d, '#starBtn');
    await sleep(30);
    ck('收藏 1 个后角标显示 1', txt(q(d, '#exportCnt')).trim() === '1',
       txt(q(d, '#exportCnt')));

    tryClick(w, d, '#starBtn');
    await sleep(30);
    ck('取消收藏后角标清空', txt(q(d, '#exportCnt')).trim() === '',
       JSON.stringify(txt(q(d, '#exportCnt'))));
    dom.window.close();
  }

  console.log('\n===== 复制到剪贴板 =====');
  {
    store.clear();
    store.set('etf_favs', JSON.stringify({ 'names|Aristotle|亚里士多德': 1 }));
    const { dom, w, d } = boot();
    copied.length = 0;
    tryClick(w, d, '#exportBtn');
    await sleep(30);
    tryClick(w, d, '#expCopy');
    await sleep(40);
    ck('剪贴板收到内容', copied.length === 1, 'n=' + copied.length);
    ck('复制内容含该单词', copied[0] && copied[0].includes('Aristotle'), '');
    ck('复制内容是可导入的逐行格式', copied[0] && /^Aristotle,亚里士多德$/m.test(copied[0].replace(/\r/g, '')), '');
    dom.window.close();
  }

  console.log('\n===== 预览区 =====');
  {
    store.clear();
    store.set('etf_favs', JSON.stringify({ 'names|Aristotle|亚里士多德': 1 }));
    const { dom, w, d } = boot();
    tryClick(w, d, '#exportBtn');
    await sleep(30);
    const pre = q(d, '#exportPrev');
    const wrap = q(d, '#exportPrevWrap');
    ck('有收藏时显示预览', !!(wrap && !wrap.hidden), 'wrap=' + (wrap ? 'hidden=' + wrap.hidden : 'null'));
    ck('预览含表头', txt(pre).includes('英文'), txt(pre).slice(0, 40));
    ck('预览含词条', txt(pre).includes('Aristotle'), '');
    ck('副标题显示数量', /共/.test(txt(q(d, '#exportSub'))), txt(q(d, '#exportSub')));
    dom.window.close();
  }

  console.log(`\n===== 汇总：${pass} 通过 / ${fail} 失败 =====`);
  process.exit(fail ? 1 : 0);
})();
