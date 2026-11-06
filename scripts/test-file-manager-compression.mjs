import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";

const ts = createRequire(import.meta.url)("typescript");
const source = readFileSync("src/lets-file-manager/image-compression.ts","utf8");
const compiled = ts.transpileModule(source, {
  compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},
  reportDiagnostics:true,
});
assert.equal((compiled.diagnostics??[]).length,0);
const api={};
const fakeService={
  assetKind:(name)=>/\.(jpe?g|png|webp|avif|gif|svg)$/i.test(name)?"image":"other",
  assetRelativePath:(folder,name)=>folder ? folder+"/"+name : name,
  assetUrl:path=>"/assets/"+path,
  formatSize:(num)=>num+" B",
  saveAssetFile:()=>{throw Error("unexpected live upload");},
  getAssetSize:()=>{throw Error("unexpected live stat");},
  relinkAssetReferences:()=>{throw Error("unexpected live relink");},
  findAssetReferences:()=>{throw Error("unexpected live scan");},
  removeUnusedAssetSafely:()=>{throw Error("unexpected live delete");},
};
const oldBytes=new Blob([new Uint8Array(1024)],{type:"image/jpeg"});
let disposed=false, canvasWidth=0,canvasHeight=0,mimeReceived="",qualityReceived=0;
const ctx={
  fillRect(){},drawImage(){},imageSmoothingEnabled:false,imageSmoothingQuality:"",
};
const canvas={
  width:0,height:0,
  getContext(){return ctx;},
  toBlob(cb,mime,quality){
    canvasWidth=this.width;canvasHeight=this.height;
    mimeReceived=mime;qualityReceived=quality;
    cb(new Blob([new Uint8Array(250)],{type:mime}));
  },
};
const sandbox={
  exports:api,Blob,File,Uint8Array,DataView,Date,Math,String,Number,Set,Map,Promise,Error,
  setTimeout:(fn)=>queueMicrotask(fn),
  fetch:async()=>({ok:true,blob:async()=>oldBytes}),
  createImageBitmap:async()=>({width:4000,height:2000,close(){disposed=true;}}),
  document:{createElement(type){assert.equal(type,"canvas");return canvas;}},
  require(name){assert.equal(name,"./file-service");return fakeService;},
};
vm.runInNewContext(compiled.outputText,sandbox,{filename:"image-compression.cjs"});

assert.equal(api.supportsImageCompression("UPPER.JPG"),true);
assert.equal(api.supportsImageCompression("a.PNG"),true);
assert.equal(api.supportsImageCompression("static.AVIF"),true);
assert.equal(api.supportsImageCompression("animated.gif"),false);
assert.equal(api.supportsImageCompression("icon.svg"),false);
assert.equal(api.supportsImageCompression("movie.mp4"),false);
assert.equal(api.compressedFileName("cover.jpeg","webp","safeid23"),"cover-optimized-safeid23.webp");
assert.equal(api.compressedFileName("a.png","jpeg","safeid23"),"a-optimized-safeid23.jpg");
assert.throws(()=>api.compressedFileName("a.png","jpeg","../escape"));
const png=(animated)=>{
  const sig=[137,80,78,71,13,10,26,10];
  const chunk=(name,len)=>[0,0,0,len,...Array.from(name).map(x=>x.charCodeAt(0)),...new Array(len+4).fill(0)];
  return new Uint8Array([...sig,...chunk("IHDR",13),...(animated?chunk("acTL",8):[]),...chunk("IDAT",5)]);
};
api.assertStaticImage("ok.png",png(false));
assert.throws(()=>api.assertStaticImage("animated.png",png(true)),/APNG/);
const webp=(animated)=>{
  const bytes=new Uint8Array(32);bytes.set([...Buffer.from("RIFF")],0);
  bytes.set([...Buffer.from("WEBP")],8);bytes.set([...Buffer.from("VP8X")],12);
  bytes[20]=animated?2:0;return bytes;
};
const avif=(animated)=>{
  const bytes=new Uint8Array(28);const major=animated?"avis":"avif";
  bytes[3]=28;
  bytes.set(Buffer.from("ftyp"),4);
  bytes.set(Buffer.from(major),8);
  bytes.set(Buffer.from("mif1"),16);
  bytes.set(Buffer.from(major),20);
  return bytes;
};
api.assertStaticImage("static.avif",avif(false));
assert.throws(()=>api.assertStaticImage("animated.avif",avif(true)),/AVIF 动图/);
api.assertStaticImage("still.webp",webp(false));
assert.throws(()=>api.assertStaticImage("animated.webp",webp(true)),/动态 WebP/);

