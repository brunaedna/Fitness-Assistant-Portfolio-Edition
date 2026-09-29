import { expect, test } from "@playwright/test";

test("configura o perfil e recebe uma orientação personalizada", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /Português/ }).click();

  await page.getByRole("button", { name: "Usar somente nesta sessão" }).click();
  await page.getByRole("button", { name: "Não permitir" }).click();
  await page.getByRole("button", { name: "Continuar somente offline" }).click();

  const input = page.locator("#messageInput");
  const botMessages = page.locator(".message.bot");
  const initialBotMessages = await botMessages.count();
  await input.fill("Meu nome é Ana, tenho 25 anos, peso 65 kg, sou iniciante e quero emagrecer.");
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.locator(".message.user").last()).toContainText("Meu nome é Ana");
  await expect(page.locator("#typingIndicator")).toBeVisible();
  await expect(page.locator("#typingIndicator")).toBeHidden({ timeout: 10_000 });
  await expect(botMessages).toHaveCount(initialBotMessages + 1, { timeout: 10_000 });

  const storedProfile = await page.evaluate(() => {
    for (const storage of [sessionStorage, localStorage]) {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (!key?.startsWith("fitness-assistant-fitness-profile-v3:")) continue;
        return JSON.parse(storage.getItem(key) || "{}");
      }
    }
    return null;
  });
  if (!storedProfile) {
    const storageKeys = await page.evaluate(() => ({
      local: Object.keys(localStorage),
      session: Object.keys(sessionStorage),
    }));
    throw new Error(`Perfil não persistido: ${JSON.stringify(storageKeys)}`);
  }
  expect(storedProfile).toMatchObject({ name: "Ana", age: 25, weightKg: 65, experience: "beginner", goal: "loss" });

  await input.fill("Monte um treino de 30 minutos para começar.");
  const messagesBeforeWorkout = await botMessages.count();
  await page.getByRole("button", { name: "Enviar" }).click();
  await expect(page.locator("#typingIndicator")).toBeVisible();
  await expect(page.locator("#typingIndicator")).toBeHidden({ timeout: 10_000 });
  await expect(botMessages).toHaveCount(messagesBeforeWorkout + 1, { timeout: 10_000 });
  await expect(botMessages.last()).toContainText(/30|minutos|treino/i);

  await page.locator("#closeChat").click();
  await expect(page.locator("#closedState")).toBeVisible();
  await expect(page.locator("#reopenChat")).toBeVisible();
  await expect.poll(() => page.locator(".fitness-robot").evaluate(image => image.complete && image.naturalWidth > 0)).toBe(true);
});
