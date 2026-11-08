import { Dialog } from "siyuan";
import type { FlomoCaptchaImage, FlomoLoginCaptcha } from "./FlomoAPI";

export interface FlomoCaptchaProvider {
  getLoginCaptcha(): Promise<FlomoCaptchaImage>;
}

/** Flomo's own image challenge, embedded in a native SiYuan dialog.
 * The code and the temporary challenge key are held only in memory. */
export function promptFlomoCaptcha(
  api: FlomoCaptchaProvider,
  reason = "",
): Promise<FlomoLoginCaptcha | null> {
  return new Promise((resolve) => {
    let settled = false;
    let requestId = 0;
    let current: FlomoCaptchaImage | null = null;
    const dialog = new Dialog({
      title: "Flomo 图形验证码",
      width: "420px",
      content: [
        '<div class="b3-dialog__content" style="padding:20px;">',
        '<div class="b3-label__text" style="margin-bottom:12px;">请输入图片中的验证码，完成 Flomo 账号校验。</div>',
        '<div data-flomo-captcha-feedback class="b3-label__text" aria-live="polite" style="margin-bottom:8px;"></div>',
        '<div class="fn__flex" style="gap:12px;align-items:center;">',
        '<img data-flomo-captcha-image alt="Flomo 图形验证码" style="height:64px;max-width:220px;object-fit:contain;" />',
        '<button type="button" data-flomo-captcha-refresh class="b3-button b3-button--outline">换一张</button>',
        '</div>',
        '<input data-flomo-captcha-input class="b3-text-field" style="margin-top:12px;width:100%;"',
        ' placeholder="输入验证码" aria-label="图片验证码" autocomplete="off" spellcheck="false" />',
        '</div>',
        '<div class="b3-dialog__action">',
        '<button type="button" data-flomo-captcha-cancel class="b3-button b3-button--cancel">取消</button>',
        '<div class="fn__space"></div>',
        '<button type="button" data-flomo-captcha-submit class="b3-button b3-button--primary">确定</button>',
        '</div>',
      ].join(""),
      destroyCallback: () => {
        requestId++;
        if (!settled) { settled = true; resolve(null); }
      },
    });
    const root = dialog.element;
    const img = root.querySelector<HTMLImageElement>("[data-flomo-captcha-image]");
    const field = root.querySelector<HTMLInputElement>("[data-flomo-captcha-input]");
    const refreshButton = root.querySelector<HTMLButtonElement>("[data-flomo-captcha-refresh]");
    const submitButton = root.querySelector<HTMLButtonElement>("[data-flomo-captcha-submit]");
    const cancelButton = root.querySelector<HTMLButtonElement>("[data-flomo-captcha-cancel]");
    const feedback = root.querySelector<HTMLElement>("[data-flomo-captcha-feedback]");

    if (!img || !field || !refreshButton || !submitButton || !cancelButton || !feedback) {
      dialog.destroy();
      return;
    }
    const finish = (result: FlomoLoginCaptcha | null): void => {
      if (settled) return;
      settled = true;
      requestId++;
      resolve(result);
      dialog.destroy();
    };
    const load = async (): Promise<void> => {
      const id = ++requestId;
      current = null;
      img.removeAttribute("src");
      field.value = "";
      field.disabled = true;
      submitButton.disabled = true;
      refreshButton.disabled = true;
      feedback.textContent = "正在获取验证码…";
      try {
        const captcha = await api.getLoginCaptcha();
        if (settled || id !== requestId) return;
        // FlomoAPI already verifies the data-image MIME and base64 payload.
        current = captcha;
        img.src = captcha.image;
        feedback.textContent = reason || "";
        field.disabled = false;
        submitButton.disabled = false;
        refreshButton.disabled = false;
        field.focus();
      } catch (error) {
        if (settled || id !== requestId) return;
        feedback.textContent = "获取验证码失败：" +
          (error instanceof Error ? error.message : String(error));
        refreshButton.disabled = false;
      }
    };
    const submit = (): void => {
      if (!current) return;
      const code = field.value.trim();
      if (!code) {
        feedback.textContent = "请输入图片中的验证码";
        field.focus();
        return;
      }
      finish({ codeKey: current.codeKey, code });
    };
    submitButton.addEventListener("click", submit);
    refreshButton.addEventListener("click", () => { void load(); });
    cancelButton.addEventListener("click", () => finish(null));
    field.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); submit(); }
    });
    void load();
  });
}