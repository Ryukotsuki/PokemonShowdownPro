const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const directory=path.resolve(__dirname,'../dist');
const files=fs.readdirSync(directory).filter(name=>/\.(exe|zip|dmg|AppImage|tar\.gz)$/.test(name));
if(!files.length)throw new Error('No app packages were produced');
(async()=>{for(const name of files){const hash=crypto.createHash('sha256');for await(const chunk of fs.createReadStream(path.join(directory,name)))hash.update(chunk);fs.writeFileSync(path.join(directory,name+'.sha256'),hash.digest('hex')+'  '+name+'\n');}})().catch(error=>{console.error(error);process.exitCode=1;});
