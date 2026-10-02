/* 回车键行为测试：判分 -> 下一个单词 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('D:/alldata2026/download/2026-10-01-16-31-55/手机版/index.html', 'utf8');

const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const ck = (n, c, e = '') => { c ? (pass++, console.log('  PASS  ' + n)) : (fail++, console.log('  FAIL  ' + n + ' ' + e)); };

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
      w.matchMedia = q => ({ matches: /hover:none|pointer:coarse/.test(q), addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
      w.__setVV = h => { vh = h; (L.resize || []).forEach(f => f({})); };
    },
  });
  const w = dom.window, d = w.document;
  d.dispatchEvent(new w.Event('DOMContentLoaded'));
  return { dom, w, d, body: d.body };
}

// 用真实 KeyboardEvent 触发回车
const pressEnter = (w, el) => el.dispatchEvent(
  new w.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true })
);

(async () => {

  console.log('\n===== 场景 1：输入框内回车，第 1 次判分 =====');
  {
    const { dom, w, d, body } = boot();
    const inp = d.querySelector('#input');
    const term0 = d.querySelector('.term').textContent;
    inp.focus(); w.__setVV(420);
    inp.value = '亚里士多德';
    pressEnter(w, inp);

    const res = d.querySelector('#resultBox');
    ck('回车后显示评分结果', !res.hidden, 'hidden=' + res.hidden);
    ck('回车后仍在同一单词(' + term0 + ')', d.querySelector('.term').textContent === term0);
    // 答对时保持紧凑（不把输入法挤走）；这里用的是正确答案，所以应保留 kbd
    ck('答对后保持紧凑态（输入法不被挤走）', body.classList.contains('kbd'), 'class=' + body.className);
    ck('答对后带 correct 类', body.classList.contains('correct'), 'class=' + body.className);
    ck('按钮变为「下一张」', d.querySelector('#mainBtn').textContent.includes('下一张'));
    dom.window.close();
  }

  console.log('\n===== 场景 2：输入框内连续两次回车，第 2 次跳下一个单词 =====');
  {
    const { dom, w, d, body } = boot();
    const inp = d.querySelector('#input');
    const term0 = d.querySelector('.term').textContent;
    inp.focus(); w.__setVV(420);
    inp.value = '亚里士多德';

    pressEnter(w, inp);                 // 第 1 次：判分
    ck('第 1 次回车后显示结果', !d.querySelector('#resultBox').hidden);

    // 第 2 次回车：输入框此时可能仍持有焦点（移动端输入法行为）
    pressEnter(w, inp);
    await sleep(400);                   // 等切词动画

    const term1 = d.querySelector('.term').textContent;
    ck('第 2 次回车切到了下一个单词', term1 !== term0, `${term0} -> ${term1}`);
    ck('新单词回到答题态（结果区隐藏）', d.querySelector('#resultBox').hidden);
    ck('新单词按钮为「确认翻译」', d.querySelector('#mainBtn').textContent.includes('确认翻译'));
    dom.window.close();
  }

  console.log('\n===== 场景 3：焦点不在输入框时回车，也能推进 =====');
  {
    const { dom, w, d, body } = boot();
    const inp = d.querySelector('#input');
    const term0 = d.querySelector('.term').textContent;
    inp.focus(); w.__setVV(420);
    inp.value = '亚里士多德';
    pressEnter(w, inp);                 // 判分
    w.__setVV(844);
    inp.blur();                         // 收键盘后焦点回到 body / 按钮

    pressEnter(w, d.body);              // 在 body 上回车
    await sleep(400);
    const term1 = d.querySelector('.term').textContent;
    ck('焦点了失去后回车仍能跳到下一个', term1 !== term0, `${term0} -> ${term1}`);
    dom.window.close();
  }

  console.log('\n===== 场景 4：连续回车答题，每题都正常判分+推进 =====');
  {
    const { dom, w, d, body } = boot();
    const seen = [];
    for (let i = 1; i <= 3; i++) {
      const inp = d.querySelector('#input');
      const t = d.querySelector('.term').textContent;
      inp.focus(); w.__setVV(420);
      inp.value = '答案' + i;
      pressEnter(w, inp);                                          // 判分
      seen.push({ t, shown: !d.querySelector('#resultBox').hidden });
      w.__setVV(844);
      if (i < 3) { pressEnter(w, inp); await sleep(400); }         // 下一个
    }
    seen.forEach((s, i) => ck(`第${i + 1}题(${s.t}) 回车判分显示结果`, s.shown));
    dom.window.close();
  }

  console.log('\n===== 场景 5：回车不会触发换行/默认行为 =====');
  {
    const { dom, w, d } = boot();
    const inp = d.querySelector('#input');
    inp.focus();
    const ev = new w.KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true, cancelable: true });
    inp.dispatchEvent(ev);
    ck('回车默认行为已被 preventDefault', ev.defaultPrevented, 'defaultPrevented=' + ev.defaultPrevented);
    dom.window.close();
  }

  console.log('\n===== 场景 6：翻页箭头不受影响 =====');
  {
    const { dom, w, d } = boot();
    const term0 = d.querySelector('.term').textContent;
    d.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await sleep(400);
    ck('方向键右键仍能翻页', d.querySelector('.term').textContent !== term0);
    dom.window.close();
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====\n`);
  process.exit(fail ? 1 : 0);
})();
