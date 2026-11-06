/**
 * Flomo API 封装
 */
import { Md5 } from "ts-md5";
import { fetchJsonWithTimeout } from "../../request-utils";
import type { FlomoConfig, FlomoMemo, FlomoAPIResponse, FlomoLoginData } from '../types';

const USG = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Safari/537.36 Edg/116.0.1938.76";
const SECRET = 'dbbc3dd73364b4084c3a69346e0ce2b2';
const FLOMO_REQUEST_TIMEOUT_MS = 60_000;

type FlomoSignParamValue = string | number | Array<string | number> | undefined | null;
type FlomoSignParams = Record<string, FlomoSignParamValue>;

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

  /**
   * 登录
   */
  async login(username: string, password: string): Promise<string> {
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const url = "https://flomoapp.com/api/v1/user/login_by_email";
    
    const data = {
      api_key: "flomo_web",
      app_version: "2.0",
      email: username,
      password: password,
      timestamp: timestamp,
      webp: "1",
    };
    data["sign"] = this.createSign(data);
    
    const resData = await fetchJsonWithTimeout<FlomoAPIResponse<FlomoLoginData>>(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': USG
      },
      body: JSON.stringify(data)
    }, {
      timeoutMs: FLOMO_REQUEST_TIMEOUT_MS,
      errorPrefix: "Flomo login",
    });
    
    if (resData.code === -10) {
      throw new Error(`同步失败，请重试：${resData.message}`);
    } else if (resData.code === -1) {
      throw new Error(`用户名或密码错误，请检查后重试`);
    } else if (resData.code !== 0) {
      throw new Error(`服务器错误: ${resData.message}`);
    }
    
    if (!resData.data?.access_token) {
      throw new Error('登录成功但未获取到 access_token');
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
      app_version: "2.0",
      latest_slug: latestSlug,
      latest_updated_at: latestUpdatedAt.toString(),
      limit: limit,
      timestamp: ts,
      tz: "8:0",
      webp: "1"
    };
    params["sign"] = this.createSign(params);
    
    const url = new URL("https://flomoapp.com/api/v1/memo/updated");
    url.search = toSearchParams(params).toString();

    const data = await fetchJsonWithTimeout<FlomoAPIResponse<FlomoMemo[]>>(url.toString(), {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': USG
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
        'User-Agent': USG
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
