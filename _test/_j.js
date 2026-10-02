const fs=require('fs');const {JSDOM}=require('jsdom');
const html=fs.readFileSync('D:/alldata2026/download/2026-10-01-16-31-55/手机版/index.html','utf8');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const q=(d,s)=>{try{return d.querySelector(s)}catch(e){return null}};
const txt=e=>e?(e.textContent||''):'';
const click=(w,e)=>{if(!e)return false;try{e.dispatchEvent(new w.MouseEvent('click',{bubbles:true}));return true}catch(x){return false}};
const store=new Map();
const st=()=>({getItem:k=>store.has(k)?store.get(k):null,setItem:(k,v)=>{store.set(k,String(v))},removeItem:k=>store.delete(k),clear:()=>store.clear(),key:i=>Array.from(store.keys())[i]??null,get length(){return store.size}});
function boot(){const dom=new JSDOM(html,{runScripts:'dangerously',pretendToBeVisual:true,url:'https://example.com/',beforeParse(w){let vh=844;const L={};const vv={get height(){return vh},get offsetTop(){return 0},addEventListener(t,f){(L[t]=L[t]||[]).push(f)},removeEventListener(){}};Object.defineProperty(w,'visualViewport',{value:vv,configurable:true});Object.defineProperty(w.navigator,'maxTouchPoints',{value:5,configurable:true});w.matchMedia=qq=>({matches:/hover:none|pointer:coarse/.test(qq),addEventListener(){},removeEventListener(){},addListener(){},removeListener(){}});Object.defineProperty(w,'localStorage',{value:st(),configurable:true})}});const w=dom.window,d=w.document;d.dispatchEvent(new w.Event('DOMContentLoaded'));return{dom,w,d}}
(async()=>{
store.clear();
store.set('etf_favs',JSON.stringify({'places|Greece|希腊':1}));
store.set('etf_favfilter',JSON.stringify('names'));   // 指向一个生词本里没有的板块
const {w,d}=boot();await sleep(300);
const fav=[...d.querySelectorAll('#tabs .tab')].find(b=>b.dataset.tab==='fav');
console.log('found fav tab =',!!fav);
click(w,fav);await sleep(300);
console.log('store etf_favfilter after =',store.get('etf_favfilter'));
console.log('store etf_tab after =',store.get('etf_tab'));
console.log('favSel =',!!q(d,'#favSel'));
console.log('fbar =',!!q(d,'.fbar'));
console.log('counter =',txt(q(d,'.counter')));
console.log('term =',txt(q(d,'.term')));
console.log('tabs on =',[...d.querySelectorAll('#tabs .tab.on')].map(b=>b.dataset.tab).join(','));
})();
