/* 分叉判分行为测试：
   答对 -> 保持紧凑、只显示「译对了」、自动跳下一词
   答错 -> 恢复完整界面，显示参考答案 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const TARGET = process.env.TARGET || 'D:/alldata2026/download/2026-10-01-16-31-55/手机版/index.html';
const html = fs.readFileSync(TARGET, 'utf8');

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
const click = (w, el) => el.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const term = d => d.querySelector('.term').textContent;

// 取出当前题的正确答案
function currentAnswer(d) {
  const t = term(d);
  // en2cn 模式下 term 是英文，答案在 DATA 里；直接从结果区反查更稳，改为读取卡片数据集
  return null;
}

(async () => {

  console.log('\n===== 答对：保持紧凑 + 只显示「译对了」+ 自动跳下一词 =====');
  {
    const { dom, w, d, body } = boot();
    const t0 = term(d);
    const inp = d.querySelector('#input');
    inp.focus(); w.__setVV(420);
    inp.value = '亚里士多德';          // 首词 correct 答案
    click(w, d.querySelector('#mainBtn'));

    ck('答对后仍保持紧凑(kbd)', body.classList.contains('kbd'), 'class=' + body.className);
    ck('答对后带 correct 类', body.classList.contains('correct'), 'class=' + body.className);
    ck('答对后仍在同一词', term(d) === t0, `${t0} -> ${term(d)}`);
    ck('结果区显示「译对了」', d.querySelector('#resultBox').innerHTML.includes('译对了'));

    // 自动跳下一词
    await sleep(1100);
    ck('自动跳到了下一个单词', term(d) !== t0, `${t0} -> ${term(d)}`);
    ck('新词清除了 correct 类', !body.classList.contains('correct'), 'class=' + body.className);
    ck('新词回到答题态', d.querySelector('#resultBox').hidden);
    ck('自动跳后仍保持紧凑', body.classList.contains('kbd'), 'class=' + body.className);
    ck('自动跳后焦点回到输入框', d.activeElement && d.activeElement.id === 'input',
       'active=' + (d.activeElement && (d.activeElement.id || d.activeElement.tagName)));
    dom.window.close();
  }

  console.log('\n===== 答错：退出紧凑 + 显示完整界面（含参考答案） =====');
  {
    const { dom, w, d, body } = boot();
    const t0 = term(d);
    const inp = d.querySelector('#input');
    inp.focus(); w.__setVV(420);
    inp.value = '完全错误的答案xyz';
    click(w, d.querySelector('#mainBtn'));

    ck('答错后退出紧凑(kbd)', !body.classList.contains('kbd'), 'class=' + body.className);
    ck('答错后无 correct 类', !body.classList.contains('correct'), 'class=' + body.className);
    ck('答错后仍在同一词(不自动跳)', term(d) === t0, `${t0} -> ${term(d)}`);
    const rb = d.querySelector('#resultBox');
    ck('结果区显示「译错了」', rb.innerHTML.includes('译错了'));
    ck('显示参考答案', rb.innerHTML.includes('参考答案'));
    ck('显示用户所写', rb.innerHTML.includes('你写的'));
    ck('显示原词', rb.innerHTML.includes('原词'));

    // 不应自动跳转
    await sleep(1100);
    ck('答错后不会自动跳词', term(d) === t0, `${t0} -> ${term(d)}`);
    dom.window.close();
  }

  console.log('\n===== 「不记得」：按答错处理，显示完整界面 =====');
  {
    const { dom, w, d, body } = boot();
    const inp = d.querySelector('#input');
    inp.focus(); w.__setVV(420);
    click(w, d.querySelector('#giveBtn'));
    ck('不记得后退出紧凑', !body.classList.contains('kbd'), 'class=' + body.className);
    ck('不记得后显示「没作答」', d.querySelector('#resultBox').innerHTML.includes('没作答'));
    ck('不记得后显示参考答案', d.querySelector('#resultBox').innerHTML.includes('参考答案'));
    dom.window.close();
  }

  console.log('\n===== 连续答对：能一路自动推进多题 =====');
  {
    const { dom, w, d, body } = boot();
    const answers = ['亚里士多德', '柏拉图', '苏格拉底'];
    const seen = [];
    for (let i = 0; i < 3; i++) {
      const inp = d.querySelector('#input');
      const t = term(d);
      if (i === 0) { inp.focus(); w.__setVV(420); }
      inp.value = answers[i];
      click(w, d.querySelector('#mainBtn'));
      seen.push({ t, ok: d.querySelector('#resultBox').innerHTML.includes('译对了') });
      await sleep(1100);
    }
    seen.forEach((s, i) => ck(`第${i + 1}题(${s.t}) 判对`, s.ok));
    ck('连续答对后仍在紧凑态（输入法没被打断）', body.classList.contains('kbd'), 'class=' + body.className);
    dom.window.close();
  }

  console.log('\n===== 答对后手动按「下一张」不会跳两次 =====');
  {
    const { dom, w, d } = boot();
    const inp = d.querySelector('#input');
    inp.focus(); w.__setVV(420);
    inp.value = '亚里士多德';
    click(w, d.querySelector('#mainBtn'));
    const afterFirst = term(d);
    click(w, d.querySelector('#mainBtn'));    // 手动下一张
    await sleep(1100);
    const after = term(d);
    ck('手动下一张后只前进了一词', after !== afterFirst, `${afterFirst} -> ${after}`);
    // 再等一会确认没有被自动跳转再推一次
    await sleep(800);
    ck('之后没有再次自动跳转', term(d) === after, `${after} -> ${term(d)}`);
    dom.window.close();
  }

  console.log(`\n===== 结果：${pass} 通过 / ${fail} 失败 =====\n`);
  process.exit(fail ? 1 : 0);
})();
