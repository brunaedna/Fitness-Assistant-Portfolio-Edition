(function () {
  "use strict";

  const servingTable = {
    omelete: { grams: 120, kcal: 180, protein: 16 }, "pao integral": { grams: 50, kcal: 125, protein: 5 }, mamao: { grams: 150, kcal: 60, protein: 1 },
    iogurte: { grams: 170, kcal: 110, protein: 9 }, aveia: { grams: 40, kcal: 150, protein: 5 }, banana: { grams: 100, kcal: 90, protein: 1 },
    arroz: { grams: 120, kcal: 155, protein: 3 }, feijao: { grams: 100, kcal: 75, protein: 5 }, frango: { grams: 120, kcal: 200, protein: 37 },
    salada: { grams: 150, kcal: 50, protein: 2 }, batata: { grams: 180, kcal: 140, protein: 3 }, peixe: { grams: 140, kcal: 210, protein: 30 },
    legumes: { grams: 160, kcal: 70, protein: 3 }, tofu: { grams: 180, kcal: 215, protein: 23 }, fruta: { grams: 130, kcal: 70, protein: 1 },
    castanhas: { grams: 20, kcal: 120, protein: 4 }, vegetais: { grams: 180, kcal: 80, protein: 4 }, carboidrato: { grams: 120, kcal: 160, protein: 3 }, proteina: { grams: 120, kcal: 190, protein: 28 },
  };

  function normalize(text) {
    return String(text || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function servingFor(name) {
    const normalized = normalize(name);
    const match = Object.keys(servingTable).find((candidate) => normalized.includes(candidate));
    return { name: String(name).trim(), ...(servingTable[match] || { grams: 100, kcal: 120, protein: 5 }) };
  }

  function splitFoods(value) {
    return String(value || "").replace(/\.$/, "").split(/,|\s+e\s+/i).map((part) => part.trim()).filter(Boolean).map(servingFor);
  }

  function foodQuantities(artifact) {
    if (artifact.quantities) return artifact.quantities;
    return {
      breakfast: splitFoods(artifact.breakfast),
      mainMeal: splitFoods(artifact.mainMeal),
      snack: splitFoods(artifact.snack),
      otherMeal: [servingFor("vegetais"), servingFor("proteína"), servingFor("carboidrato")],
    };
  }

  function mealTotals(items) {
    return items.reduce((total, item) => ({ kcal: total.kcal + item.kcal, protein: total.protein + item.protein }), { kcal: 0, protein: 0 });
  }

  function foodTotals(quantities) {
    return mealTotals(Object.values(quantities).flat());
  }

  function formatGramMeal(label, items) {
    return `• ${label}: ${items.map((item) => `${item.name} ${item.grams} g`).join(", ")}`;
  }

  window.FitnessFoodPlanUtils = { servingFor, splitFoods, foodQuantities, mealTotals, foodTotals, formatGramMeal };
})();
