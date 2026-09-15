// Assemble a release candidate from HEAD plus inventory changes, excluding unrelated visit edits.
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process'),{createHash}=require('node:crypto');
const root=path.resolve(__dirname,'../..'),out=root+'/output/diagnostics/inventory-production-readiness';
const dir=fs.mkdtempSync('/tmp/inventory-release-candidate-');fs.chmodSync(dir,0o700);
execFileSync('git',['archive','HEAD','--output',dir+'/head.tar'],{cwd:root});execFileSync('tar',['-xf',dir+'/head.tar','-C',dir]);fs.unlinkSync(dir+'/head.tar');
const tracked=execFileSync('git',['diff','--name-only','-z','HEAD'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const added=execFileSync('git',['ls-files','--others','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
const scoped=f=>f==='package-lock.json'||f==='frontend/next.config.ts'||f==='frontend/tsconfig.build.json'||f.startsWith('backend/')||(/^frontend\/(src|__tests__)\//.test(f)&&!/\/visits\/|prescription-learning/.test(f));
const paths=[...new Set([...tracked,...added].filter(scoped))];
for(const f of paths){const target=path.join(dir,f);if(fs.existsSync(root+'/'+f)){fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(root+'/'+f,target);}else fs.rmSync(target,{force:true});}
const manifest={createdAt:new Date().toISOString(),base:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),directory:dir,overlaidFiles:paths.map(f=>({file:f,sha256:fs.existsSync(dir+'/'+f)?createHash('sha256').update(fs.readFileSync(dir+'/'+f)).digest('hex'):null})),excludedChanges:[...tracked,...added].filter(f=>!scoped(f))};
fs.writeFileSync(out+'/release-candidate.json',JSON.stringify(manifest,null,2));console.log(JSON.stringify({directory:dir,overlaidFiles:paths.length,base:manifest.base}));
