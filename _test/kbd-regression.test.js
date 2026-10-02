/* 复现用户报告的缺陷：打字后判分不显示 / 界面压缩无法还原 */
const fs = require('fs');
const { JSDOM } = require('jsdom');

const html = fs.readFileSync('D:/alldata2026/download/2026-10-01-16-31-55/手机版/index.html', 'utf8');

let pass = 0, fail = 0;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const check = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name} ${extra}`); }
};

// 构造带 visualViewport 的移动端环境
function makeDom(viewH0) {
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://example.com/',
    beforeParse(w) {
      let vh = viewH0, vtop = 0;
      const listeners = {};
      const vv = {
        get height() { return vh; },
        get offsetTop() { return vtop; },
        addEventListener(t, f) { (listeners[t] = listeners[t] || []).push(f); },
        removeEventListener() {},
      };
      Object.defineProperty(w, 'visualViewport', { value: vv, configurable: true });
      // 触屏设备
      Object.defineProperty(w.navigator, 'maxTouchPoints', { value: 5, configurable: true });
      w.matchMedia = q => ({
        matches: /hover:none|pointer:coarse/.test(q),
        addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
      });
      w.__setVV = (h, t = 0) => {
        vh = h; vtop = t;
        (listeners.resize || []).forEach(f => f({}));
      };
      w.speechSynthesis = undefined;
    },
  });
  return dom;
}

(async () => {
console.log('\n========== 场景 A：打字聚焦 -> 判分 -> 应显示结果且界面还原 ==========');
{
  const dom = makeDom(844);
  const w = dom.window, d = w.document;
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));

  const body = d.body;
  const input = () => d.querySelector('#input');

  check('初始不含 kbd 类', !body.classList.contains('kbd'));
  check('初始含 asking 类', body.classList.contains('asking'));

  // 1. 聚焦输入框（等价于用户打字）
  input().focus();
  check('聚焦后进入 kbd 紧凑模式', body.classList.contains('kbd'), `class=${body.className}`);

  // 2. 键盘弹出：可视区变小
  w.__setVV(420);
  check('键盘弹出后仍在 kbd 模式', body.classList.contains('kbd'));

  // 3. 输入答案并判分（用错误答案，走「完整界面」分支）
  input().value = '一个肯定不对的答案zzz';
  const mainBtn = d.querySelector('#mainBtn');
  check('主按钮文案为「确认翻译」', mainBtn.textContent.includes('确认翻译'), mainBtn.textContent);
  mainBtn.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));

  // 4. 结果区应可见
  const resultBox = d.querySelector('#resultBox');
  check('判分后结果区已显示(非 hidden)', !resultBox.hidden);
  check('结果区含「译错了」印章', resultBox.innerHTML.includes('译错了'), resultBox.innerHTML.slice(0, 60));
  check('主按钮变为「下一张」', mainBtn.textContent.includes('下一张'), mainBtn.textContent);

  // 5. 答错时必须退出紧凑模式，让完整界面（正确答案）可见
  check('答错后已退出 kbd 模式', !body.classList.contains('kbd'), `class=${body.className}`);
  check('答错后 body 不含 asking（判分态）', !body.classList.contains('asking'));

  // 6. 收起键盘，界面应能还原
  w.__setVV(844);
  check('键盘收起后仍非 kbd 模式', !body.classList.contains('kbd'));

  // 7. 用 CSS 规则核对：答错（非 correct）后 .bottom 不再被隐藏
  const css = html.match(/<style>([\s\S]*?)<\/style>/)[1];
  const hidesBottomAlways =
    /body\.kbd\s+\.tabs[^{]*\.bottom[^{]*\{[^}]*display\s*:\s*none/.test(css) &&
    !/body\.kbd\.asking[^{]*\.bottom/.test(css);
  check('CSS 中 .bottom 只在 asking/correct 时隐藏', !hidesBottomAlways);
  dom.window.close();
}

console.log('\n========== 场景 B：blur 丢失 -> 压缩态必须能自动还原 ==========');
{
  const dom = makeDom(844);
  const w = dom.window, d = w.document;
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const body = d.body;
  const input = d.querySelector('#input');

  input.focus();
  w.__setVV(420);
  check('进入压缩态', body.classList.contains('kbd'));

  // 模拟：输入框被重建（切词），焦点丢失但 blur 未派发
  input.blur();
  w.__setVV(420);   // 键盘其实已收起但事件延迟
  w.__setVV(844);   // 可视区恢复
  check('可视区恢复后自动退出压缩态', !body.classList.contains('kbd'), `class=${body.className}`);
  dom.window.close();
}

console.log('\n========== 场景 C：连续答两题，第二题仍能正常判分 ==========');
{
  const dom = makeDom(844);
  const w = dom.window, d = w.document;
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const body = d.body;

  // 注意：切词有 125ms 动画，必须等动画结束再操作下一题（模拟真人节奏）
  // 这里全部用错误答案，走「完整界面」分支（答对会自动跳词，不适合逐步断言）
  const answerOnce = (val) => {
    const inp = d.querySelector('#input');
    inp.focus();
    w.__setVV(420);
    inp.value = val;
    d.querySelector('#mainBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
    const res = d.querySelector('#resultBox');
    const shown = !res.hidden;
    const btnText = d.querySelector('#mainBtn').textContent;
    w.__setVV(844);
    return { shown, btnText, kbd: body.classList.contains('kbd') };
  };

  const r1 = answerOnce('错误答案一');
  check('第 1 题显示结果', r1.shown);
  check('答错后退出压缩态', !r1.kbd);

  // 点「下一张」并等待切词动画完成 —— 用 Node 的 sleep，不依赖 jsdom 计时器
  d.querySelector('#mainBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(400);
  const r2 = answerOnce('错误答案二');
  check('第 2 题显示结果', r2.shown);
  check('第 2 题答错后退出压缩态', !r2.kbd, `class=${body.className}`);
  dom.window.close();
}

console.log('\n========== 场景 D：「重置进度」后必须回到可判分状态 ==========');
{
  const dom = makeDom(844);
  const w = dom.window, d = w.document;
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  const body = d.body;

  // 先答一题（用错误答案，避免触发答对后的自动跳词）
  d.querySelector('#input').focus();
  w.__setVV(420);
  d.querySelector('#input').value = '错误答案zzz';
  d.querySelector('#mainBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  w.__setVV(844);
  check('答完一题后主按钮为「下一张」', d.querySelector('#mainBtn').textContent.includes('下一张'));

  // 重置进度
  d.querySelector('#resetBtn').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('重置后主按钮回到「确认翻译」', d.querySelector('#mainBtn').textContent.includes('确认翻译'),
    d.querySelector('#mainBtn').textContent);
  check('重置后结果区隐藏', d.querySelector('#resultBox').hidden);
  check('重置后 body 含 asking', body.classList.contains('asking'));
  check('重置后清除了 correct 类', !body.classList.contains('correct'), 'class=' + body.className);
  dom.window.close();
}

console.log(`\n========== 结果：${pass} 通过 / ${fail} 失败 ==========\n`);
process.exit(fail ? 1 : 0);
})();
