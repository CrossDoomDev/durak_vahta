const {execFileSync}=require('node:child_process');const path=require('node:path');
execFileSync(process.execPath,[path.join(__dirname,'build.cjs')],{stdio:'inherit'});
execFileSync('python3',['-c',`from pathlib import Path
from zipfile import ZipFile,ZIP_DEFLATED
import json,hashlib
root=Path.cwd()
files=sorted(p for p in (root/'dist').rglob('*') if p.is_file())
manifest=[{'file':str(p.relative_to(root/'dist')),'bytes':p.stat().st_size,'sha256':hashlib.sha256(p.read_bytes()).hexdigest()} for p in files]
(root/'docs/build-manifest.json').write_text(json.dumps(manifest,indent=2))
(root/'releases').mkdir(exist_ok=True)
out=root/'releases/durak-na-vahte-offline.zip'
with ZipFile(out,'w',ZIP_DEFLATED,compresslevel=9) as z:
 for p in files:z.write(p,p.relative_to(root/'dist'))
 z.write(root/'README.md','README.md')
with ZipFile(out) as z:
 assert z.testzip() is None
 assert 'index.html' in z.namelist()
 assert 'sw.js' in z.namelist()
 assert not any('originals/' in n for n in z.namelist())
 print('Verified offline ZIP:',out.stat().st_size,'bytes;',len(z.namelist()),'files')
`],{stdio:'inherit',cwd:path.resolve(__dirname,'..')});