const preview=await api.createCompressionPreview("photos/one.jpg","one.jpg",{
  format:"webp",quality:.76,maxEdge:1920,
});
assert.equal(preview.originalSize,1024);
assert.equal(preview.blob.size,250);
assert.equal(preview.width,1920);
assert.equal(preview.height,960);
assert.equal(canvasWidth,1920);
assert.equal(canvasHeight,960);
assert.equal(mimeReceived,"image/webp");
assert.equal(qualityReceived,.76);
assert.equal(disposed,true,"bitmap must always be released");
assert.equal(api.compressionSavings(preview),76);

async function run(mode,{preflightError=false, migrateError=false, remaining=false, skipped=false, blockRef=false, unavailable=false, verificationUnavailable=false, deleteError=false, statMismatch=false, ocrOnly=false, recoverAfter=0, checkError=false}={}){
  const calls=[];
  let lookupCount=0;
  const deps={
    save:async(folder,file,name)=>{calls.push("save");assert.equal(folder,"photos");assert.ok(name.endsWith(".webp"));},
    stat:async()=>{calls.push("stat");return statMismatch ? 17 : preview.blob.size;},
    dryRun:async(oldPath,newPath,dry)=>{
      calls.push(dry?"preflight":"migrate");
      if(dry && preflightError)throw Error("kernel dryrun failed");
      if(!dry && migrateError)throw Error("kernel relink failed");
      return {references:[{relinkable:!blockRef}],skippedNotebooks:skipped?["locked"]:[],
        unavailableAttributeViews:unavailable?[{reason:"locked"}]:[],updated:1,dryRun:dry};
    },
    check:async()=>{
      calls.push("check");
      lookupCount++;
      if(checkError) throw Error("lookup unavailable");
      const hasContent=remaining && (recoverAfter === 0 || lookupCount < recoverAfter);
      return {
        references:[
          ...(hasContent?[{type:"link",path:"doc.sy"}]:[]),
          ...(ocrOnly?[{type:"ocr",path:"assets/ocr-texts.json"}]:[]),
        ],
        skippedNotebooks:[],unavailableAttributeViews:verificationUnavailable?[{reason:"locked"}]:[],
      };
    },
    remove:async()=>{calls.push("remove");if(deleteError)throw Error("kernel cleanup refused");},
  };
  try {
    const result=await api.commitCompression("photos/one.jpg",preview,"webp",mode,()=>{},deps);
    return {calls,result};
  }catch(error){return {calls,error:error.message};}
}
let result=await run("copy");
assert.deepEqual(result.calls,["save","stat"]);
assert.equal(result.result.oldRemoved,false);
assert.equal(result.result.verificationCompleted,true);

result=await run("relink-keep");
assert.deepEqual(result.calls,["save","stat","preflight","migrate","check"]);
assert.equal(result.result.migratedReferences,1);
assert.equal(result.result.verificationCompleted,true);

result=await run("relink-delete");
assert.deepEqual(result.calls,["save","stat","preflight","migrate","check","remove"]);
assert.equal(result.result.oldRemoved,true);

// Exactly the user's case: OCR metadata is NOT a document or database reference.
result=await run("relink-keep",{ocrOnly:true});
assert.equal(result.result.verificationCompleted,true);
assert.equal(result.result.ocrMetadataCount,1);
assert.equal(result.result.verificationWarning,undefined);
assert.deepEqual(result.calls,["save","stat","preflight","migrate","check"]);

result=await run("relink-delete",{ocrOnly:true});
assert.equal(result.result.verificationCompleted,true);
assert.equal(result.result.ocrMetadataCount,1);
assert.equal(result.result.oldRemoved,true,"kernel cleanup remains the final authority");
assert.deepEqual(result.calls,["save","stat","preflight","migrate","check","remove"]);

const rawClassified=api.classifyCompressionReferences({
  references:[{type:"ocr"},{type:"link"},{type:"ocr"}],
  skippedNotebooks:null,
  unavailableAttributeViews:null,
});
assert.equal(rawClassified.ocrMetadataCount,2);
assert.equal(rawClassified.documentReferences,1);
assert.equal(rawClassified.unavailableDatabases,0);
assert.equal(rawClassified.complete,false);

