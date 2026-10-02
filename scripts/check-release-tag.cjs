const version=require('../package.json').version,tag=process.env.RELEASE_TAG;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('Expected a stable app version in package.json');
if(tag&&tag!=='v'+version)throw new Error(`Release tag ${tag} must match v${version} in package.json`);
console.log('Building Pokémon Showdown Pro v'+version);
