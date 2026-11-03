import {createAppServer} from '../dev-server.mjs';

const server=createAppServer();
let stopping=false;
function stop(){
 if(stopping)return;
 stopping=true;
 server.close(()=>process.exit(process.exitCode??0));
 server.closeAllConnections();
}
server.on('error',error=>{
 console.error('RUNQ local server failed: '+String(error.code??'SERVER_ERROR'));
 process.exitCode=1;stop();
});
process.stdin.setEncoding('utf8');
process.stdin.on('data',text=>{if(text.trim()==='exit')stop();});
process.stdin.on('end',stop);
process.on('SIGINT',stop);
process.on('SIGTERM',stop);
server.listen(0,'127.0.0.1',()=>{
 console.log('RUNQ_READY http://127.0.0.1:'+server.address().port);
});