const retryCalls=[];
let recoveredLookupCount=0;
const recovered=await api.verifyCompressionRelink(
  "photos/one.jpg",
  async()=>{
    retryCalls.push("check");
    return ++recoveredLookupCount < 3
      ? {references:[{type:"link"}],skippedNotebooks:[]}
      : {references:[{type:"ocr"}],skippedNotebooks:[]};
  },
  ()=>{},
  async(ms)=>retryCalls.push("wait "+ms),
);
assert.equal(recovered.complete,true);
assert.equal(recovered.attempts,3);
assert.equal(recovered.ocrMetadataCount,1);
assert.deepEqual(retryCalls,["check","wait 350","check","wait 900","check"]);

let retryOnRequestErrorCount=0;
const retryOnRequestError=await api.verifyCompressionRelink(
  "photos/one.jpg",
  async()=>{if(!retryOnRequestErrorCount++)throw Error("temporary");return {references:[]};},
  ()=>{},async()=>{},
);
assert.equal(retryOnRequestError.complete,true,"temporary scan errors must be retried");

for(const options of [
  {preflightError:true},{skipped:true},{blockRef:true},{unavailable:true},
  {migrateError:true},{statMismatch:true},
]){
  result=await run("relink-delete",options);
  assert.ok(result.error,"pre-migration / upload failures remain hard errors");
  assert.ok(!result.calls.includes("remove"),"original must not be deleted on failure");
}
for(const options of [
  {remaining:true},{verificationUnavailable:true},{checkError:true},
]){
  result=await run("relink-delete",options);
  assert.ok(result.result,"post-commit verification warning must return a result");
  assert.equal(result.result.verificationCompleted,false);
  assert.match(result.result.verificationWarning,/原图已保留/);
  assert.equal(result.calls.filter(x=>x==="check").length,3);
  assert.ok(!result.calls.includes("remove"),"delete forbidden after unsuccessful verification");
}
result=await run("relink-keep",{remaining:true});
assert.equal(result.result.verificationCompleted,false);
assert.ok(result.result.verificationWarning);
assert.ok(!result.calls.includes("remove"));

result=await run("relink-delete",{deleteError:true});
assert.deepEqual(result.calls,["save","stat","preflight","migrate","check","remove"]);
assert.equal(result.result.oldRemoved,false);
assert.match(result.result.verificationWarning,/已保留/);
await assert.rejects(
  api.commitCompression("photos/one.jpg",{...preview,blob:oldBytes},"webp","relink-delete"),
  /没有变小/,
);
// Direct image replacement shares the same safe relink/OCR and cleanup pipeline.
// Unlike compression it must accept a larger, completely different image format.
const replaceCalls=[];
const largePNG=new File([new Uint8Array(4096)],"new-photo.png",{type:"image/png"});
const replaceDeps={
  save:async(folder,file,name)=>{
    replaceCalls.push("save"); assert.equal(folder,"photos");
    assert.match(name,/one-replaced-.*\.png/);
    assert.equal(file.size,largePNG.size);
  },
  stat:async()=>{replaceCalls.push("stat");return largePNG.size;},
  dryRun:async(_a,_b,dry)=>{
    replaceCalls.push(dry?"preflight":"migrate");
    return {references:[{type:"ocr",relinkable:true},{type:"link",relinkable:true}],
      skippedNotebooks:[],unavailableAttributeViews:[],updated:2,dryRun:dry};
  },
  check:async()=>{
    replaceCalls.push("check");
    return {references:[{type:"ocr"}],skippedNotebooks:[],unavailableAttributeViews:[]};
  },
  remove:async()=>replaceCalls.push("remove"),
};
const replaced=await api.replaceImageAsset("photos/one.jpg",largePNG,()=>{},replaceDeps);
assert.equal(replaced.oldRemoved,true);
assert.equal(replaced.ocrMetadataCount,1);
assert.equal(replaced.migratedReferences,2);
assert.deepEqual(replaceCalls,["save","stat","preflight","migrate","check","remove"]);
await assert.rejects(
  api.replaceImageAsset("photos/one.jpg",new File([new Uint8Array(3)],"bad.txt"),()=>{},replaceDeps),
  /图片格式/,
);


console.log("PASS: JPEG/WebP/AVIF safety, OCR-only verification, bounded retries, post-commit warnings, kernel-authorized deletion");
