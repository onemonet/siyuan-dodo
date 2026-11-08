/**
 * Flomo API 封装
 */
import { Md5 } from "ts-md5";
import { fetchJsonWithTimeout } from "../../request-utils";
import type { FlomoConfig, FlomoMemo, FlomoAPIResponse, FlomoLoginData } from '../types';

const SECRET = 'dbbc3dd73364b4084c3a69346e0ce2b2';
/** flomo's current web protocol version for login and memo reads. */
const FLOMO_APP_VERSION = "4.0";
const FLOMO_REQUEST_TIMEOUT_MS = 60_000;

/** Match the current flomo Web client's signed feature flags.
 * Avoid enabling webp on engines that cannot actually encode it. */
function supportsFlomoWebp(): boolean {
  if (typeof document === "undefined") return false;
  try {
    return document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

type FlomoSignParamValue = string | number | Array<string | number> | undefined | null;
type FlomoSignParams = Record<string, FlomoSignParamValue>;

/** Current login requirements returned by Flomo's public app/config endpoint. */
export interface FlomoLoginRequirements {
  url: string;
  captchaEnabled: boolean;
}

export interface FlomoCaptchaImage {
  image: string;
  codeKey: string;
}

export interface FlomoLoginCaptcha {
  codeKey: string;
  code: string;
}

export class FlomoCaptchaRequiredError extends Error {
  constructor(message = "Flomo 登录需要图形验证码") {
    super(message);
    this.name = "FlomoCaptchaRequiredError";
  }
}
export interface FlomoAPIOptions {
  onAccessTokenRefreshed?: (accessToken: string) => Promise<void> | void;
}

export class FlomoAPI {
  constructor(
    private config: FlomoConfig,
    private readonly options: FlomoAPIOptions = {},
  ) {}

  /**
   * 创建签名
   */
  private createSign(params: FlomoSignParams): string {
    const sortedParams: FlomoSignParams = {};
    Object.keys(params).sort().forEach(key => {
      sortedParams[key] = params[key];
    });

    let paramString = '';
    for (const key in sortedParams) {
      const value = sortedParams[key];
      if (typeof value === 'undefined' || (!value && value !== 0)) continue;

      if (Array.isArray(value)) {
        value.sort((a, b) => {
          return a && b ? a.toString().localeCompare(b.toString()) : 0;
        });
        for (const index in value) {
          paramString += key + '[]=' + value[index] + '&';
        }
      } else {
        paramString += key + '=' + value + '&';
      }
    }
    
    paramString = paramString.substring(0, paramString.length - 1);
    return new Md5().appendStr(paramString + SECRET).end() as string;
  }

  /** Public signed requests are safe without credentials and mirror flomo Web. */
  private async readSignedPublic<T>(path: "app/config" | "app/captcha/", extra: FlomoSignParams = {}): Promise<T> {
    const params: FlomoSignParams = {
      api_key: "flomo_web",
      app_version: FLOMO_APP_VERSION,
      platform: "web",
      ...extra,
      timestamp: Math.floor(Date.now() / 1000),
      supports_video: 1,
      ...(supportsFlomoWebp() ? { webp: "1" } : {}),
    };
    const sign = this.createSign(params);
    const url = new URL("https://flomoapp.com/api/v1/" + path);
    url.search = toSearchParams({ ...params, sign }).toString();
    const response = await fetchJsonWithTimeout<FlomoAPIResponse<T>>(url.toString(), {
      method: "GET",
      headers: { "Accept": "application/json, text/plain, */*" },
    }, {
      timeoutMs: FLOMO_REQUEST_TIMEOUT_MS,
      errorPrefix: "Flomo " + path,
    });
    if (response.code !== 0 || !response.data) {
      const reason = typeof response.message === "string" ? response.message.slice(0, 160) : "";
      throw new Error("Flomo 登录配置读取失败（" + response.code + "）" +
        (reason ? "：" + reason : ""));
    }
    return response.data;
  }

  async getLoginConfiguration(): Promise<FlomoLoginRequirements> {
    const settings = await this.readSignedPublic<{
      web_login_url?: unknown;
      login_captcha_enable?: unknown;
    }>("app/config", { referer: "login" });
    // Refuse server-controlled arbitrary URLs: credentials only go to the
    // verified Flomo origin and its documented login endpoints.
    const path = typeof settings.web_login_url === "string"
      ? settings.web_login_url.trim() : "";
    if (![
      "/api/v1/user/web/login_by_email",
      "/api/v1/user/login_by_email",
    ].includes(path)) {
      throw new Error("Flomo 返回了不支持的网页登录接口，请检查官方网页的登录配置");
    }
    return {
      url: "https://flomoapp.com" + path,
      captchaEnabled: settings.login_captcha_enable === true ||
        settings.login_captcha_enable === 1,
    };
  }

  async getLoginCaptcha(): Promise<FlomoCaptchaImage> {
    const payload = await this.readSignedPublic<{
      image?: unknown;
      code_key?: unknown;
    }>("app/captcha/");
    const image = typeof payload.image === "string" ? payload.image : "";
    const codeKey = typeof payload.code_key === "string" ? payload.code_key.trim() : "";
    if (!/^data:image\/(?:png|jpeg|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(image) ||
        image.length > 1_000_000 || !codeKey) {
      throw new Error("Flomo 返回的验证码图片或校验标识无效");
    }
    return { image, codeKey };
  }

  /**
   * Phone numbers and email addresses both use the field named "email" in
   * Flomo's current web client. Login URL comes from signed app/config.
   */
  async login(
    username: string,
    password: string,
    captcha?: FlomoLoginCaptcha,
    requirements?: FlomoLoginRequirements,
  ): Promise<string> {
    const settings = requirements ?? await this.getLoginConfiguration();
    if (settings.captchaEnabled && (!captcha?.codeKey || !captcha?.code.trim())) {
      throw new FlomoCaptchaRequiredError();
    }
    const data = {
      api_key: "flomo_web",
      app_version: FLOMO_APP_VERSION,
      platform: "web",
      email: username,
      password,
      wechat_union_id: "",
      wechat_oa_open_id: "",
      ...(captcha ? {
        captcha_code_key: captcha.codeKey,
        captcha_code: captcha.code.trim(),
      } : {}),
      timestamp: Math.floor(Date.now() / 1000),
      supports_video: 1,
      ...(supportsFlomoWebp() ? { webp: "1" } : {}),
    };
    const signed = { ...data, sign: this.createSign(data) };
    const resData = await fetchJsonWithTimeout<FlomoAPIResponse<FlomoLoginData>>(settings.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(signed),
    }, {
      timeoutMs: FLOMO_REQUEST_TIMEOUT_MS,
      errorPrefix: "Flomo login",
    });
    const reason = typeof resData.message === "string"
      ? resData.message.trim().slice(0, 160) : "";
    if (resData.code === -40) {
      throw new FlomoCaptchaRequiredError(reason || "验证码不正确或已过期，请刷新后重试");
    }
    if (resData.code === -10) {
      throw new Error("Flomo 登录会话或请求未通过（-10）" +
        (reason ? "：" + reason : ""));
    }
    if (resData.code === -1) {
      throw new Error("Flomo 登录未通过（-1）" +
        (reason ? "：" + reason : "；请检查账号验证及登录接口配置"));
    }
    if (resData.code !== 0) {
      throw new Error("Flomo 登录失败（" + resData.code + "）" +
        (reason ? "：" + reason : ""));
    }
    if (!resData.data?.access_token) {
      throw new Error("登录成功但未获取到 access_token");
    }
    return resData.data.access_token;
  }
  /**
   * 检查授权并重连
   */
  private async checkAuthorizationAndReconnect(resData: FlomoAPIResponse): Promise<boolean> {
    if (resData.code === -10) {
      // 需要重新登录
      if (this.config.username && this.config.password) {
        const newToken = await this.login(this.config.username, this.config.password);
        this.config.accessToken = newToken;
        await this.options.onAccessTokenRefreshed?.(newToken);
        return false; // 需要重试
      }
      throw new Error('授权失败，需要重新登录');
    } else if (resData.code !== 0) {
      throw new Error(`服务器错误: ${resData.message}`);
    }
    return true;
  }

  /**
   * 获取更新的 memos
   */
  async getUpdatedMemos(
    latestUpdatedAt: number,
    latestSlug: string = "",
    limit: string = "200"
  ): Promise<FlomoMemo[]> {
    const ts = Math.floor(Date.now() / 1000).toString();
    
    const params = {
      api_key: "flomo_web",
      app_version: FLOMO_APP_VERSION,
      platform: "web",
      latest_slug: latestSlug,
      latest_updated_at: latestUpdatedAt.toString(),
      limit: limit,
      timestamp: ts,
      tz: "8:0",
      supports_video: 1,
      ...(supportsFlomoWebp() ? { webp: "1" } : {}),
    };
    params["sign"] = this.createSign(params);
    
    const url = new URL("https://flomoapp.com/api/v1/memo/updated");
    url.search = toSearchParams(params).toString();

    const data = await fetchJsonWithTimeout<FlomoAPIResponse<FlomoMemo[]>>(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
    }, {
      timeoutMs: FLOMO_REQUEST_TIMEOUT_MS,
      errorPrefix: "Flomo updated memos",
    });
    
    if (!await this.checkAuthorizationAndReconnect(data)) {
      // 需要重试
      return this.getUpdatedMemos(latestUpdatedAt, latestSlug, limit);
    }

    return data.data || [];
  }

  /**
   * 更新 memo (回写标签)
   */
  async updateMemo(memo: FlomoMemo, additionalTag: string): Promise<void> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const url = `https://flomoapp.com/api/v1/memo/${memo.slug}`;
    
    const addTag1 = `<p>#${additionalTag} `;
    const addTag2 = `<p>#${additionalTag} </p>`;
    const content = memo.content.includes("<p>") ?
      memo.content.replace("<p>", addTag1) :
      addTag2.concat(memo.content);
    
    const fileIds = memo.files.map(file => file.id);
    const createdAt = memo.created_at;
    
    const data = {
      api_key: "flomo_web",
      app_version: "2.0",
      content: content,
      created_at: createdAt,
      file_ids: fileIds,
      local_updated_at: timestamp,
      platform: "web",
      timestamp: timestamp,
      tz: "8:0",
      webp: "1"
    };
    data["sign"] = this.createSign(data);
    
    const resData = await fetchJsonWithTimeout<FlomoAPIResponse>(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(data)
    }, {
      timeoutMs: FLOMO_REQUEST_TIMEOUT_MS,
      errorPrefix: "Flomo update memo",
    });
    await this.checkAuthorizationAndReconnect(resData);
  }
}

function toSearchParams(params: FlomoSignParams): URLSearchParams {
  const searchParams = new URLSearchParams();

  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }

    if (Array.isArray(value)) {
      value.forEach((item) => searchParams.append(key, String(item)));
      return;
    }

    searchParams.set(key, String(value));
  });

  return searchParams;
}
