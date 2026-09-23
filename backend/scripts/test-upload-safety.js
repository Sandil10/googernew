const {test} = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const fs = require('node:fs/promises');
const upload = require('../src/config/upload');
const {withUploadBuffer} = require('../src/modules/media/uploadBuffer');
const {invoke} = require('../src/modules/chat/chatSnapshot');

test('uploads retain contents and names, spool to disk, and clean after response', async()=>{
    const app=express(); let paths=[];
    app.post('/upload', upload.array('images',5), async(req,res,next)=>{
        try {
            assert.equal(req.files.length,2);
            const contents=[];
            for(const file of req.files){
                paths.push(file.path);assert.equal(file.buffer,undefined);
                contents.push(await withUploadBuffer(file, buffered=>buffered.buffer.toString()));
            }
            res.json({contents,names:req.files.map(f=>f.originalname)});
        } catch(e){next(e);}
    });
    const server=app.listen(0,'127.0.0.1'); await new Promise(r=>server.once('listening',r));
    try {
        const form=new FormData();form.append('images',new Blob(['first'],{type:'image/png'}),'one.png');form.append('images',new Blob(['second'],{type:'image/jpeg'}),'two.jpg');
        const response=await fetch(`http://127.0.0.1:${server.address().port}/upload`,{method:'POST',body:form});
        assert.equal(response.status,200);assert.deepEqual(await response.json(),{contents:['first','second'],names:['one.png','two.jpg']});
        for(let i=0;i<30;i++){
            if((await Promise.all(paths.map(p=>fs.stat(p).then(()=>true,()=>false)))).every(x=>!x))break;
            await new Promise(r=>setTimeout(r,10));
        }
        for(const p of paths) await assert.rejects(fs.stat(p),e=>e.code==='ENOENT');
    }finally{server.closeAllConnections();await new Promise(r=>server.close(r));}
});

test('processing concurrency is bounded even with many uploads',async()=>{
    let running=0,max=0;
    await Promise.all(Array.from({length:12},()=>withUploadBuffer({buffer:Buffer.from('image')},async()=>{
        max=Math.max(max,++running);await new Promise(r=>setTimeout(r,10));running--;
    })));
    assert.equal(max,2);
});

test('snapshot preserves handler authentication, query and error status',async()=>{
    const req={user:{id:7},query:{limit:'20'},headers:{authorization:'test'}};
    const result=await invoke(async(child,res)=>{
        assert.equal(child.user.id,7);assert.equal(child.headers.authorization,'test');assert.equal(child.params.participantId,'8');assert.equal(child.query.limit,'20');
        return res.status(403).json({message:'Blocked'});
    },req,{participantId:'8'});
    assert.deepEqual(result,{status:403,body:{message:'Blocked'}});assert.equal(req.params,undefined);
});
