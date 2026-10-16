const canvas=document.getElementById('mirror'),waiting=document.getElementById('waiting');
if(window.stream.windowControls){
 document.documentElement.classList.add('window-controls');document.getElementById('caption').hidden=false;
 for(const action of ['minimize','maximize','close'])document.getElementById(action).addEventListener('click',()=>window.stream.control(action));
}
const gl=new URLSearchParams(location.search).get('renderer')==='2d'?null:canvas.getContext('webgl',{alpha:false,antialias:false,depth:false,stencil:false,preserveDrawingBuffer:true});
let restarting=false;
const restart=()=>{if(!restarting){restarting=true;window.stream.restart();}};
canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();canvas.hidden=true;waiting.hidden=false;restart();});
canvas.addEventListener('webglcontextrestored',restart);
const stats=window.__streamStats={frames:0,totalDrawMs:0,renderer:gl?'webgl':'2d'};
let program,position,rect,bgra,vertices,textures=[],textureSizes=[],context,buffers=[];
if(gl){
 const shader=(type,source)=>{const result=gl.createShader(type);gl.shaderSource(result,source);gl.compileShader(result);if(!gl.getShaderParameter(result,gl.COMPILE_STATUS))throw Error('Mirror shader failed');return result;};
 program=gl.createProgram();
 gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 position; uniform vec4 rect; varying vec2 uv; void main(){vec2 p=rect.xy+position*rect.zw;gl_Position=vec4(p.x*2.0-1.0,1.0-p.y*2.0,0.0,1.0);uv=position;}'));
 gl.attachShader(program,shader(gl.FRAGMENT_SHADER,'precision mediump float; uniform sampler2D picture; uniform bool bgra; varying vec2 uv; void main(){vec4 color=texture2D(picture,uv);gl_FragColor=bgra?color.bgra:color;}'));
 gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Mirror program failed');
 gl.useProgram(program);position=gl.getAttribLocation(program,'position');rect=gl.getUniformLocation(program,'rect');bgra=gl.getUniformLocation(program,'bgra');
 vertices=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([0,0,1,0,0,1,0,1,1,0,1,1]),gl.STATIC_DRAW);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
}else context=canvas.getContext('2d',{alpha:false});
function drawPicture(picture,index,x,width,height){
 const bytes=picture.pixels;
 if(gl){
  if(!textures[index]){textures[index]=gl.createTexture();gl.bindTexture(gl.TEXTURE_2D,textures[index]);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);}
  gl.bindTexture(gl.TEXTURE_2D,textures[index]);const size=picture.width+'x'+picture.height;
  if(bytes){if(textureSizes[index]!==size){gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,picture.width,picture.height,0,gl.RGBA,gl.UNSIGNED_BYTE,bytes);textureSizes[index]=size;}else gl.texSubImage2D(gl.TEXTURE_2D,0,0,0,picture.width,picture.height,gl.RGBA,gl.UNSIGNED_BYTE,bytes);}
  else{if(textureSizes[index]!==size)throw Error('Mirror key frame missing');for(const patch of picture.patches)gl.texSubImage2D(gl.TEXTURE_2D,0,patch.x,patch.y,patch.width,patch.height,gl.RGBA,gl.UNSIGNED_BYTE,patch.pixels);}
  gl.uniform4f(rect,x/canvas.width,0,width/canvas.width,height/canvas.height);gl.uniform1i(bgra,picture.format==='bgra');gl.drawArrays(gl.TRIANGLES,0,6);
 }else{
  let buffer=buffers[index];if(!buffer||buffer.width!==picture.width||buffer.height!==picture.height){if(!bytes)throw Error('Mirror key frame missing');buffer=document.createElement('canvas');buffer.width=picture.width;buffer.height=picture.height;buffer.image=new ImageData(picture.width,picture.height);buffers[index]=buffer;}
  const rgba=buffer.image.data;
  for(const patch of bytes?[{x:0,y:0,width:picture.width,height:picture.height,pixels:bytes}]:picture.patches)for(let y=0;y<patch.height;y++){
   const row=patch.pixels.subarray(y*patch.width*4,(y+1)*patch.width*4),offset=((patch.y+y)*picture.width+patch.x)*4;
   if(picture.format==='rgba')rgba.set(row,offset);else for(let i=0;i<row.length;i+=4){rgba[offset+i]=row[i+2];rgba[offset+i+1]=row[i+1];rgba[offset+i+2]=row[i];rgba[offset+i+3]=row[i+3];}
  }
  buffer.getContext('2d').putImageData(buffer.image,0,0);context.drawImage(buffer,x,0,width,height);
 }
}
function drawFrame(frame){
 const start=performance.now();
 if(!frame){canvas.hidden=true;waiting.hidden=false;return;}
 try{
  if(gl?.isContextLost())throw Error('Mirror graphics context lost');
  const scaleX=frame.client.width/frame.client.displayWidth,scaleY=frame.client.height/frame.client.displayHeight;
  const hubWidth=frame.hub?Math.round(frame.hub.displayWidth*scaleX):0,hubHeight=frame.hub?Math.round(frame.hub.displayHeight*scaleY):0;
  const width=frame.client.width+hubWidth,height=Math.max(frame.client.height,hubHeight);
  if(canvas.width!==width)canvas.width=width;if(canvas.height!==height)canvas.height=height;
  const color={pro:[20/255,40/255,56/255],light:[240/255,243/255,247/255],dark:[32/255,35/255,41/255]}[frame.theme]||[20/255,40/255,56/255];
  if(gl){
   // A restored Windows surface can lose bindings without a JavaScript error.
   gl.useProgram(program);gl.bindBuffer(gl.ARRAY_BUFFER,vertices);gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
   gl.viewport(0,0,width,height);gl.clearColor(...color,1);gl.clear(gl.COLOR_BUFFER_BIT);
  }else{context.fillStyle='rgb('+color.map(v=>Math.round(v*255)).join(',')+')';context.fillRect(0,0,width,height);}
  drawPicture(frame.client,0,0,frame.client.width,frame.client.height);if(frame.hub)drawPicture(frame.hub,1,frame.client.width,hubWidth,hubHeight);
  if(gl&&gl.getError()!==gl.NO_ERROR)throw Error('Mirror graphics state unavailable');
  document.documentElement.dataset.theme=frame.theme;waiting.hidden=true;canvas.hidden=false;stats.frames++;stats.totalDrawMs+=performance.now()-start;
  return true;
 }catch(error){console.error('Mirror drawing:',error.message);canvas.hidden=true;waiting.hidden=false;restart();return false;}
}
window.addEventListener('message',event=>{
 if(event.source!==window||event.data?.type!=='pro-stream-frame')return;
 const frame=event.data.frame;
 const drawn=drawFrame(frame);if(frame?.sequence)window.postMessage({type:'pro-stream-painted',sequence:frame.sequence,reset:!drawn},'*');
});
window.stream.start();
