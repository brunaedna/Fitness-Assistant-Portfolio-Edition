/* Deterministic local food composition and meal calculation engine. Values are educational averages per 100 g. */
(function () {
  "use strict";
  const VERSION = "2026.08.1";
  const rows = [
    ["rice-cooked","arroz cozido",130,2.7,28.2,0.3,0.4,["vegan","vegetarian","lactose-free"],[]],
    ["beans-cooked","feijão cozido",76,4.8,13.6,0.5,8.5,["vegan","vegetarian","lactose-free"],[]],
    ["chicken-cooked","frango cozido",165,31,0,3.6,0,[],[]],
    ["beef-lean-cooked","carne bovina magra cozida",210,29,0,9,0,[],[]],
    ["fish-cooked","peixe cozido",140,26,0,4,0,[],["fish"]],
    ["egg","ovo",143,12.6,0.7,9.5,0,[],["egg"]],
    ["tofu","tofu",84,10,2,5,1,["vegan","vegetarian","lactose-free"],["soy"]],
    ["lentils-cooked","lentilha cozida",116,9,20,0.4,7.9,["vegan","vegetarian","lactose-free"],[]],
    ["chickpeas-cooked","grão-de-bico cozido",164,8.9,27.4,2.6,7.6,["vegan","vegetarian","lactose-free"],[]],
    ["milk","leite",61,3.2,4.8,3.3,0,["vegetarian"],["milk"]],
    ["soy-milk","bebida de soja",45,3.3,3,2,0.6,["vegan","vegetarian","lactose-free"],["soy"]],
    ["yogurt","iogurte natural",63,5.3,7,1.6,0,["vegetarian"],["milk"]],
    ["oats","aveia",389,16.9,66.3,6.9,10.6,["vegan","vegetarian","lactose-free"],["gluten-cross-contact"]],
    ["whole-bread","pão integral",247,13,41,4.2,7,["vegan","vegetarian","lactose-free"],["gluten"]],
    ["banana","banana",89,1.1,22.8,0.3,2.6,["vegan","vegetarian","lactose-free"],[]],
    ["papaya","mamão",43,0.5,10.8,0.3,1.7,["vegan","vegetarian","lactose-free"],[]],
    ["potato-cooked","batata cozida",87,1.9,20.1,0.1,1.8,["vegan","vegetarian","lactose-free"],[]],
    ["sweet-potato-cooked","batata-doce cozida",86,1.6,20.1,0.1,3,["vegan","vegetarian","lactose-free"],[]],
    ["broccoli-cooked","brócolis cozido",35,2.4,7.2,0.4,3.3,["vegan","vegetarian","lactose-free"],[]],
    ["olive-oil","azeite",884,0,0,100,0,["vegan","vegetarian","lactose-free"],[]],
    ["peanuts","amendoim",567,25.8,16.1,49.2,8.5,["vegan","vegetarian","lactose-free"],["peanut"]]
  ];
  const multilingualAliases = {
    "rice-cooked":["cooked rice","arroz cocido","gekochter reis"], "beans-cooked":["cooked beans","frijoles cocidos","gekochte bohnen"],
    "chicken-cooked":["cooked chicken","pollo cocido","gegartes huhn"], "beef-lean-cooked":["lean cooked beef","carne magra cocida","mageres rindfleisch"],
    "fish-cooked":["cooked fish","pescado cocido","gegarter fisch"], egg:["egg","huevo","ei"], tofu:["tofu"],
    "lentils-cooked":["cooked lentils","lentejas cocidas","gekochte linsen"], "chickpeas-cooked":["cooked chickpeas","garbanzos cocidos","gekochte kichererbsen"],
    milk:["milk","leche","milch"], "soy-milk":["soy milk","bebida de soja","sojamilch"], yogurt:["natural yogurt","yogur natural","naturjoghurt"],
    oats:["oats","avena","haferflocken"], "whole-bread":["whole grain bread","pan integral","vollkornbrot"], banana:["banana"], papaya:["papaya"],
    "potato-cooked":["cooked potato","patata cocida","gekochte kartoffel"], "sweet-potato-cooked":["cooked sweet potato","batata cocida","gekochte süßkartoffel"],
    "broccoli-cooked":["cooked broccoli","brócoli cocido","gekochter brokkoli"], "olive-oil":["olive oil","aceite de oliva","olivenöl"], peanuts:["peanuts","cacahuete","erdnüsse"]
  };
  const foods = rows.map(([id,name,kcal,protein,carbs,fat,fiber,tags,allergens]) => ({ id,name,aliases:[name,...(multilingualAliases[id]||[])],state:/cooked|cozid/.test(id+name)?"cooked":"as-sold",per100g:{kcal,protein,carbs,fat,fiber},tags,allergens,source:"educational average; validate against production food table",version:VERSION }));
  const normalize = value => String(value||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const find = value => { const t=normalize(value); return foods.find(food => t.includes(normalize(food.name)) || food.aliases.some(alias=>t.includes(normalize(alias)))) || null; };
  function calculate(items) {
    const totals={kcal:0,protein:0,carbs:0,fat:0,fiber:0}; const resolved=[]; const missing=[];
    for(const item of items||[]){const food=find(item.id||item.name); const grams=Number(item.grams); if(!food||!grams){missing.push(item.name||item.id);continue;} const factor=grams/100; Object.keys(totals).forEach(key=>totals[key]+=food.per100g[key]*factor); resolved.push({foodId:food.id,name:food.name,grams});}
    Object.keys(totals).forEach(key=>totals[key]=Math.round(totals[key]*10)/10);
    return {totals,items:resolved,missing,complete:missing.length===0,version:VERSION};
  }
  function compatible(food, restrictions=[]){return !restrictions.some(rule=>rule==="vegan"&&!food.tags.includes("vegan")||rule==="vegetarian"&&!food.tags.includes("vegetarian")||rule==="lactose-free"&&food.allergens.includes("milk")||food.allergens.includes(rule));}
  function equivalents(value, restrictions=[]){const current=typeof value==="string"?find(value):value;if(!current)return[];return foods.filter(food=>food.id!==current.id&&compatible(food,restrictions)&&Math.abs(food.per100g.protein-current.per100g.protein)<=8).slice(0,5);}
  window.FitnessNutritionEngine={version:VERSION,foods,find,calculate,compatible,equivalents};
})();

