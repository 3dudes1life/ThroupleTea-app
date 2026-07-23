#!/usr/bin/env python3
from pathlib import Path
import html, json, re, subprocess

ROOT=Path(__file__).resolve().parents[1]
LIVE=ROOT/'live-data'/'content.json'
FALLBACK=ROOT/'www'/'data'/'fallback.json'

def load(p):
    try:return json.loads(p.read_text(encoding='utf-8'))
    except:return {}

def clean(v):
    v=html.unescape(v or '')
    v=re.sub(r'<script[\s\S]*?</script>|<style[\s\S]*?</style>',' ',v,flags=re.I)
    v=re.sub(r'<\s*br\s*/?>','\n',v,flags=re.I)
    v=re.sub(r'</\s*(p|div|li|h[1-6]|section|article)\s*>','\n',v,flags=re.I)
    v=re.sub(r'<[^>]+>',' ',v)
    v=v.replace('\xa0',' ')
    v=re.sub(r'[ \t]+\n','\n',v)
    v=re.sub(r'\n[ \t]+','\n',v)
    v=re.sub(r'[ \t]{2,}',' ',v)
    v=re.sub(r'\n{3,}','\n\n',v)
    return v.strip()

def longest(*vals):
    vals=[str(x or '').strip() for x in vals if str(x or '').strip()]
    return max(vals,key=len,default='')

def fetch(url):
    r=subprocess.run(['curl','-fL','--retry','2','--connect-timeout','15','--max-time','35','-A','Mozilla/5.0 A Little Throuple Tea App',url],capture_output=True,text=True)
    return r.stdout if r.returncode==0 else ''

def meta(doc,key):
    k=re.escape(key)
    for pat in [
        rf'<meta[^>]+(?:property|name)=["\']{k}["\'][^>]+content=["\']([^"\']+)["\']',
        rf'<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']{k}["\']'
    ]:
        m=re.search(pat,doc,re.I)
        if m:return clean(m.group(1))
    return ''

def jsonld(doc):
    vals=[]
    for raw in re.findall(r'<script[^>]+type=["\']application/ld\+json["\'][^>]*>([\s\S]*?)</script>',doc,re.I):
        try:data=json.loads(html.unescape(raw).strip())
        except:continue
        def walk(x):
            if isinstance(x,dict):
                for key in ('description','articleBody'):
                    if isinstance(x.get(key),str): vals.append(clean(x[key]))
                for v in x.values(): walk(v)
            elif isinstance(x,list):
                for v in x: walk(v)
        walk(data)
    return vals

def articles(doc):
    vals=[]
    for pat in [r'<article\b[^>]*>([\s\S]*?)</article>',r'<main\b[^>]*>([\s\S]*?)</main>']:
        for raw in re.findall(pat,doc,re.I):
            t=clean(raw)
            if len(t)>180: vals.append(t)
    return vals

def trim_site(v,title):
    t=v
    i=t.lower().find((title or '').lower())
    if i>=0:t=t[i+len(title):]
    for mark in ('Listen Now','Open on Spotify','All Episodes','Copyright','Privacy Policy'):
        j=t.lower().find(mark.lower())
        if j>180:t=t[:j]
    t=re.sub(r'Home\s*/\s*Episodes[\s\S]{0,120}',' ',t,flags=re.I)
    t=re.sub(r'\bDuration:\s*\d{1,2}:\d{2}:\d{2}\b',' ',t,flags=re.I)
    t=re.sub(r'\b3Dudes1Life Creative\b',' ',t,flags=re.I)
    return clean(t)

cat=load(LIVE) or load(FALLBACK)
eps=cat.get('episodes',[])
fetched=upgraded=rich=0
for ep in eps:
    previous=longest(ep.get('description'),ep.get('summary'))
    url=str(ep.get('webUrl') or '')
    if url.startswith('http'):
        doc=fetch(url)
        if doc:
            fetched+=1
            candidates=jsonld(doc)+[meta(doc,'description'),meta(doc,'og:description'),meta(doc,'twitter:description')]+articles(doc)
            candidates=[trim_site(x,ep.get('title','')) for x in candidates]
            candidates=[x for x in candidates if len(x)>120]
            best=longest(*candidates,previous)
            if len(best)>len(previous)+40:
                ep['description']=best; upgraded+=1
    ep['description']=longest(ep.get('description'),ep.get('summary'))
    if len(ep['description'])>len(ep.get('summary',''))+40: rich+=1
cat['schemaVersion']=max(int(cat.get('schemaVersion') or 0),5)
cat['descriptionSource']='rss-plus-website-pages'
payload=json.dumps(cat,ensure_ascii=False,indent=2)+'\n'
LIVE.write_text(payload,encoding='utf-8')
FALLBACK.write_text(payload,encoding='utf-8')
print(f'🌐 Episode pages fetched: {fetched}')
print(f'✅ Descriptions upgraded: {upgraded}')
print(f'📖 Full descriptions available: {rich}/{len(eps)}')
