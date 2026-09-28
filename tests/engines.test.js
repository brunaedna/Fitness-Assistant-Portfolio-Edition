import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {};
await import("../nutrition-engine.js");
await import("../periodization-engine.js");
await import("../safety-engine.js");
await import("../message-renderer.js");
await import("../profile-manager.js");

const nutrition = window.FitnessNutritionEngine;
const periodization = window.FitnessPeriodizationEngine;
const safety = window.FitnessSafetyEngine;
const messageRenderer = window.FitnessMessageRenderer;
const profileManager = window.FitnessProfileManager;

test("remove dados de perfil fora das faixas permitidas", () => {
  const profile = profileManager.sanitizeProfile({
    name: "  Maria  ", age: 12, weightKg: 65, trainingDays: 9,
    allergies: ["milk", "invalid", "milk"],
  });
  assert.equal(profile.name, "Maria");
  assert.equal(profile.age, null);
  assert.equal(profile.weightKg, 65);
  assert.equal(profile.trainingDays, null);
  assert.deepEqual(profile.allergies, ["milk"]);
});

test("limpa Markdown e LaTeX antes de renderizar respostas", () => {
  assert.equal(
    messageRenderer.cleanFormatting("## Resultado\n**Proteína:** \\frac{20}{2} g"),
    "Resultado\nProteína: (20) / (2) g",
  );
});

test("calcula os nutrientes de uma refeição por peso", () => {
  const result = nutrition.calculate([
    { id: "chicken-cooked", grams: 100 },
    { id: "rice-cooked", grams: 100 },
  ]);

  assert.deepEqual(result.totals, {
    kcal: 295,
    protein: 33.7,
    carbs: 28.2,
    fat: 3.9,
    fiber: 0.4,
  });
  assert.equal(result.complete, true);
});

test("informa alimentos não reconhecidos sem inventar valores", () => {
  const result = nutrition.calculate([{ name: "alimento inexistente", grams: 120 }]);
  assert.equal(result.complete, false);
  assert.deepEqual(result.missing, ["alimento inexistente"]);
  assert.equal(result.totals.kcal, 0);
});

test("respeita restrições alimentares ao buscar equivalentes", () => {
  const milk = nutrition.find("leite");
  assert.equal(nutrition.compatible(milk, ["lactose-free"]), false);
  assert.equal(nutrition.compatible(nutrition.find("tofu"), ["vegan"]), true);
});

test("gera periodização com semanas de recuperação previsíveis", () => {
  const plan = periodization.build({ weeks: 8, days: 4, goal: "muscle", language: "pt" });
  assert.equal(plan.phases.length, 8);
  assert.equal(plan.phases[3].recovery, true);
  assert.equal(plan.phases[3].volumeFactor, 0.65);
  assert.equal(plan.phases[7].recovery, true);
  assert.match(plan.text, /hipertrofia/);
});

test("limita dias e duração adaptada sem duplicar sessão perdida", () => {
  const plan = periodization.build({ weeks: 4, days: 20, durationMinutes: 45 });
  assert.equal(plan.days, 6);
  const adapted = periodization.adapt(plan, { missedDay: true, newDays: 2, newDuration: 30 });
  assert.equal(adapted.days, 2);
  assert.equal(adapted.durationMinutes, 30);
  assert.match(adapted.text, /não compense/i);
});

test("bloqueia sinais de emergência antes de recomendar treino", () => {
  const result = safety.classify("Estou com dor forte no peito e falta de ar intensa");
  assert.equal(result.level, "emergency");
  assert.equal(result.blocksAnswer, true);
  assert.match(safety.response(result, "pt"), /emergência/i);
});

test("não cria falso positivo quando o usuário nega dor no peito", () => {
  const result = safety.classify("Não tenho dor no peito, quero um treino leve");
  assert.equal(result.level, "low");
  assert.equal(result.blocksAnswer, false);
});

test("recusa métodos perigosos de emagrecimento", () => {
  const result = safety.classify("Quero perder 10 kg em uma semana");
  assert.equal(result.level, "unsafe");
  assert.equal(result.blocksAnswer, true);
});
