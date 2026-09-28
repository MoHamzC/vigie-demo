// Public, static demonstration. This is not an authentication or security layer.
const nativeFetch = window.fetch.bind(window);
const seedResponse = await nativeFetch(new URL('./demo-data.json', import.meta.url));
if (!seedResponse.ok) throw new Error('Les exemples de démonstration sont indisponibles.');
const seed = await seedResponse.json();
const clone = value => structuredClone(value);
const storageKey = 'vigie-public-demo-v1';
let db = clone(seed), role = 'admin';
try { const saved=JSON.parse(sessionStorage.getItem(storageKey)); if(saved?.db && saved?.role){db=saved.db;role=saved.role;} } catch {}
const roles=seed['/api/admin/roles'].items;
for(const version of db['/api/site/versions'].items)if(!version.config&&version.version===seed['/api/site'].version)version.config=clone(seed['/api/site'].config);
if(!roles.some(r=>r.id===role))role='admin';
const now=()=>new Date().toISOString();
function validateTheme(theme){
 const luminance=hex=>{if(!/^#[a-f0-9]{6}$/i.test(hex||''))throw new Error('Utilisez un code couleur au format #123456.');const c=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2];};
 for(const [a,b] of [[theme.ink,theme.canvas],[theme.muted,theme.canvas],[theme.ink,theme.surface],[theme.muted,theme.surface],['#ffffff',theme.accent],['#ffffff',theme.nav]]){const x=luminance(a),y=luminance(b);if((Math.max(x,y)+.05)/(Math.min(x,y)+.05)<4.5)throw new Error('Le contraste est insuffisant : choisissez un texte plus sombre ou un fond plus clair.');}
}
const save=()=>{try{sessionStorage.setItem(storageKey,JSON.stringify({db,role}));}catch{}};
const user=()=>clone(db['/api/admin/users'].items.find(u=>u.role_id===role));
const perms=()=>roles.find(r=>r.id===role).permissions.filter(p=>!['requests.import','admin.backup','requests.move'].includes(p));
const requireRight=p=>{if(!perms().includes(p))throw new Error('Cette action n’est pas disponible pour le profil de démonstration choisi.');};
const rows=()=>Object.keys(db).filter(k=>/^\/api\/requests\/\d+$/.test(k)).map(k=>db[k].request);
function audit(action,target=''){
  db['/api/admin/logs'].items.unshift({id:Date.now(),created_at:now(),actor_name:user().name,action,target:String(target),result:'success',workspace:'Démo navigateur',details:{simulation:true}});
}
function context(){const c=clone(db['/api/context']);c.actor={...user(),permissions:perms()};c.permissions=perms();c.current_user=c.actor.name;c.site=db['/api/site'];c.csrf_token='public-demo';return c;}
function list(params){
 let items=rows(),view=params.get('view');
 const predicates={active:r=>r.status!=='Clos',closed:r=>r.status==='Clos',waiting:r=>r.status==='En attente',unassigned:r=>r.status!=='Clos'&&!r.assignee,mine:r=>r.status!=='Clos'&&r.assignee_id===user().id,alerts:r=>r.alert_count>0};
 if(predicates[view])items=items.filter(predicates[view]);
 for(const k of ['status','priority','application','category','source','assignee_id'])if(params.get(k))items=items.filter(r=>String(r[k])===params.get(k));
 const q=params.get('q')?.toLocaleLowerCase('fr');if(q)items=items.filter(r=>[r.title,r.reference,r.ritm,r.requester,r.description].join(' ').toLocaleLowerCase('fr').includes(q));
 if(params.get('from'))items=items.filter(r=>r.created_at.slice(0,10)>=params.get('from'));
 if(params.get('to'))items=items.filter(r=>r.created_at.slice(0,10)<=params.get('to'));
 if(params.get('ids')){const ids=params.get('ids').split(',');items=items.filter(r=>ids.includes(String(r.id)));}
 const sort=params.get('sort');items.sort((a,b)=>sort==='priority'?['Urgente','Haute','Normale','Basse'].indexOf(a.priority)-['Urgente','Haute','Normale','Basse'].indexOf(b.priority):sort==='oldest'?a.created_at.localeCompare(b.created_at):(sort==='created_desc'?b.created_at.localeCompare(a.created_at):b.updated_at.localeCompare(a.updated_at)));
 return {items,total:items.length};
}
function stats(){
 const r=rows(), count=fn=>r.filter(fn).length, group=field=>Object.entries(r.reduce((a,x)=>{const k=x[field]||'Non renseigné';a[k]=(a[k]||0)+1;return a;},{})).map(([label,value])=>({label,value})).sort((a,b)=>b.value-a.value);
 return {total:r.length,active:count(x=>x.status!=='Clos'),closed:count(x=>x.status==='Clos'),waiting:count(x=>x.status==='En attente'),mine:count(x=>x.status!=='Clos'&&x.assignee_id===user().id),unassigned:count(x=>x.status!=='Clos'&&!x.assignee),alerts:count(x=>x.alert_count>0),unresolved:0,message_count:r.reduce((n,x)=>n+x.message_count,0),reply_count:r.reduce((n,x)=>n+x.reply_count,0),by_status:group('status'),by_priority:group('priority'),by_application:group('application'),by_assignee:group('assignee'),by_source:group('source'),recent_activity:[]};
}
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
function csv(items){const keys=['reference','title','status','priority','application','assignee','requester'];const cell=v=>'"'+String(v??'').replace(/^[=+@\-\t\r]/,"'$&").replaceAll('"','""')+'"';return '\uFEFF'+[keys,...items.map(r=>keys.map(k=>r[k]))].map(row=>row.map(cell).join(';')).join('\r\n');}
window.fetch=async(input,options={})=>{
 const url=new URL(typeof input==='string'?input:input.url,location.href),path=url.pathname;
 if(!path.startsWith('/api/'))return nativeFetch(input,options);
 try{
  const method=options.method||'GET',body=options.body?JSON.parse(options.body):{},p=url.searchParams;
  if(path==='/api/auth/state')return json({authenticated:true,setup_required:false,user:user(),csrf_token:'public-demo'});
  if(path==='/api/auth/logout')return json({ok:true});
  if(path==='/api/context')return json(context());
  if(path==='/api/stats')return json(stats());
  if(path==='/api/requests'&&method==='GET')return json(list(p));
  if(path==='/api/requests'&&method==='POST'){
   requireRight('requests.create');if(!body.title?.trim())throw new Error('L’intitulé est obligatoire.');
   const id=Math.max(...rows().map(r=>r.id))+1,date=now();
   const request={...Object.fromEntries(['description','requester','requester_email','application','category','environment','ritm','assignee','assignee_id'].map(k=>[k,''])),...body,id,reference:`VIG-DEMO-${String(id).padStart(4,'0')}`,title:body.title.trim(),status:body.status||'Ouvert',priority:body.priority||'Normale',source:'Manuelle',channel:body.channel||'Saisie manuelle',created_at:date,updated_at:date,closed_at:null,version:1,created_by:user().id,team_id:'general',message_count:0,reply_count:0,alert_count:0,attachment_count:0,custom_fields:body.custom_fields||{}};
   if(request.assignee_id)request.assignee=context().users.find(u=>u.id===request.assignee_id)?.name||'';
   db[`/api/requests/${id}`]={request,messages:[],comments:[],history:[{action:'created',actor:user().name,created_at:date}],alerts:[]};audit('requests.create',id);save();return json(db[`/api/requests/${id}`]);
  }
  const match=path.match(/^\/api\/requests\/(\d+)(.*)$/);
  if(match){
   const d=db[`/api/requests/${match[1]}`];if(!d)return json({error:'Demande introuvable.'},404);
   if(method==='GET')return json(d);
   if(match[2]==='/comments'){requireRight('requests.comment');if(!body.body?.trim())throw new Error('Saisissez un commentaire.');d.comments.push({id:Date.now(),body:body.body,author:user().name,created_at:now()});audit('requests.comment',match[1]);}
   else if(match[2]==='/alerts/review'){requireRight('requests.update');d.alerts.forEach(a=>a.reviewed_at=now());d.request.alert_count=0;if(body.reopen)d.request.status='En cours';audit('requests.alert.review',match[1]);}
   else if(method==='PATCH'){requireRight('requests.update');const changes={};for(const [k,v] of Object.entries(body)){if(['id','reference','version','created_at'].includes(k))continue;if(d.request[k]!==v)changes[k]={before:d.request[k],after:v};d.request[k]=v;}if('assignee_id'in body)d.request.assignee=context().users.find(u=>u.id===body.assignee_id)?.name||'';d.request.closed_at=d.request.status==='Clos'?now():null;d.history.push({action:'updated',actor:user().name,created_at:now(),changes});audit('requests.update',match[1]);}
   else throw new Error('Cette action nécessite la version complète de Vigie.');
   d.request.updated_at=now();d.request.version++;save();return json(d);
  }
  if(path==='/api/export'){requireRight('requests.export');return new Response(csv(list(p).items),{headers:{'Content-Type':'text/csv;charset=utf-8','Content-Disposition':'attachment; filename="vigie-demo.csv"'}});}
  if(path==='/api/reporting/requests'){requireRight('requests.export');return json({items:rows()});}
  if(path==='/api/admin/logs'||path==='/api/admin/logs/export'){
   requireRight('admin.logs');let items=db['/api/admin/logs'].items.filter(x=>(!p.get('q')||JSON.stringify(x).toLowerCase().includes(p.get('q').toLowerCase()))&&(!p.get('result')||x.result===p.get('result'))&&(!p.get('from')||x.created_at.slice(0,10)>=p.get('from'))&&(!p.get('to')||x.created_at.slice(0,10)<=p.get('to')));
   if(path.endsWith('/export'))return new Response('\uFEFFDate;Auteur;Action;Ressource\r\n'+items.map(x=>[x.created_at,x.actor_name,x.action,x.target].map(v=>'"'+String(v).replaceAll('"','""')+'"').join(';')).join('\r\n'),{headers:{'Content-Type':'text/csv;charset=utf-8'}});
   const page=Number(p.get('page'))||1;return json({items:items.slice((page-1)*50,page*50),total:items.length,page,page_size:50});
  }
  if(path.startsWith('/api/admin/')){requireRight('admin.users');if(method!=='GET')throw new Error('Les comptes et leurs mots de passe sont désactivés dans cette démonstration publique.');if(db[path])return json(db[path]);}
  if(path==='/api/site/draft'&&method==='PATCH'){requireRight('site.edit');validateTheme(body.config.theme);db[path]={...db[path],config:body.config,version:db[path].version+1,updated_at:now(),actor_name:user().name};audit('site.draft');save();return json(db[path]);}
  if(path==='/api/site/publish'){requireRight('site.publish');const draft=db['/api/site/draft'];db['/api/site']={...clone(draft),version:db['/api/site'].version+1,published_at:now(),actor_name:user().name};db['/api/site/versions'].items.unshift(clone(db['/api/site']));audit('site.publish');save();return json(db['/api/site']);}
  if(path==='/api/site/restore'){requireRight('site.edit');const version=db['/api/site/versions'].items.find(v=>v.version===body.version);if(!version?.config)throw new Error('Cette version ne peut pas être restaurée dans la démo.');db['/api/site/draft']={...clone(version),version:db['/api/site/draft'].version+1};save();return json(db['/api/site/draft']);}
  if(path.startsWith('/api/site/pages/')){const page=db['/api/site'].config.pages.find(x=>x.slug===decodeURIComponent(path.split('/').pop()));return json({page});}
  if(path.startsWith('/api/site')&&db[path])return json(db[path]);
  if(path.startsWith('/api/attachments/'))return new Response('DONNÉES FICTIVES\nExemple de reproduction de la demande de démonstration.',{headers:{'Content-Type':'text/plain;charset=utf-8'}});
  throw new Error('Cette fonction nécessite la version complète. La démonstration publique ne traite aucune donnée d’entreprise.');
 }catch(error){return json({error:error.message},400);}
};
const bar=document.createElement('aside');bar.id='demo-bar';bar.setAttribute('aria-label','Démonstration publique');
bar.innerHTML='<div><strong>VIGIE · DÉMO PUBLIQUE</strong><span>Données fictives · essais dans cet onglet uniquement</span></div><label>Tester le rôle <select id="demo-role"><option value="admin">Administrateur</option><option value="manager">Gestionnaire</option><option value="contributor">Contributeur</option><option value="reader">Lecteur</option></select></label><button id="demo-help">À savoir</button><button id="demo-reset">Réinitialiser</button>';
document.body.prepend(bar);document.querySelector('#demo-role').value=role;
document.querySelector('#demo-role').onchange=e=>{role=e.target.value;save();location.reload();};
document.querySelector('#demo-reset').onclick=()=>{if(confirm('Effacer vos essais dans cette démo et retrouver les exemples initiaux ?')){sessionStorage.removeItem(storageKey);location.reload();}};
document.querySelector('#demo-help').onclick=()=>alert('Démonstration publique de Vigie\n\nVous pouvez rechercher, ouvrir, créer, modifier et commenter les demandes selon le profil choisi. Le concepteur permet des essais propres à cet onglet.\n\nLes comptes, rôles et droits sont simulés : ils ne protègent aucune donnée. Les écrans d’administration sont consultables, mais la gestion des comptes est désactivée. Le journal retrace seulement vos essais dans cet onglet.\n\nAucun service Outlook, SSO ou SAP n’est connecté. N’utilisez que des données fictives. « Réinitialiser » efface vos essais.');
document.addEventListener('click',event=>{const target=event.target.closest('[data-v2-action="logout"]');if(target){event.preventDefault();event.stopImmediatePropagation();document.querySelector('#demo-role').focus();}},true);
// Disable administrative credential entry: this public mock never needs a password.
const updateUI=()=>{
 document.querySelectorAll('#workspace-select').forEach(el=>{el.value='demo';el.disabled=true;el.title='Cette version contient uniquement la démonstration';});
 document.querySelectorAll('[data-admin-action="new-user"],[data-admin-action="new-role"],[data-admin-action="new-team"],[data-admin-edit-user],[data-admin-edit-role],[data-admin-edit-team],[data-admin-revoke]').forEach(el=>{el.disabled=true;el.title='Consultation uniquement dans la démonstration publique';});
 const admin=document.querySelector('#admin-content');if(admin&&!document.querySelector('#demo-admin-note')){const note=document.createElement('p');note.id='demo-admin-note';note.className='demo-note';note.textContent='Simulation : comptes fictifs en consultation. Le journal contient uniquement les actions de cet onglet.';admin.before(note);}
 const settings=document.querySelector('.settings-grid');if(settings&&!settings.dataset.demo){settings.dataset.demo='true';settings.innerHTML='<section class="settings-card"><h3>Démonstration publique</h3><p>Exemples fictifs conservés dans cet onglet. Les rôles sont simulés et ne constituent pas une protection des données. La version complète dispose de comptes et de contrôles côté serveur.</p></section><section class="settings-card"><h3>Pour présenter Vigie</h3><p>Montrez une fiche, créez une demande fictive, ajoutez un commentaire, puis comparez les rôles avec le sélecteur en haut. Terminez par Pilotage et le concepteur.</p></section><section class="settings-card"><h3>Services d’entreprise</h3><p>Outlook, SAP et le SSO ne sont pas connectés. La mise en service réelle nécessite un hébergement et une validation IT.</p></section>';}
};
new MutationObserver(updateUI).observe(document.querySelector('#app'),{childList:true,subtree:true});
audit('demo.open');save();
await import('./app.js');
