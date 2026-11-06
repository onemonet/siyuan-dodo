import type { FlomoConfig, FlomoMemo } from "../types";

export const VALIDATE_FLOMO_ACCOUNT_ACTION = "validateAccount";

export interface FlomoAccountValidationApi {
  login(username: string, password: string): Promise<string>;
  getUpdatedMemos(
    latestUpdatedAt: number,
    latestSlug?: string,
    limit?: string,
  ): Promise<FlomoMemo[]>;
}

export interface FlomoAccountValidationResult {
  success: boolean;
  message: string;
}

interface FlomoAccountValidatorDependencies {
  getConfig: () => FlomoConfig;
  saveConfig: (config: Partial<FlomoConfig>) => Promise<void>;
  createApi: (config: FlomoConfig) => FlomoAccountValidationApi;
  refreshServices: () => void;
  getNow?: () => Date;
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

export class FlomoAccountValidator {
  constructor(private readonly dependencies: FlomoAccountValidatorDependencies) {}

  async validate(): Promise<FlomoAccountValidationResult> {
    const config = this.dependencies.getConfig();

    if (hasText(config.username) && hasText(config.password)) {
      return this.validateCredentials(config);
    }

    if (hasText(config.accessToken)) {
      return this.validateAccessToken(config);
    }

    const message = "请先填写用户名和密码";
    await this.saveAuthStatus("error", message);
    return {
      success: false,
      message,
    };
  }

  private async validateCredentials(
    config: FlomoConfig,
  ): Promise<FlomoAccountValidationResult> {
    try {
      const api = this.dependencies.createApi(config);
      const accessToken = await api.login(
        config.username.trim(),
        config.password,
      );
      const message = "Flomo 账号校验成功";

      await this.dependencies.saveConfig({
        accessToken,
        accountAuthStatus: "success",
        accountAuthMessage: message,
        accountAuthCheckedAt: this.getCheckedAt(),
      });
      this.dependencies.refreshServices();

      return {
        success: true,
        message,
      };
    } catch (error) {
      const message = this.getFailureMessage(error);
      await this.saveAuthStatus("error", message);
      throw error;
    }
  }

  private async validateAccessToken(
    config: FlomoConfig,
  ): Promise<FlomoAccountValidationResult> {
    try {
      const api = this.dependencies.createApi({
        ...config,
        accessToken: config.accessToken.trim(),
      });
      await api.getUpdatedMemos(0, "", "1");
      const message = "Flomo 账号校验成功";

      await this.saveAuthStatus("success", message);
      this.dependencies.refreshServices();

      return {
        success: true,
        message,
      };
    } catch (error) {
      const message = this.getFailureMessage(error);
      await this.saveAuthStatus("error", message);
      throw error;
    }
  }

  private async saveAuthStatus(
    status: FlomoConfig["accountAuthStatus"],
    message: string,
  ): Promise<void> {
    await this.dependencies.saveConfig({
      accountAuthStatus: status,
      accountAuthMessage: message,
      accountAuthCheckedAt: this.getCheckedAt(),
    });
  }

  private getCheckedAt(): string {
    return (this.dependencies.getNow?.() ?? new Date()).toISOString();
  }

  private getFailureMessage(error: unknown): string {
    const reason = error instanceof Error ? error.message : String(error);
    return `Flomo 账号校验失败: ${reason}`;
  }
}
