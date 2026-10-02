// Test sessions keep the real client and its connection, but exclude its
// advertising bootstrap and trackers. These are unrelated to compatibility.
function isolateAuditNetwork(session) {
  session.webRequest.onBeforeRequest({urls:[
    '*://*.vntsm.com/*',
    '*://*.rlcdn.com/*',
    '*://*.tracookiepixel.xyz/*',
    '*://*.indexww.com/*',
  ]},(_details,callback)=>callback({cancel:true}));
}

async function loadAuditClient(contents,url,{timeout=45000,attempts=2}={}) {
  for(let attempt=1;attempt<=attempts;attempt++) {
    console.log(`Loading audit client (${attempt}/${attempts}): ${url}`);
    let timer,navigation;
    try {
      navigation=contents.loadURL(url);
      await Promise.race([
        navigation,
        new Promise((_,reject)=>{timer=setTimeout(()=>{
          reject(new Error(`Client navigation timed out after ${timeout}ms: ${url}`));
          contents.stop();
        },timeout);}),
      ]);
      console.log('Audit client navigation complete: '+url);
      return;
    } catch(error) {
      console.error(`Audit client navigation failed (${attempt}/${attempts}): ${error.message}`);
      // Let stop() finish the previous navigation before attaching the next
      // loadURL listeners, so its delayed ERR_ABORTED cannot reject the retry.
      if(navigation)await Promise.race([navigation.catch(()=>{}),new Promise(resolve=>setTimeout(resolve,250))]);
      if(attempt===attempts)throw error;
    } finally {clearTimeout(timer);}
  }
}

module.exports={isolateAuditNetwork,loadAuditClient};
