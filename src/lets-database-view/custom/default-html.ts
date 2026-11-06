/** First-run example; the user's source is persisted separately and never rebuilt on plugin upgrades. */
export const DEFAULT_CUSTOM_HTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Dodo 数据库自定义视图</title>
<style>
:root{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color-scheme:light dark}
body{margin:0;padding:24px;background:#f7f8fa;color:#27303b}
h1{font-size:22px;margin:0 0 6px}
.sub{color:#707987;font-size:13px;margin-bottom:18px}
.toolbar{display:flex;gap:10px;margin:0 0 16px}
input{padding:10px 13px;border-radius:8px;border:1px solid #ddd;flex:1;max-width:350px;background:transparent;color:inherit}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px}
.card{padding:18px;background:#fff;border:1px solid #e5e8ef;border-radius:12px;min-width:0;box-shadow:0 2px 8px #00000006}
.cover{width:100%;height:165px;display:block;object-fit:cover;border-radius:8px;background:#e8edf3;margin-bottom:12px}
.title{font-weight:650;margin-bottom:12px;overflow-wrap:anywhere}
.meta{font-size:13px;color:#667183;overflow-wrap:anywhere;margin:5px 0}
.status{font-size:13px;color:#666;margin-top:14px}
.more{display:block;margin:14px auto 0;padding:9px 20px;border-radius:8px;border:1px solid #cfd5df;background:#fff;color:#27303b;cursor:pointer}
.more[hidden]{display:none}
.more:disabled{opacity:.6;cursor:wait}
@media(prefers-color-scheme:dark){body{background:#1c1f25;color:#e9edf5}.card{background:#282d35;border-color:#3e4650}.meta,.sub,.status{color:#aab4c2}input{border-color:#515b69}}
</style>
</head>
<body>
<h1>我的数据库</h1>
<div class="sub">此界面是独立 HTML，由 Dodo 提供数据库 SDK；可用 Agent 按需重新设计。</div>
<div class="toolbar"><input id="q" placeholder="搜索当前已加载记录…" aria-label="搜索记录"></div>
<div id="cards" class="cards"></div><p id="status" class="status">正在读取数据库…</p>
<button id="more" class="more" type="button" hidden>加载更多</button>
<script>
const cards=document.querySelector('#cards'),status=document.querySelector('#status'),input=document.querySelector('#q');
const more=document.querySelector('#more');
const pager=window.dodoDB.createPaginator();
let fields=[],records=[],generation=0,loading=false,loadedTotal=0;
function text(value){if(value==null)return '';if(typeof value==='object')return Array.isArray(value)?value.map(text).join(', '):JSON.stringify(value);return String(value)}
function display(row,key){return row.displayValues?.[key] ?? text(row.values?.[key])}
function draw(added){
  const q=input.value.toLowerCase(),filtered=added&&!q?added:
    records.filter(r=>fields.some(f=>display(r,f.id).toLowerCase().includes(q)));
  if(!added||q)cards.replaceChildren();
  for(const row of filtered){
    const node=document.createElement('article');node.className='card';
    const primary=fields.find(f=>f.type==='block')||fields[0];
    const assetField=fields.find(f=>f.type==='mAsset');
    const assets=assetField?row.values?.[assetField.id]:null;
    const cover=Array.isArray(assets)
      ?assets.find(a=>a && typeof a.path==='string' &&
         /\\.(?:jpe?g|png|webp|gif|avif|bmp)(?:[?#]|$)/i.test(a.path)):null;
    if(cover){
      const img=document.createElement('img');img.className='cover';
      img.alt=cover.name||'数据库封面';img.loading='lazy';
      // Native SiYuan asset URL: browser handles thumbnailing and caching.
      const path=cover.path.startsWith('/')?cover.path.slice(1):cover.path;
      img.src=path+(path.includes('style=')?'':path.includes('?')?'&style=thumb':'?style=thumb');
      img.onerror=()=>{img.style.display='none'};
      node.append(img);
    }
    const title=document.createElement('div');title.className='title';title.textContent=display(row,primary?.id)||'未命名记录';node.append(title);
    for(const field of fields.filter(f=>f.id!==primary?.id).slice(0,6)){
      const line=document.createElement('div');line.className='meta';line.textContent=field.name+'：'+display(row,field.id);node.append(line);
    }
    cards.append(node);
  }
  status.textContent='已读取 '+records.length+' / '+loadedTotal+' 条'+
    (q?'；匹配 '+records.filter(r=>fields.some(f=>display(r,f.id).toLowerCase().includes(q))).length+' 条':'')+
    '；每批 '+pager.pageSize+' 条'+(pager.pageSize>=102400?'（全部模式分块读取）':'');
}
async function loadNext(epoch=generation){
  if(loading||!pager.hasMore)return;
  loading=true;more.disabled=true;
  try{
    const data=await pager.next();
    if(epoch!==generation||data.stale)return;
    records=data.records;loadedTotal=data.total;
    draw(data.added);
    more.hidden=!data.hasMore;
  }catch(error){if(epoch===generation)status.textContent='读取失败：'+error.message}
  finally{
    if(epoch===generation){loading=false;more.disabled=false}
  }
}
async function load(){
  const epoch=++generation;
  pager.reset();loading=false;records=[];fields=[];loadedTotal=0;
  cards.replaceChildren();status.textContent='正在读取数据库…';more.hidden=true;
  try{
    const schema=await window.dodoDB.getSchema();
    if(epoch!==generation)return;
    fields=schema.fields;
    document.querySelector('h1').textContent=schema.name||'我的数据库';
    await loadNext(epoch);
  }catch(error){if(epoch===generation)status.textContent='读取失败：'+error.message}
}
input.addEventListener('input',()=>draw());
more.addEventListener('click',()=>{void loadNext()});
const observer=typeof IntersectionObserver==='function'
  ?new IntersectionObserver(entries=>{
    if(entries.some(item=>item.isIntersecting)&&!loading&&!more.hidden)void loadNext();
  },{rootMargin:'180px'}):null;
observer?.observe(more);
let started=false;
function start(){if(started)return;started=true;void load()}
window.addEventListener('dodoDBRefresh',load);
if(window.dodoDB)start();
else window.addEventListener('dodoDBReady',start,{once:true});
<\/script>
</body>
</html>`;
