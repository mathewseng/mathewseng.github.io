// Export a lightweight, self-contained illustration from the real board renderer.
// Run from the repository root: node scripts/render-home-backgammon.cjs
const fs = require('node:fs/promises'), path = require('node:path'), http = require('node:http');
const {chromium} = require('playwright');
const root = path.resolve(__dirname, '..');
const mime = {'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
const server = http.createServer(async (req,res) => {
  const pathname = new URL(req.url,'http://localhost').pathname;
  const file = path.join(root,pathname.endsWith('/')?pathname+'index.html':pathname);
  if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}
  try{const data=await fs.readFile(file);res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');res.end(data);}
  catch{res.writeHead(404);res.end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try{
    browser=await chromium.launch({headless:true});
    const page=await browser.newPage({viewport:{width:1000,height:800},reducedMotion:'reduce',serviceWorkers:'block'});
    await page.goto(`http://127.0.0.1:${server.address().port}/backgammon/`);
    await page.waitForFunction(()=>document.documentElement.dataset.appReady==='true');
    const output=await page.evaluate(async()=>{
      const r=await import('/backgammon/core/rules.mjs');
      const {Board}=await import('/backgammon/ui/board.mjs');
      const {applySkin}=await import('/backgammon/ui/skin.mjs');
      const {applyBoardTheme}=await import('/backgammon/core/appearance.mjs');
      applySkin('liquid-chrome');applyBoardTheme({preset:'plum'});
      let state=r.initialState({phase:'roll',matchLength:0});
      // Six legal opening/reply turns create points, runners and contact.
      for(const [dice,moves] of [
        [[3,1],[[8,5,3],[6,5,1]]], [[4,2],[[8,4,4],[6,4,2]]],
        [[6,5],[[24,18,6],[18,13,5]]], [[3,2],[[13,10,3],[24,22,2]]],
        [[6,4],[[24,18,6],[13,9,4]]], [[5,1],[[13,8,5],[24,23,1]]],
      ]){
        state=r.transition(state,{type:'roll',dice});
        const point=p=>state.turn===0?p-1:24-p;
        state=r.transition(state,{type:'move',steps:moves.map(([from,to,die])=>({from:point(from),to:point(to),die}))});
      }
      state=r.transition(state,{type:'roll',dice:[6,2]});
      const container=document.createElement('div');
      container.style.cssText='position:fixed;inset:0;width:876px;height:660px';
      document.body.append(container);
      const board=new Board(container);board.motion=false;
      board.render(state,{interactive:false,numbers:false,moveHints:false,cubeOneAsOne:true});
      const svg=board.svg;
      for(const id of ['skin-board-definitions','board-pattern-definitions'])
        for(const defs of document.querySelectorAll(`#${id} > defs`))svg.prepend(defs.cloneNode(true));
      svg.querySelectorAll('.checker-hit,.board-dice-hit,.board-caption,.cube-key').forEach(n=>n.remove());
      const properties=['fill','fill-opacity','stroke','stroke-opacity','stroke-width','stroke-linecap','stroke-linejoin',
        'stroke-dasharray','opacity','filter','font-family','font-size','font-weight','text-anchor','dominant-baseline','stop-color','stop-opacity'];
      const nodes=[svg,...svg.querySelectorAll('*')],styles=new Map();
      const paints=nodes.map(n=>{
        const css=getComputedStyle(n);
        const paint=properties.map(p=>`${p}:${css.getPropertyValue(p).replace(/url\(["']?[^)#]*#([^"')]+)["']?\)/g,'url(#$1)')}`).join(';');
        if(!styles.has(paint))styles.set(paint,`s${styles.size}`);
        return styles.get(paint);
      });
      nodes.forEach((n,i)=>{
        for(const a of [...n.attributes])if(/^(data-|aria-)/.test(a.name)||['class','style','role','tabindex'].includes(a.name))n.removeAttribute(a.name);
        n.setAttribute('class',paints[i]);
      });
      const style=document.createElementNS(svg.namespaceURI,'style');
      style.textContent=[...styles].map(([css,name])=>`.${name}{${css}}`).join('');svg.prepend(style);
      const title=document.createElementNS(svg.namespaceURI,'title');title.textContent='Backgammon midgame in Liquid Chrome Plum';svg.prepend(title);
      svg.setAttribute('width','876');svg.setAttribute('height','660');
      return new XMLSerializer().serializeToString(svg);
    });
    await fs.writeFile(path.join(root,'home-backgammon.svg'),output+'\n');
    console.log(`Exported Backgammon preview (${Buffer.byteLength(output)} bytes).`);
  }finally{await browser?.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
