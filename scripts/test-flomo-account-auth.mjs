import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const ui = readFileSync("src/lets-flomo-sync/pluginSettingsAccount.ts", "utf8");
const source = readFileSync("src/lets-flomo-sync/services/FlomoAPI.ts", "utf8");
for(const required of [
  'title: "账号"', 'description: "Flomo 手机号/邮箱"',
  'description: "Flomo 密码"', 'placeholder: "手机号或邮箱"',
  'key: "username"', 'key: "password"'
]) assert(ui.includes(required), "Account setting mismatch: "+required);
assert(!ui.includes('title: "用户名"') && !ui.includes("Flomo 账号用户名（邮箱）"));
assert(source.includes('const FLOMO_APP_VERSION = "4.0"'));
assert(!source.includes("用户名或密码错误，请检查后重试"));
assert(!source.includes("Edg/116") && !source.includes("'User-Agent': USG"));

async function importTestModule(path) {
  const bundled = await build({
    entryPoints:[path],write:false,bundle:true,format:"esm",platform:"node",logLevel:"silent"
  });
  return import("data:text/javascript;base64,"+Buffer.from(bundled.outputFiles[0].contents).toString("base64"));
}
const {FlomoAPI} = await importTestModule("src/lets-flomo-sync/services/FlomoAPI.ts");
const fake = {username:"example@example.invalid",password:"synthetic-only",accessToken:""};
let response = {code:0,data:{access_token:"synthetic-token"}};
const calls=[];
const loginConfig = {
  web_login_url:"/api/v1/user/web/login_by_email",
  login_captcha_enable:false,
};
let captchaData = {
  image:"data:image/png;base64," + Buffer.from("synthetic-image-data").toString("base64"),
  code_key:"synthetic-code-key",
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options={})=>{
  const path=new URL(String(url)).pathname;
  calls.push({url:String(url),options});
  const payload=path==="/api/v1/app/config"
    ? {code:0,data:loginConfig}
    : path==="/api/v1/app/captcha/"
      ? {code:0,data:captchaData}
      : response;
  return new Response(JSON.stringify(payload),{status:200,headers:{"content-type":"application/json"}});
};
try{
  const api=new FlomoAPI({...fake});
  assert.equal(await api.login(fake.username,fake.password),"synthetic-token");
  const login=calls.at(-1);
  assert(login.url.endsWith("/api/v1/user/web/login_by_email"),
    "Use endpoint from signed public Flomo config, not obsolete hardcoded login");
  const publicConfigCall=calls.find(call=>new URL(call.url).pathname==="/api/v1/app/config");
  assert(publicConfigCall,"Login must request signed public configuration first");
  const publicConfigQuery=new URL(publicConfigCall.url).searchParams;
  assert.equal(publicConfigQuery.get("referer"),"login");
  assert.equal(publicConfigQuery.get("app_version"),"4.0");
  assert.match(publicConfigQuery.get("sign"),/^[0-9a-f]{32}$/);
  const body=JSON.parse(login.options.body);
  assert.equal(body.email,fake.username);
  assert.equal(body.app_version,"4.0");
  assert.equal(body.platform,"web");
  assert.equal(body.supports_video,1,"Current web client sends supports_video with signed requests");
  assert.equal(body.webp,undefined,"Non-browser test environment must not claim WebP support");
  assert.match(body.sign,/^[0-9a-f]{32}$/);
  // Official Flomo Web's login_by_email endpoint also submits phone numbers
  // under the legacy field named "email"; do not invent a phone-only API.
  await api.login("13800000000",fake.password);
  assert.equal(JSON.parse(calls.at(-1).options.body).email,"13800000000");
  assert(!Object.keys(login.options.headers).some(key=>key.toLowerCase()==="user-agent"));

  response={code:0,data:[]};
  const updatedApi=new FlomoAPI({...fake,accessToken:"synthetic-token"});
  assert.deepEqual(await updatedApi.getUpdatedMemos(0,"","1"),[]);
  const params=new URL(calls.at(-1).url).searchParams;
  assert.equal(params.get("app_version"),"4.0");
  assert.equal(params.get("supports_video"),"1");
  assert.match(params.get("sign"),/^[0-9a-f]{32}$/);

  const savedDoc = globalThis.document;
  globalThis.document = {createElement:()=>({toDataURL:()=>"data:image/webp;base64,dummy"})};
  try{
    response={code:0,data:{access_token:"synthetic-token"}};
    await api.login(fake.username,fake.password);
    const webBody = JSON.parse(calls.at(-1).options.body);
    assert.equal(webBody.webp,"1","Browser-supported WebP must be included in signed params");
    response={code:0,data:[]};
    await updatedApi.getUpdatedMemos(0,"","1");
    assert.equal(new URL(calls.at(-1).url).searchParams.get("webp"),"1");
  } finally {
    if(savedDoc===undefined) delete globalThis.document;
    else globalThis.document=savedDoc;
  }

  response={code:-1,message:"需要额外验证"};
  await assert.rejects(api.login(fake.username,fake.password),/需要额外验证/);
  response={code:-1};
  await assert.rejects(api.login(fake.username,fake.password),/请检查账号验证及登录接口配置/);
  response={code:-10,message:"请重新授权"};
  await assert.rejects(api.login(fake.username,fake.password),/请重新授权/);
  response={code:125,message:"服务器限制访问"};
  await assert.rejects(api.login(fake.username,fake.password),/登录失败（125）：服务器限制访问/);
  response={code:0,data:{}};
  await assert.rejects(api.login(fake.username,fake.password),/未获取到 access_token/);

  const requirements = await api.getLoginConfiguration();
  assert.equal(requirements.url, "https://flomoapp.com/api/v1/user/web/login_by_email");
  assert.equal(requirements.captchaEnabled,false);

  // Public config is server-controlled but credentials must NEVER be sent
  // to an unrecognized URL, even when that URL came from flomoapp.com.
  loginConfig.web_login_url="https://attacker.invalid/collect";
  await assert.rejects(api.login(fake.username,fake.password),/不支持的网页登录接口/);
  loginConfig.web_login_url="/api/v1/user/web/login_by_email";

  loginConfig.login_captcha_enable=true;
  const requiresCaptcha=await api.getLoginConfiguration();
  assert.equal(requiresCaptcha.captchaEnabled,true);
  const beforeNoCaptcha=calls.length;
  await assert.rejects(api.login(fake.username,fake.password),err=>
    err.name==="FlomoCaptchaRequiredError");
  assert.equal(calls.slice(beforeNoCaptcha).filter(c=>
    new URL(c.url).pathname==="/api/v1/user/web/login_by_email").length,0,
    "Do not send credentials when the official config requires a human captcha");

  const challenge=await api.getLoginCaptcha();
  assert.equal(challenge.codeKey,"synthetic-code-key");
  assert(challenge.image.startsWith("data:image/png;base64,"));
  const invalidCaptcha=captchaData;
  captchaData={...captchaData,image:"data:text/html;base64,PHNjcmlwdD4="};
  await assert.rejects(api.getLoginCaptcha(),/验证码图片或校验标识无效/);
  captchaData=invalidCaptcha;

  response={code:0,data:{access_token:"synthetic-token"}};
  assert.equal(await api.login(fake.username,fake.password,
    {codeKey:challenge.codeKey,code:"1234"},requiresCaptcha),"synthetic-token");
  const verifiedBody=JSON.parse(calls.at(-1).options.body);
  assert.equal(verifiedBody.captcha_code_key,challenge.codeKey);
  assert.equal(verifiedBody.captcha_code,"1234");
  assert.match(verifiedBody.sign,/^[0-9a-f]{32}$/);

  response={code:-40,message:"验证码不正确"};
  await assert.rejects(api.login(fake.username,fake.password,
    {codeKey:challenge.codeKey,code:"1234"},requiresCaptcha),err=>
      err.name==="FlomoCaptchaRequiredError" &&
      err.message.includes("验证码不正确"));
  loginConfig.login_captcha_enable=false;
  response={code:0,data:{access_token:"synthetic-token"}};
  const {FlomoAccountValidator}=await importTestModule(
    "src/lets-flomo-sync/services/FlomoAccountValidator.ts");
  const saved=[];
  const validator=new FlomoAccountValidator({
    getConfig:()=>({...fake}),
    saveConfig:async payload=>{saved.push(payload)},
    createApi:()=>({
      getLoginConfiguration:async()=>({url:"https://flomoapp.com/api/v1/user/web/login_by_email",captchaEnabled:false}),
      login:async()=>{throw new Error("登录未通过（-1）：需要额外验证")}
    }),
    refreshServices:()=>{throw new Error("Should not refresh failed login")},
  });
  await assert.rejects(validator.validate(),/需要额外验证/);
  assert.equal(saved.at(-1).accountAuthStatus,"error");
  assert.match(saved.at(-1).accountAuthMessage,/需要额外验证/);

  let promptCount=0;
  const successfulValidator=new FlomoAccountValidator({
    getConfig:()=>({...fake}),
    saveConfig:async payload=>{saved.push(payload)},
    createApi:()=>({
      getLoginConfiguration:async()=>requiresCaptcha,
      login:async (_username,_password,captcha)=>{
        assert.equal(captcha.code,"4321");
        return "synthetic-token";
      },
    }),
    requestCaptcha:async()=>{promptCount++;return {codeKey:"new-code-key",code:"4321"}},
    refreshServices:()=>{},
  });
  assert.equal((await successfulValidator.validate()).success,true);
  assert.equal(saved.at(-1).accountAuthStatus,"success");
  assert.equal(promptCount,1);

  const cancelledValidator=new FlomoAccountValidator({
    getConfig:()=>({...fake}),
    saveConfig:async()=>{throw new Error("Cancel should not change authentication state")},
    createApi:()=>({
      getLoginConfiguration:async()=>requiresCaptcha,
      login:async()=>{throw new Error("Cancel should not make a login request")},
    }),
    requestCaptcha:async()=>null,
    refreshServices:()=>{},
  });
  assert.equal((await cancelledValidator.validate()).message,"已取消 Flomo 账号校验");

  let retries=0;
  const retryValidator=new FlomoAccountValidator({
    getConfig:()=>({...fake}),
    saveConfig:async payload=>{saved.push(payload)},
    createApi:()=>({
      getLoginConfiguration:async()=>requiresCaptcha,
      login:async()=>{
        if(retries++===0){const e=new Error("请刷新验证码重试");e.name="FlomoCaptchaRequiredError";throw e;}
        return "synthetic-token";
      },
    }),
    requestCaptcha:async()=>({codeKey:"another-key",code:"different-code"}),
    refreshServices:()=>{},
  });
  assert.equal((await retryValidator.validate()).success,true);
  assert.equal(retries,2);
}finally{
  globalThis.fetch=originalFetch;
}
console.log("PASS: Flomo dynamic signed login endpoint, human captcha validation, retries, cancellation, and account settings");